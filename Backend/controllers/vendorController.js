// controllers/vendorController.js
const Razorpay = require('razorpay');
const crypto = require('crypto');

const pool = require('../config/db');
const { decryptText, encryptText } = require('../utils/encryptionUtil');
const { sendDepositForfeitureEmail, sendCustomerCancellationEmail, sendDepositRefundSettlementEmail } = require('../services/emailService');
const imagekit = require('../config/imagekit');
const { deleteImageFromImageKit } = require('../utils/imagekitUtil');

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

// 2. Fetch Active Bill Status
exports.getAnnualBillingStatus = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendorQuery = await pool.query(
      `SELECT subscription_start_date, subscription_renewal_date FROM users WHERE id = $1`,
      [vendorId]
    );

    const billsQuery = await pool.query(
      `SELECT * FROM vendor_annual_billing 
       WHERE vendor_id = $1 
       ORDER BY billing_year DESC`,
      [vendorId]
    );

    const pendingBill = billsQuery.rows.find((b) => b.payment_status === 'PENDING' || b.payment_status === 'OVERDUE' ) || null;

    return res.status(200).json({
      success: true,
      subscription: vendorQuery.rows[0],
      pendingBill,
      history: billsQuery.rows,
    });
  } catch (error) {
    console.error('Get Annual Billing Status Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch billing status.' });
  }
};

// 3. Create Razorpay Order using PLATFORM ADMIN credentials from .env
exports.createAnnualBillingOrder = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { billing_id } = req.body;

    // 1. Verify vendor anniversary date has arrived before accepting payment
    const vendorRes = await pool.query(
      `SELECT subscription_renewal_date FROM users WHERE id = $1`,
      [vendorId]
    );

    if (vendorRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const renewalDate = new Date(vendorRes.rows[0].subscription_renewal_date);
    const now = new Date();

    // Prevent paying before the 1-year cycle has actually concluded
    if (now < renewalDate) {
      return res.status(400).json({
        success: false,
        message: `Your annual billing cycle is active until ${renewalDate.toLocaleDateString()}. Royalties are finalized and settled at the conclusion of your full 12-month period.`,
      });
    }

    const billRes = await pool.query(
      `SELECT * FROM vendor_annual_billing WHERE id = $1 AND vendor_id = $2 AND payment_status = 'PENDING'`,
      [billing_id, vendorId]
    );

    if (billRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No pending annual bill found.' });
    }

    const bill = billRes.rows[0];
    const amountInPaise = Math.round(parseFloat(bill.platform_fee_due) * 100);

    // If zero earnings during the year, mark settled directly
    if (amountInPaise <= 0) {
      await pool.query(
        `UPDATE vendor_annual_billing SET payment_status = 'PAID', paid_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [billing_id]
      );
      await pool.query(
        `UPDATE users 
         SET subscription_start_date = CURRENT_DATE, 
             subscription_renewal_date = CURRENT_DATE + INTERVAL '1 year' 
         WHERE id = $1`,
        [vendorId]
      );
      return res.status(200).json({ success: true, zero_due: true, message: 'Annual license renewed (Zero earnings).' });
    }

    // Initialize using platform admin Razorpay keys from .env
    const platformRazorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const rzpOrder = await platformRazorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `annual_royalty_${bill.id}`,
      notes: {
        vendor_id: vendorId,
        billing_id: bill.id,
        year: bill.billing_year,
      },
    });

    return res.status(200).json({
      success: true,
      key_id: process.env.RAZORPAY_KEY_ID,
      razorpay_order_id: rzpOrder.id,
      amount: amountInPaise,
      currency: 'INR',
    });
  } catch (error) {
    console.error('Create Annual Billing Order Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to initialize payment.' });
  }
};

// 4. Verify Payment with Admin Secret & Rollover Subscription by +1 Year
// POST /api/v1/rms/vendor/verifyAnnualBillingPayment
exports.verifyAnnualBillingPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    const vendorId = req.user.id;
    const { billing_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature.' });
    }

    await client.query('BEGIN');

    // 1. Mark bill paid
    await client.query(
      `UPDATE vendor_annual_billing 
       SET payment_status = 'PAID'::billing_status_type, 
           paid_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND vendor_id = $2`,
      [billing_id, vendorId]
    );

    // 2. Fixed-Anchor Rollover: Advance anniversary window by exactly +1 year from old renewal date
    const userUpdate = await client.query(
      `UPDATE users 
       SET subscription_start_date = subscription_renewal_date,
           subscription_renewal_date = (subscription_renewal_date + INTERVAL '1 year')::DATE
       WHERE id = $1
       RETURNING subscription_start_date, subscription_renewal_date`,
      [vendorId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Annual license renewed successfully! Your store is active for another year.',
      subscription: userUpdate.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Verify Annual Billing Payment Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify payment.' });
  } finally {
    client.release();
  }
};

// GET /api/v1/rms/vendor/getProducts
exports.getMyProducts = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const result = await pool.query(
      `SELECT p.*, c.name AS category_name,
              COUNT(ao.order_id)::INT AS active_rentals_count
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN active_orders ao ON p.id = ao.product_id
       WHERE p.vendor_id = $1
       GROUP BY p.id, c.name
       ORDER BY p.created_at DESC`,
      [vendorId]
    );

    return res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Get Vendor Products Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch vendor products.' });
  }
};

// GET /api/v1/rms/vendor/getProduct/:id
exports.getProductById = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1 AND p.vendor_id = $2`,
      [id, vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or unauthorized.' });
    }

    return res.status(200).json({ success: true, product: result.rows[0] });
  } catch (error) {
    console.error('Get Product By ID Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch product details.' });
  }
};

// Ensures an expired vendor with an unpaid bill cannot mutate inventory
async function checkVendorLicenseActive(vendorId) {
  const res = await pool.query(
    `SELECT u.subscription_renewal_date,
            (
              SELECT COUNT(*) 
              FROM vendor_annual_billing vab 
              WHERE vab.vendor_id = u.id 
                AND vab.payment_status IN ('PENDING', 'OVERDUE')
                AND CURRENT_DATE > (vab.period_end + INTERVAL '3 days')
            ) AS overdue_bills_past_grace
     FROM users u WHERE u.id = $1`,
    [vendorId]
  );
  if (res.rows.length === 0) return false;
  const overdueCount = parseInt(res.rows[0].overdue_bills_past_grace, 10);
  // Vendor is blocked only if an unpaid bill is past the 3-day grace window
  return overdueCount === 0;
}

// POST /api/v1/rms/vendor/addProduct
exports.addProduct = async (req, res) => {
  try {
    const vendorId = req.user.id;

    // Check if vendor license is expired with an unpaid bill
    const isLicenseActive = await checkVendorLicenseActive(vendorId);
    if (!isLicenseActive) {
      return res.status(403).json({
        success: false,
        message: 'Your annual RMS software license has expired. Please settle your 5% platform royalty under "Payment Gateway & License" before adding new inventory.',
      });
    }

    const {
      title,
      description,
      category_id,
      total_quantity,
      rent_per_day_1_4,
      rent_per_day_5_9,
      rent_per_day_10_onwards,
      deposit_verified,
      deposit_non_verified,
      late_fee_verified,
      cancellation_fee,
      late_fee_non_verified,
    } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'At least 1 product image is required.' });
    }

    if (req.files.length > 6) {
      return res.status(400).json({ success: false, message: 'Maximum 6 images are allowed per product.' });
    }

    const r1 = parseFloat(rent_per_day_1_4);
    const r2 = parseFloat(rent_per_day_5_9);
    const r3 = parseFloat(rent_per_day_10_onwards);

    if (r1 < r2 || r2 < r3 || r3 <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Tiered pricing constraint violated. Ensure: Rate(1-4) >= Rate(5-9) >= Rate(10+)',
      });
    }

    const imageUrls = [];
    for (const file of req.files) {
      const uploadRes = await imagekit.upload({
        file: file.buffer,
        fileName: `prod_${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`,
        folder: '/rms_products/',
      });
      imageUrls.push(uploadRes.url);
    }

    const insertQuery = `
      INSERT INTO products 
        (vendor_id, category_id, title, description, total_quantity, 
         rent_per_day_1_4, rent_per_day_5_9, rent_per_day_10_onwards, 
         deposit_verified, deposit_non_verified, late_fee_verified, late_fee_non_verified, images, cancellation_fee)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      vendorId,
      category_id || null,
      title,
      description,
      parseInt(total_quantity, 10),
      r1,
      r2,
      r3,
      parseFloat(deposit_verified),
      parseFloat(deposit_non_verified),
      parseFloat(late_fee_verified),
      parseFloat(late_fee_non_verified),
      imageUrls,
      parseFloat(cancellation_fee) || 0,
    ]);

    return res.status(201).json({
      success: true,
      message: 'Product added successfully with uploaded images.',
      product: result.rows[0],
    });
  } catch (error) {
    console.error('Add Product Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to add product.' });
  }
};

// PUT /api/v1/rms/vendor/editProduct/:id
exports.editProduct = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    // Check if vendor license is expired with an unpaid bill
    const isLicenseActive = await checkVendorLicenseActive(vendorId);
    if (!isLicenseActive) {
      return res.status(403).json({
        success: false,
        message: 'Your annual RMS software license has expired. Please settle your 5% platform royalty under "Payment Gateway & License" before updating inventory.',
      });
    }

    const {
      title,
      description,
      category_id,
      total_quantity,
      rent_per_day_1_4,
      rent_per_day_5_9,
      rent_per_day_10_onwards,
      deposit_verified,
      deposit_non_verified,
      late_fee_verified,
      cancellation_fee,
      late_fee_non_verified,
      existing_images,
    } = req.body;

    const currentProdRes = await pool.query(
      'SELECT images FROM products WHERE id = $1 AND vendor_id = $2',
      [id, vendorId]
    );

    if (currentProdRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or unauthorized.' });
    }

    const dbExistingImages = currentProdRes.rows[0].images || [];

    let retainedImages = [];
    if (existing_images) {
      try {
        retainedImages = typeof existing_images === 'string' ? JSON.parse(existing_images) : existing_images;
      } catch {
        retainedImages = existing_images.split(',').map((url) => url.trim());
      }
    } else {
      retainedImages = dbExistingImages;
    }

    const imagesToDelete = dbExistingImages.filter((imgUrl) => !retainedImages.includes(imgUrl));
    for (const url of imagesToDelete) {
      await deleteImageFromImageKit(url);
    }

    const newFilesCount = req.files ? req.files.length : 0;
    const finalImageCount = retainedImages.length + newFilesCount;

    if (finalImageCount < 1) {
      return res.status(400).json({ success: false, message: 'Product must have at least 1 image.' });
    }

    if (finalImageCount > 6) {
      return res.status(400).json({
        success: false,
        message: `Total images cannot exceed 6 (Retained: ${retainedImages.length}, New: ${newFilesCount}).`,
      });
    }

    const newlyUploadedUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadRes = await imagekit.upload({
          file: file.buffer,
          fileName: `prod_${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`,
          folder: '/rms_products/',
        });
        newlyUploadedUrls.push(uploadRes.url);
      }
    }

    const finalImagesArray = [...retainedImages, ...newlyUploadedUrls];

    const r1 = parseFloat(rent_per_day_1_4);
    const r2 = parseFloat(rent_per_day_5_9);
    const r3 = parseFloat(rent_per_day_10_onwards);

    if (r1 < r2 || r2 < r3 || r3 <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Tiered pricing constraint violated. Ensure: Rate(1-4) >= Rate(5-9) >= Rate(10+)',
      });
    }

    const updateQuery = `
      UPDATE products 
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          category_id = COALESCE($3, category_id),
          total_quantity = COALESCE($4, total_quantity),
          rent_per_day_1_4 = COALESCE($5, rent_per_day_1_4),
          rent_per_day_5_9 = COALESCE($6, rent_per_day_5_9),
          rent_per_day_10_onwards = COALESCE($7, rent_per_day_10_onwards),
          deposit_verified = COALESCE($8, deposit_verified),
          deposit_non_verified = COALESCE($9, deposit_non_verified),
          late_fee_verified = COALESCE($10, late_fee_verified),
          late_fee_non_verified = COALESCE($11, late_fee_non_verified),
          images = $12,
          cancellation_fee = COALESCE($15, cancellation_fee),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $13 AND vendor_id = $14
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      title,
      description,
      category_id || null,
      parseInt(total_quantity, 10),
      r1,
      r2,
      r3,
      parseFloat(deposit_verified),
      parseFloat(deposit_non_verified),
      parseFloat(late_fee_verified),
      parseFloat(late_fee_non_verified),
      finalImagesArray,
      id,
      vendorId,
      cancellation_fee,
    ]);

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully.',
      product: result.rows[0],
    });
  } catch (error) {
    console.error('Edit Product Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to update product.' });
  }
};

// GET /api/v1/rms/vendor/getCategories
exports.getCategories = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    return res.status(200).json({ success: true, categories: result.rows });
  } catch (error) {
    console.error('Get Categories Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
  }
};

// POST /api/v1/rms/vendor/addCategory
exports.addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required.' });

    const result = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *',
      [name.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, message: 'Category already exists.' });
    }

    return res.status(201).json({ success: true, category: result.rows[0] });
  } catch (error) {
    console.error('Add Category Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create category.' });
  }
};

// GET /api/v1/rms/vendor/getOrders
exports.getVendorOrders = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const query = `
      SELECT o.*, p.title AS product_title, p.images AS product_images,
             u.full_name AS customer_name, u.phone AS customer_phone, u.city AS customer_city
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.customer_id = u.id
      WHERE o.vendor_id = $1
      ORDER BY 
        (CASE WHEN o.status IN ('Lock', 'With Customer') THEN 0 ELSE 1 END),
        o.created_at DESC
    `;

    const result = await pool.query(query, [vendorId]);
    return res.status(200).json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('Get Vendor Orders Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
  }
};

// GET /api/v1/rms/vendor/getOrder/:id
exports.getVendorOrderById = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const query = `
      SELECT o.*, p.title AS product_title, p.images AS product_images,
             u.full_name AS customer_name, u.email AS customer_email, 
             u.phone AS customer_phone, u.address AS customer_address, u.city AS customer_city
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.customer_id = u.id
      WHERE o.id = $1 AND o.vendor_id = $2
    `;

    const result = await pool.query(query, [id, vendorId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    return res.status(200).json({ success: true, order: result.rows[0] });
  } catch (error) {
    console.error('Get Vendor Order Detail Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch order details.' });
  }
};

// POST /api/v1/rms/vendor/verifyHandoverOtp
exports.verifyHandoverOtp = async (req, res) => {
  const client = await pool.connect();
  try {
    const vendorId = req.user.id;
    const { order_id, otp, assigned_serial_number } = req.body;

    if (!order_id || !otp) {
      return res.status(400).json({ success: false, message: 'Order ID and 6-digit OTP are required.' });
    }

    // Optional serial number: Clean if provided, otherwise null
    const cleanSerial = assigned_serial_number && assigned_serial_number.trim() !== ''
      ? assigned_serial_number.trim().toUpperCase()
      : null;

    await client.query('BEGIN');

    const orderRes = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND vendor_id = $2 FOR UPDATE',
      [order_id, vendorId]
    );

    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const order = orderRes.rows[0];
    if (order.status !== 'Lock') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot verify handover. Order status must be 'Lock' (Current: '${order.status}').`,
      });
    }

    if (String(order.handover_otp).trim() !== String(otp).trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invalid Handover PIN. Please request the current 6-digit code from the customer.',
      });
    }

    const updateRes = await client.query(
      `UPDATE orders 
       SET status = 'With Customer',
           handover_verified_at = CURRENT_TIMESTAMP,
           assigned_serial_number = COALESCE($1, assigned_serial_number)
       WHERE id = $2 
       RETURNING *`,
      [cleanSerial, order_id]
    );

    await client.query('COMMIT');

    const io = req.app.get('socketio');
    if (io) {
      const numericOrderId = parseInt(order_id, 10);
      io.emit('ORDER_STATUS_CHANGED', {
        orderId: numericOrderId,
        newStatus: 'With Customer',
        vendorId: order.vendor_id,
        customerId: order.customer_id,
        assigned_serial_number: cleanSerial,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Handshake PIN verified successfully. Equipment handed over to customer.',
      order: updateRes.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Verify Handover OTP Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify handover PIN.' });
  } finally {
    client.release();
  }
};

// POST /api/v1/rms/vendor/changeOrderStatus (Return Inspection & Direct Refund)
exports.changeOrderStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const vendorId = req.user.id;
    const { order_id, status, product_condition = 'Good', offline_refund_reference } = req.body;

    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT o.*, po.razorpay_payment_id 
       FROM orders o
       JOIN parent_order po ON o.group_id = po.id
       WHERE o.id = $1 AND o.vendor_id = $2 FOR UPDATE`,
      [order_id, vendorId]
    );

    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const currentOrder = orderRes.rows[0];

    // Transition 1: Lock -> Cancelled (Vendor cancels before delivery)
    if (currentOrder.status === 'Lock' && status === 'Cancelled') {
      const grossRent = parseFloat(currentOrder.gross_rent_snapshot || 0);
      const discountAmount = parseFloat(currentOrder.discount_amount_snapshot || 0);
      const actualPaidRent = parseFloat(currentOrder.customer_paid_rent_snapshot || (grossRent - discountAmount));
      const totalDeposit = parseFloat(currentOrder.deposit_per_item_snapshot) * currentOrder.quantity;
      const totalRefund = actualPaidRent + totalDeposit;

      let refundReference = offline_refund_reference || 'VENDOR_CANCEL_REFUND';

      if (currentOrder.razorpay_payment_id && totalRefund > 0 && !offline_refund_reference) {
        try {
          const vendorGateway = await getVendorRazorpayClient(vendorId, client);
          const rzpRefund = await vendorGateway.instance.payments.refund(currentOrder.razorpay_payment_id, {
            amount: Math.round(totalRefund * 100),
            notes: { reason: `Vendor cancellation refund for Order #${order_id}` },
          });
          refundReference = rzpRefund.id;
        } catch (rfErr) {
          console.error('Vendor cancel refund API warning:', rfErr.message);
        }
      }

      await client.query(
        `UPDATE orders 
         SET status = 'Cancelled', 
             cancelled_by = 'vendor',
             payment_status = 'Refunded_Full',
             deposit_refunded_amount = $1,
             deposit_refund_reference = $2
         WHERE id = $3`,
        [totalRefund, refundReference, order_id]
      );

      await client.query('COMMIT');

      // Send Customer Cancellation Notice
      const detailsRes = await pool.query(
        `SELECT c.full_name AS customer_name, c.email AS customer_email, p.title AS product_title
         FROM users c, products p WHERE c.id = $1 AND p.id = $2`,
        [currentOrder.customer_id, currentOrder.product_id]
      );

      if (detailsRes.rows.length > 0) {
        const d = detailsRes.rows[0];
        sendCustomerCancellationEmail({
          to: d.customer_email,
          customerName: d.customer_name,
          productTitle: d.product_title,
          orderId: currentOrder.id,
          cancelledBy: 'vendor',
          grossRent,
          discountAmount,
          actualPaidRent,
          totalDeposit,
          cancellationFeeDeducted: 0,
          refundAmount: totalRefund,
        });
      }

      const io = req.app.get('socketio');
      if (io) {
        io.emit('ORDER_STATUS_CHANGED', {
          orderId: order_id,
          customerId: currentOrder.customer_id,
          newStatus: 'Cancelled',
          refundedAmount: totalRefund,
          refundReference: refundReference,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Order cancelled. 100% refund has been processed directly to customer.',
      });
    }

    // Transition 2: With Customer -> Returned (Vendor accepts returned item)
    else if (currentOrder.status === 'With Customer' && status === 'Returned') {
      const endDate = new Date(currentOrder.end_date);
      const maxAllowedDate = new Date(endDate);
      maxAllowedDate.setDate(maxAllowedDate.getDate() + currentOrder.max_late_days);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      maxAllowedDate.setHours(0, 0, 0, 0);

      // A. Overdue beyond grace period -> Lost
      if (today > maxAllowedDate) {
        const totalDeposit = parseFloat(currentOrder.deposit_per_item_snapshot) * currentOrder.quantity;

        await client.query(
          "UPDATE orders SET status = 'Lost', payment_status = 'Refunded_Full' WHERE id = $1",
          [order_id]
        );

        await client.query(
          `UPDATE products 
           SET total_quantity = GREATEST(0, total_quantity - $1),
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [currentOrder.quantity, currentOrder.product_id]
        );

        await client.query(
          'UPDATE users SET late_returns_count = COALESCE(late_returns_count, 0) + 1 WHERE id = $1',
          [currentOrder.customer_id]
        );

        await client.query('COMMIT');

        const detailsRes = await pool.query(
          `SELECT u.email, u.full_name, p.title AS product_title, v.full_name AS vendor_name
           FROM users u, products p, users v 
           WHERE u.id = $1 AND p.id = $2 AND v.id = $3`,
          [currentOrder.customer_id, currentOrder.product_id, vendorId]
        );

        if (detailsRes.rows.length > 0) {
          const d = detailsRes.rows[0];
          sendDepositForfeitureEmail({
            to: d.email,
            customerName: d.full_name,
            productTitle: d.product_title,
            vendorName: d.vendor_name,
            orderId: currentOrder.id,
            forfeitedAmount: totalDeposit,
            reason: `Return period exceeded the maximum allowed late window (${currentOrder.max_late_days} days). Order marked as Lost.`,
          });
        }

        const io = req.app.get('socketio');
        if (io) {
          io.emit('ORDER_STATUS_CHANGED', {
            orderId: order_id,
            customerId: currentOrder.customer_id,
            newStatus: 'Lost',
            refundedAmount: 0,
          });
        }

        return res.status(400).json({
          success: false,
          message: `Return window expired. Order marked as 'Lost' and deposit forfeited to your store.`,
        });
      }

      // B. Standard Return
      const totalDeposit = parseFloat(currentOrder.deposit_per_item_snapshot) * currentOrder.quantity;
      let lateDays = 0;
      let lateFeeTotal = 0;

      const returnDate = new Date();
      returnDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      if (returnDate > endDate) {
        const diffTime = Math.abs(returnDate - endDate);
        lateDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const lateFeePerDay = parseFloat(currentOrder.late_fee_per_day_snapshot || 0);
        lateFeeTotal = Math.min(lateDays * lateFeePerDay * currentOrder.quantity, totalDeposit);

        await client.query(
          'UPDATE users SET late_returns_count = COALESCE(late_returns_count, 0) + 1 WHERE id = $1',
          [currentOrder.customer_id]
        );
      }

      let depositToRefund = 0;
      if (product_condition === 'Good') {
        depositToRefund = Math.max(0, totalDeposit - lateFeeTotal);
      } else {
        // Damaged: Deposit forfeited to vendor for repairs
        depositToRefund = 0;
      }

      let refundRef = offline_refund_reference ? offline_refund_reference.trim() : null;

      // Trigger automated partial refund of the remaining deposit via vendor's Razorpay
      if (depositToRefund > 0 && currentOrder.razorpay_payment_id && !offline_refund_reference) {
        try {
          const vendorGateway = await getVendorRazorpayClient(vendorId, client);
          const rzpRefund = await vendorGateway.instance.payments.refund(currentOrder.razorpay_payment_id, {
            amount: Math.round(depositToRefund * 100),
            notes: { reason: `Deposit refund for Order #${order_id}` },
          });
          refundRef = rzpRefund.id;
        } catch (rfErr) {
          console.error('Razorpay Deposit Partial Refund Error:', rfErr.message);
          refundRef = `MANUAL_PENDING: ${rfErr.message}`;
        }
      }

      // If full deposit was retained due to late fees or damage and no refund was issued
      if (depositToRefund === 0 && !refundRef) {
        refundRef = product_condition === 'Damaged' ? 'FORFEITED_DAMAGE' : 'FORFEITED_LATE_FEES';
      }

      // Updating order triggers 'trg_update_annual_billing_on_return' in PostgreSQL
      await client.query(
        `UPDATE orders 
         SET status = 'Returned', 
             product_condition = $1,
             returned_to_vendor_at = CURRENT_TIMESTAMP,
             payment_status = $2,
             deposit_refunded_amount = $3,
             deposit_refund_reference = $4
         WHERE id = $5`,
        [
          product_condition,
          depositToRefund > 0 ? 'Refunded_Partial' : 'Paid',
          depositToRefund,
          refundRef,
          order_id,
        ]
      );

      await client.query('COMMIT');

      // Fetch customer, product, and vendor details for email
      const detailsRes = await pool.query(
        `SELECT u.email, u.full_name, p.title AS product_title, v.full_name AS vendor_name
         FROM users u, products p, users v 
         WHERE u.id = $1 AND p.id = $2 AND v.id = $3`,
        [currentOrder.customer_id, currentOrder.product_id, vendorId]
      );

      if (detailsRes.rows.length > 0) {
        const d = detailsRes.rows[0];

        if (product_condition === 'Good') {
          // Send official return & refund settlement receipt to customer
          sendDepositRefundSettlementEmail({
            to: d.email,
            customerName: d.full_name,
            vendorName: d.vendor_name,
            orderId: currentOrder.id,
            productTitle: d.product_title,
            totalDeposit,
            lateFeeDeducted: lateFeeTotal,
            refundedAmount: depositToRefund,
            refundReference: refundRef,
            isDamaged: false,
          });
        } else {
          // Send deposit forfeiture notice
          sendDepositForfeitureEmail({
            to: d.email,
            customerName: d.full_name,
            productTitle: d.product_title,
            vendorName: d.vendor_name,
            orderId: currentOrder.id,
            forfeitedAmount: totalDeposit,
            reason: 'Product was returned in damaged condition. Deposit forfeited to vendor for repairs.',
          });
        }
      }

      // Real-time WebSocket sync with full refund details
      const io = req.app.get('socketio');
      if (io) {
        io.emit('ORDER_STATUS_CHANGED', {
          orderId: order_id,
          customerId: currentOrder.customer_id,
          vendorId: vendorId,
          newStatus: 'Returned',
          paymentStatus: depositToRefund > 0 ? 'Refunded_Partial' : 'Paid',
          deposit_refunded_amount: depositToRefund,
          deposit_refund_reference: refundRef,
          product_condition: product_condition,
        });
      }

      return res.status(200).json({
        success: true,
        message: `Order marked as Returned (${product_condition} condition). Refund of ₹${depositToRefund.toFixed(2)} processed.`,
        refundedAmount: depositToRefund,
        reference: refundRef,
      });
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from '${currentOrder.status}' to '${status}'.`,
      });
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Vendor Change Order Status Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to update order status.' });
  } finally {
    client.release();
  }
};

// PUT /api/v1/rms/vendor/updateGatewayCredentials
exports.updateGatewayCredentials = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { razorpay_key_id, razorpay_key_secret } = req.body;

    if (!razorpay_key_id || !razorpay_key_secret) {
      return res.status(400).json({
        success: false,
        message: 'Both Razorpay Key ID and Key Secret are required.',
      });
    }

    const encryptedSecret = encryptText(razorpay_key_secret.trim());

    await pool.query(
      `UPDATE users 
       SET razorpay_key_id = $1, 
           razorpay_key_secret = $2,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [razorpay_key_id.trim(), encryptedSecret, vendorId]
    );

    return res.status(200).json({
      success: true,
      message: 'Razorpay payment gateway credentials securely updated and encrypted.',
    });
  } catch (error) {
    console.error('Update Gateway Credentials Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update payment gateway credentials.' });
  }
};

// GET /api/v1/rms/vendor/getGatewayStatus
exports.getGatewayStatus = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const result = await pool.query(
      `SELECT razorpay_key_id, subscription_start_date, subscription_renewal_date 
       FROM users WHERE id = $1`,
      [vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const v = result.rows[0];
    const isConfigured = Boolean(v.razorpay_key_id);

    return res.status(200).json({
      success: true,
      isConfigured,
      key_id: v.razorpay_key_id ? `${v.razorpay_key_id.substring(0, 8)}...` : null,
      subscription_start_date: v.subscription_start_date,
      subscription_renewal_date: v.subscription_renewal_date,
    });
  } catch (error) {
    console.error('Get Gateway Status Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch gateway status.' });
  }
};

// GET /api/v1/rms/vendor/coupons
exports.getMyCoupons = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const result = await pool.query(
      `SELECT sc.*, p.title AS target_product_title 
       FROM store_coupons sc
       LEFT JOIN products p ON sc.product_id = p.id
       WHERE sc.vendor_id = $1
       ORDER BY sc.created_at DESC`,
      [vendorId]
    );
    return res.status(200).json({ success: true, coupons: result.rows });
  } catch (error) {
    console.error('Get Vendor Coupons Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch coupons.' });
  }
};

// POST /api/v1/rms/vendor/createCoupon
exports.createCoupon = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const {
      code,
      discount_type = 'PERCENT',
      discount_value,
      max_discount_amount,
      min_order_amount = 0,
      min_rental_days = 1,
      product_id,
      max_uses,
      per_user_limit = 1,
      valid_until,
    } = req.body;

    if (!code || !discount_value) {
      return res.status(400).json({ success: false, message: 'Coupon code and discount value are required.' });
    }

    const cleanCode = code.trim().toUpperCase();

    const insertQuery = `
      INSERT INTO store_coupons 
        (vendor_id, code, discount_type, discount_value, max_discount_amount, 
         min_order_amount, min_rental_days, product_id, max_uses, per_user_limit, valid_until)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      vendorId,
      cleanCode,
      discount_type,
      parseFloat(discount_value),
      max_discount_amount ? parseFloat(max_discount_amount) : null,
      parseFloat(min_order_amount),
      parseInt(min_rental_days, 10),
      product_id || null,
      max_uses ? parseInt(max_uses, 10) : null,
      parseInt(per_user_limit, 10),
      valid_until || null,
    ]);

    return res.status(201).json({
      success: true,
      message: `Coupon "${cleanCode}" created successfully.`,
      coupon: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'A coupon with this code already exists in your store.' });
    }
    console.error('Create Coupon Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create store coupon.' });
  }
};

// PUT /api/v1/rms/vendor/toggleCoupon/:id
exports.toggleCouponStatus = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE store_coupons 
       SET is_active = NOT is_active 
       WHERE id = $1 AND vendor_id = $2 
       RETURNING *`,
      [id, vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Coupon not found or unauthorized.' });
    }

    return res.status(200).json({
      success: true,
      message: `Coupon is now ${result.rows[0].is_active ? 'Active' : 'Inactive'}.`,
      coupon: result.rows[0],
    });
  } catch (error) {
    console.error('Toggle Coupon Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to toggle coupon status.' });
  }
};

// DELETE /api/v1/rms/vendor/deleteCoupon/:id (Soft-Delete / Archive)
exports.deleteCoupon = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE store_coupons 
       SET is_archived = TRUE, is_active = FALSE 
       WHERE id = $1 AND vendor_id = $2 
       RETURNING id, code`,
      [id, vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Coupon not found or unauthorized.' });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Coupon "${result.rows[0].code}" archived. Historical redemption audits preserved.` 
    });
  } catch (error) {
    console.error('Archive Coupon Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to archive coupon.' });
  }
};

