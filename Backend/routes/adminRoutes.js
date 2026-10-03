// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { validateRequired } = require('../middlewares/validateMiddleware');

router.use(verifyToken);
router.use(authorizeRoles('admin'));

// Dashboard & Analytics
router.get('/dashboardStats', adminController.getDashboardStats);
router.get('/ordersByCategory', adminController.getOrdersByCategory);
router.get('/transactionLedger', adminController.getTransactionLedger);

// Vendor & Inventory Moderation
router.get('/vendors', adminController.getAllVendors);
router.get('/vendorProducts/:vendorId', adminController.getVendorProducts);
router.delete('/product/:id', adminController.deleteProductByAdmin);

// Annual SaaS Licensing & Platform Royalties
router.get('/annualBillingAudit', adminController.getAnnualBillingAudit);
router.post('/markAnnualBillingPaid', validateRequired(['billing_id']), adminController.markAnnualBillingPaid);

// User & Delinquency Management
router.get('/delinquentUsers', adminController.getDelinquentUsers);
router.post('/pardonDelinquentUser', validateRequired(['userId']), adminController.pardonDelinquentUser);
router.post('/toggleBlockUser', validateRequired(['userId']), adminController.toggleBlockUser);

// KYC Officers
router.get('/officers', adminController.getKycOfficers);
router.post('/addOfficer', validateRequired(['full_name', 'email', 'password', 'phone']), adminController.addKycOfficer);
router.delete('/removeOfficer/:id', adminController.removeKycOfficer);

// Maintenance
router.post('/triggerLostOrdersCheck', adminController.triggerLostOrdersCheck);

router.post('/triggerLicenseExpiryCheck', adminController.triggerLicenseExpiryCheck);

// Admin Taxonomy Management
router.post('/addCategory', validateRequired(['name']), adminController.addCategory);

module.exports = router;