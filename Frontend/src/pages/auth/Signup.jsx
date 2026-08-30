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
    bank_account_no: '',
    bank_ifsc: '',
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
      setError('You must review and accept the 10% Platform Commission Policy to register as a Vendor.');
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

          {/* Bank details for payouts */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2 font-medium">Bank Information (For automated payouts & refunds)</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <input
                  type="text"
                  name="bank_account_no"
                  value={formData.bank_account_no}
                  onChange={handleChange}
                  placeholder="Bank Account No."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <input
                  type="text"
                  name="bank_ifsc"
                  value={formData.bank_ifsc}
                  onChange={handleChange}
                  placeholder="IFSC Code"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>
          </div>

          {/* Vendor Mandatory Commission Agreement */}
          {formData.role === 'vendor' && (
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-2.5">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>RMS Vendor Partner & Commission Agreement</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                By registering as a Vendor on RMS, you agree that a fixed <b>10% platform commission fee</b> is deducted from gross rental income upon product handover. Security deposits are non-commissionable (100% held in escrow for repair/damage protection).
              </p>
              <label className="flex items-center gap-2 pt-1 font-semibold text-emerald-950 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={agreedToVendorTerms}
                  onChange={(e) => setAgreedToVendorTerms(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300"
                />
                <span>I understand and agree to the 10% Platform Commission Policy</span>
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