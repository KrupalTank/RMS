// controllers/orderController.js
const pool = require('../config/db');
const { sendCustomerCancellationEmail, sendVendorCancellationEmail } = require('../services/emailService');

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

// POST /api/v1/rms/user/changeOrderStatus
exports.confirmOrderReceived = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { order_id } = req.body;

    // Check order status is Lock
    const orderCheck = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND customer_id = $2',
      [order_id, customerId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    
    const order = orderCheck.rows[0];
    if (order.status !== 'Lock') {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm receipt. Order must be in 'Lock' status (Current: '${order.status}').`,
      });
    }

    // Update status to 'With Customer'
    // NOTE: Database trigger 'trg_handle_order_handover_payout' automatically generates
    // the rent payout ledger to the vendor and sets payment_status = 'Partial'!
    const result = await pool.query(
      `UPDATE orders 
       SET status = 'With Customer' 
       WHERE id = $1 
       RETURNING *`,
      [order_id]
    );

    // Emit real-time notification
    const io = req.app.get('socketio');
    if (io) {
      io.emit('ORDER_STATUS_CHANGED', {
        orderId: order_id,
        vendorId: order.vendor_id,
        newStatus: 'With Customer',
      });

      io.emit('PAYOUT_GENERATED', {
        orderId: order_id,
        vendorId: order.vendor_id,
        type: 'rent_handover',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Product receipt confirmed. Order marked as With Customer.',
      order: result.rows[0],
    });
  } catch (error) {
    console.error('Confirm Order Received Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to confirm receipt.' });
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
      'SELECT * FROM orders WHERE id = $1 AND customer_id = $2',
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

    // 2. Update status to Cancelled and set cancelled_by = 'customer'
    // NOTE: Database trigger 'trg_handle_order_handover_payout' will automatically branch
    // and generate the two payout slips (vendor fee + customer refund)!
    const updateRes = await client.query(
      `UPDATE orders 
       SET status = 'Cancelled', 
           cancelled_by = 'customer' 
       WHERE id = $1 
       RETURNING *`,
      [order_id]
    );

    await client.query('COMMIT');

    // 3. Emit real-time WebSocket updates
    const io = req.app.get('socketio');
    if (io) {
      io.emit('ORDER_STATUS_CHANGED', {
        orderId: order_id,
        customerId,
        vendorId: order.vendor_id,
        newStatus: 'Cancelled',
      });

      io.emit('PAYOUT_GENERATED', {
        orderId: order_id,
        customerId,
        type: 'cancellation_refund_customer',
      });
    }


    // Fetch order, product, customer & vendor details for notification

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

      const grossRent = parseFloat(d.gross_rent_snapshot || 0);
      const discountAmount = parseFloat(d.discount_amount_snapshot || 0);
      const actualPaidRent = parseFloat(d.customer_paid_rent_snapshot || (grossRent - discountAmount));
      const totalDeposit = parseFloat(d.deposit_per_item_snapshot) * d.quantity;
      const feePerUnit = parseFloat(d.cancellation_fee_snapshot || 0);
      const cancellationFeeDeducted = Math.min(feePerUnit * d.quantity, totalDeposit);
      const refundAmount = actualPaidRent + (totalDeposit - cancellationFeeDeducted);

      // 1. Email Customer
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

      // 2. Email Vendor
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
      message: 'Booking cancelled successfully. Refund and settlement payouts have been recorded.',
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