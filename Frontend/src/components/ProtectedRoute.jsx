import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Redirect unauthenticated visitors to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Strict role mismatch handling: redirect to their respective hub
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'vendor') return <Navigate to="/vendor/dashboard" replace />;
    if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
    if (user.role === 'kyc_officer') return <Navigate to="/kyc/dashboard" replace />;
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;