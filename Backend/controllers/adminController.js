// controllers/adminController.js
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const razorpay = require('../config/razorpay');
const { sendPayoutSettlementEmail, sendAccountBlockedEmail } = require('../services/emailService');
const { processLostOrders } = require('../services/cronJobs');


// GET /api/v1/rms/admin/dashboardStats
exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await pool.query("SELECT role, COUNT(*)::INT FROM users GROUP BY role");
    const activeRentals = await pool.query("SELECT COUNT(*)::INT FROM active_orders WHERE status = 'With Customer'");
    const pendingKyc = await pool.query("SELECT COUNT(*)::INT FROM users WHERE kyc_status = 'pending'");
    const totalSettlements = await pool.query("SELECT SUM(amount)::NUMERIC(10,2) AS gross FROM payouts");

    const loyaltyFinancials = await pool.query(`
      SELECT 
        COALESCE(SUM(platform_commission_snapshot), 0) AS total_platform_commission
      FROM orders 
      WHERE status IN ('Lock', 'With Customer', 'Returned', 'Lost')
    `);

    const totaldiscountused = await pool.query(`
      SELECT 
        COALESCE(SUM(discount_amount_snapshot), 0) AS total_discounts_absorbed
      FROM orders 
      WHERE status NOT IN ('Pending_Payment')
    `);

    const activeCouponsCount = await pool.query(
      "SELECT COUNT(*) AS active_coupons_count FROM coupons WHERE status = 'AVAILABLE'"
    );

    return res.status(200).json({
      success: true,
      stats: {
        usersByRole: totalUsers.rows,
        activeRentalsCount: activeRentals.rows[0]?.count || 0,
        pendingKycCount: pendingKyc.rows[0]?.count || 0,
        totalDisbursedAmount: totalSettlements.rows[0]?.gross || 0,

        totalPlatformCommission: parseFloat(loyaltyFinancials.rows[0].total_platform_commission),
        totalDiscountsAbsorbed: parseFloat(totaldiscountused.rows[0].total_discounts_absorbed),
        activeCouponsCount: parseInt(activeCouponsCount.rows[0].active_coupons_count, 10),
      },
    });
  } catch (error) {
    console.error('Admin Stats Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
};

// GET /api/v1/rms/admin/ordersByCategory
exports.getOrdersByCategory = async (req, res) => {
  try {
    const { category } = req.query; 
    // 'all' | 'with_customer' | 'returned_on_time' | 'returned_late' | 'overdue_active' | 'lost' | 'cancelled'

    let whereClause = '';

    switch (category) {
      case 'with_customer':
        whereClause = "o.status = 'With Customer' AND CURRENT_DATE <= o.end_date";
        break;
      case 'returned_on_time':
        whereClause = "o.status = 'Returned' AND o.returned_to_vendor_at::DATE <= o.end_date";
        break;
      case 'returned_late':
        whereClause = "o.status = 'Returned' AND o.returned_to_vendor_at::DATE > o.end_date";
        break;
      case 'overdue_active':
        whereClause = "o.status = 'With Customer' AND CURRENT_DATE > o.end_date AND CURRENT_DATE <= (o.end_date + o.max_late_days)";
        break;
      case 'lost':
        whereClause = "o.status = 'Lost' OR (o.status = 'With Customer' AND CURRENT_DATE > (o.end_date + o.max_late_days))";
        break;
      case 'cancelled':
        whereClause = "o.status = 'Cancelled'";
        break;
      case 'all':
      default:
        whereClause = '1=1';
    }

    const query = `
      SELECT o.*, p.title AS product_title,
             c.full_name AS customer_name, c.phone AS customer_phone,
             v.full_name AS vendor_name, v.phone AS vendor_phone
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users c ON o.customer_id = c.id
      JOIN users v ON o.vendor_id = v.id
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
    `;

    const result = await pool.query(query);
    return res.status(200).json({ success: true, count: result.rows.length, orders: result.rows });
  } catch (error) {
    console.error('Admin Orders Category Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch categorized orders.' });
  }
};

// GET /api/v1/rms/admin/vendors
exports.getAllVendors = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.phone, u.address, u.city, u.pincode, u.is_blocked,
             COUNT(p.id)::INT AS total_products
      FROM users u
      LEFT JOIN products p ON u.id = p.vendor_id
      WHERE u.role = 'vendor'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    return res.status(200).json({ success: true, vendors: result.rows });
  } catch (error) {
    console.error('Get Vendors Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch vendors.' });
  }
};

// GET /api/v1/rms/admin/vendorProducts/:vendorId
exports.getVendorProducts = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const result = await pool.query(
      'SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.vendor_id = $1',
      [vendorId]
    );

    return res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Get Vendor Products Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
};

// DELETE /api/v1/rms/admin/product/:id
exports.deleteProductByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE products SET total_quantity=$2 WHERE id = $1', [id, 0]);
    return res.status(200).json({ success: true, message: 'Product Quantity set to 0 by admin.' });
  } catch (error) {
    console.error('Admin Delete Product Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove product.' });
  }
};

// GET /api/v1/rms/admin/delinquentUsers
exports.getDelinquentUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, 
        u.full_name, 
        u.email, 
        u.phone, 
        u.late_returns_count, 
        u.consecutive_good_returns, 
        u.is_blocked,
        COALESCE(SUM(cph.violations_pardoned), 0)::INT AS total_pardoned_violations,
        COUNT(cph.id)::INT AS pardon_count,
        MAX(cph.created_at) AS last_pardoned_at
      FROM users u
      LEFT JOIN customer_pardon_history cph ON u.id = cph.customer_id
      WHERE u.late_returns_count > 0 OR cph.id IS NOT NULL
      GROUP BY u.id
      ORDER BY u.late_returns_count DESC, total_pardoned_violations DESC
    `);
    return res.status(200).json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Get Delinquent Users Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch delinquent users.' });
  }
};

// POST /api/v1/rms/admin/pardonDelinquentUser
exports.pardonDelinquentUser = async (req, res) => {
  const client = await pool.connect();
  try {
    const adminId = req.user.id;
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Customer User ID is required.' });
    }

    await client.query('BEGIN');

    // Fetch current late returns count
    const userRes = await client.query(
      'SELECT id, full_name, email, late_returns_count FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User record not found.' });
    }

    const targetUser = userRes.rows[0];
    const violationsToPardon = targetUser.late_returns_count;

    if (violationsToPardon <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'This user currently has 0 active late return violations.',
      });
    }

    // 1. Insert audit record in customer_pardon_history
    await client.query(
      `INSERT INTO customer_pardon_history (customer_id, admin_id, violations_pardoned, reason)
       VALUES ($1, $2, $3, $4)`,
      [userId, adminId, violationsToPardon, reason || '1-Time Customer Loyalty Pardon granted by Administrator']
    );

    // 2. Reset active late_returns_count to 0 (unfreezes loyalty streak without losing existing count)
    const updatedUserRes = await client.query(
      `UPDATE users 
       SET late_returns_count = 0 
       WHERE id = $1 
       RETURNING id, full_name, email, late_returns_count, consecutive_good_returns`,
      [userId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Pardon granted to ${targetUser.full_name}. Active violations reset to 0.`,
      user: updatedUserRes.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Pardon Delinquent User Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process customer pardon.' });
  } finally {
    client.release();
  }
};


// POST /api/v1/rms/admin/toggleBlockUser
exports.toggleBlockUser = async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId, is_blocked } = req.body; //[cite: 21]

    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE users SET is_blocked = $1 WHERE id = $2 RETURNING id, full_name, email, is_blocked',
      [is_blocked, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // If blocking user, auto-cancel orders in 'Lock' status (not yet handed over)
    if (is_blocked) {
      await client.query(
        `UPDATE orders 
         SET status = 'Cancelled', 
             cancelled_by = 'admin' 
         WHERE customer_id = $1 AND status = 'Lock'`,
        [userId]
      );

      sendAccountBlockedEmail({
        to: result.rows[0].email,
        userName: result.rows[0].full_name,
        reason: 'Account frozen by platform administration due to policy review or repeated delinquency.',
      });
    }

    await client.query('COMMIT');

    const io = req.app.get('socketio');
    if (io && is_blocked) {
      io.emit('USER_BLOCKED', { userId }); //[cite: 21]
      io.emit('PAYOUT_GENERATED', { customerId: userId });
    }

    return res.status(200).json({
      success: true,
      message: `User ${is_blocked ? 'blocked and non-dispatched bookings refunded' : 'unblocked'} successfully.`,
      user: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Toggle Block User Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to toggle block status.' });
  } finally {
    client.release();
  }
};


// GET /api/v1/rms/admin/officers
exports.getKycOfficers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, full_name, email, phone, created_at FROM users WHERE role = 'kyc_officer' AND is_blocked=false"
    );
    return res.status(200).json({ success: true, officers: result.rows });
  } catch (error) {
    console.error('Get Officers Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch officers.' });
  }
};

// POST /api/v1/rms/admin/addOfficer
exports.addKycOfficer = async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role, kyc_status)
       VALUES ($1, $2, $3, $4, 'kyc_officer', 'verified')
       RETURNING id, full_name, email, phone, role`,
      [full_name, email, phone, password_hash]
    );

    return res.status(201).json({ success: true, officer: result.rows[0] });
  } catch (error) {
    console.error('Add Officer Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add KYC officer.' });
  }
};

// DELETE /api/v1/rms/admin/removeOfficer/:id
exports.removeKycOfficer = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE users SET is_blocked = True WHERE id = $1 AND role = 'kyc_officer'", [id]);

    return res.status(200).json({ success: true, message: 'Officer removed successfully.' });
  } catch (error) {
    console.error('Remove Officer Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove officer.' });
  }
};

// GET /api/v1/rms/admin/pendingPayouts
// GET /api/v1/rms/admin/pendingPayouts
// Fetches only unpaid settlements (gateway_reference_id IS NULL)
exports.getPendingPayouts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.full_name AS recipient_name, u.bank_account_no, u.bank_ifsc, u.phone
      FROM payouts p
      JOIN users u ON p.recipient_id = u.id
      WHERE p.gateway_reference_id IS NULL
      ORDER BY p.processed_at DESC
    `);
    return res.status(200).json({ success: true, payouts: result.rows });
  } catch (error) {
    console.error('Get Payouts Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch pending payouts.' });
  }
};

// POST /api/v1/rms/admin/recordPayoutReference
// Verifies directly with Razorpay API before recording gateway_reference_id
// POST /api/v1/rms/admin/recordPayoutReference
// Verifies directly with Razorpay API before recording gateway_reference_id
exports.recordPayoutReference = async (req, res) => {
  const client = await pool.connect();
  try {
    const { payout_id, gateway_reference_id } = req.body;

    if (!payout_id || !gateway_reference_id || typeof gateway_reference_id !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Payout ID and a valid Razorpay Reference ID are required.',
      });
    }

    const trimmedRef = gateway_reference_id.trim();

    await client.query('BEGIN');

    // 1. Acquire exclusive row-level lock on payout record[cite: 8]
    const existingPayout = await client.query(
      'SELECT * FROM payouts WHERE id = $1 FOR UPDATE',
      [payout_id]
    );

    if (existingPayout.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Payout record not found.' });
    }

    const payoutRecord = existingPayout.rows[0];

    if (payoutRecord.gateway_reference_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'This payout has already been verified and recorded.',
      });
    }

    // 2. Query Razorpay API directly to verify genuine transaction[cite: 8]
    let razorpayPayment;
    try {
      razorpayPayment = await razorpay.payments.fetch(trimmedRef);
    } catch (rzpErr) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invalid Razorpay Reference ID or transaction does not exist on Razorpay.',
        error: rzpErr.error ? rzpErr.error.description : rzpErr.message,
      });
    }

    // 3. Verify Payment Status & Amount Integrity[cite: 8]
    const expectedPaise = Math.round(parseFloat(payoutRecord.amount) * 100);

    if (razorpayPayment.status !== 'captured' && razorpayPayment.status !== 'processed') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Transaction on Razorpay is not successful (Current Status: ${razorpayPayment.status}).`,
      });
    }

    if (razorpayPayment.amount !== expectedPaise) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Amount mismatch: Payout requires ₹${payoutRecord.amount}, but Razorpay transaction is for ₹${razorpayPayment.amount / 100}.`,
      });
    }

    // 4. Update payout record with transaction reference[cite: 8]
    const result = await client.query(
      `UPDATE payouts 
       SET gateway_reference_id = $1,
           processed_at = CURRENT_TIMESTAMP
       WHERE id = $2 
       RETURNING *`,
      [trimmedRef, payout_id]
    );

    await client.query('COMMIT');

    // 5. Send settlement receipt email asynchronously
    const recipientQuery = await pool.query(
      `SELECT u.full_name, u.email, u.bank_account_no, u.bank_ifsc,
              o.start_date, o.end_date, p_prod.title AS product_title
       FROM payouts p
       JOIN users u ON p.recipient_id = u.id
       JOIN orders o ON p.order_id = o.id
       JOIN products p_prod ON o.product_id = p_prod.id
       WHERE p.id = $1`,
      [payout_id]
    );

    if (recipientQuery.rows.length > 0) {
      const data = recipientQuery.rows[0];
      sendPayoutSettlementEmail({
        recipient: {
          full_name: data.full_name,
          email: data.email,
          bank_account_no: data.bank_account_no,
          bank_ifsc: data.bank_ifsc,
        },
        payout: result.rows[0],
        orderDetails: {
          product_title: data.product_title,
          start_date: data.start_date,
          end_date: data.end_date,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payout transaction verified with Razorpay and recorded successfully.',
      payout: result.rows[0],
      razorpay_details: {
        id: razorpayPayment.id,
        method: razorpayPayment.method,
        status: razorpayPayment.status,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Record Payout Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process payout verification.' });
  } finally {
    client.release();
  }
};

// POST /api/v1/rms/admin/createPayoutOrder
// Generates a Razorpay order_id for an individual payout settlement
exports.createPayoutOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const { payout_id } = req.body;

    if (!payout_id) {
      return res.status(400).json({ success: false, message: 'Payout ID is required.' });
    }

    await client.query('BEGIN');

    // 1. Acquire exclusive lock on payout record to prevent concurrent order creation[cite: 8]
    const payoutRes = await client.query(
      `SELECT p.*, u.full_name AS recipient_name, u.email AS recipient_email, u.phone AS recipient_phone
       FROM payouts p
       JOIN users u ON p.recipient_id = u.id
       WHERE p.id = $1 FOR UPDATE`,
      [payout_id]
    );

    if (payoutRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Payout record not found.' });
    }

    const payout = payoutRes.rows[0];

    // Check if payout has already been completed[cite: 8]
    if (payout.gateway_reference_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'This payout has already been paid and finalized.',
      });
    }

    // 2. Convert amount to paise (e.g., ₹500.00 -> 50000 paise)[cite: 8]
    const amountInPaise = Math.round(parseFloat(payout.amount) * 100);

    // 3. Create Razorpay Order[cite: 8]
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `payout_rcpt_${payout.id}_${Date.now()}`,
      notes: {
        payout_id: payout.id.toString(),
        order_id: payout.order_id.toString(),
        recipient_id: payout.recipient_id.toString(),
        payout_type: payout.type,
      },
    };

    const rzpOrder = await razorpay.orders.create(options);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Razorpay order created for payout approval.',
      key_id: process.env.RAZORPAY_KEY_ID,
      razorpay_order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      payout: {
        id: payout.id,
        amount: payout.amount,
        type: payout.type,
        recipient_name: payout.recipient_name,
        recipient_email: payout.recipient_email,
        recipient_phone: payout.recipient_phone,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create Payout Order Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create payout order.' });
  } finally {
    client.release();
  }
};

// POST /api/v1/rms/admin/triggerLostOrdersCheck
exports.triggerLostOrdersCheck = async (req, res) => {
  try {
    const result = await processLostOrders();

    return res.status(200).json({
      success: true,
      message: `Lost orders reconciliation executed. ${result.count} order(s) marked as Lost.`,
      data: result,
    });
  } catch (error) {
    console.error('Manual Lost Orders Trigger Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute lost orders check.',
      error: error.message,
    });
  }
};


// GET /api/v1/rms/admin/transactionLedger
exports.getTransactionLedger = async (req, res) => {
  try {
    // 1. Fetch All Incoming Customer Payments (Including Loyalty Discounts & Platform Commission Snapshots)
    const incomingQuery = `
      SELECT 
        po.id AS group_id,
        po.created_at AS transaction_date,
        u.full_name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone,
        COUNT(o.id)::INT AS total_sub_orders,
        COALESCE(SUM(o.gross_rent_snapshot), 0)::NUMERIC(10,2) AS total_gross_rent,
        COALESCE(SUM(o.discount_amount_snapshot), 0)::NUMERIC(10,2) AS total_loyalty_discount,
        COALESCE(SUM(o.customer_paid_rent_snapshot), 0)::NUMERIC(10,2) AS total_rent,
        COALESCE(SUM(o.deposit_per_item_snapshot * o.quantity), 0)::NUMERIC(10,2) AS total_escrow_deposit,
        COALESCE(SUM(o.platform_commission_snapshot), 0)::NUMERIC(10,2) AS total_platform_commission,
        (COALESCE(SUM(o.customer_paid_rent_snapshot), 0) + COALESCE(SUM(o.deposit_per_item_snapshot * o.quantity), 0))::NUMERIC(10,2) AS gross_amount
      FROM parent_order po
      JOIN users u ON po.customer_id = u.id
      JOIN orders o ON po.id = o.group_id
      WHERE o.status != 'Pending_Payment'
      GROUP BY po.id, po.created_at, u.full_name, u.email, u.phone
      ORDER BY po.created_at DESC
    `;

    // 2. Fetch All Outgoing Disbursals (Payout Ledger Entries)
    const outgoingQuery = `
      SELECT 
        p.id AS payout_id,
        p.order_id,
        p.group_id,
        p.amount,
        p.type,
        p.gateway_reference_id,
        p.processed_at,
        u.full_name AS recipient_name,
        u.email AS recipient_email,
        u.role AS recipient_role,
        u.bank_account_no,
        u.bank_ifsc,
        prod.title AS product_title
      FROM payouts p
      JOIN users u ON p.recipient_id = u.id
      JOIN orders o ON p.order_id = o.id
      JOIN products prod ON o.product_id = prod.id
      ORDER BY p.processed_at DESC
    `;

    // 3. Aggregate Platform-Wide Revenue & Discount Totals
    const platformFinancialsQuery = `
      SELECT 
        COALESCE(SUM(platform_commission_snapshot), 0)::NUMERIC(10,2) AS total_platform_commission_earned,
        COALESCE(SUM(discount_amount_snapshot), 0)::NUMERIC(10,2) AS total_loyalty_discounts_absorbed
      FROM orders
      WHERE status IN ('Lock', 'With Customer', 'Returned', 'Lost')
    `;

    const [incomingRes, outgoingRes, financialsRes] = await Promise.all([
      pool.query(incomingQuery),
      pool.query(outgoingQuery),
      pool.query(platformFinancialsQuery),
    ]);

    const totalCollected = incomingRes.rows.reduce((acc, row) => acc + parseFloat(row.gross_amount || 0), 0);
    const totalDisbursedSettled = outgoingRes.rows
      .filter((p) => p.gateway_reference_id)
      .reduce((acc, row) => acc + parseFloat(row.amount || 0), 0);
    const totalPendingDisbursal = outgoingRes.rows
      .filter((p) => !p.gateway_reference_id)
      .reduce((acc, row) => acc + parseFloat(row.amount || 0), 0);

    const platformCommissionEarned = parseFloat(financialsRes.rows[0]?.total_platform_commission_earned || 0);
    const loyaltyDiscountsAbsorbed = parseFloat(financialsRes.rows[0]?.total_loyalty_discounts_absorbed || 0);

    return res.status(200).json({
      success: true,
      summary: {
        totalGrossCollected: totalCollected,
        totalDisbursedSettled: totalDisbursedSettled,
        totalPendingDisbursal: totalPendingDisbursal,
        netEscrowRetained: totalCollected - (totalDisbursedSettled + totalPendingDisbursal),
        totalPlatformCommissionEarned: platformCommissionEarned,
        totalLoyaltyDiscountsAbsorbed: loyaltyDiscountsAbsorbed,
      },
      incomingTransactions: incomingRes.rows,
      outgoingPayouts: outgoingRes.rows,
    });
  } catch (error) {
    console.error('Transaction Ledger Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch transaction ledger.' });
  }
};

