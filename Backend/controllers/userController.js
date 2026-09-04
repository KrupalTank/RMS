// controllers/userController.js
const pool = require('../config/db');
const imagekit = require('../config/imagekit');
const { encryptBuffer } = require('../utils/encryptionUtil');
const { sendKycSubmissionEmail } = require('../services/emailService');

// POST /api/v1/rms/user/authenticateMe
exports.submitKyc = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.files || !req.files['aadhaar_card'] || !req.files['live_photo']) {
      return res.status(400).json({
        success: false,
        message: 'Both Aadhaar image and live photo are required.',
      });
    }

    const aadhaarFile = req.files['aadhaar_card'][0];
    const livePhotoFile = req.files['live_photo'][0];

    // 1. Encrypt both buffers via AES-256-GCM
    const encryptedAadhaar = encryptBuffer(aadhaarFile.buffer);
    const encryptedPhoto = encryptBuffer(livePhotoFile.buffer);

    // 2. Upload encrypted buffers to ImageKit
    const aadhaarUpload = await imagekit.upload({
      file: encryptedAadhaar,
      fileName: `user_${userId}_aadhaar.enc`,
      folder: '/rms_kyc_encrypted/',
      isPrivateFile: true,
    });

    const photoUpload = await imagekit.upload({
      file: encryptedPhoto,
      fileName: `user_${userId}_live_photo.enc`,
      folder: '/rms_kyc_encrypted/',
      isPrivateFile: true,
    });

    // 3. Create entry in kyc_requests table
    const kycResult = await pool.query(
      `INSERT INTO kyc_requests (user_id, aadhaar_card_url, live_photo_url)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, aadhaarUpload.url, photoUpload.url]
    );

    // 4. Update user's status to pending
    await pool.query("UPDATE users SET kyc_status = 'pending' WHERE id = $1", [userId]);



    // 5. Emit real-time notification to KYC officers
    const io = req.app.get('socketio');
    if (io) {
      io.emit('KYC_SUBMITTED', {
        userId,
        requestId: kycResult.rows[0].id,
        submittedAt: kycResult.rows[0].submitted_at,
      });
    }

    sendKycSubmissionEmail({
      user: req.user,
      kycRequest: kycResult.rows[0],
    });

    return res.status(200).json({
      success: true,
      message: 'KYC documents submitted successfully. Status is now pending review.',
      kyc: kycResult.rows[0],
    });
  } catch (error) {
    console.error('Submit KYC Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit KYC documents.' });
  }
};

// GET /api/v1/rms/user/myProfile
// GET /api/v1/rms/user/myProfile
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role, kyc_status, 
              address, city, pincode, bank_account_no, bank_ifsc 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Get Profile Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
};

// PUT /api/v1/rms/user/myProfile
exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, phone, address, city, pincode, bank_account_no, bank_ifsc } = req.body;

    const cleanBankAcc = bank_account_no && bank_account_no.trim() !== '' ? bank_account_no.trim() : null;
    const cleanIfsc = bank_ifsc && bank_ifsc.trim() !== '' ? bank_ifsc.trim().toUpperCase() : null;

    const result = await pool.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           address = COALESCE($3, address),
           city = COALESCE($4, city),
           pincode = COALESCE($5, pincode),
           bank_account_no = COALESCE($6, bank_account_no),
           bank_ifsc = COALESCE($7, bank_ifsc),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING id, full_name, email, phone, role, kyc_status, address, city, pincode, bank_account_no, bank_ifsc`,
      [full_name, phone, address, city, pincode, bank_account_no, bank_ifsc, userId]
    );

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

// GET /api/v1/rms/user/getProducts (Prioritizes user's city)
exports.getProducts = async (req, res) => {
  try {
    const userCity = req.user.city || '';

    const query = `
      SELECT p.*, c.name AS category_name, u.city AS vendor_city, u.address AS vendor_address, u.phone AS vendor_phone
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      WHERE p.total_quantity > 0
      ORDER BY (CASE WHEN LOWER(u.city) = LOWER($1) THEN 0 ELSE 1 END), p.created_at DESC
    `;

    const result = await pool.query(query, [userCity]);
    return res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Get Products Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
};

// GET /api/v1/rms/user/getProducts/:category
exports.getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const userCity = req.user.city || '';

    const query = `
      SELECT p.*, c.name AS category_name, u.city AS vendor_city, u.address AS vendor_address, u.phone AS vendor_phone
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      WHERE (LOWER(c.name) = LOWER($1) OR c.id::TEXT = $1) AND p.total_quantity > 0
      ORDER BY (CASE WHEN LOWER(u.city) = LOWER($2) THEN 0 ELSE 1 END), p.created_at DESC
    `;

    const result = await pool.query(query, [category, userCity]);
    return res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Get Category Products Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch category products.' });
  }
};

// GET /api/v1/rms/user/products/:productName (Fuzzy Search)
exports.searchProducts = async (req, res) => {
  try {
    const { productName } = req.params;
    const userCity = req.user.city || '';

    const query = `
      SELECT p.*, p.cancellation_fee, c.name AS category_name, u.city AS vendor_city, u.address AS vendor_address, u.phone AS vendor_phone
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      WHERE (p.title ILIKE $1 OR p.description ILIKE $1) AND p.total_quantity > 0
      ORDER BY (CASE WHEN LOWER(u.city) = LOWER($2) THEN 0 ELSE 1 END), p.created_at DESC
    `;

    const result = await pool.query(query, [`%${productName}%`, userCity]);
    return res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Search Products Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to search products.' });
  }
};

// GET /api/v1/rms/user/getProduct/:id
// In controllers/userController.js
// GET /api/v1/rms/user/getProduct/:id
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.id || null;

    const productQuery = `
      SELECT p.*, p.cancellation_fee, c.name AS category_name,
             u.id AS vendor_id,
             u.full_name AS vendor_name, 
             u.phone AS vendor_phone, 
             u.address AS vendor_address, 
             u.city AS vendor_city, 
             u.pincode AS vendor_pincode
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      WHERE p.id = $1
    `;
    const productRes = await pool.query(productQuery, [id]);

    if (productRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const rawProduct = productRes.rows[0];

    // Check if requester has a paid/confirmed booking for this product
    let hasConfirmedOrder = false;
    if (currentUserId) {
      const orderCheck = await pool.query(
        `SELECT id FROM orders 
         WHERE customer_id = $1 
           AND product_id = $2 
           AND status IN ('Lock', 'With Customer', 'Returned')
         LIMIT 1`,
        [currentUserId, id]
      );
      hasConfirmedOrder = orderCheck.rows.length > 0;
    }

    // Mask direct contact details prior to confirmed booking
    const sanitizedProduct = {
      ...rawProduct,
      vendor_phone: hasConfirmedOrder
        ? rawProduct.vendor_phone
        : null,
      vendor_address: hasConfirmedOrder
        ? rawProduct.vendor_address
        : null,
      is_contact_masked: !hasConfirmedOrder,
    };

    // Fetch product reviews
    const reviewsQuery = `
      SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS customer_name
      FROM reviews r
      JOIN users u ON r.customer_id = u.id
      WHERE r.product_id = $1
      ORDER BY r.created_at DESC
    `;
    const reviewsRes = await pool.query(reviewsQuery, [id]);

    return res.status(200).json({
      success: true,
      product: sanitizedProduct,
      reviews: reviewsRes.rows,
    });
  } catch (error) {
    console.error('Get Product Detail Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch product details.' });
  }
};

// POST /api/v1/rms/user/review/:id
exports.postReview = async (req, res) => {
  try {
    const customerId = req.user.id;
    const orderId = req.params.id;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    }

    // Verify order belongs to this customer and is active/completed
    const orderCheck = await pool.query(
      `SELECT product_id, status FROM orders 
       WHERE id = $1 AND customer_id = $2 AND status IN ('With Customer', 'Returned')`,
      [orderId, customerId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You can only review products from active or returned orders.',
      });
    }

    const productId = orderCheck.rows[0].product_id;

    const reviewInsert = await pool.query(
      `INSERT INTO reviews (product_id, customer_id, order_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
       RETURNING *`,
      [productId, customerId, orderId, rating, comment]
    );

    return res.status(201).json({
      success: true,
      message: 'Review posted successfully.',
      review: reviewInsert.rows[0],
    });
  } catch (error) {
    console.error('Post Review Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to post review.' });
  }
};

// Inside getMyCoupons in RMS/Backend/controllers/userController.js
exports.getMyCoupons = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch all available unredeemed coupons (Always usable by customer)
    const couponsRes = await pool.query(
      `SELECT id, code, discount_percent, status, created_at
       FROM coupons
       WHERE user_id = $1 AND status = 'AVAILABLE'
       ORDER BY created_at DESC`,
      [userId]
    );

    // 2. Fetch user's streak & active violation count
    const userRes = await pool.query(
      'SELECT consecutive_good_returns, late_returns_count FROM users WHERE id = $1',
      [userId]
    );

    const currentStreak = userRes.rows[0]?.consecutive_good_returns || 0;
    const lateReturnsCount = userRes.rows[0]?.late_returns_count || 0;
    const milestoneTarget = parseInt(process.env.LOYALTY_THRESHOLD_ORDERS || 8, 10);

    return res.status(200).json({
      success: true,
      coupons: couponsRes.rows,
      consecutive_good_returns: currentStreak,
      late_returns_count: lateReturnsCount,
      milestone_target: milestoneTarget,
      contact_support_email: process.env.ContactMe || 'support@rms.com',
    });
  } catch (error) {
    console.error('Get Coupons Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch coupons.' });
  }
};

// GET /api/v1/rms/user/productAvailability/:productId
// Generates a 60-day rolling calendar showing booked quantities and unavailable dates
exports.getProductAvailability = async (req, res) => {
  try {
    const { productId } = req.params;

    // 1. Fetch product's total inventory
    const productRes = await pool.query(
      'SELECT id, total_quantity FROM products WHERE id = $1',
      [productId]
    );

    if (productRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const totalStock = parseInt(productRes.rows[0].total_quantity, 10);

    // 2. Query daily booked count across the next 60 days
    // Considers locked bookings, active rentals, and active checkout carts
    const availabilityQuery = `
      WITH calendar_dates AS (
        SELECT generate_series(
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '60 days',
          INTERVAL '1 day'
        )::DATE AS calendar_date
      ),
      booked_counts AS (
        SELECT cd.calendar_date,
               COALESCE(SUM(o.quantity), 0)::INT AS booked_quantity
        FROM calendar_dates cd
        LEFT JOIN orders o ON o.product_id = $1
          AND o.status IN ('Lock', 'With Customer')
          AND cd.calendar_date >= o.start_date::DATE
          AND cd.calendar_date <= o.end_date::DATE
        GROUP BY cd.calendar_date
      )
      SELECT TO_CHAR(bc.calendar_date, 'YYYY-MM-DD') AS date,
             bc.booked_quantity,
             GREATEST(0, $2 - bc.booked_quantity) AS remaining_stock,
             (bc.booked_quantity >= $2) AS is_sold_out
      FROM booked_counts bc
      ORDER BY bc.calendar_date ASC;
    `;

    const result = await pool.query(availabilityQuery, [productId, totalStock]);

    return res.status(200).json({
      success: true,
      total_stock: totalStock,
      days: result.rows,
    });
  } catch (error) {
    console.error('Get Product Availability Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to calculate product availability.' });
  }
};