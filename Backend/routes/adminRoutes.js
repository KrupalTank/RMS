// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { validateRequired } = require('../middlewares/validateMiddleware');

router.use(verifyToken);
router.use(authorizeRoles('admin'));

router.get('/dashboardStats', adminController.getDashboardStats);
router.get('/ordersByCategory', adminController.getOrdersByCategory);
router.get('/vendors', adminController.getAllVendors);
router.get('/vendorProducts/:vendorId', adminController.getVendorProducts);
router.delete('/product/:id', adminController.deleteProductByAdmin);
router.get('/delinquentUsers', adminController.getDelinquentUsers);
router.post('/toggleBlockUser', validateRequired(['userId']), adminController.toggleBlockUser);
router.get('/officers', adminController.getKycOfficers);
router.post('/addOfficer', validateRequired(['full_name', 'email', 'password', 'phone']), adminController.addKycOfficer);
router.delete('/removeOfficer/:id', adminController.removeKycOfficer);
router.get('/pendingPayouts', adminController.getPendingPayouts);
router.post('/recordPayoutReference', validateRequired(['payout_id', 'gateway_reference_id']), adminController.recordPayoutReference);
// router.post('/createPayoutOrder', validateRequired(['payout_id']), adminController.createPayoutOrder);

router.post('/triggerLostOrdersCheck', adminController.triggerLostOrdersCheck);
router.get('/transactionLedger', adminController.getTransactionLedger);

router.post('/pardonDelinquentUser', validateRequired(['userId']), adminController.pardonDelinquentUser);

// Inside routes/adminRoutes.js
router.post(
  '/batchBankingPayouts',
  validateRequired(['payout_ids']),
  adminController.batchBankingPayouts
);

module.exports = router;