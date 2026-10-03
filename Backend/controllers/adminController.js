// controllers/adminController.js
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { sendAccountBlockedEmail } = require('../services/emailService');
const { processLostOrders, processAnnualLicenseExpiry } = require('../services/cronJobs');

// GET /api/v1/rms/admin/dashboardStats
exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await pool.query("SELECT role, COUNT(*)::INT FROM users GROUP BY role");
    const activeRentals = await pool.query("SELECT COUNT(*)::INT FROM active_orders WHERE status = 'With Customer'");
    const pendingKyc = await pool.query("SELECT COUNT(*)::INT FROM users WHERE kyc_status = 'pending'");

    // SaaS Revenue: 5% annual platform royalties across all billing periods
    const royaltyFinancials = await pool.query(`
      SELECT 
        COALESCE(SUM(total_net_rental_earnings), 0)::NUMERIC(12,2) AS total_vendor_net_earnings,
        COALESCE(SUM(platform_fee_due), 0)::NUMERIC(12,2) AS total_platform_royalties_due,
        COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN platform_fee_due ELSE 0 END), 0)::NUMERIC(12,2) AS total_royalties_collected
      FROM vendor_annual_billing
    `);

    // Total gross business transacted across all vendor gateways
    const grossVolumeRes = await pool.query(`
      SELECT 
        COALESCE(SUM(customer_paid_rent_snapshot), 0)::NUMERIC(12,2) AS total_customer_rent_paid,
        COALESCE(SUM(discount_amount_snapshot), 0)::NUMERIC(12,2) AS total_vendor_discounts_given
      FROM orders 
      WHERE status NOT IN ('Pending_Payment', 'Cancelled')
    `);

    const activeCouponsCount = await pool.query(
      "SELECT COUNT(*)::INT AS active_coupons_count FROM store_coupons WHERE is_active = TRUE"
    );

    return res.status(200).json({
      success: true,
      stats: {
        usersByRole: totalUsers.rows,
        activeRentalsCount: activeRentals.rows[0]?.count || 0,
        pendingKycCount: pendingKyc.rows[0]?.count || 0,
        totalVendorNetEarnings: parseFloat(royaltyFinancials.rows[0].total_vendor_net_earnings),
        totalPlatformRoyaltiesDue: parseFloat(royaltyFinancials.rows[0].total_platform_royalties_due),
        totalRoyaltiesCollected: parseFloat(royaltyFinancials.rows[0].total_royalties_collected),
        totalCustomerRentPaid: parseFloat(grossVolumeRes.rows[0].total_customer_rent_paid),
        totalVendorDiscountsGiven: parseFloat(grossVolumeRes.rows[0].total_vendor_discounts_given),
        activeCouponsCount: activeCouponsCount.rows[0]?.active_coupons_count || 0,
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
             u.subscription_start_date, u.subscription_renewal_date,
             (u.razorpay_key_id IS NOT NULL) AS has_payment_gateway,
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

    await client.query(
      `INSERT INTO customer_pardon_history (customer_id, admin_id, violations_pardoned, reason)
       VALUES ($1, $2, $3, $4)`,
      [userId, adminId, violationsToPardon, reason || '1-Time Customer Loyalty Pardon granted by Administrator']
    );

    const updatedUserRes = await client.query(
      `UPDATE users 
       SET late_returns_count = 0 
       WHERE id = $1 
       RETURNING id, full_name, email, late_returns_count`,
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
    const { userId, is_blocked } = req.body;

    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE users SET is_blocked = $1 WHERE id = $2 RETURNING id, full_name, email, is_blocked',
      [is_blocked, userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

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
      io.emit('USER_BLOCKED', { userId });
    }

    return res.status(200).json({
      success: true,
      message: `User ${is_blocked ? 'blocked and undelivered bookings cancelled' : 'unblocked'} successfully.`,
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

// KYC Officer Management
exports.getKycOfficers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, full_name, email, phone, created_at FROM users WHERE role = 'kyc_officer' AND is_blocked = FALSE"
    );
    return res.status(200).json({ success: true, officers: result.rows });
  } catch (error) {
    console.error('Get Officers Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch officers.' });
  }
};

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

exports.removeKycOfficer = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE users SET is_blocked = TRUE WHERE id = $1 AND role = 'kyc_officer'", [id]);
    return res.status(200).json({ success: true, message: 'Officer removed successfully.' });
  } catch (error) {
    console.error('Remove Officer Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove officer.' });
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

// GET /api/v1/rms/admin/annualBillingAudit
// Oversee vendor annual 5% platform royalty obligations
exports.getAnnualBillingAudit = async (req, res) => {
  try {
    const query = `
      SELECT vab.*, u.full_name AS vendor_name, u.email AS vendor_email, u.phone AS vendor_phone
      FROM vendor_annual_billing vab
      JOIN users u ON vab.vendor_id = u.id
      ORDER BY vab.billing_year DESC, vab.period_end DESC
    `;
    const result = await pool.query(query);
    return res.status(200).json({ success: true, billingLedger: result.rows });
  } catch (error) {
    console.error('Annual Billing Audit Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch annual billing records.' });
  }
};

// POST /api/v1/rms/admin/markAnnualBillingPaid
// Admin confirms receipt of the vendor's 5% annual royalty fee
exports.markAnnualBillingPaid = async (req, res) => {
  try {
    const { billing_id } = req.body;
    if (!billing_id) {
      return res.status(400).json({ success: false, message: 'Billing ID is required.' });
    }

    const result = await pool.query(
      `UPDATE vendor_annual_billing 
       SET payment_status = 'PAID', paid_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [billing_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Billing record not found.' });
    }

    const vendorId = result.rows[0].vendor_id;

    // Advance the vendor's subscription dates by 1 year
    await pool.query(
      `UPDATE users 
       SET subscription_start_date = CURRENT_DATE,
           subscription_renewal_date = (CURRENT_DATE + INTERVAL '1 year')
       WHERE id = $1`,
      [vendorId]
    );

    // Notify any open vendor sessions via socket
    const io = req.app.get('socketio');
    if (io) {
      io.emit('ANNUAL_BILLING_PAID', { vendorId, billingId: billing_id });
    }

    return res.status(200).json({
      success: true,
      message: 'Annual platform royalty marked as PAID. Vendor subscription renewed.',
      record: result.rows[0],
    });
  } catch (error) {
    console.error('Mark Billing Paid Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update billing status.' });
  }
};

// GET /api/v1/rms/admin/transactionLedger
// Unified audit ledger tracking customer checkouts and vendor deposit refunds
exports.getTransactionLedger = async (req, res) => {
  try {
    // 1. Direct Customer Inflows (Checkout bookings)
    const incomingQuery = `
      SELECT 
        po.id AS group_id,
        po.created_at AS transaction_date,
        po.razorpay_payment_id AS payment_reference,
        u.full_name AS customer_name,
        v.full_name AS vendor_name,
        'INFLOW_PAYMENT' AS transaction_type,
        COUNT(o.id)::INT AS total_sub_orders,
        COALESCE(SUM(o.gross_rent_snapshot), 0)::NUMERIC(10,2) AS total_gross_rent,
        COALESCE(SUM(o.discount_amount_snapshot), 0)::NUMERIC(10,2) AS total_vendor_discount,
        COALESCE(SUM(o.customer_paid_rent_snapshot), 0)::NUMERIC(10,2) AS total_net_rent,
        COALESCE(SUM(o.deposit_per_item_snapshot * o.quantity), 0)::NUMERIC(10,2) AS total_security_deposit,
        (COALESCE(SUM(o.customer_paid_rent_snapshot), 0) + COALESCE(SUM(o.deposit_per_item_snapshot * o.quantity), 0))::NUMERIC(10,2) AS gross_amount
      FROM parent_order po
      JOIN users u ON po.customer_id = u.id
      JOIN users v ON po.vendor_id = v.id
      JOIN orders o ON po.id = o.group_id
      WHERE o.status != 'Pending_Payment'
      GROUP BY po.id, po.created_at, po.razorpay_payment_id, u.full_name, v.full_name
      ORDER BY po.created_at DESC
    `;

    // 2. Vendor Outflows (Deposit refunds upon return or cancellation)
    const outgoingQuery = `
      SELECT 
        o.id AS order_id,
        o.group_id,
        o.returned_to_vendor_at AS transaction_date,
        o.deposit_refund_reference AS payment_reference,
        u.full_name AS customer_name,
        v.full_name AS vendor_name,
        p.title AS product_title,
        'OUTFLOW_REFUND' AS transaction_type,
        o.deposit_refunded_amount AS refund_amount,
        (o.deposit_per_item_snapshot * o.quantity) AS original_deposit,
        o.product_condition,
        o.status AS order_status
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      JOIN users v ON o.vendor_id = v.id
      JOIN products p ON o.product_id = p.id
      WHERE o.deposit_refund_reference IS NOT NULL 
         OR o.deposit_refunded_amount > 0
      ORDER BY o.returned_to_vendor_at DESC NULLS LAST
    `;

    const [inflowsRes, outflowsRes] = await Promise.all([
      pool.query(incomingQuery),
      pool.query(outgoingQuery),
    ]);

    const totalCollected = inflowsRes.rows.reduce((acc, row) => acc + parseFloat(row.gross_amount || 0), 0);
    const totalNetRent = inflowsRes.rows.reduce((acc, row) => acc + parseFloat(row.total_net_rent || 0), 0);
    const totalDiscounts = inflowsRes.rows.reduce((acc, row) => acc + parseFloat(row.total_vendor_discount || 0), 0);
    const totalRefunded = outflowsRes.rows.reduce((acc, row) => acc + parseFloat(row.refund_amount || 0), 0);

    return res.status(200).json({
      success: true,
      summary: {
        totalGrossVolumeTransacted: totalCollected,
        totalNetRentalRevenue: totalNetRent,
        totalVendorDiscountsGiven: totalDiscounts,
        totalSecurityDepositsRefunded: totalRefunded,
        totalInflowTransactions: inflowsRes.rows.length,
        totalOutflowRefunds: outflowsRes.rows.length,
      },
      inflowTransactions: inflowsRes.rows,
      outflowRefunds: outflowsRes.rows,
    });
  } catch (error) {
    console.error('Transaction Ledger Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch transaction ledger.' });
  }
};

// POST /api/v1/rms/admin/triggerLicenseExpiryCheck
exports.triggerLicenseExpiryCheck = async (req, res) => {
  try {
    const result = await processAnnualLicenseExpiry();
    return res.status(200).json({
      success: true,
      message: `License expiry audit completed. Generated ${result.count} pending annual bill(s).`,
      count: result.count,
    });
  } catch (error) {
    console.error('Admin Trigger License Expiry Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to execute license audit.' });
  }
};

// POST /api/v1/rms/admin/addCategory
// Restricts taxonomy creation exclusively to platform administrators
exports.addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const result = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *',
      [name.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, message: 'Category already exists.' });
    }

    return res.status(201).json({
      success: true,
      message: `Category "${result.rows[0].name}" added to public taxonomy.`,
      category: result.rows[0],
    });
  } catch (error) {
    console.error('Admin Add Category Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create category.' });
  }
};