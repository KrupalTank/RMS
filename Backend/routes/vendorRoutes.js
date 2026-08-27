// routes/vendorRoutes.js
const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const userController = require('../controllers/userController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const { validateRequired } = require('../middlewares/validateMiddleware');

// Protect all vendor routes
router.use(verifyToken);
router.use(authorizeRoles('vendor', 'admin'));

// Product Management
router.get('/getProducts', vendorController.getMyProducts);
router.get('/getProduct/:id', vendorController.getProductById);
// routes/vendorRoutes.js
router.post('/addProduct', upload.array('images', 6),
validateRequired([
    'title',
    'category_id',
    'total_quantity',
    'rent_per_day_1_4',
    'rent_per_day_5_9',
    'rent_per_day_10_onwards',
    'deposit_verified',
    'deposit_non_verified',
    'late_fee_verified',
    'late_fee_non_verified',
  ]), vendorController.addProduct);

router.put('/editProduct/:id', upload.array('images', 6),
validateRequired([
    'title',
    'category_id',
    'total_quantity',
    'rent_per_day_1_4',
    'rent_per_day_5_9',
    'rent_per_day_10_onwards',
    'deposit_verified',
    'deposit_non_verified',
    'late_fee_verified',
    'late_fee_non_verified',
  ]), vendorController.editProduct);
// Categories
router.get('/getCategories', vendorController.getCategories);
router.post('/addCategory', validateRequired(['name']), vendorController.addCategory);

// Orders
router.get('/getOrders', vendorController.getVendorOrders);
router.get('/getOrder/:id', vendorController.getVendorOrderById);
router.post('/changeOrderStatus', validateRequired(['order_id', 'status']), vendorController.changeOrderStatus);

// Vendor Profile
router.get('/myProfile', userController.getMyProfile);
router.put('/myProfile', userController.updateMyProfile);


module.exports = router;