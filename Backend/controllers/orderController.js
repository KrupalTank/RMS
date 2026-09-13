// controllers/orderController.js
const Razorpay = require('razorpay');
const pool = require('../config/db');
const { decryptText } = require('../utils/encryptionUtil');
const { sendCustomerCancellationEmail, sendVendorCancellationEmail } = require('../services/emailService');
const { generateRentalAgreementPDF } = require('../utils/pdfGenerator');

// Helper to instantiate vendor's Razorpay instance
async function getVendorRazorpayClient(vendorId, client = pool) {
  const vendorRes = await client.query(
    'SELECT id, full_name, razorpay_key_id, razorpay_key_secret FROM users WHERE id = $1',
    [vendorId]
  );
  if (vendorRes.rows.length === 0) throw new Error('Vendor account not found.');
  const vendor = vendorRes.rows[0];
  if (!vendor.razorpay_key_id || !vendor.razorpay_key_secret) {
    throw new Error(`Vendor "${vendor.full_name}" has not configured their Razorpay payment gateway.`);
  }
  return {
    instance: new Razorpay({
      key_id: vendor.razorpay_key_id,
      key_secret: decryptText(vendor.razorpay_key_secret),
    }),
    key_id: vendor.razorpay_key_id,
    vendor_name: vendor.full_name,
  };
}

// GET /api/v1/rms/user/getOrders
exports.getCustomerOrders = async (req, res) => {
  try {
    const customerId = req.user.id;

    const query = `
      SELECT o.*, p.title AS product_title, p.images AS product_images,
             u.full_name AS vendor_name, u.phone AS vendor_phone, 
             u.address AS vendor_address, u.city AS vendor_city,
             r.id AS review_id, r.rating AS review_rating
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.vendor_id = u.id
      LEFT JOIN reviews r ON o.id = r.order_id
      WHERE o.customer_id = $1
      ORDER BY 
        (CASE WHEN o.status IN ('Lock', 'With Customer') THEN 0 ELSE 1 END),
        o.created_at DESC
    `;

    const result = await pool.query(query, [customerId]);
    return res.status(200).json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('Get Customer Orders Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer orders.' });
  }
};

// POST /api/v1/rms/user/cancelOrder
exports.cancelOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const customerId = req.user.id;
    const { order_id } = req.body;

    // 1. Fetch order and ensure it belongs to customer and is in 'Lock' status
    const orderCheck = await client.query(
      `SELECT o.*, po.razorpay_payment_id 
       FROM orders o
       JOIN parent_order po ON o.group_id = po.id
       WHERE o.id = $1 AND o.customer_id = $2`,
      [order_id, customerId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const order = orderCheck.rows[0];
    if (order.status !== 'Lock') {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled. Only bookings in 'Lock' status before handover can be cancelled (Current status: '${order.status}').`,
      });
    }

    await client.query('BEGIN');

    // 2. Financial calculation for customer cancellation
    const grossRent = parseFloat(order.gross_rent_snapshot || 0);
    const discountAmount = parseFloat(order.discount_amount_snapshot || 0);
    const actualPaidRent = parseFloat(order.customer_paid_rent_snapshot || (grossRent - discountAmount));
    const totalDeposit = parseFloat(order.deposit_per_item_snapshot) * order.quantity;
    const feePerUnit = parseFloat(order.cancellation_fee_snapshot || 0);
    const cancellationFeeDeducted = Math.min(feePerUnit * order.quantity, totalDeposit);
    const refundAmount = actualPaidRent + (totalDeposit - cancellationFeeDeducted);

    let refundReference = 'CANCEL_DIRECT_REFUND';

    // 3. Initiate dynamic partial refund via vendor's Razorpay
    if (order.razorpay_payment_id && refundAmount > 0) {
      try {
        const vendorGateway = await getVendorRazorpayClient(order.vendor_id, client);
        const rzpRefund = await vendorGateway.instance.payments.refund(order.razorpay_payment_id, {
          amount: Math.round(refundAmount * 100),
          notes: { reason: `Customer cancellation refund for Order #${order.id}` },
        });
        refundReference = rzpRefund.id;
      } catch (refundErr) {
        console.error('Vendor Gateway Cancellation Refund Warning:', refundErr.message);
      }
    }

    // 4. Update order record
    const updateRes = await client.query(
      `UPDATE orders 
       SET status = 'Cancelled', 
           cancelled_by = 'customer',
           payment_status = 'Refunded_Full',
           deposit_refunded_amount = $1,
           deposit_refund_reference = $2
       WHERE id = $3 
       RETURNING *`,
      [refundAmount, refundReference, order_id]
    );

    await client.query('COMMIT');

    // 5. Emit real-time WebSocket updates
    const io = req.app.get('socketio');
    if (io) {
      io.emit('ORDER_STATUS_CHANGED', {
        orderId: order_id,
        customerId,
        vendorId: order.vendor_id,
        newStatus: 'Cancelled',
      });
    }

    // 6. Fetch details for notification emails
    const emailDetailsRes = await pool.query(
      `SELECT o.*, p.title AS product_title,
              c.full_name AS customer_name, c.email AS customer_email,
              v.full_name AS vendor_name, v.email AS vendor_email
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users c ON o.customer_id = c.id
       JOIN users v ON o.vendor_id = v.id
       WHERE o.id = $1`,
      [order_id]
    );

    if (emailDetailsRes.rows.length > 0) {
      const d = emailDetailsRes.rows[0];

      sendCustomerCancellationEmail({
        to: d.customer_email,
        customerName: d.customer_name,
        productTitle: d.product_title,
        orderId: d.id,
        cancelledBy: 'customer',
        grossRent,
        discountAmount,
        actualPaidRent,
        totalDeposit,
        cancellationFeeDeducted,
        refundAmount,
      });

      sendVendorCancellationEmail({
        to: d.vendor_email,
        vendorName: d.vendor_name,
        productTitle: d.product_title,
        orderId: d.id,
        quantity: d.quantity,
        cancellationCompensation: cancellationFeeDeducted,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully. Refund processed directly to your payment account.',
      order: updateRes.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Customer Cancel Order Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to cancel order.' });
  } finally {
    client.release();
  }
};

// GET /api/v1/rms/user/downloadAgreement/:groupId
exports.downloadRentalAgreement = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { groupId } = req.params;

    const subOrdersRes = await pool.query(
      `SELECT o.*, p.title AS product_title, 
              u.full_name AS vendor_name, u.city AS vendor_city, u.phone AS vendor_phone, u.address AS vendor_address
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users u ON o.vendor_id = u.id
       WHERE o.group_id = $1
       ORDER BY o.id ASC`,
      [groupId]
    );

    if (subOrdersRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rental agreement not found for this group booking.' });
    }

    const subOrders = subOrdersRes.rows;
    const customerId = subOrders[0].customer_id;

    const isCustomer = userId === customerId;
    const isVendor = subOrders.some((o) => o.vendor_id === userId);
    const isAdmin = userRole === 'admin';

    if (!isCustomer && !isVendor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized to download this rental agreement.' });
    }

    const customerRes = await pool.query(
      'SELECT id, full_name, email, phone, city, kyc_status FROM users WHERE id = $1',
      [customerId]
    );
    const customer = customerRes.rows[0];

    const pdfBuffer = await generateRentalAgreementPDF({
      customer,
      parentOrder: { group_id: groupId },
      subOrders,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Rental_Agreement_Group_${groupId}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Download Rental Agreement Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate rental agreement PDF.' });
  }
};