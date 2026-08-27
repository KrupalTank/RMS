import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import api from '../../api/axiosInstance';
import {
  ShieldCheck,
  Clock,
  User,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  AlertCircle,
  X,
} from 'lucide-react';

const KycDashboard = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState({ success: '', error: '' });

  // Inspection Modal State
  const [activeRequest, setActiveRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // 1. Fetch Pending KYC Requests
  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/kyc/pendingRequests');
      if (res.data.success) {
        setRequests(res.data.pendingRequests);
      }
    } catch (err) {
      setBanner({
        success: '',
        error: err.response?.data?.message || 'Failed to fetch pending KYC requests.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    // Live Socket listener for incoming KYC applications
    const socket = io('http://localhost:5000', { withCredentials: true });
    socket.on('KYC_SUBMITTED', () => {
      fetchRequests();
    });

    return () => socket.disconnect();
  }, []);

  // 2. Submit Officer Decision (Verified vs Rejected)
  const handleReviewDecision = async (decision) => {
    if (decision === 'rejected' && !rejectionReason.trim()) {
      alert('Please provide a specific rejection reason for the applicant.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/kyc/review', {
        requestId: activeRequest.request_id,
        decision,
        rejection_reason: decision === 'rejected' ? rejectionReason.trim() : null,
      });

      if (res.data.success) {
        setBanner({ success: `Application marked as ${decision.toUpperCase()}.`, error: '' });
        setActiveRequest(null);
        setRejectionReason('');
        fetchRequests();
      }
    } catch (err) {
      setBanner({
        success: '',
        error: err.response?.data?.message || 'Failed to process decision.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-600" />
            <span>KYC Compliance & Verification Portal</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Review customer biometric selfies against decrypted government identification documents.
          </p>
        </div>
        <button
          onClick={fetchRequests}
          className="p-2 text-gray-500 hover:text-purple-600 hover:bg-gray-100 rounded-lg transition"
          title="Refresh Queue"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {banner.success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{banner.success}</span>
        </div>
      )}

      {banner.error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{banner.error}</span>
        </div>
      )}

      {/* Requests Queue */}
      {requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200 space-y-2">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h3 className="text-sm font-bold text-gray-800">All caught up!</h3>
          <p className="text-xs text-gray-500">There are no pending KYC requests awaiting review.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requests.map((req) => (
            <div
              key={req.request_id}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="font-bold text-gray-500">Application #{req.request_id}</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(req.submitted_at).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-bold text-gray-900 text-sm">{req.full_name}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <span>{req.email}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <span>{req.phone}</span>
                </div>
              </div>

              <button
                onClick={() => setActiveRequest(req)}
                className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Eye className="w-4 h-4" /> Inspect Documents
              </button>
            </div>
          ))}
        </div>
      )}

      {/* INSPECTION & DECISION MODAL */}
      {activeRequest && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-4xl w-full rounded-xl shadow-xl border border-gray-200 p-6 space-y-6 my-8">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Inspecting Application #{activeRequest.request_id}: {activeRequest.full_name}
                </h3>
                <p className="text-xs text-gray-500">
                  Decrypted document streams (Decrypted AES-256 in server memory)
                </p>
              </div>
              <button
                onClick={() => setActiveRequest(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Comparison Stream */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2">
                <span className="block text-xs font-bold text-gray-700">Aadhaar Card Document</span>
                <div className="h-64 bg-black rounded-lg overflow-hidden flex items-center justify-center">
                  <img
                    src={`http://localhost:5000/api/v1/rms/kyc/document/aadhaar/${activeRequest.request_id}`}
                    alt="Decrypted Aadhaar"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2">
                <span className="block text-xs font-bold text-gray-700">Live Selfie Capture</span>
                <div className="h-64 bg-black rounded-lg overflow-hidden flex items-center justify-center">
                  <img
                    src={`http://localhost:5000/api/v1/rms/kyc/document/live_photo/${activeRequest.request_id}`}
                    alt="Decrypted Selfie"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>

            {/* Rejection Note Field */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Rejection Note (Mandatory if rejecting):
              </label>
              <input
                type="text"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Document image is blurry or selfie face does not match ID."
                className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-purple-500"
              />
            </div>

            {/* Decision Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => handleReviewDecision('rejected')}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" /> Reject Application
              </button>

              <button
                type="button"
                onClick={() => handleReviewDecision('verified')}
                disabled={actionLoading}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> Approve & Verify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KycDashboard;