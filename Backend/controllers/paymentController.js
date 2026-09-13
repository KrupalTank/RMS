// controllers/paymentController.js
const crypto = require('crypto');
const Razorpay = require('razorpay');
const pool = require('../config/db');
const { calculateRentalQuotation } = require('../services/pricingService');
const { decryptText } = require('../utils/encryptionUtil');
const { sendBookingConfirmationEmail, sendAccountBlockedEmail, sendVendorBookingNotificationEmail } = require('../services/emailService');

// Helper: Dynamically instantiate Razorpay client for a specific vendor
async function getVendorRazorpayClient(vendorId, client = pool) {
  const vendorRes = await client.query(
    'SELECT id, full_name, razorpay_key_id, razorpay_key_secret FROM users WHERE id = $1',
    [vendorId]
  );

  if (vendorRes.rows.length === 0) {
    throw new Error('Vendor account not found.');
  }

  const vendor = vendorRes.rows[0];
  if (!vendor.razorpay_key_id || !vendor.razorpay_key_secret) {
    throw new Error(`Vendor "${vendor.full_name}" has not configured their Razorpay payment gateway yet.`);
  }

  const decryptedSecret = decryptText(vendor.razorpay_key_secret);

  const instance = new Razorpay({
    key_id: vendor.razorpay_key_id,
    key_secret: decryptedSecret,
  });

  return {
    instance,
    key_id: vendor.razorpay_key_id,
    key_secret: decryptedSecret,
    vendor_name: vendor.full_name,
  };
}

// POST /api/v1/rms/payment/createCheckoutOrder
exports.createCheckoutOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const customerId = req.user.id;
    const kycStatus = req.user.kyc_status;
    const { coupon_assignments = [] } = req.body; // [{ product_id, coupon_id }]

    // 1. Check if user is suspended
    const userCheck = await client.query('SELECT is_blocked FROM users WHERE id = $1', [customerId]);
    if (userCheck.rows[0]?.is_blocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account is suspended. You cannot rent or book new equipment.',
      });
    }

    // 2. Fetch user's cart items
    const cartRes = await client.query(
      `SELECT c.*, p.vendor_id, p.title, p.rent_per_day_1_4, p.rent_per_day_5_9, p.rent_per_day_10_onwards,
              p.deposit_verified, p.deposit_non_verified, p.late_fee_verified, p.late_fee_non_verified,
              p.cancellation_fee
       FROM cart c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1`,
      [customerId]
    );

    if (cartRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Your cart is empty.' });
    }

    const cartItems = cartRes.rows;

    // 3. Ensure all items belong to exactly ONE vendor
    const vendorIds = [...new Set(cartItems.map((item) => item.vendor_id))];
    if (vendorIds.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Multi-vendor checkout is not supported. Please clear your cart and order from one shop at a time.',
      });
    }
    
    const currentVendorId = vendorIds[0];

    // Check if the vendor's subscription has an overdue bill past grace period
    const vendorCheck = await pool.query(
      `SELECT u.full_name,
              (
                SELECT COUNT(*) 
                FROM vendor_annual_billing vab 
                WHERE vab.vendor_id = u.id 
                  AND vab.payment_status IN ('PENDING', 'OVERDUE')
                  AND CURRENT_DATE > (vab.period_end + INTERVAL '3 days')
              ) AS overdue_past_grace
       FROM users u WHERE u.id = $1`,
      [currentVendorId]
    );

    if (vendorCheck.rows.length > 0) {
      const { full_name, overdue_past_grace } = vendorCheck.rows[0];
      if (parseInt(overdue_past_grace, 10) > 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: `Store "${full_name}" is temporarily paused for annual SaaS licensing renewal. No new bookings can be placed at this moment.`,
        });
      }
    }


    // 4. Fetch the vendor's dynamic Razorpay client
    let vendorGateway;
    try {
      vendorGateway = await getVendorRazorpayClient(currentVendorId, client);
    } catch (gatewayErr) {
      return res.status(400).json({ success: false, message: gatewayErr.message });
    }

    await client.query('BEGIN');

    // 5. Validate & Lock assigned store coupons (from 'store_coupons')
    const assignedCouponMap = new Map(); // product_id -> couponRecord
    const uniqueCouponIds = new Set();

    for (const assignment of coupon_assignments) {
      const { product_id, coupon_id } = assignment;
      if (!coupon_id) continue;

      if (uniqueCouponIds.has(coupon_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'The same coupon cannot be applied to multiple items simultaneously.',
        });
      }
      uniqueCouponIds.add(coupon_id);

      // Verify coupon belongs to this vendor, is active, within validity dates (end of day inclusive)
      const couponRes = await client.query(
        `SELECT * FROM store_coupons 
         WHERE id = $1 
           AND vendor_id = $2 
           AND is_active = TRUE
           AND (valid_until IS NULL OR valid_until::DATE >= CURRENT_DATE)
           AND (max_uses IS NULL OR used_count < max_uses)
         FOR UPDATE`,
        [coupon_id, currentVendorId]
      );

      if (couponRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Coupon #${coupon_id} is invalid, expired, or fully redeemed for this store.`,
        });
      }

      const coupon = couponRes.rows[0];

      // Check per-user limit
      const userRedemptions = await client.query(
        'SELECT COUNT(*)::INT AS count FROM coupon_redemptions WHERE coupon_id = $1 AND customer_id = $2',
        [coupon.id, customerId]
      );

      if (userRedemptions.rows[0].count >= coupon.per_user_limit) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `You have reached the maximum allowed redemptions for coupon "${coupon.code}".`,
        });
      }

      assignedCouponMap.set(product_id, coupon);
    }

    // 6. Create parent_order scoped to this vendor
    const parentOrderRes = await client.query(
      'INSERT INTO parent_order (customer_id, vendor_id) VALUES ($1, $2) RETURNING id',
      [customerId, currentVendorId]
    );
    const groupId = parentOrderRes.rows[0].id;

    let grandTotalAmount = 0;
    const generatedSubOrders = [];

    const sortedCartItems = [...cartItems].sort((a, b) => a.product_id - b.product_id);

    for (const item of sortedCartItems) {
      const lockRes = await client.query(
        'SELECT id, total_quantity FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      if (lockRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Product ID ${item.product_id} is no longer listed.`,
        });
      }

      const availRes = await client.query(
        'SELECT available_stock FROM check_product_availability($1, $2, $3)',
        [item.product_id, item.start_date, item.end_date]
      );

      const availableStock = availRes.rows[0]?.available_stock ?? 0;
      if (item.quantity > availableStock) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Product "${item.title || item.product_id}" has insufficient stock (${availableStock} available).`,
        });
      }

      const appliedCoupon = assignedCouponMap.get(item.product_id);

      const quotation = calculateRentalQuotation(
        item,
        item.start_date,
        item.end_date,
        item.quantity,
        kycStatus,
        appliedCoupon || null
      );

      grandTotalAmount += quotation.grandTotal;

      const orderInsert = await client.query(
        `INSERT INTO orders 
          (customer_id, vendor_id, product_id, group_id, quantity, start_date, end_date, 
           max_late_days, rent_per_day_snapshot, deposit_per_item_snapshot, late_fee_per_day_snapshot, 
           cancellation_fee_snapshot, applied_coupon_id, gross_rent_snapshot, discount_amount_snapshot, 
           customer_paid_rent_snapshot, status, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'Pending_Payment', 'No')
         RETURNING *`,
        [
          customerId,
          currentVendorId,
          item.product_id,
          groupId,
          item.quantity,
          item.start_date,
          item.end_date,
          quotation.maxLateDays,
          quotation.applicableDailyRent,
          quotation.depositPerItem,
          quotation.lateFeePerDay,
          parseFloat(item.cancellation_fee || 0),
          appliedCoupon ? appliedCoupon.id : null,
          quotation.grossRent,
          quotation.discountAmount,
          quotation.customerPaidRent,
        ]
      );

      generatedSubOrders.push(orderInsert.rows[0]);
    }

    // 7. Initialize Order on Vendor's Razorpay Account
    const razorpayOptions = {
      amount: Math.round(grandTotalAmount * 100),
      currency: 'INR',
      receipt: `rms_ord_${groupId}_${Date.now()}`,
    };

    const rzpOrder = await vendorGateway.instance.orders.create(razorpayOptions);

    // Save Razorpay order ID to parent order
    await client.query(
      'UPDATE parent_order SET razorpay_order_id = $1, total_amount = $2 WHERE id = $3',
      [rzpOrder.id, grandTotalAmount, groupId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Checkout initialized. Complete direct payment to vendor.',
      key_id: vendorGateway.key_id, // Vendor's public Key ID passed to client
      vendor_name: vendorGateway.vendor_name,
      razorpay_order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      group_id: groupId,
      sub_orders: generatedSubOrders,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create Checkout Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create checkout order.' });
  } finally {
    client.release();
  }
};

// POST /api/v1/rms/payment/verifyPayment
exports.verifyPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    const customerId = req.user.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, group_id } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !group_id) {
      return res.status(400).json({ success: false, message: 'Incomplete payment verification payload.' });
    }

    // 1. Fetch parent_order and vendor credentials
    const parentRes = await client.query(
      'SELECT id, vendor_id, total_amount FROM parent_order WHERE id = $1 AND customer_id = $2',
      [group_id, customerId]
    );

    if (parentRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Parent order record not found.' });
    }

    const parentOrder = parentRes.rows[0];
    const vendorGateway = await getVendorRazorpayClient(parentOrder.vendor_id, client);

    // 2. Verify HMAC SHA-256 signature using the Vendor's Key Secret
    const generatedSignature = crypto
      .createHmac('sha256', vendorGateway.key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment signature verification failed.' });
    }

    // Save payment ID to parent order
    await client.query(
      'UPDATE parent_order SET razorpay_payment_id = $1 WHERE id = $2',
      [razorpay_payment_id, group_id]
    );

    // 3. Fetch User & Current Block Status
    const userRes = await client.query(
      'SELECT full_name, is_blocked, email, city FROM users WHERE id = $1',
      [customerId]
    );

    const user = userRes.rows[0];
    const io = req.app.get('socketio');

    await client.query('BEGIN');

    // 4. CASE A: User was blocked while checkout was in-flight
    if (user.is_blocked) {
      // Step A: Cancel sub-orders
      const cancelledOrders = await client.query(
        `UPDATE orders 
         SET status = 'Cancelled', 
             cancelled_by = 'admin',
             payment_status = 'Refunded_Full'
         WHERE group_id = $1 AND status = 'Pending_Payment' 
         RETURNING *`,
        [group_id]
      );

      const totalRefundAmount = cancelledOrders.rows.reduce((sum, ord) => {
        const rentPaid = parseFloat(ord.customer_paid_rent_snapshot || 0);
        const deposit = parseFloat(ord.deposit_per_item_snapshot || 0) * ord.quantity;
        return sum + rentPaid + deposit;
      }, 0);

      // Trigger automatic 100% refund via Vendor's Razorpay API
      try {
        await vendorGateway.instance.payments.refund(razorpay_payment_id, {
          amount: Math.round(totalRefundAmount * 100),
          notes: { reason: `Auto-refund for suspended user checkout #${group_id}` },
        });
      } catch (refundErr) {
        console.error('Automated blocked account refund failed:', refundErr.message);
      }

      await client.query('COMMIT');

      sendAccountBlockedEmail({
        to: user.email,
        userName: user.full_name,
        reason: 'Your checkout payment was received, but your account was suspended by administration. A 100% refund was issued to your payment source.',
        paymentDetails: { razorpay_payment_id, razorpay_order_id },
        groupId: group_id,
        refundAmount: totalRefundAmount,
      });

      return res.status(403).json({
        success: false,
        message: 'Payment received, but your account is suspended. An automated 100% refund has been initiated to your original payment method.',
      });
    }

    // 5. CASE B: Standard Active User Flow
    const pendingOrdersRes = await client.query(
      `SELECT id, applied_coupon_id, discount_amount_snapshot FROM orders 
       WHERE group_id = $1 AND status = 'Pending_Payment'`,
      [group_id]
    );

    const updatedOrders = [];
    for (const pending of pendingOrdersRes.rows) {
      // Cryptographically secure 6-digit Handshake OTP
      const otp = crypto.randomInt(100000, 1000000).toString();
      const updateSingle = await client.query(
        `UPDATE orders 
         SET status = 'Lock',
             payment_status = 'Paid',
             handover_otp = $1
         WHERE id = $2
         RETURNING *`,
        [otp, pending.id]
      );
      updatedOrders.push(updateSingle.rows[0]);

      // Record coupon redemption in store_coupons & coupon_redemptions
      if (pending.applied_coupon_id) {
        await client.query(
          `INSERT INTO coupon_redemptions (coupon_id, order_id, customer_id, discount_applied)
           VALUES ($1, $2, $3, $4)`,
          [pending.applied_coupon_id, pending.id, customerId, pending.discount_amount_snapshot]
        );

        await client.query(
          `UPDATE store_coupons 
           SET used_count = used_count + 1 
           WHERE id = $1`,
          [pending.applied_coupon_id]
        );
      }
    }

    // Clear the customer's cart
    await client.query('DELETE FROM cart WHERE user_id = $1', [customerId]);

    await client.query('COMMIT');

    // 6. Emit real-time WebSocket alerts to vendors
    if (io) {
      updatedOrders.forEach((order) => {
        io.emit('ORDER_LOCKED', {
          orderId: order.id,
          vendorId: order.vendor_id,
          productId: order.product_id,
          quantity: order.quantity,
        });
      });
    }

    // 7. Send invoice email
    const subOrdersQuery = await pool.query(
      `SELECT o.*, p.title AS product_title, u.full_name AS vendor_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.vendor_id = u.id
       WHERE o.group_id = $1`,
      [group_id]
    );

    const vendorQuery = await pool.query(
      'SELECT id, full_name, email, phone FROM users WHERE id = $1',
      [parentOrder.vendor_id]
    );

    sendBookingConfirmationEmail({
      customer: user,
      parentOrder: { group_id },
      subOrders: subOrdersQuery.rows,
      paymentDetails: { razorpay_payment_id },
    });

    if (vendorQuery.rows.length > 0) {
      sendVendorBookingNotificationEmail({
        vendor: vendorQuery.rows[0],
        customer: user,
        parentOrder: { group_id },
        subOrders: subOrdersQuery.rows,
        paymentDetails: { razorpay_payment_id },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified directly by vendor. Equipment locked for physical handover with PIN.',
      orders: updatedOrders,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Verify Payment Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Payment verification failed.' });
  } finally {
    client.release();
  }
};