// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  let token = null;
  // 2. Fallback: Check Authorization Header (Bearer token)
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 1. Check HttpOnly Cookie (signed or unsigned)
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.signedCookies && req.signedCookies.token) {
    token = req.signedCookies.token;
  }


  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Please log in.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role, city, kyc_status }
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session. Please log in again.',
    });
  }
};

module.exports = { verifyToken };