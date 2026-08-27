// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken } = require('../middlewares/authMiddleware');
const {validateRequired} = require('../middlewares/validateMiddleware')

router.use(verifyToken);
router.post('/createCheckoutOrder', paymentController.createCheckoutOrder);
router.post('/verifyPayment', validateRequired(['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature', 'group_id']), paymentController.verifyPayment);

module.exports = router;