import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';

import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

import Catalog from './pages/customer/Catalog';
import ProductDetail from './pages/customer/ProductDetail';
import Cart from './pages/customer/Cart';
import Checkout from './pages/customer/Checkout';
import CustomerOrders from './pages/customer/CustomerOrders';
import CustomerKyc from './pages/customer/CustomerKyc';

import VendorDashboard from './pages/vendor/VendorDashboard';
import KycDashboard from './pages/kyc/KycDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <Routes>
            {/* 1. Public Visitor Routes */}
            <Route path="/" element={<Catalog />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* 2. Customer Protected Actions */}
            <Route element={<ProtectedRoute allowedRoles={['customer', 'admin']} />}>
              <Route path="/customer/cart" element={<Cart />} />
              <Route path="/customer/checkout" element={<Checkout />} />
              <Route path="/customer/orders" element={<CustomerOrders />} />
              <Route path="/customer/kyc" element={<CustomerKyc />} />
            </Route>

            {/* 3. Vendor Protected Actions */}
            <Route element={<ProtectedRoute allowedRoles={['vendor', 'admin']} />}>
              <Route path="/vendor/dashboard" element={<VendorDashboard />} />
            </Route>

            {/* 4. KYC Officer Protected Actions */}
            <Route element={<ProtectedRoute allowedRoles={['kyc_officer', 'admin']} />}>
              <Route path="/kyc/dashboard" element={<KycDashboard />} />
            </Route>

            {/* 5. Admin Protected Actions */}
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;