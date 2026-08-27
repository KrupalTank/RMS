import React, { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  ShieldAlert,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  RotateCcw,
} from 'lucide-react';

const CustomerKyc = () => {
  const { user, updateUserKyc } = useAuth();
  const webcamRef = useRef(null);

  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [aadhaarPreview, setAadhaarPreview] = useState(null);

  const [capturedPhotoBlob, setCapturedPhotoBlob] = useState(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState(null);

  const [isCameraActive, setIsCameraActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ success: '', error: '' });

  // 1. Handle Aadhaar Card File Select
  const handleAadhaarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAadhaarFile(file);
      setAadhaarPreview(URL.createObjectURL(file));
    }
  };

  // 2. Capture Live Photo from Webcam
  const handleCapturePhoto = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedPhotoUrl(imageSrc);
      setIsCameraActive(false);

      // Convert Base64 dataURL to Blob for FormData upload
      fetch(imageSrc)
        .then((res) => res.blob())
        .then((blob) => {
          setCapturedPhotoBlob(new File([blob], `live_photo_${Date.now()}.jpg`, { type: 'image/jpeg' }));
        });
    }
  }, [webcamRef]);

  const handleRetakePhoto = () => {
    setCapturedPhotoUrl(null);
    setCapturedPhotoBlob(null);
    setIsCameraActive(true);
  };

  // 3. Submit Multi-part Encrypted KYC
  const handleSubmitKyc = async (e) => {
    e.preventDefault();
    setMessage({ success: '', error: '' });

    if (!aadhaarFile) {
      setMessage({ success: '', error: 'Please upload your Aadhaar card document image.' });
      return;
    }

    if (!capturedPhotoBlob) {
      setMessage({ success: '', error: 'Please take a live selfie photo via camera.' });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('aadhaar_card', aadhaarFile);
      formData.append('live_photo', capturedPhotoBlob);

      const res = await api.post('/user/authenticateMe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        setMessage({
          success: 'KYC documents encrypted and submitted successfully! Your account status is now pending review.',
          error: '',
        });
        updateUserKyc('pending');
      }
    } catch (err) {
      setMessage({
        success: '',
        error: err.response?.data?.message || 'Failed to submit KYC verification.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // If already verified or pending
  if (user?.kyc_status === 'verified') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white p-8 rounded-xl border border-emerald-200 shadow-sm text-center space-y-3">
          <ShieldCheck className="w-16 h-16 text-emerald-600 mx-auto" />
          <h2 className="text-2xl font-black text-gray-900">Identity Verified</h2>
          <p className="text-sm text-gray-600">
            Your government ID and biometric photo have been approved. You have full access to low escrow deposits.
          </p>
        </div>
      </div>
    );
  }

  if (user?.kyc_status === 'pending') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white p-8 rounded-xl border border-amber-200 shadow-sm text-center space-y-3">
          <Clock className="w-16 h-16 text-amber-500 mx-auto" />
          <h2 className="text-2xl font-black text-gray-900">Verification Under Review</h2>
          <p className="text-sm text-gray-600">
            Your KYC application is currently being inspected by our compliance team. You will receive an email confirmation once verified.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-blue-600" />
          <span>Customer Identity Verification (KYC)</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Upload your Aadhaar ID and capture a live selfie. Documents are encrypted using AES-256 before storage.
        </p>
      </div>

      {message.success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{message.success}</span>
        </div>
      )}

      {message.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{message.error}</span>
        </div>
      )}

      <form onSubmit={handleSubmitKyc} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1. Aadhaar Card Upload */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Upload className="w-4 h-4 text-blue-600" />
              <span>Step 1: Aadhaar Document</span>
            </div>

            <div className="h-56 w-full border-2 border-dashed border-gray-300 rounded-lg overflow-hidden flex flex-col items-center justify-center bg-gray-50 p-2 relative">
              {aadhaarPreview ? (
                <img src={aadhaarPreview} alt="Aadhaar Preview" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center p-4">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-500 font-medium">Select clear photo of Aadhaar Card</p>
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              required
              onChange={handleAadhaarChange}
              className="block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {/* 2. Live Webcam Selfie Capture */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Camera className="w-4 h-4 text-blue-600" />
              <span>Step 2: Live Selfie Photo</span>
            </div>

            <div className="h-56 w-full bg-black rounded-lg overflow-hidden flex items-center justify-center relative">
              {isCameraActive ? (
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user' }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <img src={capturedPhotoUrl} alt="Captured Selfie" className="w-full h-full object-cover" />
              )}
            </div>

            {isCameraActive ? (
              <button
                type="button"
                onClick={handleCapturePhoto}
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <Camera className="w-4 h-4" /> Capture Live Photo
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRetakePhoto}
                className="w-full py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> Retake Photo
              </button>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> Encrypting & Submitting...
            </>
          ) : (
            'Submit KYC for Verification'
          )}
        </button>
      </form>
    </div>
  );
};

export default CustomerKyc;