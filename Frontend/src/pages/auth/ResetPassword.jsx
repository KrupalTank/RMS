import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { Lock, CheckCircle2, AlertCircle } from 'lucide-react';

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState({ loading: false, success: '', error: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return setStatus({ loading: false, success: '', error: 'Passwords do not match.' });
    }

    setStatus({ loading: true, success: '', error: '' });
    try {
      const res = await api.post(`/auth/resetPassword/${token}`, { password });
      if (res.data.success) {
        setStatus({ loading: false, success: res.data.message, error: '' });
        setTimeout(() => navigate('/login'), 2500);
      }
    } catch (err) {
      setStatus({
        loading: false,
        success: '',
        error: err.response?.data?.message || 'Token is invalid or has expired.',
      });
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div>
          <h2 className="text-center text-2xl font-extrabold text-gray-900">Set New Password</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Please enter your new strong password below.
          </p>
        </div>

        {status.success && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{status.success} Redirecting to login...</span>
          </div>
        )}

        {status.error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{status.error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="At least 6 characters"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Re-enter password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={status.loading || !!status.success}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {status.loading ? 'Updating Password...' : 'Save New Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;