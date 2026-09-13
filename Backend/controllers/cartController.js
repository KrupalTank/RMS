// controllers/cartController.js
const pool = require('../config/db');
const { calculateRentalQuotation } = require('../services/pricingService');

// POST /api/v1/rms/user/addToCart
exports.addToCart = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { product_id, quantity, start_date, end_date } = req.body;

    if (!product_id || !quantity || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'Please provide all required cart fields.' });
    }

    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ success: false, message: 'End date cannot be earlier than start date.' });
    }

    // 1. Check if user is suspended
    const userCheck = await client.query('SELECT is_blocked FROM users WHERE id = $1', [userId]);
    if (userCheck.rows[0]?.is_blocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account is suspended. You cannot rent or book new equipment.',
      });
    }

    await client.query('BEGIN');

    // 2. Fetch the target product and its vendor
    // 2. Fetch the target product and its vendor
    const prodRes = await client.query(
      `SELECT p.id, p.vendor_id, p.total_quantity, 
              u.full_name AS vendor_name, u.is_blocked AS vendor_blocked,
              u.subscription_renewal_date,
              (u.razorpay_key_id IS NOT NULL AND u.razorpay_key_secret IS NOT NULL) AS vendor_has_gateway,
              (SELECT COUNT(*) FROM vendor_annual_billing vab 
               WHERE vab.vendor_id = u.id 
                 AND vab.payment_status IN ('PENDING', 'OVERDUE')
                 AND CURRENT_DATE > (vab.period_end + INTERVAL '3 days')) AS overdue_past_grace
       FROM products p
       JOIN users u ON p.vendor_id = u.id
       WHERE p.id = $1 FOR UPDATE`,
      [product_id]
    );

    if (prodRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const targetProduct = prodRes.rows[0];

    if (targetProduct.vendor_blocked) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'This store is temporarily suspended.' });
    }

    if (parseInt(targetProduct.overdue_past_grace, 10) > 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: `Store "${targetProduct.vendor_name}" is paused for annual licensing renewal.`,
      });
    }

    if (!targetProduct.vendor_has_gateway) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Store "${targetProduct.vendor_name}" has not yet configured their direct payment gateway.`,
      });
    }

    // 3. ZERO-INTERMEDIATION RULE: Single-Vendor Cart Boundary
    // Customers pay vendors directly, so cart cannot mix equipment from different vendors.
    const cartVendorCheck = await client.query(
      `SELECT DISTINCT p.vendor_id, u.full_name AS current_vendor_name
       FROM cart c
       JOIN products p ON c.product_id = p.id
       JOIN users u ON p.vendor_id = u.id
       WHERE c.user_id = $1`,
      [userId]
    );

    if (cartVendorCheck.rows.length > 0) {
      const existingVendorId = cartVendorCheck.rows[0].vendor_id;
      if (existingVendorId !== targetProduct.vendor_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          conflict: true,
          currentVendorName: cartVendorCheck.rows[0].current_vendor_name,
          newVendorName: targetProduct.vendor_name,
          message: `Your cart contains items from "${cartVendorCheck.rows[0].current_vendor_name}". Rentals must be checked out per individual store. Would you like to clear your cart and rent from "${targetProduct.vendor_name}"?`,
        });
      }
    }

    // 4. Verify live stock availability
    const availCheck = await client.query(
      'SELECT available_stock FROM check_product_availability($1, $2, $3)',
      [product_id, start_date, end_date]
    );

    const availableStock = availCheck.rows[0]?.available_stock ?? 0;
    const requestedQty = parseInt(quantity, 10);

    if (requestedQty > availableStock) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Requested quantity exceeds available stock (${availableStock} unit(s) available for selected dates).`,
      });
    }

    // 5. Upsert into cart table
    const result = await client.query(
      `INSERT INTO cart (user_id, product_id, quantity, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = EXCLUDED.quantity, 
                     start_date = EXCLUDED.start_date, 
                     end_date = EXCLUDED.end_date, 
                     updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, product_id, requestedQty, start_date, end_date]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Item added/updated in cart.',
      cartItem: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Add to Cart Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add item to cart.' });
  } finally {
    client.release();
  }
};

// GET /api/v1/rms/user/getCart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const userKyc = req.user.kyc_status;

    const query = `
      SELECT c.id AS cart_id, c.product_id, c.quantity, 
             TO_CHAR(c.start_date, 'YYYY-MM-DD') AS start_date, 
             TO_CHAR(c.end_date, 'YYYY-MM-DD') AS end_date,
             p.vendor_id, p.title, p.images, p.rent_per_day_1_4, p.rent_per_day_5_9, p.rent_per_day_10_onwards,
             p.deposit_verified, p.deposit_non_verified, p.late_fee_verified, p.late_fee_non_verified,
             u.full_name AS vendor_name, u.phone AS vendor_phone, u.address AS vendor_address, u.city AS vendor_city,
             u.razorpay_key_id,
             u.subscription_renewal_date,
             (SELECT COUNT(*)::INT FROM vendor_annual_billing vab 
              WHERE vab.vendor_id = u.id 
                AND vab.payment_status IN ('PENDING', 'OVERDUE')
                AND CURRENT_DATE > (vab.period_end + INTERVAL '3 days')) AS overdue_past_grace
      FROM cart c
      JOIN products p ON c.product_id = p.id
      JOIN users u ON p.vendor_id = u.id
      WHERE c.user_id = $1
      ORDER BY c.created_at ASC
    `;

    const result = await pool.query(query, [userId]);

    let grandTotalRent = 0;
    let grandTotalDeposit = 0;
    let storeVendor = null;

    const items = result.rows.map((row) => {
      if (!storeVendor) {
        storeVendor = {
          id: row.vendor_id,
          name: row.vendor_name,
          phone: row.vendor_phone,
          address: row.vendor_address,
          city: row.vendor_city,
          hasGatewayConfigured: Boolean(row.razorpay_key_id),
          isRenewalDue: parseInt(row.overdue_past_grace, 10) > 0,
        };
      }

      const quotation = calculateRentalQuotation(
        row,
        row.start_date,
        row.end_date,
        row.quantity,
        userKyc
      );

      grandTotalRent += quotation.totalRent;
      grandTotalDeposit += quotation.totalDeposit;

      return {
        cart_id: row.cart_id,
        product_id: row.product_id,
        title: row.title,
        images: row.images,
        quantity: row.quantity,
        start_date: row.start_date,
        end_date: row.end_date,
        quotation,
      };
    });

    return res.status(200).json({
      success: true,
      storeVendor,
      items,
      summary: {
        totalRent: grandTotalRent,
        totalDeposit: grandTotalDeposit,
        grandTotal: grandTotalRent + grandTotalDeposit,
        itemCount: items.length,
      },
    });
  } catch (error) {
    console.error('Get Cart Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch cart.' });
  }
};

// DELETE /api/v1/rms/user/removeItemFromCart/:id
exports.removeItemFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await pool.query('DELETE FROM cart WHERE id = $1 AND user_id = $2', [id, userId]);

    return res.status(200).json({ success: true, message: 'Item removed from cart.' });
  } catch (error) {
    console.error('Remove Cart Item Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove cart item.' });
  }
};

// DELETE /api/v1/rms/user/clearCart
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query('DELETE FROM cart WHERE user_id = $1', [userId]);
    return res.status(200).json({ success: true, message: 'Cart cleared successfully.' });
  } catch (error) {
    console.error('Clear Cart Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to clear cart.' });
  }
};