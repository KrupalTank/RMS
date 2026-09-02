// controllers/recommendationController.js
const recommendationService = require('../services/recommendationService');

// GET /api/v1/rms/user/recommendations/similar/:productId
exports.getSimilar = async (req, res) => {
  try {
    const { productId } = req.params;
    const userCity = req.user?.city || '';
    const limit = parseInt(req.query.limit, 10) || 6;

    const products = await recommendationService.getSimilarProducts(
      parseInt(productId, 10),
      userCity,
      limit
    );

    return res.status(200).json({ success: true, products });
  } catch (err) {
    console.error('Recommendation Controller Similar Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch similar recommendations.' });
  }
};

// POST /api/v1/rms/user/recommendations/frequentlyRentedTogether
exports.getFrequentlyRentedTogether = async (req, res) => {
  try {
    const { product_ids = [] } = req.body;
    const limit = parseInt(req.query.limit, 10) || 4;

    const products = await recommendationService.getFrequentlyRentedTogether(
      product_ids.map((id) => parseInt(id, 10)),
      limit
    );

    return res.status(200).json({ success: true, products });
  } catch (err) {
    console.error('Recommendation Controller Co-Rent Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch frequently rented together items.' });
  }
};

// GET /api/v1/rms/user/recommendations/forYou
exports.getPersonalized = async (req, res) => {
  try {
    const userId = req.user.id;
    const userCity = req.user?.city || '';
    const limit = parseInt(req.query.limit, 10) || 8;

    const products = await recommendationService.getPersonalizedFeed(userId, userCity, limit);

    return res.status(200).json({ success: true, products });
  } catch (err) {
    console.error('Recommendation Controller ForYou Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch personalized feed.' });
  }
};