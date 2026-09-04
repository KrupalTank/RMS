// src/pages/customer/CustomerOrders.jsx
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import ChatModal from '../../components/ChatModal';

import {
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Star,
  MapPin,
  Phone,
  RefreshCw,
  AlertCircle,
  X,
  Tag,
  MessageSquare,
  KeyRound,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';

const CustomerOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [visibleOtps, setVisibleOtps] = useState({});

  // Review Modal State
  const [activeReviewOrder, setActiveReviewOrder] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState({ success: '', error: '' });

  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeConversation, setActiveConversation] = useState(null);
  const socketRef = useRef(null);

  const handleCustomerCancelOrder = async () => {
    if (!cancellingOrder) return;
    setCancelSubmitting(true);
    setError('');

    try {
      const res = await api.post('/user/cancelOrder', { order_id: cancellingOrder.id });
      if (res.data.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === cancellingOrder.id ? { ...o, status: 'Cancelled', cancelled_by: 'customer' } : o
          )
        );
        setCancellingOrder(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel order.');
      setCancellingOrder(null);
    } finally {
      setCancelSubmitting(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await api.get('/user/getOrders');
      if (res.data.success) {
        setOrders(res.data.orders);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch your orders.');
    } finally {
      setLoading(false);
    }
  };

  // MERGED SINGLE SOCKET EFFECT in CustomerOrders.jsx
  useEffect(() => {
    fetchOrders();

    const socket = io('http://localhost:5000', { withCredentials: true });
    socketRef.current = socket;

    if (user?.id) {
      socket.emit('join_user_room', user.id);
    }

    socket.on('ORDER_STATUS_CHANGED', (data) => {
      // Check if this update belongs to current logged-in customer
      if (!data.customerId || Number(data.customerId) === Number(user?.id)) {
        setOrders((prevOrders) =>
          prevOrders.map((o) =>
            Number(o.id) === Number(data.orderId) ? { ...o, status: data.newStatus } : o
          )
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id]);

  const handleOpenOrderChat = async (order) => {
    try {
      const res = await api.post('/chat/getOrCreateConversation', {
        vendor_id: order.vendor_id,
        product_id: order.product_id,
        order_id: order.id,
      });
      if (res.data.success) {
        setActiveConversation(res.data.conversation);
        setIsChatOpen(true);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to open order chat.');
    }
  };

  const handleConfirmHandover = async (orderId) => {
    const numericId = parseInt(orderId, 10);
    setActionLoadingId(numericId);
    setError('');

    try {
      const res = await api.post('/user/changeOrderStatus', { order_id: numericId });
      if (res.data.success) {
        // Instantly switch to 'With Customer' on customer side without waiting or refreshing
        setOrders((prev) =>
          prev.map((o) => (Number(o.id) === numericId ? { ...o, status: 'With Customer' } : o))
        );
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to confirm product receipt.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePostReview = async (e) => {
    e.preventDefault();
    setReviewSubmitting(true);
    setReviewMessage({ success: '', error: '' });

    try {
      const res = await api.post(`/user/review/${activeReviewOrder.id}`, {
        rating,
        comment,
      });

      if (res.data.success) {
        setReviewMessage({ success: 'Thank you! Your review has been recorded.', error: '' });
        setOrders((prev) =>
          prev.map((o) =>
            o.id === activeReviewOrder.id
              ? { ...o, review_id: res.data.review.id, review_rating: rating }
              : o
          )
        );
        setTimeout(() => {
          setActiveReviewOrder(null);
          setComment('');
          setReviewMessage({ success: '', error: '' });
        }, 1800);
      }
    } catch (err) {
      setReviewMessage({
        success: '',
        error: err.response?.data?.message || 'Failed to submit review.',
      });
    } finally {
      setReviewSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Lock':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Ready for Handover
          </span>
        );
      case 'With Customer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <Package className="w-3.5 h-3.5" /> Active Rental
          </span>
        );
      case 'Returned':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed & Returned
          </span>
        );
      case 'Lost':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-800 border border-red-200">
            <AlertTriangle className="w-3.5 h-3.5" /> Marked Lost
          </span>
        );
      case 'Cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-300">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-50 text-gray-800 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            <span>My Bookings & Rental History</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Track equipment handovers, return timelines, and leave reviews for completed rentals.
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition"
          title="Refresh orders"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gray-800">No rental orders found</h3>
          <p className="text-xs text-gray-500 mt-1">Your confirmed bookings will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const images = Array.isArray(order.product_images)
              ? order.product_images
              : typeof order.product_images === 'string'
              ? JSON.parse(order.product_images || '[]')
              : [];
            const primaryImg = images[0] || 'https://placehold.co/300x200?text=No+Image';
            const discountApplied = parseFloat(order.discount_amount_snapshot || 0);

            return (
              <div
                key={order.id}
                className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4"
              >
                {/* Top Row: Order Header & Status */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-500">
                      Order #{order.id} (Group #{order.group_id})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            const response = await api.get(`/user/downloadAgreement/${order.group_id}`, {
                              responseType: 'blob',
                            });
                            const url = window.URL.createObjectURL(new Blob([response.data]));
                            const link = document.createElement('a');
                            link.href = url;
                            link.setAttribute('download', `Rental_Agreement_Group_${order.group_id}.pdf`);
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                          } catch (err) {
                            alert('Failed to download agreement.');
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 transition"
                        title="Download Official Rental Agreement PDF"
                      >
                        📄 Rental Agreement
                      </button>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      Booked on: {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    {discountApplied > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        <Tag className="w-3 h-3" /> 10% Loyalty Discount Applied (-₹{discountApplied.toFixed(2)})
                      </span>
                    )}
                  </div>
                  {getStatusBadge(order.status)}
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  {/* Product & Image (5 cols) */}
                  <div className="md:col-span-5 flex gap-4 items-center">
                    <img
                      src={primaryImg}
                      alt={order.product_title}
                      className="w-20 h-20 object-cover rounded-lg bg-gray-100 flex-shrink-0"
                    />
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{order.product_title}</h3>
                      <p className="text-xs text-gray-500">Quantity: <b>{order.quantity} unit(s)</b></p>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        <span>Vendor: {order.vendor_name} ({order.vendor_city})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>Contact: {order.vendor_phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Dates & Rates Snapshots (4 cols) */}
                  <div className="md:col-span-4 space-y-1 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="flex justify-between">
                      <span>Rental Duration:</span>
                      <span className="font-semibold text-gray-900">
                        {order.start_date.split('T')[0]} → {order.end_date.split('T')[0]}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rent Snapshot:</span>
                      <span className="font-semibold text-gray-900">
                        ₹{parseFloat(order.rent_per_day_snapshot).toFixed(2)}/day
                      </span>
                    </div>
                    {discountApplied > 0 && (
                      <div className="flex justify-between text-emerald-600 font-semibold">
                        <span>Discounted Rent Paid:</span>
                        <span>₹{parseFloat(order.customer_paid_rent_snapshot || 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Security Escrow:</span>
                      <span className="font-semibold text-gray-900">
                        ₹{(parseFloat(order.deposit_per_item_snapshot) * order.quantity).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>Late Return Grace:</span>
                      <span>{order.max_late_days} days allowed</span>
                    </div>
                  </div>

                  {/* Action Column (3 cols) */}
                  <div className="md:col-span-3 flex flex-col items-stretch justify-center gap-2">
                    {/* Real-Time Chat Button */}
                    <button
                      onClick={() => handleOpenOrderChat(order)}
                      className="w-full py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 transition flex items-center justify-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat Vendor</span>
                    </button>

                    {/* Handover Security PIN Card for Locked Orders */}
                    {order.status === 'Lock' && (
                      <div className="w-full bg-amber-50/80 border border-amber-300 rounded-xl p-3 space-y-2 text-center">
                        <div className="flex items-center justify-between text-amber-900 text-[11px] font-bold">
                          <span className="flex items-center gap-1">
                            <KeyRound className="w-3.5 h-3.5 text-amber-600" /> Handover PIN
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleOtps((prev) => ({ ...prev, [order.id]: !prev[order.id] }))
                            }
                            className="text-amber-700 hover:text-amber-900 text-[10px] underline"
                          >
                            {visibleOtps[order.id] ? 'Hide' : 'Reveal'}
                          </button>
                        </div>

                        <div className="bg-white border border-amber-200 py-1.5 px-3 rounded-lg flex items-center justify-center gap-2">
                          <span className="font-mono text-base font-black tracking-widest text-gray-900">
                            {visibleOtps[order.id] ? order.handover_otp : '••••••'}
                          </span>
                          {visibleOtps[order.id] && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(order.handover_otp);
                                alert('Handover PIN copied to clipboard!');
                              }}
                              className="text-gray-400 hover:text-gray-600"
                              title="Copy PIN"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-amber-700 leading-tight">
                          Provide this PIN to the vendor upon inspecting and receiving the gear.
                        </p>

                        <button
                          onClick={() => setCancellingOrder(order)}
                          className="w-full py-1 px-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-[11px] font-semibold transition text-center"
                        >
                          Cancel Booking
                        </button>
                      </div>
                    )}

                    {['With Customer', 'Returned'].includes(order.status) && (
                      <button
                        onClick={() => {
                          setActiveReviewOrder(order);
                          setRating(order.review_rating || 5);
                        }}
                        className="w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span>{order.review_id ? 'Update Review' : 'Write a Review'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal Dialog */}
      {activeReviewOrder && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-xl shadow-xl border border-gray-200 p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                Rate & Review: {activeReviewOrder.product_title}
              </h3>
              <button
                onClick={() => setActiveReviewOrder(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reviewMessage.success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{reviewMessage.success}</span>
              </div>
            )}

            {reviewMessage.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{reviewMessage.error}</span>
              </div>
            )}

            <form onSubmit={handlePostReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Rating</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 hover:scale-110 transition"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= rating
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Your Review / Experience
                </label>
                <textarea
                  required
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="How was the product condition, performance, and vendor experience?"
                  className="w-full text-xs p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveReviewOrder(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition"
                >
                  {reviewSubmitting ? 'Posting Review...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Order Cancellation Modal */}
      {cancellingOrder && (() => {
        const totalDays = Math.ceil(
          Math.abs(new Date(cancellingOrder.end_date) - new Date(cancellingOrder.start_date)) / (1000 * 60 * 60 * 24)
        ) + 1;
        const actualPaidRent = parseFloat(cancellingOrder.customer_paid_rent_snapshot) || 
          (parseFloat(cancellingOrder.rent_per_day_snapshot) * cancellingOrder.quantity * totalDays);
        const totalDeposit = parseFloat(cancellingOrder.deposit_per_item_snapshot) * cancellingOrder.quantity;
        const feePerUnit = parseFloat(cancellingOrder.cancellation_fee_snapshot || 0);
        const totalCancellationFee = Math.min(feePerUnit * cancellingOrder.quantity, totalDeposit);
        const estimatedRefund = actualPaidRent + (totalDeposit - totalCancellationFee);

        return (
          <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-xl shadow-xl border border-gray-200 p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <h3 className="text-base font-bold text-gray-900">Cancel Booking #{cancellingOrder.id}</h3>
                <button onClick={() => setCancellingOrder(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-gray-600">
                Are you sure you want to cancel your reservation for <b>{cancellingOrder.product_title}</b>?
              </p>

              {/* Breakdown Box */}
              <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 text-xs space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Paid Rental Cost (100% Refundable):</span>
                  <span className="font-bold text-gray-900">₹{actualPaidRent.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Escrow Deposit:</span>
                  <span className="font-bold text-gray-900">₹{totalDeposit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Vendor Cancellation Fee ({cancellingOrder.quantity} item × ₹{feePerUnit}):</span>
                  <span className="font-bold">-₹{totalCancellationFee.toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-sm">
                  <span className="font-extrabold text-gray-900">Total Refund to You:</span>
                  <span className="font-extrabold text-emerald-600">₹{estimatedRefund.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingOrder(null)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Keep Booking
                </button>
                <button
                  type="submit"
                  onClick={handleCustomerCancelOrder}
                  disabled={cancelSubmitting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition"
                >
                  {cancelSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <ChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        conversation={activeConversation}
        socket={socketRef.current}
      />
    </div>
  );
};

export default CustomerOrders;