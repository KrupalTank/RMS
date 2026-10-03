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

// In controllers/userController.js:

// GET /api/v1/rms/user/myProfile
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role, kyc_status, is_blocked, 
              late_returns_count, address, city, pincode, 
              subscription_start_date, subscription_renewal_date,
              (razorpay_key_id IS NOT NULL AND razorpay_key_secret IS NOT NULL) AS has_payment_gateway
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
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
    const { full_name, phone, address, city, pincode } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           address = COALESCE($3, address),
           city = COALESCE($4, city),
           pincode = COALESCE($5, pincode),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, full_name, email, phone, role, kyc_status, is_blocked, 
                 late_returns_count, address, city, pincode,
                 subscription_start_date, subscription_renewal_date`,
      [full_name, phone, address, city, pincode, userId]
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

// GET /api/v1/rms/user/getProducts (Prioritizes user's city, filters active vendors only)
exports.getProducts = async (req, res) => {
  try {
    const userCity = req.user.city || '';

    const query = `
      SELECT p.*, c.name AS category_name, u.city AS vendor_city, u.address AS vendor_address, u.phone AS vendor_phone,
             COALESCE(sc_agg.available_coupons, '[]'::json) AS store_coupons
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sc.id,
            'code', sc.code,
            'discount_type', sc.discount_type,
            'discount_value', sc.discount_value,
            'max_discount_amount', sc.max_discount_amount,
            'min_order_amount', sc.min_order_amount,
            'min_rental_days', sc.min_rental_days
          ) ORDER BY sc.discount_value DESC
        ) AS available_coupons
        FROM store_coupons sc
        WHERE sc.vendor_id = p.vendor_id
          AND sc.is_active = TRUE
          AND sc.is_archived = FALSE
          AND (sc.valid_until IS NULL OR sc.valid_until::DATE >= CURRENT_DATE)
          AND (sc.max_uses IS NULL OR sc.used_count < sc.max_uses)
      ) sc_agg ON TRUE
      WHERE p.total_quantity > 0
        AND u.is_blocked = FALSE
        AND (
          u.subscription_renewal_date >= CURRENT_DATE 
          OR NOT EXISTS (
            SELECT 1 FROM vendor_annual_billing vab 
            WHERE vab.vendor_id = u.id 
              AND vab.payment_status IN ('PENDING', 'OVERDUE') 
              AND CURRENT_DATE >= (vab.period_end + INTERVAL '3 days')
          )
        )
        AND u.razorpay_key_id IS NOT NULL
        AND u.razorpay_key_secret IS NOT NULL
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
      SELECT p.*, c.name AS category_name, u.city AS vendor_city, u.address AS vendor_address, u.phone AS vendor_phone,
             COALESCE(sc_agg.available_coupons, '[]'::json) AS store_coupons
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sc.id,
            'code', sc.code,
            'discount_type', sc.discount_type,
            'discount_value', sc.discount_value,
            'max_discount_amount', sc.max_discount_amount,
            'min_order_amount', sc.min_order_amount,
            'min_rental_days', sc.min_rental_days
          ) ORDER BY sc.discount_value DESC
        ) AS available_coupons
        FROM store_coupons sc
        WHERE sc.vendor_id = p.vendor_id
          AND sc.is_active = TRUE
          AND sc.is_archived = FALSE
          AND (sc.valid_until IS NULL OR sc.valid_until::DATE >= CURRENT_DATE)
          AND (sc.max_uses IS NULL OR sc.used_count < sc.max_uses)
      ) sc_agg ON TRUE
      WHERE (LOWER(c.name) = LOWER($1) OR c.id::TEXT = $1)
        AND p.total_quantity > 0
        AND u.is_blocked = FALSE
        AND (
          u.subscription_renewal_date >= CURRENT_DATE 
          OR NOT EXISTS (
            SELECT 1 FROM vendor_annual_billing vab 
            WHERE vab.vendor_id = u.id 
              AND vab.payment_status IN ('PENDING', 'OVERDUE') 
              AND CURRENT_DATE >= (vab.period_end + INTERVAL '3 days')
          )
        )
        AND u.razorpay_key_id IS NOT NULL
        AND u.razorpay_key_secret IS NOT NULL
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
      SELECT p.*, p.cancellation_fee, c.name AS category_name, u.city AS vendor_city, u.address AS vendor_address, u.phone AS vendor_phone,
             COALESCE(sc_agg.available_coupons, '[]'::json) AS store_coupons
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sc.id,
            'code', sc.code,
            'discount_type', sc.discount_type,
            'discount_value', sc.discount_value,
            'max_discount_amount', sc.max_discount_amount,
            'min_order_amount', sc.min_order_amount,
            'min_rental_days', sc.min_rental_days
          ) ORDER BY sc.discount_value DESC
        ) AS available_coupons
        FROM store_coupons sc
        WHERE sc.vendor_id = p.vendor_id
          AND sc.is_active = TRUE
          AND sc.is_archived = FALSE
          AND (sc.valid_until IS NULL OR sc.valid_until::DATE >= CURRENT_DATE)
          AND (sc.max_uses IS NULL OR sc.used_count < sc.max_uses)
      ) sc_agg ON TRUE
      WHERE (p.title ILIKE $1 OR p.description ILIKE $1)
        AND p.total_quantity > 0
        AND u.is_blocked = FALSE
        AND (
          u.subscription_renewal_date >= CURRENT_DATE 
          OR NOT EXISTS (
            SELECT 1 FROM vendor_annual_billing vab 
            WHERE vab.vendor_id = u.id 
              AND vab.payment_status IN ('PENDING', 'OVERDUE') 
              AND CURRENT_DATE >= (vab.period_end + INTERVAL '3 days')
          )
        )
        AND u.razorpay_key_id IS NOT NULL
        AND u.razorpay_key_secret IS NOT NULL
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
             u.pincode AS vendor_pincode,
             u.is_blocked AS vendor_blocked,
             u.subscription_renewal_date AS vendor_renewal_date,
             (u.razorpay_key_id IS NOT NULL AND u.razorpay_key_secret IS NOT NULL) AS vendor_has_gateway,
             (
               SELECT COUNT(*)::INT 
               FROM vendor_annual_billing vab 
               WHERE vab.vendor_id = u.id 
                 AND vab.payment_status IN ('PENDING', 'OVERDUE')
                 AND CURRENT_DATE > (vab.period_end + INTERVAL '3 days')
             ) AS overdue_bills_past_grace
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

    // 1. Vendor suspended by admin
    if (rawProduct.vendor_blocked) {
      return res.status(403).json({
        success: false,
        message: 'This vendor account is currently suspended.',
      });
    }

    // 2. Gateway not configured
    if (!rawProduct.vendor_has_gateway) {
      return res.status(403).json({
        success: false,
        message: 'This vendor has not yet activated their direct payment gateway.',
      });
    }

    // 3. Pause store ONLY if unpaid annual bill is past the 3-day grace period
    if (parseInt(rawProduct.overdue_bills_past_grace, 10) > 0) {
      return res.status(403).json({
        success: false,
        message: 'This vendor store is temporarily paused for annual licensing renewal. Please check back later.',
      });
    }

    // Check confirmed booking for unmasking contact details
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

    const sanitizedProduct = {
      ...rawProduct,
      vendor_phone: hasConfirmedOrder ? rawProduct.vendor_phone : null,
      vendor_address: hasConfirmedOrder ? rawProduct.vendor_address : null,
      is_contact_masked: !hasConfirmedOrder,
    };

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

// GET /api/v1/rms/user/storeCoupons/:vendorId
exports.getStoreCoupons = async (req, res) => {
  try {
    const customerId = req.user?.id || null;
    const { vendorId } = req.params;

    const query = `
      SELECT sc.id, sc.vendor_id, sc.code, sc.discount_type, sc.discount_value, 
             sc.max_discount_amount, sc.min_order_amount, sc.min_rental_days, sc.product_id,
             sc.valid_until
      FROM store_coupons sc
      WHERE sc.vendor_id = $1 
        AND sc.is_active = TRUE
        AND sc.is_archived = FALSE
        AND (sc.valid_until IS NULL OR sc.valid_until::DATE >= CURRENT_DATE)
        AND (sc.max_uses IS NULL OR sc.used_count < sc.max_uses)
        AND (
          $2::INT IS NULL OR (
            SELECT COUNT(*)::INT 
            FROM coupon_redemptions cr 
            WHERE cr.coupon_id = sc.id AND cr.customer_id = $2
          ) < sc.per_user_limit
        )
      ORDER BY sc.discount_value DESC
    `;

    const result = await pool.query(query, [vendorId, customerId]);
    return res.status(200).json({ success: true, coupons: result.rows });
  } catch (error) {
    console.error('Get Store Coupons Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch store coupons.' });
  }
};