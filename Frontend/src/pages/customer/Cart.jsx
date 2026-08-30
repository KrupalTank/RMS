// src/pages/customer/Cart.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { formatLocalDate } from '../../utils/dateHelper';
import { parseProductImages } from '../../utils/imageHelper';
import { useAuth } from '../../context/AuthContext';
import {
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  ShoppingBag,
  RefreshCw,
  AlertCircle,
  Award,
  Tag,
  CheckCircle2,
} from 'lucide-react';

const Cart = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cartData, setCartData] = useState({ items: [], summary: {} });
  const [couponsData, setCouponsData] = useState({
    coupons: [],
    consecutive_good_returns: 0,
    late_returns_count: 0,
    milestone_target: 8,
    contact_support_email: 'support@rms.com',
  });

  // Map of { [productId]: couponId }
  const [appliedCoupons, setAppliedCoupons] = useState({});

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');

  const fetchCartAndCoupons = async () => {
    try {
      const [cartRes, couponsRes] = await Promise.all([
        api.get('/user/getCart'),
        api.get('/user/myCoupons'),
      ]);

      if (cartRes.data.success) {
        setCartData({
          items: cartRes.data.items || [],
          summary: cartRes.data.summary || {},
        });
      }

      if (couponsRes.data.success) {
        setCouponsData({
          coupons: couponsRes.data.coupons || [],
          consecutive_good_returns: couponsRes.data.consecutive_good_returns || 0,
          late_returns_count: couponsRes.data.late_returns_count || 0,
          milestone_target: couponsRes.data.milestone_target || 8,
          contact_support_email: couponsRes.data.contact_support_email || 'support@rms.com',
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch cart data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCartAndCoupons();
  }, []);

  const handleUpdateItem = async (productId, newQuantity, newStartDate, newEndDate) => {
    if (!newStartDate || !newEndDate) return;
    if (new Date(newEndDate) < new Date(newStartDate)) {
      setError('End date cannot be earlier than start date.');
      return;
    }

    setUpdatingId(productId);
    setError('');

    try {
      await api.post('/user/addToCart', {
        product_id: productId,
        quantity: parseInt(newQuantity, 10),
        start_date: newStartDate,
        end_date: newEndDate,
      });

      await fetchCartAndCoupons();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update cart configuration.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveItem = async (cartId, productId) => {
    try {
      await api.delete(`/user/removeItemFromCart/${cartId}`);
      setAppliedCoupons((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      await fetchCartAndCoupons();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove item.');
    }
  };

  const handleToggleCoupon = (productId, couponId) => {
    setAppliedCoupons((prev) => {
      const next = { ...prev };
      if (next[productId] === couponId) {
        delete next[productId];
      } else {
        next[productId] = couponId;
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  const { items } = cartData;
  const { coupons, consecutive_good_returns, milestone_target, late_returns_count } = couponsData;
  const todayStr = formatLocalDate(new Date());

  let calculatedGrossRent = 0;
  let calculatedDiscount = 0;
  let calculatedDeposit = 0;

  items.forEach((item) => {
    const itemRent = parseFloat(item.quotation?.grossRent || item.quotation?.totalRent || 0);
    const itemDeposit = parseFloat(item.quotation?.totalDeposit || 0);
    calculatedGrossRent += itemRent;
    calculatedDeposit += itemDeposit;

    const assignedCouponId = appliedCoupons[item.product_id];
    if (assignedCouponId) {
      const activeCoupon = coupons.find((c) => c.id === assignedCouponId);
      const discountRate = parseFloat(activeCoupon?.discount_percent || 10) / 100;
      calculatedDiscount += itemRent * discountRate;
    }
  });

  const calculatedGrandTotal = calculatedGrossRent - calculatedDiscount + calculatedDeposit;
  const progressPercent = Math.min(100, Math.round((consecutive_good_returns / milestone_target) * 100));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-blue-600" />
          <span>Your Rental Cart</span>
        </h1>
        <span className="text-xs font-semibold px-3 py-1 bg-gray-100 rounded-full text-gray-600">
          {items.length} Item{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loyalty Milestone Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 text-white rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Award className="w-6 h-6 text-amber-400 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-sm">Loyalty Rental Privilege Program</h3>
              <p className="text-xs text-blue-200">
                Complete {milestone_target} on-time, undamaged returns to earn an exclusive 10% Discount Card.
              </p>
            </div>
          </div>
          <div className="text-right">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                late_returns_count > 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                  : 'bg-white/10 text-white border-white/20'
              }`}
            >
              {consecutive_good_returns} / {milestone_target} Completed
              {late_returns_count > 0 && ' (Paused)'}
            </span>
          </div>
        </div>

        {/* Branch: If user has active late returns (> 0), show the Amnesty / Paused Notice */}
        {late_returns_count > 0 ? (
          <div className="bg-amber-950/50 border border-amber-400/40 rounded-lg p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Loyalty Streak Accrual Paused</span>
            </div>
            <p className="text-blue-100 text-[11px] leading-relaxed">
              Your streak is paused at <b>{consecutive_good_returns} / {milestone_target} returns</b> due to{' '}
              <b>{late_returns_count} overdue return record(s)</b>. New milestone progress will resume once reviewed by administration.
            </p>
            <p className="text-blue-100 text-[11px] leading-relaxed">
              You can still apply your previously earned coupon vouchers to the cart below. To request a 1-time loyalty amnesty review, reach out to RMS Support at:{' '}
              <a
                href={`mailto:${couponsData.contact_support_email}`}
                className="text-amber-300 font-bold underline hover:text-amber-200"
              >
                {couponsData.contact_support_email}
              </a>
            </p>
          </div>
        ) : (
          /* Regular Progress Bar */
          <div className="w-full bg-blue-950/60 rounded-full h-2.5 overflow-hidden border border-white/10">
            <div
              className="bg-gradient-to-r from-amber-400 to-emerald-400 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Active Available Coupons Pool (Always Usable) */}
        {coupons.length > 0 && (
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-amber-300 font-medium">
              <Tag className="w-3.5 h-3.5" />
              You have <b>{coupons.length} available 10% Loyalty Coupon{coupons.length > 1 ? 's' : ''}</b>!
            </span>
            <span className="text-[11px] text-blue-200">
              Apply up to 1 coupon per item to maximize savings.
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200 space-y-3">
          <ShoppingBag className="w-12 h-12 text-gray-400 mx-auto" />
          <h3 className="text-base font-bold text-gray-800">Your cart is empty</h3>
          <p className="text-xs text-gray-500">Explore our catalog and rent products easily.</p>
          <Link
            to="/"
            className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Items List (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {items.map((item) => {
              const formattedStart = formatLocalDate(item.start_date);
              const formattedEnd = formatLocalDate(item.end_date);
              const images = parseProductImages(item.images);
              const primaryImg = images[0] || 'https://placehold.co/400x300?text=No+Image';

              const itemGrossRent = parseFloat(item.quotation?.grossRent || item.quotation?.totalRent || 0);
              const assignedCouponId = appliedCoupons[item.product_id];
              const itemDiscount = assignedCouponId ? itemGrossRent * 0.1 : 0;

              return (
                <div
                  key={item.cart_id}
                  className={`bg-white p-4 sm:p-5 rounded-xl border transition ${
                    assignedCouponId
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                      : 'border-gray-200'
                  } space-y-4`}
                >
                  <div className="flex flex-col sm:flex-row gap-4 justify-between">
                    <div className="flex gap-4 sm:w-1/3">
                      <img
                        src={primaryImg}
                        alt={item.title}
                        className="w-20 h-20 object-cover rounded-lg bg-gray-100 flex-shrink-0"
                      />
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 line-clamp-1">{item.title}</h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">Vendor: {item.vendor.name}</p>
                        <p className="text-[11px] text-gray-500">📍 {item.vendor.city}</p>
                      </div>
                    </div>

                    {/* Date & Quantity Controls */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:w-1/3 text-xs">
                      <div>
                        <label className="block text-[11px] text-gray-500 font-medium">Start Date</label>
                        <input
                          type="date"
                          min={todayStr}
                          value={formattedStart}
                          onChange={(e) =>
                            handleUpdateItem(item.product_id, item.quantity, e.target.value, formattedEnd)
                          }
                          className="w-full text-[11px] p-1.5 border border-gray-300 rounded focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 font-medium">End Date</label>
                        <input
                          type="date"
                          min={formattedStart || todayStr}
                          value={formattedEnd}
                          onChange={(e) =>
                            handleUpdateItem(item.product_id, item.quantity, formattedStart, e.target.value)
                          }
                          className="w-full text-[11px] p-1.5 border border-gray-300 rounded focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[11px] text-gray-500 font-medium">Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.product_id,
                              e.target.value,
                              formattedStart,
                              formattedEnd
                            )
                          }
                          className="w-full text-[11px] p-1.5 border border-gray-300 rounded text-center font-bold"
                        />
                      </div>
                    </div>

                    {/* Quotation & Remove */}
                    <div className="flex sm:flex-col justify-between items-end sm:w-1/4 text-xs">
                      <div className="text-right">
                        {assignedCouponId ? (
                          <>
                            <span className="block text-[11px] text-gray-400 line-through">
                              ₹{itemGrossRent.toFixed(2)}
                            </span>
                            <span className="block font-bold text-emerald-600">
                              Rent: ₹{(itemGrossRent - itemDiscount).toFixed(2)} (-10%)
                            </span>
                          </>
                        ) : (
                          <span className="block font-bold text-gray-900">
                            Rent: ₹{itemGrossRent.toFixed(2)}
                          </span>
                        )}
                        <span className="block text-gray-500 text-[11px]">
                          Deposit: ₹{parseFloat(item.quotation?.totalDeposit || 0).toFixed(2)}
                        </span>
                      </div>

                      <button
                        onClick={() => handleRemoveItem(item.cart_id, item.product_id)}
                        className="text-red-500 hover:text-red-700 p-1 rounded transition"
                        title="Remove from cart"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Multi-Coupon Buttons */}
                  {coupons.length > 0 && (
                    <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-semibold text-gray-700">Apply Loyalty Privilege Voucher:</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {coupons.map((c) => {
                          const isSelectedHere = assignedCouponId === c.id;
                          const isUsedElsewhere = Object.entries(appliedCoupons).some(
                            ([prodId, coupId]) => parseInt(prodId, 10) !== item.product_id && coupId === c.id
                          );

                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleToggleCoupon(item.product_id, c.id)}
                              disabled={isUsedElsewhere}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                                isSelectedHere
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : isUsedElsewhere
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200 opacity-60'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              {isSelectedHere && <CheckCircle2 className="w-3 h-3" />}
                              <span>{c.code} (10% OFF)</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Checkout Breakdown (4 cols) */}
          <div className="lg:col-span-4">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <h2 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-3">
                Order Summary
              </h2>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Gross Rental Charges:</span>
                  <span className="font-bold text-gray-900">
                    ₹{calculatedGrossRent.toFixed(2)}
                  </span>
                </div>

                {calculatedDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Loyalty Voucher Savings:</span>
                    <span>-₹{calculatedDiscount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-1">
                    {user?.kyc_status === 'verified' ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    Total Escrow Deposit:
                  </span>
                  <span className="font-bold text-gray-900">
                    ₹{calculatedDeposit.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
                <span className="font-extrabold text-gray-900 text-sm">Payable Total:</span>
                <span className="text-lg font-black text-blue-600">
                  ₹{calculatedGrandTotal.toFixed(2)}
                </span>
              </div>

              <button
                onClick={() =>
                  navigate('/customer/checkout', {
                    state: {
                      applied_coupons: appliedCoupons,
                    },
                  })
                }
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cart;