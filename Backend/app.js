// app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const kycRoutes = require('./routes/kycRoutes');
const userRoutes = require('./routes/userRoutes'); 
const vendorRoutes = require('./routes/vendorRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173', // Vite default port
    credentials: true,
  })
);

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'RMS Backend is running' });
});

//Mount Routes
app.use('/api/v1/rms/auth', authRoutes);
app.use('/api/v1/rms/kyc', kycRoutes);
app.use('/api/v1/rms/user', userRoutes);
app.use('/api/v1/rms/vendor', vendorRoutes);
app.use('/api/v1/rms/payment', paymentRoutes);
app.use('/api/v1/rms/admin', adminRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

module.exports = app;