/*
getSimilarProducts (Weighted Content & Locality Scoring):
Category Affinity (+40 pts): Matches items in the same category. 
City Proximity (+30 pts): Matches items in the customer's city for easy pickup.
Pricing Bracket (+20 pts): Proximity score based on daily rental rate difference ($\vert{}\Delta \text{Rent}\vert{}$).  
Customer Review Rating (+10 pts): Boosts items with 4+ star verified reviews.  

getFrequentlyRentedTogether (Co-Occurrence Mining):
Computes multi-item co-occurrence across shared group_id checkout groups in orders (excluding the items already in the user's cart).  

getPersonalizedFeed (User Profile & History Collaborative Scoring):
Analyzes the customer's completed/active rental history to identify top category preferences, boosts local inventory in their city, and ranks the rest by average review ratings.  
*/

// services/recommendationService.js
const pool = require('../config/db');

/**
 * 1. Content & Locality-Based Similarity
 * Recommends substitutes and similar equipment on ProductDetail page.
 */
async function getSimilarProducts(productId, userCity = '', limit = 6) {
  try {
    // Fetch reference product baseline details
    const targetProductRes = await pool.query(
      `SELECT p.id, p.category_id, p.rent_per_day_1_4, u.city AS vendor_city
       FROM products p
       JOIN users u ON p.vendor_id = u.id
       WHERE p.id = $1`,
      [productId]
    );

    if (targetProductRes.rows.length === 0) return [];

    const target = targetProductRes.rows[0];
    const targetCategory = target.category_id;
    const targetRate = parseFloat(target.rent_per_day_1_4 || 0);

    const query = `
      SELECT 
        p.*, 
        c.name AS category_name, 
        u.city AS vendor_city, 
        u.address AS vendor_address, 
        u.phone AS vendor_phone,
        COALESCE(AVG(r.rating), 0)::NUMERIC(2,1) AS avg_rating,
        COUNT(r.id)::INT AS review_count,
        (
          -- Weight 1: Category Match (40 points)
          (CASE WHEN p.category_id = $2 THEN 40 ELSE 0 END) +
          
          -- Weight 2: Same City Locality (30 points)
          (CASE WHEN LOWER(u.city) = LOWER($3) THEN 30 ELSE 0 END) +
          
          -- Weight 3: Price Proximity (Up to 20 points, decays with larger price difference)
          GREATEST(0, 20 - (ABS(p.rent_per_day_1_4 - $4) / GREATEST($4, 1) * 20)) +
          
          -- Weight 4: Verified High Rating Boost (Up to 10 points)
          (COALESCE(AVG(r.rating), 0) * 2)
        ) AS recommendation_score
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      LEFT JOIN reviews r ON p.id = r.product_id
      WHERE p.id != $1 
        AND p.total_quantity > 0
      GROUP BY p.id, c.name, u.city, u.address, u.phone
      ORDER BY recommendation_score DESC, p.created_at DESC
      LIMIT $5
    `;

    const result = await pool.query(query, [
      productId,
      targetCategory,
      userCity,
      targetRate,
      limit,
    ]);

    return result.rows;
  } catch (err) {
    console.error('getSimilarProducts Service Error:', err);
    throw err;
  }
}

/**
 * 2. Association Rule Mining ("Frequently Rented Together")
 * Analyzes co-occurrence in orders table by group_id.
 */
async function getFrequentlyRentedTogether(productIds = [], limit = 4) {
  try {
    if (!productIds || productIds.length === 0) return [];

    const query = `
      WITH TargetOrders AS (
        -- Find all checkout groups that contain any of the target products
        SELECT DISTINCT group_id 
        FROM orders 
        WHERE product_id = ANY($1::int[]) 
          AND status NOT IN ('Cancelled', 'Pending_Payment')
      ),
      CoOccurrences AS (
        -- Count how many times other products were ordered in the exact same groups
        SELECT 
          o.product_id,
          COUNT(DISTINCT o.group_id) AS co_occurrence_count
        FROM orders o
        JOIN TargetOrders t ON o.group_id = t.group_id
        WHERE o.product_id != ALL($1::int[])
          AND o.status NOT IN ('Cancelled', 'Pending_Payment')
        GROUP BY o.product_id
      )
      SELECT 
        p.*, 
        c.name AS category_name, 
        u.city AS vendor_city, 
        u.address AS vendor_address, 
        u.phone AS vendor_phone,
        COALESCE(AVG(r.rating), 0)::NUMERIC(2,1) AS avg_rating,
        COUNT(DISTINCT r.id)::INT AS review_count,
        co.co_occurrence_count
      FROM CoOccurrences co
      JOIN products p ON co.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      LEFT JOIN reviews r ON p.id = r.product_id
      WHERE p.total_quantity > 0
      GROUP BY p.id, c.name, u.city, u.address, u.phone, co.co_occurrence_count
      ORDER BY co.co_occurrence_count DESC, avg_rating DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [productIds, limit]);

    // Fallback: If no co-occurrences exist yet (new items), suggest top-rated items from other categories
    if (result.rows.length === 0) {
      const fallbackQuery = `
        SELECT 
          p.*, 
          c.name AS category_name, 
          u.city AS vendor_city, 
          u.address AS vendor_address, 
          u.phone AS vendor_phone,
          COALESCE(AVG(r.rating), 0)::NUMERIC(2,1) AS avg_rating,
          COUNT(r.id)::INT AS review_count
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        JOIN users u ON p.vendor_id = u.id
        LEFT JOIN reviews r ON p.id = r.product_id
        WHERE p.id != ALL($1::int[]) 
          AND p.total_quantity > 0
        GROUP BY p.id, c.name, u.city, u.address, u.phone
        ORDER BY avg_rating DESC, p.created_at DESC
        LIMIT $2
      `;
      const fallbackRes = await pool.query(fallbackQuery, [productIds, limit]);
      return fallbackRes.rows;
    }

    return result.rows;
  } catch (err) {
    console.error('getFrequentlyRentedTogether Service Error:', err);
    throw err;
  }
}

/**
 * 3. Personalized Feed ("Recommended For You")
 * Personalizes feed based on user's past rental categories and city locality.
 */
async function getPersonalizedFeed(userId, userCity = '', limit = 8) {
  try {
    const query = `
      WITH UserPreferredCategories AS (
        -- Determine top categories the customer has rented in the past
        SELECT p.category_id, COUNT(o.id) AS rental_weight
        FROM orders o
        JOIN products p ON o.product_id = p.id
        WHERE o.customer_id = $1 AND o.status NOT IN ('Cancelled', 'Pending_Payment')
        GROUP BY p.category_id
      )
      SELECT 
        p.*, 
        c.name AS category_name, 
        u.city AS vendor_city, 
        u.address AS vendor_address, 
        u.phone AS vendor_phone,
        COALESCE(AVG(r.rating), 0)::NUMERIC(2,1) AS avg_rating,
        COUNT(r.id)::INT AS review_count,
        (
          -- Category preference weight (Up to 40 pts)
          COALESCE(upc.rental_weight * 10, 0) +
          
          -- Same city locality boost (30 pts)
          (CASE WHEN LOWER(u.city) = LOWER($2) THEN 30 ELSE 0 END) +
          
          -- Product rating boost (Up to 30 pts)
          (COALESCE(AVG(r.rating), 0) * 6)
        ) AS personal_score
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN users u ON p.vendor_id = u.id
      LEFT JOIN UserPreferredCategories upc ON p.category_id = upc.category_id
      LEFT JOIN reviews r ON p.id = r.product_id
      WHERE p.total_quantity > 0
      GROUP BY p.id, c.name, u.city, u.address, u.phone, upc.rental_weight
      ORDER BY personal_score DESC, p.created_at DESC
      LIMIT $3
    `;

    const result = await pool.query(query, [userId, userCity, limit]);
    return result.rows;
  } catch (err) {
    console.error('getPersonalizedFeed Service Error:', err);
    throw err;
  }
}

module.exports = {
  getSimilarProducts,
  getFrequentlyRentedTogether,
  getPersonalizedFeed,
};