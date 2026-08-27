// services/cronJobs.js
const cron = require('node-cron');
const pool = require('../config/db');
const { sendDepositForfeitureEmail } = require('./emailService');

/**
 * Reusable function to process overdue orders and mark them as Lost
 */
async function processLostOrders() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lostOrdersQuery = `
      SELECT o.id, o.vendor_id, o.customer_id, o.group_id, o.quantity, o.deposit_per_item_snapshot
      FROM orders o
      WHERE o.status = 'With Customer' 
        AND CURRENT_DATE > (o.end_date + o.max_late_days)
      FOR UPDATE OF o
    `;

    const { rows: lostOrders } = await client.query(lostOrdersQuery);
    const processedOrders = [];

    for (const order of lostOrders) {
      const totalDeposit = order.deposit_per_item_snapshot * order.quantity;

      // 1. Mark order status as Lost
      await client.query(
        "UPDATE orders SET status = 'Lost', payment_status = 'Full' WHERE id = $1",
        [order.id]
      );

      // 2. Forfeit full deposit to vendor
      await client.query(
        `INSERT INTO payouts (order_id, recipient_id, group_id, amount, type)
         VALUES ($1, $2, $3, $4, 'deposit_forfeit_vendor')`,
        [order.id, order.vendor_id, order.group_id, totalDeposit]
      );

      // 3. Increment customer delinquency counter
      await client.query(
        'UPDATE users SET late_returns_count = late_returns_count + 1 WHERE id = $1',
        [order.customer_id]
      );


      // 4. Deduct lost units from vendor's total inventory (floor at 0)
      await client.query(
        `UPDATE products 
        SET total_quantity = GREATEST(0, total_quantity - $1),
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2`,
        [order.quantity, order.product_id]
      );

      processedOrders.push({ orderId: order.id, customerId: order.customer_id, forfeitedDeposit: totalDeposit });
      console.log(`🚨 Marked Order #${order.id} as LOST. Deposit forfeited to Vendor.`);

      // Fetch customer, product & vendor details for email dispatch
      const customerNoticeQuery = await client.query(
        `SELECT u.email, u.full_name, p.title AS product_title, v.full_name AS vendor_name
        FROM users u
        JOIN products p ON p.id = $1
        JOIN users v ON v.id = $2
        WHERE u.id = $3`,
        [order.product_id, order.vendor_id, order.customer_id]
      );

      if (customerNoticeQuery.rows.length > 0) {
        const details = customerNoticeQuery.rows[0];
        sendDepositForfeitureEmail({
          to: details.email,
          customerName: details.full_name,
          productTitle: details.product_title,
          vendorName: details.vendor_name,
          orderId: order.id,
          forfeitedAmount: totalDeposit,
          reason: 'Non-return exceeding maximum late grace window (Marked Lost)',
        });
      }

    }

    await client.query('COMMIT');
    return { success: true, count: processedOrders.length, processedOrders };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Process Lost Orders Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

function initCronJobs() {
  // Cron Job 1: Every 5 minutes - Delete uncompleted parent orders older than 15 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const expiredQuery = `
        DELETE FROM parent_order 
        WHERE id IN (
          SELECT group_id FROM orders 
          WHERE status = 'Pending_Payment' 
            AND created_at < NOW() - INTERVAL '5 minutes'
        )
      `;
      const result = await pool.query(expiredQuery);
      if (result.rowCount > 0) {
        console.log(`⏰ Cron: Expired ${result.rowCount} unpaid checkout carts.`);
      }
    } catch (err) {
      console.error('Cron Expire Cart Error:', err.message);
    }
  });

  // Cron Job 2: Daily at 9:00 PM sharp (21:00 Indian Standard Time)
  cron.schedule(
    '0 21 * * *',
    async () => {
      console.log('⏰ Running scheduled 9:00 PM Lost Orders check...');
      try {
        const result = await processLostOrders();
        console.log(`✅ 9:00 PM Lost Orders task completed. Total marked lost: ${result.count}`);
      } catch (err) {
        console.error('⚠️ 9:00 PM Cron failed:', err.message);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );
}

module.exports = { initCronJobs, processLostOrders };

