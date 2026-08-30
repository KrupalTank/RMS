// src/components/Navbar.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ProfileModal from './ProfileModal';
import api from '../api/axiosInstance';
import { io } from 'socket.io-client';
import {
  ShoppingBag,
  ShoppingCart,
  User,
  LogOut,
  ShieldCheck,
  Store,
  LayoutDashboard,
  Award,
  Tag,
} from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [loyaltyInfo, setLoyaltyInfo] = useState({ couponsCount: 0, streak: 0 });

  const fetchLoyalty = async () => {
    if (user && user.role === 'customer') {
      try {
        const res = await api.get('/user/myCoupons');
        if (res.data.success) {
          setLoyaltyInfo({
            couponsCount: (res.data.coupons || []).length,
            streak: res.data.consecutive_good_returns || 0,
          });
        }
      } catch (err) {
        // Silent fallback
      }
    }
  };

  useEffect(() => {
    fetchLoyalty();

    if (user && user.role === 'customer') {
      const socket = io('http://localhost:5000', { withCredentials: true });
      socket.on('ORDER_STATUS_CHANGED', () => fetchLoyalty());
      socket.on('PAYOUT_GENERATED', () => fetchLoyalty());
      return () => socket.disconnect();
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center gap-2 text-blue-600 font-extrabold text-xl tracking-tight">
                <ShoppingBag className="w-6 h-6" />
                <span>RMS Portal</span>
              </Link>
            </div>

            {/* Role Navigation & Links */}
            <div className="flex items-center gap-3 sm:gap-4">
              <Link to="/" className="text-gray-600 hover:text-blue-600 text-sm font-medium hidden sm:block">
                Catalog
              </Link>

              {user ? (
                <>
                  {user.role === 'customer' && (
                    <>
                      {/* Loyalty Badge in Nav */}
                      <Link
                        to="/customer/cart"
                        className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border transition ${
                          loyaltyInfo.couponsCount > 0
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm animate-pulse'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                        title="Loyalty Privilege Progress"
                      >
                        {loyaltyInfo.couponsCount > 0 ? (
                          <>
                            <Tag className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{loyaltyInfo.couponsCount} Voucher{loyaltyInfo.couponsCount > 1 ? 's' : ''}</span>
                          </>
                        ) : (
                          <>
                            <Award className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{loyaltyInfo.streak}/8 Streak</span>
                          </>
                        )}
                      </Link>

                      <Link
                        to="/customer/cart"
                        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 border border-gray-200"
                        title="View Cart"
                      >
                        <ShoppingCart className="w-4 h-4 text-blue-600" />
                        <span className="hidden sm:inline">My Cart</span>
                      </Link>

                      <Link to="/customer/orders" className="text-gray-600 hover:text-blue-600 text-sm font-medium">
                        My Orders
                      </Link>

                      <Link
                        to="/customer/kyc"
                        className="hidden md:flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>KYC: {user.kyc_status?.toUpperCase() || 'NON_VERIFIED'}</span>
                      </Link>
                    </>
                  )}

                  {user.role === 'vendor' && (
                    <Link
                      to="/vendor/dashboard"
                      className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200"
                    >
                      <Store className="w-4 h-4" />
                      <span>Vendor Hub</span>
                    </Link>
                  )}

                  {user.role === 'kyc_officer' && (
                    <Link
                      to="/kyc/dashboard"
                      className="flex items-center gap-1.5 text-sm font-medium text-purple-700 bg-purple-50 px-3 py-1.5 rounded-md border border-purple-200"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>KYC Console</span>
                    </Link>
                  )}

                  {user.role === 'admin' && (
                    <Link
                      to="/admin/dashboard"
                      className="flex items-center gap-1.5 text-sm font-medium text-rose-700 bg-rose-50 px-3 py-1.5 rounded-md border border-rose-200"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Admin Suite</span>
                    </Link>
                  )}

                  {/* Profile & Logout */}
                  <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
                    <button
                      onClick={() => setIsProfileOpen(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-blue-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
                      title="Edit Profile"
                    >
                      <User className="w-4 h-4" />
                      <span className="max-w-[100px] truncate">{user.full_name}</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md transition"
                      title="Sign Out"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Link to="/login" className="text-sm font-medium text-gray-700 hover:text-blue-600">
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition"
                  >
                    Create Account
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  );
};

export default Navbar;