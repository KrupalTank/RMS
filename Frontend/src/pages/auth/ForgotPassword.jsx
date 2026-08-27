import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { Mail, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ loading: false, success: '', error: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, success: '', error: '' });

    try {
      const res = await api.post('/auth/forgotPassword', { email });
      if (res.data.success) {
        setStatus({
          loading: false,
          success: 'Password reset link sent! Check your inbox for the 15-minute token link.',
          error: '',
        });
      }
    } catch (err) {
      setStatus({
        loading: false,
        success: '',
        error: err.response?.data?.message || 'Failed to send reset link.',
      });
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div>
          <h2 className="text-center text-2xl font-extrabold text-gray-900">Reset your password</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your registered email and we'll send a cryptographic reset link.
          </p>
        </div>

        {status.success && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{status.success}</span>
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
            <label className="block text-sm font-medium text-gray-700">Email address</label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={status.loading}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {status.loading ? 'Sending Request...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="text-center">
          <Link to="/login" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-blue-600">
            <ArrowLeft className="w-4 h-4" /> Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;