// src/pages/auth/Signup.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axiosInstance';
import { AlertCircle, ShieldCheck } from 'lucide-react';

const Signup = () => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'customer',
    city: '',
    phone: '',
  });
  const [agreedToVendorTerms, setAgreedToVendorTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.role === 'vendor' && !agreedToVendorTerms) {
      setError('You must review and accept the Annual RMS Licensing & Zero-Commission Policy to register as a Vendor.');
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/auth/signup', formData);
      if (res.data.success) {
        const newUser = res.data.user;
        login(newUser);

        if (newUser.role === 'vendor') navigate('/vendor/dashboard');
        else navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full space-y-6 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900 tracking-tight">Create your RMS Account</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700">Account Type / Role</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-medium text-gray-800"
            >
              <option value="customer">Customer (Rent items & equipment)</option>
              <option value="vendor">Vendor (List inventory & earn revenue)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                type="text"
                name="full_name"
                required
                value={formData.full_name}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">City</label>
              <input
                type="text"
                name="city"
                required
                value={formData.city}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Vadodara"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="9876543210"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              value={formData.password}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="At least 6 characters"
            />
          </div>

          {/* Vendor Mandatory Annual Licensing & 0% Per-Order Commission Agreement */}
          {formData.role === 'vendor' && (
            <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl border border-emerald-500/40 text-xs space-y-3 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-emerald-400 border-b border-white/10 pb-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="text-sm font-black">RMS Zero-Intermediation & Licensing Agreement</span>
              </div>

              <div className="space-y-2 text-[11px] text-gray-300 leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>
                    <b className="text-white">Direct-to-Vendor Payouts (0% Per-Order Cut):</b> 100% of all rental fees and customer security deposits land directly into your personal Razorpay merchant account upon checkout.
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>
                    <b className="text-white">Annual 365-Day Subscription Cycle:</b> Your software licensing cycle activates today and runs for exactly 1 full calendar year (365 days).
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>
                    <b className="text-white">5% Annual Royalty on Net Rent:</b> Platform royalty is strictly <b>5%</b> of your cumulative annual net rental revenue. Customer security deposits and cancelled bookings are <b>100% royalty-exempt</b>.
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>
                    <b className="text-white">3-Day Operational Grace Buffer:</b> Upon reaching your anniversary renewal date, you receive a 3-day grace period to settle the 5% platform statement. If unpaid past 3 days, your storefront and inventory will be temporarily locked to prevent new customer bookings until cleared.
                  </span>
                </div>
              </div>

              <label className="flex items-start gap-2.5 pt-2 border-t border-white/10 font-semibold text-emerald-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={agreedToVendorTerms}
                  onChange={(e) => setAgreedToVendorTerms(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-emerald-500 focus:ring-emerald-400 border-gray-400 bg-gray-800"
                />
                <span className="text-[11px]">
                  I agree to the RMS Zero-Commission Direct Model, 365-Day Cycle, 5% Annual Net Royalty, and 3-Day Grace Policy.
                </span>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (formData.role === 'vendor' && !agreedToVendorTerms)}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition"
          >
            {loading ? 'Creating Account...' : 'Complete Registration'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Signup;