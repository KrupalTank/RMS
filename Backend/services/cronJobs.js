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

    // 1. Fetch overdue orders beyond max allowed late days (include product_id)
    const lostOrdersQuery = `
      SELECT o.id, o.vendor_id, o.customer_id, o.product_id, o.group_id, o.quantity, o.deposit_per_item_snapshot
      FROM orders o
      WHERE o.status = 'With Customer' 
        AND CURRENT_DATE > (o.end_date + o.max_late_days)
      FOR UPDATE OF o
    `;

    const { rows: lostOrders } = await client.query(lostOrdersQuery);
    const processedOrders = [];

    for (const order of lostOrders) {
      const totalDeposit = parseFloat(order.deposit_per_item_snapshot) * order.quantity;

      // 2. Mark order status as Lost
      await client.query(
        "UPDATE orders SET status = 'Lost', payment_status = 'Full' WHERE id = $1",
        [order.id]
      );

      // 3. Forfeit full deposit to vendor
      await client.query(
        `INSERT INTO payouts (order_id, recipient_id, group_id, amount, type)
         VALUES ($1, $2, $3, $4, 'deposit_forfeit_vendor')`,
        [order.id, order.vendor_id, order.group_id, totalDeposit]
      );

      // 4. Increment delinquency counter & reset loyalty streak to 0
      await client.query(
        `UPDATE users 
         SET late_returns_count = COALESCE(late_returns_count, 0) + 1,
             consecutive_good_returns = 0
         WHERE id = $1`,
        [order.customer_id]
      );

      // 5. Deduct lost units from vendor's total inventory (floor at 0)
      await client.query(
        `UPDATE products 
         SET total_quantity = GREATEST(0, total_quantity - $1),
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [order.quantity, order.product_id]
      );

      processedOrders.push({
        orderId: order.id,
        customerId: order.customer_id,
        forfeitedDeposit: totalDeposit,
      });

      // 6. Fetch details for notification email
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
          reason: 'Return period exceeded the maximum allowed grace window. Order marked as Lost.',
        });
      }
    }

    await client.query('COMMIT');
    return { success: true, count: processedOrders.length, processedOrders };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Process Lost Orders Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}


/**
 * Purge stale chat conversations based on the tiered data retention policy:
 * - Inquiries (order_id IS NULL): 3-day TTL from last message
 * - Concluded orders (Returned, Lost, Cancelled): 7-day TTL from last message
 * Note: chat_messages rows are automatically removed via ON DELETE CASCADE.
 */
const purgeExpiredChats = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Purge standalone inquiries older than 3 days
    const inquiryResult = await client.query(`
      DELETE FROM chat_conversations
      WHERE order_id IS NULL
        AND last_message_at < NOW() - INTERVAL '3 days'
      RETURNING id
    `);

    // 2. Purge chats for finalized/terminal orders older than 7 days
    const orderChatResult = await client.query(`
      DELETE FROM chat_conversations cc
      USING orders o
      WHERE cc.order_id = o.id
        AND o.status IN ('Returned', 'Lost', 'Cancelled')
        AND cc.last_message_at < NOW() - INTERVAL '7 days'
      RETURNING cc.id
    `);

    await client.query('COMMIT');

    const totalPurged = inquiryResult.rowCount + orderChatResult.rowCount;
    if (totalPurged > 0) {
      console.log(
        `🧹 Chat Purge Run: Cleaned ${inquiryResult.rowCount} stale inquiry thread(s) and ${orderChatResult.rowCount} concluded order thread(s).`
      );
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error executing chat retention purge:', err.message);
  } finally {
    client.release();
  }
};

function initCronJobs() {
  // Cron Job 1: Every 5 minutes - Delete uncompleted parent orders older than 5 minutes[cite: 9]
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

  // Cron Job 2: Daily at 9:00 PM IST (21:00) - Reconcile Overdue Lost Orders[cite: 9]
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

  // Cron Job 3: Daily at Midnight IST (00:00) - State-Aware Chat Retention Purge[cite: 9]
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('⏰ Running scheduled midnight Chat Retention Purge...');
      await purgeExpiredChats();
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );
}

module.exports = { initCronJobs, processLostOrders };