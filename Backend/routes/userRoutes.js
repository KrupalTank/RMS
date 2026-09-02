// routes/userRoutes.js
const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const cartController = require('../controllers/cartController');
const orderController = require('../controllers/orderController');

const { verifyToken } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const { validateRequired } = require('../middlewares/validateMiddleware');

const recommendationController = require('../controllers/recommendationController');

// All user routes require authentication
router.use(verifyToken);

// KYC Document Submission (Aadhaar image + Webcam snapshot)
router.post(
  '/authenticateMe',
  upload.fields([
    { name: 'aadhaar_card', maxCount: 1 },
    { name: 'live_photo', maxCount: 1 },
  ]),
  userController.submitKyc
);

// Profile
router.get('/myProfile', userController.getMyProfile);
router.put('/myProfile', userController.updateMyProfile);

// Catalog Exploration
router.get('/getProducts', userController.getProducts);
router.get('/getProducts/:category', userController.getProductsByCategory);
router.get('/products/:productName', userController.searchProducts);
router.get('/getProduct/:id', userController.getProductById);

// Cart
router.post('/addToCart', validateRequired(['product_id', 'quantity', 'start_date', 'end_date']), cartController.addToCart);
router.get('/getCart', cartController.getCart);
router.delete('/removeItemFromCart/:id', cartController.removeItemFromCart);

// Orders & Handover
router.get('/getOrders', orderController.getCustomerOrders);
router.post('/changeOrderStatus', validateRequired(['order_id']), orderController.confirmOrderReceived);
router.post('/cancelOrder', validateRequired(['order_id']), orderController.cancelOrder);
// Reviews
router.post('/review/:id', validateRequired(['rating', 'comment']), userController.postReview);

router.get('/myCoupons', userController.getMyCoupons);

router.get('/recommendations/similar/:productId', recommendationController.getSimilar);
router.post('/recommendations/frequentlyRentedTogether', recommendationController.getFrequentlyRentedTogether);
router.get('/recommendations/forYou', recommendationController.getPersonalized);

module.exports = router;