import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import { loadRazorpayScript } from '../../utils/loadRazorpay';
import {
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ShoppingBag,
  RefreshCw,
} from 'lucide-react';

const Checkout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cartData, setCartData] = useState({ items: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    const fetchCart = async () => {
      try {
        const res = await api.get('/user/getCart');
        if (res.data.success) {
          setCartData({
            items: res.data.items || [],
            summary: res.data.summary || {},
          });
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch cart.');
      } finally {
        setLoading(false);
      }
    };
    fetchCart();
  }, []);

  const handleRazorpayPayment = async () => {
    setError('');
    setPaymentLoading(true);

    try {
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        throw new Error('Razorpay SDK failed to load. Please check your connection.');
      }

      const checkoutRes = await api.post('/payment/createCheckoutOrder');
      if (!checkoutRes.data.success) {
        throw new Error(checkoutRes.data.message || 'Failed to initialize checkout.');
      }

      const { key_id, razorpay_order_id, amount, currency, group_id } = checkoutRes.data;

      const options = {
        key: key_id || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: amount,
        currency: currency || 'INR',
        name: 'RMS Rental Platform',
        description: `Rental Booking Group #${group_id}`,
        order_id: razorpay_order_id,
        prefill: {
          name: user?.full_name || '',
          email: user?.email || '',
          contact: user?.phone || '9999999999',
        },
        theme: {
          color: '#2563EB',
        },
        handler: async function (response) {
          try {
            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              group_id: group_id,
            };

            const verifyRes = await api.post('/payment/verifyPayment', verifyPayload);

            if (verifyRes.data.success) {
              setPaymentSuccess(true);
              setTimeout(() => {
                navigate('/customer/orders');
              }, 2000);
            }
          } catch (verifyErr) {
            setError(verifyErr.response?.data?.message || 'Payment verification failed.');
          } finally {
            setPaymentLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            setPaymentLoading(false);
          },
        },
      };

      const razorpayInstance = new window.Razorpay(options);

      razorpayInstance.on('payment.failed', function (response) {
        setError(`Payment Failed: ${response.error.description || 'Transaction declined.'}`);
        setPaymentLoading(false);
      });

      razorpayInstance.open();
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.message || err.message || 'Payment initiation failed.');
      setPaymentLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  const { items, summary } = cartData;

  if (items.length === 0 && !paymentSuccess) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center bg-white rounded-xl border border-gray-200 mt-8 space-y-4">
        <ShoppingBag className="w-12 h-12 text-gray-400 mx-auto" />
        <h2 className="text-xl font-bold text-gray-800">Your Cart is Empty</h2>
        <p className="text-sm text-gray-500">Please add items to your cart before proceeding to checkout.</p>
        <Link
          to="/"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
        >
          Explore Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back button */}
      <button
        onClick={() => navigate('/customer/cart')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-blue-600"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Cart
      </button>

      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-blue-600" />
          <span>Checkout & Secure Payment</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">Review rental configuration and complete payment via Razorpay.</p>
      </div>

      {paymentSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800">
          <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm">Payment Verified Successfully!</h4>
            <p className="text-xs">Your booking is locked. Redirecting to your orders...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Order Items Breakdown (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Items in this Booking</h3>
          {items.map((item) => {
            const images = Array.isArray(item.images)
              ? item.images
              : typeof item.images === 'string'
              ? JSON.parse(item.images || '[]')
              : [];
            const primaryImg = images[0] || 'https://placehold.co/400x300?text=No+Image';

            return (
              <div
                key={item.cart_id}
                className="bg-white p-4 rounded-xl border border-gray-200 flex gap-4 items-center justify-between"
              >
                <div className="flex gap-3 items-center">
                  <img
                    src={primaryImg}
                    alt={item.title}
                    className="w-16 h-16 object-cover rounded-lg bg-gray-100 flex-shrink-0"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 line-clamp-1">{item.title}</h4>
                    <p className="text-[11px] text-gray-500">
                      Duration: {item.start_date.split('T')[0]} to {item.end_date.split('T')[0]}
                    </p>
                    <p className="text-[11px] text-gray-500">Quantity: <b>{item.quantity} unit(s)</b></p>
                  </div>
                </div>

                <div className="text-right text-xs">
                  <span className="block font-bold text-gray-900">Rent: ₹{item.quotation.totalRent.toFixed(2)}</span>
                  <span className="block text-gray-500 text-[11px]">Deposit: ₹{item.quotation.totalDeposit.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Escrow Breakdown & Pay Button (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-3">
              Payment Breakdown
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Total Rental Charges:</span>
                <span className="font-bold text-gray-900">₹{summary.totalRent?.toFixed(2) || '0.00'}</span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span className="flex items-center gap-1">
                  {user?.kyc_status === 'verified' ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  Refundable Security Escrow:
                </span>
                <span className="font-bold text-gray-900">₹{summary.totalDeposit?.toFixed(2) || '0.00'}</span>
              </div>

              <div className="pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
                <span className="font-extrabold text-gray-900">Total Payable Amount:</span>
                <span className="text-xl font-black text-blue-600">
                  ₹{summary.grandTotal?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-[11px] text-blue-800 space-y-1">
              <p className="font-semibold">🔒 Escrow Protection Policy:</p>
              <p>
                Your security deposit is safely held in escrow and will be automatically refunded upon completing the rental in good condition.
              </p>
            </div>

            <button
              onClick={handleRazorpayPayment}
              disabled={paymentLoading || paymentSuccess}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-md transition disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              <span>{paymentLoading ? 'Processing Checkout...' : `Pay ₹${summary.grandTotal?.toFixed(2) || '0.00'} via Razorpay`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;