// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const crypto = require('crypto'); // <-- Must be Node's native 'crypto' module
const { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordResetSuccessEmail } = require('../services/emailService');

// POST /api/v1/rms/auth/signup
exports.signup = async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      password,
      role = 'customer',
      address,
      city,
      pincode,
    } = req.body;

    if (!full_name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanPhone = phone.trim();

    // Check if email or phone already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [normalizedEmail, cleanPhone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email or phone already registered.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert user into database
    // For vendors: subscription_start_date & subscription_renewal_date use schema defaults (today and +1 year)
    // For customers: dates are set to NULL
    const newUser = await pool.query(
      `INSERT INTO users 
        (
          full_name, email, phone, password_hash, role, 
          address, city, pincode,
          subscription_start_date, subscription_renewal_date
        ) 
       VALUES (
         $1, $2, $3, $4, $5::user_role, $6, $7, $8,
         CASE WHEN $5::text = 'vendor' THEN CURRENT_DATE ELSE NULL END,
         CASE WHEN $5::text = 'vendor' THEN (CURRENT_DATE + INTERVAL '1 year')::DATE ELSE NULL END
       ) 
       RETURNING id, full_name, email, phone, role, kyc_status, city, 
                 subscription_start_date, subscription_renewal_date`,
      [full_name.trim(), normalizedEmail, cleanPhone, password_hash, role, address || null, city || null, pincode || null]
    );

    const user = newUser.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, city: user.city, kyc_status: user.kyc_status },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set HttpOnly Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Send welcome email (and attaches Agreement PDF if role === 'vendor')
    sendWelcomeEmail({
      user,
    });

    const io = req.app.get('socketio');
    if (io) {
      io.emit('USER_REGISTERED', {
        userId: user.id,
        role: user.role,
        fullName: user.full_name,
        email: user.email,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user,
    });
  } catch (error) {
    console.error('Signup Error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error.' });
  }
};

// POST /api/v1/rms/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password both.' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email. Please login agian or create new account if you are new user.' });
    }

    const user = result.rows[0];

    if (user.is_blocked) {
      return res.status(403).json({ success: false, message: 'Your account has been blocked by admin. please contact '+process.env.ContactMe });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, city: user.city, kyc_status: user.kyc_status },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const sanitizedUser = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      kyc_status: user.kyc_status,
      city: user.city,
      late_returns_count: user.late_returns_count,
    };

  

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      user: sanitizedUser,
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error.' });
  }
};

// POST /api/v1/rms/auth/logout
exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
  });
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
};

// POST /api/v1/rms/auth/forgotPassword
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide an email address.' });
    }

    // 1. Check if user exists
    const userRes = await pool.query('SELECT id, full_name, email FROM users WHERE email = $1', [
      email.toLowerCase().trim(),
    ]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No account registered with this email address.' });
    }

    const user = userRes.rows[0];

    // 2. Generate random 32-byte hex token and hash it for DB storage
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // 3. Set expiration time to 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `UPDATE users 
       SET reset_password_token = $1, 
           reset_password_expires = $2 
       WHERE id = $3`,
      [hashedToken, expiresAt, user.id]
    );

    // 4. Build reset URL pointing to frontend client
    const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientBaseUrl}/reset-password/${resetToken}`;

    // 5. Send Email
    await sendPasswordResetEmail({ user, resetUrl });

    return res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email address.',
    });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process forgot password request.' });
  }
};

// POST /api/v1/rms/auth/resetPassword/:token
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    // 1. Hash incoming plain token to compare with DB
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // 2. Find user where token matches and has not expired
    const userRes = await pool.query(
      `SELECT id, full_name, email 
       FROM users 
       WHERE reset_password_token = $1 
         AND reset_password_expires > NOW()`,
      [hashedToken]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired.',
      });
    }

    const user = userRes.rows[0];

    // 3. Hash the new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(password, salt);

    // 4. Update user password and clear token fields
    await pool.query(
      `UPDATE users 
       SET password_hash = $1, 
           reset_password_token = NULL, 
           reset_password_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPasswordHash, user.id]
    );

    // 5. Send confirmation email
    sendPasswordResetSuccessEmail({ user });

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};