// controllers/vendorController.js
const pool = require('../config/db');
const { sendDepositForfeitureEmail, sendCustomerCancellationEmail } = require('../services/emailService');
const imagekit = require('../config/imagekit');
const { deleteImageFromImageKit } = require('../utils/imagekitUtil');

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

// POST /api/v1/rms/vendor/addProduct
exports.addProduct = async (req, res) => {
  try {
    const vendorId = req.user.id;
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

    // 1. Mandatory image validation: Min 1, Max 6 images
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least 1 product image is required.',
      });
    }

    if (req.files.length > 6) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 6 images are allowed per product.',
      });
    }

    // 2. Validate tiered pricing rule: 1_4 >= 5_9 >= 10_onwards
    const r1 = parseFloat(rent_per_day_1_4);
    const r2 = parseFloat(rent_per_day_5_9);
    const r3 = parseFloat(rent_per_day_10_onwards);

    if (r1 < r2 || r2 < r3 || r3 <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Tiered pricing constraint violated. Ensure: Rate(1-4) >= Rate(5-9) >= Rate(10+)',
      });
    }

    // 3. Upload images to ImageKit
    const imageUrls = [];
    for (const file of req.files) {
      const uploadRes = await imagekit.upload({
        file: file.buffer,
        fileName: `prod_${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`,
        folder: '/rms_products/',
      });
      imageUrls.push(uploadRes.url);
    }

    // 4. Insert into database
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
      existing_images, // Can be a JSON array string or comma-separated list of kept URLs
      replaced_images, // Optional: array/string of URLs specifically being removed/replaced
    } = req.body;

    // 1. Fetch current product to check ownership and retrieve existing images
    const currentProdRes = await pool.query(
      'SELECT images FROM products WHERE id = $1 AND vendor_id = $2',
      [id, vendorId]
    );

    if (currentProdRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or unauthorized.' });
    }

    const dbExistingImages = currentProdRes.rows[0].images || [];

    // 2. Parse retained image URLs sent by the frontend
    let retainedImages = [];
    if (existing_images) {
      try {
        retainedImages = typeof existing_images === 'string' 
          ? JSON.parse(existing_images) 
          : existing_images;
      } catch {
        retainedImages = existing_images.split(',').map((url) => url.trim());
      }
    } else {
      retainedImages = dbExistingImages;
    }

    // 3. Identify and delete removed/replaced images from ImageKit
    const imagesToDelete = dbExistingImages.filter((imgUrl) => !retainedImages.includes(imgUrl));
    for (const url of imagesToDelete) {
      await deleteImageFromImageKit(url);
    }

    // 4. Validate total image count before adding new files (Min 1, Max 6)
    const newFilesCount = req.files ? req.files.length : 0;
    const finalImageCount = retainedImages.length + newFilesCount;

    if (finalImageCount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Product must have at least 1 image.',
      });
    }

    if (finalImageCount > 6) {
      return res.status(400).json({
        success: false,
        message: `Total images cannot exceed 6 (Current retained: ${retainedImages.length}, New uploaded: ${newFilesCount}).`,
      });
    }

    // 5. Upload any newly added/replacement files to ImageKit
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

    // 6. Validate tiered rates
    const r1 = parseFloat(rent_per_day_1_4);
    const r2 = parseFloat(rent_per_day_5_9);
    const r3 = parseFloat(rent_per_day_10_onwards);

    if (r1 < r2 || r2 < r3 || r3 <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Tiered pricing constraint violated. Ensure: Rate(1-4) >= Rate(5-9) >= Rate(10+)',
      });
    }

    // 7. Update database record
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
      message: 'Product and image gallery updated successfully.',
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

// POST /api/v1/rms/vendor/changeOrderStatus
exports.changeOrderStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const vendorId = req.user.id;
    const { order_id, status, product_condition = 'Good' } = req.body;

    await client.query('BEGIN');

    // 1. Acquire exclusive row-level lock on the target order
    const orderRes = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND vendor_id = $2 FOR UPDATE',
      [order_id, vendorId]
    );

    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized.' });
    }

    const currentOrder = orderRes.rows[0];

    // Allowed Vendor transitions:
    // 1. Lock -> Cancelled (Vendor cancels before delivery)
    if (currentOrder.status === 'Lock' && status === 'Cancelled') {
      await client.query(
        "UPDATE orders SET status = 'Cancelled', cancelled_by = 'vendor' WHERE id = $1",
        [order_id]
      );

      await client.query('COMMIT');

      // Fetch customer & product details for cancellation notice
      const detailsRes = await pool.query(
        `SELECT o.*, p.title AS product_title, c.full_name AS customer_name, c.email AS customer_email
         FROM orders o
         JOIN products p ON o.product_id = p.id
         JOIN users c ON o.customer_id = c.id
         WHERE o.id = $1`,
        [order_id]
      );

      // Inside changeOrderStatus (when status === 'Cancelled') in vendorController.js

      if (detailsRes.rows.length > 0) {
        const d = detailsRes.rows[0];

        const grossRent = parseFloat(d.gross_rent_snapshot || 0);
        const discountAmount = parseFloat(d.discount_amount_snapshot || 0);
        const actualPaidRent = parseFloat(d.customer_paid_rent_snapshot || (grossRent - discountAmount));
        const totalDeposit = parseFloat(d.deposit_per_item_snapshot) * d.quantity;

        sendCustomerCancellationEmail({
          to: d.customer_email,
          customerName: d.customer_name,
          productTitle: d.product_title,
          orderId: d.id,
          cancelledBy: 'vendor',
          grossRent,
          discountAmount,
          actualPaidRent,
          totalDeposit,
          cancellationFeeDeducted: 0,
          refundAmount: actualPaidRent + totalDeposit,
        });
      }

      const io = req.app.get('socketio');
      if (io) {
        io.emit('ORDER_STATUS_CHANGED', {
          orderId: order_id,
          customerId: currentOrder.customer_id,
          newStatus: 'Cancelled',
        });
        io.emit('PAYOUT_GENERATED', {
          orderId: order_id,
          customerId: currentOrder.customer_id,
          type: 'full_refund',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Order cancelled. Full refund recorded for customer.',
      });
    }

    // 2. With Customer -> Returned (Vendor accepts returned item)
    else if (currentOrder.status === 'With Customer' && status === 'Returned') {
      const endDate = new Date(currentOrder.end_date);
      const maxAllowedDate = new Date(endDate);
      maxAllowedDate.setDate(maxAllowedDate.getDate() + currentOrder.max_late_days);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      maxAllowedDate.setHours(0, 0, 0, 0);

      // A. Late return window expired -> Auto-mark Lost
      if (today > maxAllowedDate) {
        const totalDeposit = parseFloat(currentOrder.deposit_per_item_snapshot) * currentOrder.quantity;

        // Auto-mark order as Lost
        await client.query(
          "UPDATE orders SET status = 'Lost', payment_status = 'Full' WHERE id = $1",
          [order_id]
        );

        // Deduct lost inventory units
        await client.query(
          `UPDATE products 
           SET total_quantity = GREATEST(0, total_quantity - $1),
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [currentOrder.quantity, currentOrder.product_id]
        );

        // Forfeit full deposit to vendor
        await client.query(
          `INSERT INTO payouts (order_id, recipient_id, group_id, amount, type)
           VALUES ($1, $2, $3, $4, 'deposit_forfeit_vendor')`,
          [order_id, vendorId, currentOrder.group_id, totalDeposit]
        );

        // Increment customer delinquency counter
        await client.query(
          'UPDATE users SET late_returns_count = COALESCE(late_returns_count, 0) + 1 WHERE id = $1',
          [currentOrder.customer_id]
        );

        await client.query('COMMIT');

        // Fetch details for forfeiture email
        const customerNoticeQuery = await pool.query(
          `SELECT u.email, u.full_name, p.title AS product_title, v.full_name AS vendor_name
           FROM users u
           JOIN products p ON p.id = $1
           JOIN users v ON v.id = $2
           WHERE u.id = $3`,
          [currentOrder.product_id, currentOrder.vendor_id, currentOrder.customer_id]
        );

        if (customerNoticeQuery.rows.length > 0) {
          const details = customerNoticeQuery.rows[0];
          sendDepositForfeitureEmail({
            to: details.email,
            customerName: details.full_name,
            productTitle: details.product_title,
            vendorName: details.vendor_name,
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
          });
          io.emit('PAYOUT_GENERATED', {
            orderId: order_id,
            customerId: currentOrder.customer_id,
            type: 'deposit_forfeit_vendor',
          });
        }

        return res.status(400).json({
          success: false,
          message: `Return window expired (${currentOrder.max_late_days} days late limit exceeded). Order marked as 'Lost' and deposit forfeited to you.`,
        });
      }

      // B. Standard Return (Within Allowed Window)
      // Database trigger 'trg_handle_order_return_settlement' handles financial calculations automatically
      await client.query(
        `UPDATE orders 
         SET status = 'Returned', 
             product_condition = $1,
             returned_to_vendor_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [product_condition, order_id]
      );

      await client.query('COMMIT');

      // If damaged, notify customer of deposit deduction
      if (product_condition === 'Damaged') {
        const totalDeposit = parseFloat(currentOrder.deposit_per_item_snapshot) * currentOrder.quantity;
        const customerNoticeQuery = await pool.query(
          `SELECT u.email, u.full_name, p.title AS product_title, v.full_name AS vendor_name
           FROM users u
           JOIN products p ON p.id = $1
           JOIN users v ON v.id = $2
           WHERE u.id = $3`,
          [currentOrder.product_id, currentOrder.vendor_id, currentOrder.customer_id]
        );

        if (customerNoticeQuery.rows.length > 0) {
          const details = customerNoticeQuery.rows[0];
          sendDepositForfeitureEmail({
            to: details.email,
            customerName: details.full_name,
            productTitle: details.product_title,
            vendorName: details.vendor_name,
            orderId: currentOrder.id,
            forfeitedAmount: totalDeposit,
            reason: 'Product was returned in damaged condition. Deposit forfeited to vendor for repair/replacement.',
          });
        }
      }

      const io = req.app.get('socketio');
      if (io) {
        io.emit('ORDER_STATUS_CHANGED', {
          orderId: order_id,
          customerId: currentOrder.customer_id,
          newStatus: 'Returned',
        });

        io.emit('PAYOUT_GENERATED', {
          orderId: order_id,
          customerId: currentOrder.customer_id,
          type: product_condition === 'Damaged' ? 'deposit_forfeit_vendor' : 'deposit_refund_customer',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Order status updated to Returned.',
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
    return res.status(500).json({ success: false, message: 'Failed to update order status.' });
  } finally {
    client.release();
  }
};

// POST /api/v1/rms/vendor/verifyHandoverOtp
exports.verifyHandoverOtp = async (req, res) => {
  const client = await pool.connect();
  try {
    const vendorId = req.user.id;
    const { order_id, otp } = req.body;

    if (!order_id || !otp) {
      return res.status(400).json({ success: false, message: 'Order ID and 6-digit OTP are required.' });
    }

    await client.query('BEGIN');

    // 1. Lock and fetch order
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

    // 2. Validate OTP
    if (String(order.handover_otp).trim() !== String(otp).trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invalid Handover PIN. Please request the current 6-digit code from the customer.',
      });
    }

    // 3. Update status to 'With Customer'
    // NOTE: Database trigger 'trg_handle_order_handover_payout' automatically generates
    // the rent payout ledger to the vendor and sets payment_status = 'Partial'!
    const updateRes = await client.query(
      `UPDATE orders 
       SET status = 'With Customer',
           handover_verified_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING *`,
      [order_id]
    );

    await client.query('COMMIT');

    // 4. Emit real-time WebSocket sync
    const io = req.app.get('socketio');
    if (io) {
      const numericOrderId = parseInt(order_id, 10);
      io.emit('ORDER_STATUS_CHANGED', {
        orderId: numericOrderId,
        newStatus: 'With Customer',
        vendorId: order.vendor_id,
        customerId: order.customer_id,
      });

      io.emit('PAYOUT_GENERATED', {
        orderId: numericOrderId,
        vendorId: order.vendor_id,
        type: 'rent_handover',
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