// routes/kycRoutes.js
const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { validateRequired } = require('../middlewares/validateMiddleware');

// Protected for KYC Officers and Admins
router.use(verifyToken);
router.use(authorizeRoles('kyc_officer', 'admin'));

router.get('/pendingRequests', kycController.getPendingRequests);
router.get('/document/:type/:requestId', kycController.getDecryptedDocument);
router.post('/review', validateRequired(['requestId', 'decision']), kycController.reviewKyc);

module.exports = router;