// src/components/ProfileModal.jsx
import React, { useState, useEffect } from 'react';
import api from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';
import { User, X, CheckCircle2, AlertCircle, RefreshCw, Shield, CreditCard, Calendar } from 'lucide-react';

const ProfileModal = ({ isOpen, onClose }) => {
  const { user, login } = useAuth();

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
  });

  const [vendorSaaSData, setVendorSaaSData] = useState({
    isConfigured: false,
    key_id: null,
    subscription_start_date: null,
    subscription_renewal_date: null,
  });

  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ success: '', error: '' });

  useEffect(() => {
    const fetchFullProfile = async () => {
      if (!isOpen) return;

      setFetching(true);
      setStatus({ success: '', error: '' });

      try {
        const [profileRes, gatewayRes] = await Promise.all([
          api.get('/user/myProfile'),
          user?.role === 'vendor' ? api.get('/vendor/gatewayStatus').catch(() => ({ data: {} })) : Promise.resolve({ data: {} }),
        ]);

        if (profileRes.data.success && profileRes.data.user) {
          const u = profileRes.data.user;
          setFormData({
            full_name: u.full_name || '',
            phone: u.phone || '',
            address: u.address || '',
            city: u.city || '',
            pincode: u.pincode || '',
          });
        }

        if (gatewayRes.data?.success) {
          setVendorSaaSData(gatewayRes.data);
        }
      } catch (err) {
        if (user) {
          setFormData({
            full_name: user.full_name || '',
            phone: user.phone || '',
            address: user.address || '',
            city: user.city || '',
            pincode: user.pincode || '',
          });
        }
      } finally {
        setFetching(false);
      }
    };

    fetchFullProfile();
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ success: '', error: '' });

    try {
      const res = await api.put('/user/myProfile', formData);
      if (res.data.success) {
        setStatus({ success: 'Profile updated successfully!', error: '' });
        login(res.data.user);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err) {
      setStatus({
        success: '',
        error: err.response?.data?.message || 'Failed to update profile.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full rounded-xl shadow-xl border border-gray-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            <span>Account Profile</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Vendor-Specific SaaS License & Gateway Banner */}
        {user?.role === 'vendor' && (
          <div className="bg-gradient-to-r from-gray-900 to-slate-800 text-white rounded-xl p-4 space-y-2.5 shadow-sm text-xs">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2 font-bold text-emerald-400">
                <CreditCard className="w-4 h-4" />
                <span>Razorpay Gateway Status</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  vendorSaaSData.isConfigured
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                }`}
              >
                {vendorSaaSData.isConfigured ? 'Active / Configured' : 'Keys Missing'}
              </span>
            </div>

            <div className="flex justify-between text-gray-300 text-[11px]">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" /> 5% Royalty Anniversary Renewal:
              </span>
              <span className="font-bold text-amber-300">
                {vendorSaaSData.subscription_renewal_date
                  ? new Date(vendorSaaSData.subscription_renewal_date).toLocaleDateString()
                  : 'N/A'}
              </span>
            </div>
          </div>
        )}

        {status.success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{status.success}</span>
          </div>
        )}

        {status.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{status.error}</span>
          </div>
        )}

        {fetching ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="text-xs text-gray-500 font-medium">Loading profile details...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  name="full_name"
                  required
                  value={formData.full_name}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Phone Number</label>
                <input
                  type="text"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Pincode</label>
                <input
                  type="text"
                  name="pincode"
                  value={formData.pincode}
                  onChange={handleChange}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500"
                  placeholder="e.g. 390001"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Address / Logistics Pickup</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500"
                placeholder="Street address, building, or landmark"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50 transition shadow-sm"
              >
                {loading ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;