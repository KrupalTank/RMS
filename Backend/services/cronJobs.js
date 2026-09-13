// services/cronJobs.js
const cron = require('node-cron');
const pool = require('../config/db');
const { sendDepositForfeitureEmail } = require('./emailService');

/**
 * 1. Process overdue orders and mark them as Lost
 */
async function processLostOrders() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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

      await client.query(
        `UPDATE orders 
         SET status = 'Lost', 
             payment_status = 'Full',
             returned_to_vendor_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [order.id]
      );

      await client.query(
        `UPDATE users 
         SET late_returns_count = COALESCE(late_returns_count, 0) + 1
         WHERE id = $1`,
        [order.customer_id]
      );

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
 * 2. NEW: Process Annual SaaS Licensing Expiry & Generate Pending Bills
 * Can be run at midnight cron or on-demand via the Admin Suite.
 */

async function processAnnualLicenseExpiry() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Select vendors whose subscription renewal date has arrived or passed
    const expiredVendorsQuery = `
      SELECT u.id, u.full_name, u.email, u.subscription_start_date, u.subscription_renewal_date
      FROM users u
      WHERE u.role = 'vendor'
        AND u.subscription_renewal_date <= CURRENT_DATE
      FOR UPDATE OF u
    `;
    const { rows: expiredVendors } = await client.query(expiredVendorsQuery);
    const generatedBills = [];

    for (const vendor of expiredVendors) {
      const cycleYear = new Date(vendor.subscription_start_date).getFullYear();

      // Check if a finalized bill already exists for this cycle year
      const existingBill = await client.query(
        `SELECT id, payment_status FROM vendor_annual_billing 
         WHERE vendor_id = $1 AND billing_year = $2`,
        [vendor.id, cycleYear]
      );

      // Only proceed if bill does not exist or is still accumulating
      if (existingBill.rows.length === 0 || existingBill.rows[0].payment_status === 'ACCUMULATING') {
        // Aggregate all orders returned or declared lost within the concluded window
        const ordersAgg = await client.query(
          `SELECT 
             COUNT(id)::INT AS total_orders,
             COALESCE(SUM(customer_paid_rent_snapshot), 0.00)::NUMERIC(12, 2) AS total_earnings
           FROM orders
           WHERE vendor_id = $1
             AND status IN ('Returned', 'Lost')
             AND returned_to_vendor_at >= $2::TIMESTAMP
             AND returned_to_vendor_at < ($3::DATE + INTERVAL '1 day')::TIMESTAMP`,
          [vendor.id, vendor.subscription_start_date, vendor.subscription_renewal_date]
        );

        const totalOrders = ordersAgg.rows[0].total_orders;
        const totalEarnings = parseFloat(ordersAgg.rows[0].total_earnings);
        const royaltyFeeDue = parseFloat((totalEarnings * 0.05).toFixed(2));

        const insertBill = await client.query(
          `INSERT INTO vendor_annual_billing (
             vendor_id, 
             billing_year, 
             period_start, 
             period_end, 
             total_orders_completed, 
             total_net_rental_earnings, 
             platform_fee_due,
             payment_status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING'::billing_status_type)
           ON CONFLICT (vendor_id, billing_year)
           DO UPDATE SET
             period_start = EXCLUDED.period_start,
             period_end = EXCLUDED.period_end,
             total_orders_completed = EXCLUDED.total_orders_completed,
             total_net_rental_earnings = EXCLUDED.total_net_rental_earnings,
             platform_fee_due = EXCLUDED.platform_fee_due,
             payment_status = 'PENDING'::billing_status_type
           WHERE vendor_annual_billing.payment_status != 'PAID'::billing_status_type
           RETURNING id, payment_status`,
          [
            vendor.id,
            cycleYear,
            vendor.subscription_start_date,
            vendor.subscription_renewal_date,
            totalOrders,
            totalEarnings,
            royaltyFeeDue,
          ]
        );

        if (insertBill.rows.length > 0) {
          generatedBills.push({
            billId: insertBill.rows[0].id,
            vendorId: vendor.id,
            vendorName: vendor.full_name,
            feeDue: royaltyFeeDue,
          });
        }
      }
    }

    await client.query('COMMIT');
    return { success: true, count: generatedBills.length, generatedBills };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Process Annual License Expiry Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 3. Purge stale chat conversations based on retention policy
 */
const purgeExpiredChats = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inquiryResult = await client.query(`
      DELETE FROM chat_conversations
      WHERE order_id IS NULL
        AND last_message_at < NOW() - INTERVAL '3 days'
      RETURNING id
    `);

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
      console.log(`🧹 Chat Purge Run: Cleaned ${totalPurged} stale threads.`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error executing chat retention purge:', err.message);
  } finally {
    client.release();
  }
};

function initCronJobs() {
  // Cron Job 1: Every 5 minutes - Delete uncompleted parent orders[cite: 14]
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

  // Cron Job 2: Daily at 9:00 PM IST (21:00) - Reconcile Overdue Lost Orders[cite: 14]
  cron.schedule(
    '0 21 * * *',
    async () => {
      console.log('⏰ Running scheduled 9:00 PM Lost Orders check...');
      try {
        const result = await processLostOrders();
        console.log(`✅ 9:00 PM Lost Orders completed. Marked lost: ${result.count}`);
      } catch (err) {
        console.error('⚠️ 9:00 PM Cron failed:', err.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Cron Job 3: Daily at Midnight IST (00:00) - Annual License Expiry Audit & Chat Purge[cite: 14]
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('⏰ Running scheduled Midnight Audits (License Expiry & Chat Retention)...');
      try {
        const billingResult = await processAnnualLicenseExpiry();
        console.log(`✅ Midnight License Audit: Generated ${billingResult.count} pending annual bill(s).`);
      } catch (err) {
        console.error('⚠️ Midnight License Audit failed:', err.message);
      }
      await purgeExpiredChats();
    },
    { timezone: 'Asia/Kolkata' }
  );
}

module.exports = { initCronJobs, processLostOrders, processAnnualLicenseExpiry };