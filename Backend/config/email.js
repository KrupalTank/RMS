// config/email.js
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT, 10) || 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify connection configuration
transporter.verify((error) => {
  if (error) {
    console.error('⚠️ Email transporter configuration error:', error.message);
  } else {
    console.log('📧 Email SMTP Transporter Ready');
  }
});

module.exports = transporter;