// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRequired } = require('../middlewares/validateMiddleware');

router.post('/signup',validateRequired([
    'full_name',
    'email',
    'password',
    'phone',
  ]), authController.signup);

router.post('/login', validateRequired(['email', 'password']), authController.login);
router.post('/logout', authController.logout);

// Forgot & Reset Password
router.post('/forgotPassword', validateRequired(['email']), authController.forgotPassword);
router.post('/resetPassword/:token', validateRequired(['password']), authController.resetPassword);

module.exports = router;