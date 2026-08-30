// src/components/ProfileModal.jsx
import React, { useState, useEffect } from 'react';
import api from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';
import { User, X, CheckCircle2, AlertCircle, RefreshCw, Award, Tag, Gift } from 'lucide-react';

const ProfileModal = ({ isOpen, onClose }) => {
  const { user, login } = useAuth();

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
    bank_account_no: '',
    bank_ifsc: '',
  });

  const [loyaltyData, setLoyaltyData] = useState({
    coupons: [],
    consecutive_good_returns: 0,
    late_returns_count: 0,
    milestone_target: 8,
    contact_support_email: 'support@rms.com',
  });

  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ success: '', error: '' });

  useEffect(() => {
    const fetchFullProfileAndCoupons = async () => {
      if (!isOpen) return;

      setFetching(true);
      setStatus({ success: '', error: '' });

      try {
        const [profileRes, couponsRes] = await Promise.all([
          api.get('/user/myProfile'),
          user?.role === 'customer' ? api.get('/user/myCoupons') : Promise.resolve({ data: {} }),
        ]);

        if (profileRes.data.success && profileRes.data.user) {
          const u = profileRes.data.user;
          setFormData({
            full_name: u.full_name || '',
            phone: u.phone || '',
            address: u.address || '',
            city: u.city || '',
            pincode: u.pincode || '',
            bank_account_no: u.bank_account_no || '',
            bank_ifsc: u.bank_ifsc || '',
          });
        }

        if (couponsRes.data?.success) {
          setLoyaltyData({
            coupons: couponsRes.data.coupons || [],
            consecutive_good_returns: couponsRes.data.consecutive_good_returns || 0,
            late_returns_count: couponsRes.data.late_returns_count || 0,
            milestone_target: couponsRes.data.milestone_target || 8,
            contact_support_email: couponsRes.data.contact_support_email || 'support@rms.com',
          });
        }
      } catch (err) {
        if (user) {
          setFormData({
            full_name: user.full_name || '',
            phone: user.phone || '',
            address: user.address || '',
            city: user.city || '',
            pincode: user.pincode || '',
            bank_account_no: user.bank_account_no || '',
            bank_ifsc: user.bank_ifsc || '',
          });
        }
      } finally {
        setFetching(false);
      }
    };

    fetchFullProfileAndCoupons();
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

  const progressPercent = Math.min(
    100,
    Math.round((loyaltyData.consecutive_good_returns / loyaltyData.milestone_target) * 100)
  );

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full rounded-xl shadow-xl border border-gray-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            <span>Manage My Account Profile</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loyalty Rewards Privilege Section for Customers */}
        {user?.role === 'customer' && (
          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 text-white rounded-xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-xs">Customer Loyalty Milestone</span>
              </div>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  loyaltyData.late_returns_count > 0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    : 'bg-white/10 text-white border-white/20'
                }`}
              >
                {loyaltyData.consecutive_good_returns} / {loyaltyData.milestone_target} Completed
                {loyaltyData.late_returns_count > 0 && ' (Paused)'}
              </span>
            </div>

            {loyaltyData.late_returns_count > 0 ? (
              <div className="bg-amber-950/50 border border-amber-400/40 rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Streak Accrual Paused</span>
                </div>
                <p className="text-blue-100 text-[11px] leading-relaxed">
                  Your streak is paused at <b>{loyaltyData.consecutive_good_returns} / {loyaltyData.milestone_target} returns</b> due to{' '}
                  <b>{loyaltyData.late_returns_count} overdue return record(s)</b>.
                </p>
                <p className="text-blue-100 text-[11px] leading-relaxed">
                  You can still use any existing coupons below. To request a 1-time amnesty review, contact RMS Support at:{' '}
                  <a
                    href={`mailto:${loyaltyData.contact_support_email}`}
                    className="text-amber-300 font-bold underline hover:text-amber-200"
                  >
                    {loyaltyData.contact_support_email}
                  </a>
                </p>
              </div>
            ) : (
              <div className="w-full bg-blue-950/60 rounded-full h-2 overflow-hidden border border-white/10">
                <div
                  className="bg-gradient-to-r from-amber-400 to-emerald-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            {loyaltyData.coupons.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] text-amber-300 font-semibold flex items-center gap-1">
                  <Gift className="w-3.5 h-3.5" /> Available 10% Loyalty Coupons:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {loyaltyData.coupons.map((c) => (
                    <span
                      key={c.id}
                      className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-bold text-emerald-200 flex items-center gap-1"
                    >
                      <Tag className="w-3 h-3" /> {c.code}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              loyaltyData.late_returns_count === 0 && (
                <p className="text-[11px] text-blue-200">
                  {loyaltyData.milestone_target - loyaltyData.consecutive_good_returns} more on-time undamaged return(s) to earn your next 10% coupon card.
                </p>
              )
            )}
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
                  className="w-full p-2 border rounded-lg"
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
                  className="w-full p-2 border rounded-lg"
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
                  className="w-full p-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Pincode</label>
                <input
                  type="text"
                  name="pincode"
                  value={formData.pincode}
                  onChange={handleChange}
                  className="w-full p-2 border rounded-lg"
                  placeholder="e.g. 390001"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Address / Pickup Logistics</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full p-2 border rounded-lg"
                placeholder="Detailed street address, building, or landmark"
              />
            </div>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-[11px] text-gray-500 font-semibold mb-2">
                Bank Details (For Payouts / Escrow Refunds)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    name="bank_account_no"
                    value={formData.bank_account_no}
                    onChange={handleChange}
                    placeholder="Bank Account Number"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    name="bank_ifsc"
                    value={formData.bank_ifsc}
                    onChange={handleChange}
                    placeholder="IFSC Code"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;