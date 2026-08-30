// controllers/paymentController.js
const crypto = require('crypto');
const pool = require('../config/db');
const razorpay = require('../config/razorpay');
const { calculateRentalQuotation } = require('../services/pricingService');
const { sendBookingConfirmationEmail, sendAccountBlockedEmail } = require('../services/emailService');

// POST /api/v1/rms/payment/createCheckoutOrder
// POST /api/v1/rms/payment/createCheckoutOrder in paymentController.js
exports.createCheckoutOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const customerId = req.user.id;
    const kycStatus = req.user.kyc_status;
    const { coupon_assignments = [] } = req.body; // Array: [{ product_id, coupon_id }]

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

    await client.query('BEGIN');

    // 3. Validate & Lock all assigned coupons (Verify each coupon is distinct, AVAILABLE, and belongs to user)
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

      const couponRes = await client.query(
        `SELECT * FROM coupons 
         WHERE id = $1 AND user_id = $2 AND status = 'AVAILABLE' 
         FOR UPDATE`,
        [coupon_id, customerId]
      );

      if (couponRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Loyalty coupon #${coupon_id} is invalid or already redeemed.`,
        });
      }

      assignedCouponMap.set(product_id, couponRes.rows[0]);
    }

    // 4. Create parent_order
    const parentOrderRes = await client.query(
      'INSERT INTO parent_order (customer_id) VALUES ($1) RETURNING id',
      [customerId]
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
      const discountPercent = appliedCoupon ? parseFloat(appliedCoupon.discount_percent) : 0;

      const quotation = calculateRentalQuotation(
        item,
        item.start_date,
        item.end_date,
        item.quantity,
        kycStatus,
        discountPercent
      );

      grandTotalAmount += quotation.grandTotal;

      const orderInsert = await client.query(
        `INSERT INTO orders 
          (customer_id, vendor_id, product_id, group_id, quantity, start_date, end_date, 
           max_late_days, rent_per_day_snapshot, deposit_per_item_snapshot, late_fee_per_day_snapshot, 
           cancellation_fee_snapshot, applied_coupon_id, gross_rent_snapshot, discount_amount_snapshot, 
           customer_paid_rent_snapshot, platform_commission_snapshot, vendor_net_rent_snapshot, 
           status, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'Pending_Payment', 'No')
         RETURNING *`,
        [
          customerId,
          item.vendor_id,
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
          quotation.platformCommission,
          quotation.vendorNetRent,
        ]
      );

      generatedSubOrders.push(orderInsert.rows[0]);
    }

    const razorpayOptions = {
      amount: Math.round(grandTotalAmount * 100),
      currency: 'INR',
      receipt: `rms_grp_${groupId}_${Date.now()}`,
    };

    const rzpOrder = await razorpay.orders.create(razorpayOptions);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Checkout initialized. Complete payment to lock booking.',
      key_id: process.env.RAZORPAY_KEY_ID,
      razorpay_order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      group_id: groupId,
      sub_orders: generatedSubOrders,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create Checkout Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create checkout order.' });
  } finally {
    client.release();
  }
};

// POST /api/v1/rms/payment/verifyPayment
exports.verifyPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, group_id } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !group_id) {
      return res.status(400).json({ success: false, message: 'Incomplete payment verification payload.' });
    }

    // 1. Verify Razorpay Signature (HMAC SHA-256)
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment signature verification failed.' });
    }

    // 2. Fetch User & Current Block Status
    const userRes = await client.query(
      'SELECT full_name, is_blocked, email, city FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User record not found.' });
    }

    const user = userRes.rows[0];
    const io = req.app.get('socketio');

    await client.query('BEGIN');

    // 3. CASE A: User was blocked while checkout was in-flight
    if (user.is_blocked) {
      // Step A: Transition to Lock
      await client.query(
        `UPDATE orders 
         SET status = 'Lock' 
         WHERE group_id = $1 AND status = 'Pending_Payment'`,
        [group_id]
      );

      // Step B: Immediately Cancel as admin (DB trigger uses customer_paid_rent_snapshot)
      const cancelledOrders = await client.query(
        `UPDATE orders 
         SET status = 'Cancelled', 
             cancelled_by = 'admin' 
         WHERE group_id = $1 AND status = 'Lock' 
         RETURNING *`,
        [group_id]
      );

      // Calculate total refund amount based on what the customer actually paid
      const totalRefundAmount = cancelledOrders.rows.reduce((sum, ord) => {
        const rentPaid = parseFloat(ord.customer_paid_rent_snapshot || 0);
        const deposit = parseFloat(ord.deposit_per_item_snapshot || 0) * ord.quantity;
        return sum + rentPaid + deposit;
      }, 0);

      // Redeem applied coupon permanently even on blocked cancellation (no reuse)
      for (const ord of cancelledOrders.rows) {
        if (ord.applied_coupon_id) {
          await client.query(
            `UPDATE coupons 
             SET status = 'REDEEMED', 
                 redeemed_order_id = $1, 
                 redeemed_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [ord.id, ord.applied_coupon_id]
          );
        }
      }

      await client.query('COMMIT');

      if (io) {
        cancelledOrders.rows.forEach((order) => {
          io.emit('PAYOUT_GENERATED', {
            orderId: order.id,
            customerId: req.user.id,
            type: 'full_refund',
          });
        });
      }

      sendAccountBlockedEmail({
        to: user.email,
        userName: user.full_name,
        reason: 'Your checkout payment was completed while your account was flagged as suspended by administration. A 100% refund has been registered.',
        paymentDetails: {
          razorpay_payment_id,
          razorpay_order_id,
        },
        groupId: group_id,
        refundAmount: totalRefundAmount,
      });

      return res.status(403).json({
        success: false,
        message: 'Payment received, but your account has been suspended by administration. A 100% full refund has been recorded and scheduled for transfer.',
      });
    }

    // 4. CASE B: Standard Active User Flow
    // Update orders from 'Pending_Payment' to 'Lock'
    const updatedOrders = await client.query(
      `UPDATE orders 
       SET status = 'Lock' 
       WHERE group_id = $1 AND status = 'Pending_Payment' 
       RETURNING *`,
      [group_id]
    );

    // Redeem coupon permanently upon successful payment lock
    for (const ord of updatedOrders.rows) {
      if (ord.applied_coupon_id) {
        await client.query(
          `UPDATE coupons 
           SET status = 'REDEEMED', 
               redeemed_order_id = $1, 
               redeemed_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [ord.id, ord.applied_coupon_id]
        );
      }
    }

    await client.query('COMMIT');

    // Emit real-time WebSocket alert to vendors
    if (io) {
      updatedOrders.rows.forEach((order) => {
        io.emit('ORDER_LOCKED', {
          orderId: order.id,
          vendorId: order.vendor_id,
          productId: order.product_id,
          quantity: order.quantity,
        });
      });
    }

    // Fetch sub-order details for booking confirmation invoice email
    const subOrdersQuery = await pool.query(
      `SELECT o.*, p.title AS product_title, u.full_name AS vendor_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.vendor_id = u.id
       WHERE o.group_id = $1`,
      [group_id]
    );

    sendBookingConfirmationEmail({
      customer: user,
      parentOrder: { group_id },
      subOrders: subOrdersQuery.rows,
      paymentDetails: { razorpay_payment_id },
    });

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully. Orders locked for pickup.',
      orders: updatedOrders.rows,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Verify Payment Error:', error);
    return res.status(500).json({ success: false, message: 'Payment verification failed.' });
  } finally {
    client.release();
  }
};