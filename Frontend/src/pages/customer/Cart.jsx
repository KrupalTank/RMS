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
  Tag,
  CheckCircle2,
  Plus,
  Sparkles,
  Store,
} from 'lucide-react';

const Cart = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cartData, setCartData] = useState({ items: [], summary: {}, storeVendor: null });
  const [storeCoupons, setStoreCoupons] = useState([]);

  // Frequently Rented Together recommendations
  const [frequentlyRented, setFrequentlyRented] = useState([]);
  const [addingRecId, setAddingRecId] = useState(null);

  // Map of { [productId]: couponId }
  const [appliedCoupons, setAppliedCoupons] = useState({});

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');

  // Vendor Conflict State (Modal prompt if adding gear from a second vendor)
  const [conflictModal, setConflictModal] = useState(null);

  const fetchCartAndCoupons = async () => {
    try {
      const cartRes = await api.get('/user/getCart');

      let currentItems = [];
      let vendor = null;

      if (cartRes.data.success) {
        currentItems = cartRes.data.items || [];
        vendor = cartRes.data.storeVendor || null;
        setCartData({
          items: currentItems,
          summary: cartRes.data.summary || {},
          storeVendor: vendor,
        });
      }

      // Fetch active promo coupons for this specific store
      if (vendor?.id) {
        try {
          const couponRes = await api.get(`/user/storeCoupons/${vendor.id}`);
          if (couponRes.data.success) {
            setStoreCoupons(couponRes.data.coupons || []);
          }
        } catch (cErr) {
          console.error('Failed to load store coupons:', cErr);
        }
      } else {
        setStoreCoupons([]);
      }

      // Fetch recommendations based on cart items
      if (currentItems.length > 0) {
        const productIds = currentItems.map((item) => item.product_id);
        const recRes = await api.post('/user/recommendations/frequentlyRentedTogether', {
          product_ids: productIds,
          limit: 4,
        });

        if (recRes.data.success) {
          const filtered = (recRes.data.products || []).filter(
            (rec) => !productIds.includes(rec.id)
          );
          setFrequentlyRented(filtered);
        }
      } else {
        setFrequentlyRented([]);
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
      if (err.response?.status === 409 && err.response?.data?.conflict) {
        setConflictModal({
          currentVendor: err.response.data.currentVendorName,
          newVendor: err.response.data.newVendorName,
          pendingItem: {
            product_id: productId,
            quantity: newQuantity,
            start_date: newStartDate,
            end_date: newEndDate,
          },
        });
      } else {
        setError(err.response?.data?.message || 'Failed to update cart configuration.');
      }
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

  const handleClearAndSwitchVendor = async () => {
    if (!conflictModal?.pendingItem) return;
    try {
      await api.delete('/user/clearCart');
      setAppliedCoupons({});
      await api.post('/user/addToCart', conflictModal.pendingItem);
      setConflictModal(null);
      await fetchCartAndCoupons();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to switch stores.');
      setConflictModal(null);
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

  const handleQuickAddRecommendation = async (recProduct) => {
    if (!cartData.items || cartData.items.length === 0) return;

    const baseItem = cartData.items[0];
    setAddingRecId(recProduct.id);
    setError('');

    try {
      await api.post('/user/addToCart', {
        product_id: recProduct.id,
        quantity: 1,
        start_date: baseItem.start_date,
        end_date: baseItem.end_date,
      });

      await fetchCartAndCoupons();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.conflict) {
        setConflictModal({
          currentVendor: err.response.data.currentVendorName,
          newVendor: err.response.data.newVendorName,
          pendingItem: {
            product_id: recProduct.id,
            quantity: 1,
            start_date: baseItem.start_date,
            end_date: baseItem.end_date,
          },
        });
      } else {
        setError(err.response?.data?.message || 'Failed to add recommended item to cart.');
      }
    } finally {
      setAddingRecId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  const { items, storeVendor } = cartData;
  const todayStr = formatLocalDate(new Date());

  // Dynamic live pricing & coupon calculation
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
      const activeCoupon = storeCoupons.find((c) => c.id === assignedCouponId);
      if (activeCoupon) {
        let discount = 0;
        if (activeCoupon.discount_type === 'FLAT') {
          discount = Math.min(parseFloat(activeCoupon.discount_value), itemRent);
        } else {
          const raw = (itemRent * parseFloat(activeCoupon.discount_value)) / 100;
          discount = activeCoupon.max_discount_amount
            ? Math.min(raw, parseFloat(activeCoupon.max_discount_amount))
            : raw;
        }
        calculatedDiscount += Math.min(discount, itemRent);
      }
    }
  });

  const calculatedGrandTotal = calculatedGrossRent - calculatedDiscount + calculatedDeposit;
  const isCheckoutBlocked = Boolean(
    storeVendor && (!storeVendor.hasGatewayConfigured || storeVendor.isRenewalDue)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-blue-600" />
            <span>Your Rental Cart</span>
          </h1>
          {storeVendor && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-blue-600" />
              Ordering directly from <b>{storeVendor.name}</b> ({storeVendor.city})
            </p>
          )}
        </div>
        <span className="text-xs font-semibold px-3 py-1 bg-gray-100 rounded-full text-gray-600">
          {items.length} Item{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Single-Vendor Cart Conflict Modal */}
      {conflictModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="font-bold text-base text-gray-900">Single Store Checkout Policy</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Your cart currently contains gear from <b>{conflictModal.currentVendor}</b>. Payments are made directly to the store owner's account, so orders cannot combine items from multiple shops.
            </p>
            <p className="text-xs font-semibold text-gray-700">
              Would you like to clear your cart and start a new rental with <b>{conflictModal.newVendor}</b>?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConflictModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Keep Current Cart
              </button>
              <button
                onClick={handleClearAndSwitchVendor}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
              >
                Clear & Switch Store
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div className="lg:col-span-8 space-y-6">
            <div className="space-y-4">
              {items.map((item) => {
                const formattedStart = formatLocalDate(item.start_date);
                const formattedEnd = formatLocalDate(item.end_date);
                const images = parseProductImages(item.images);
                const primaryImg = images[0] || 'https://placehold.co/400x300?text=No+Image';

                const itemGrossRent = parseFloat(item.quotation?.grossRent || item.quotation?.totalRent || 0);
                const assignedCouponId = appliedCoupons[item.product_id];
                const activeCoupon = storeCoupons.find((c) => c.id === assignedCouponId);

                let itemDiscount = 0;
                if (activeCoupon) {
                  if (activeCoupon.discount_type === 'FLAT') {
                    itemDiscount = Math.min(parseFloat(activeCoupon.discount_value), itemGrossRent);
                  } else {
                    const raw = (itemGrossRent * parseFloat(activeCoupon.discount_value)) / 100;
                    itemDiscount = activeCoupon.max_discount_amount
                      ? Math.min(raw, parseFloat(activeCoupon.max_discount_amount))
                      : raw;
                  }
                  itemDiscount = Math.min(itemDiscount, itemGrossRent);
                }

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
                          <p className="text-[11px] text-gray-500 mt-0.5">Shop: {storeVendor?.name}</p>
                          <p className="text-[11px] text-gray-500">📍 {storeVendor?.city}</p>
                        </div>
                      </div>

                      {/* Date & Quantity Controls */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:w-1/3 text-xs">
                        <div>
                          <label className="block text-[11px] text-gray-500 font-medium">Start Date</label>
                          <input
                            type="date"
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
                              handleUpdateItem(item.product_id, e.target.value, formattedStart, formattedEnd)
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
                                Rent: ₹{(itemGrossRent - itemDiscount).toFixed(2)}
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

                    {/* Store Coupons Selector */}
                    {storeCoupons.length > 0 && (
                      <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-semibold text-gray-700">Store Promotional Codes:</span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {storeCoupons.map((c) => {
                            const isSelectedHere = assignedCouponId === c.id;
                            const isUsedElsewhere = Object.entries(appliedCoupons).some(
                              ([prodId, coupId]) => parseInt(prodId, 10) !== item.product_id && coupId === c.id
                            );

                            // 1. Calculate actual rental days accurately from start and end dates
                            const sDate = new Date(item.start_date);
                            const eDate = new Date(item.end_date);
                            const diffDays = Math.ceil(Math.abs(eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;

                            // 2. Accurate validation checks
                            const meetsMinRent = itemGrossRent >= parseFloat(c.min_order_amount || 0);
                            const meetsMinDays = diffDays >= parseInt(c.min_rental_days || 1, 10);
                            const isEligible = meetsMinRent && meetsMinDays;

                            const label =
                              c.discount_type === 'FLAT'
                                ? `₹${parseFloat(c.discount_value)} OFF`
                                : `${parseFloat(c.discount_value)}% OFF`;

                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  if (!meetsMinRent) {
                                    alert(
                                      `Coupon "${c.code}" requires minimum rental charges of ₹${parseFloat(
                                        c.min_order_amount
                                      ).toFixed(2)} (Current rent: ₹${itemGrossRent.toFixed(2)}).`
                                    );
                                    return;
                                  }
                                  if (!meetsMinDays) {
                                    alert(
                                      `Coupon "${c.code}" requires a minimum rental duration of ${c.min_rental_days} day(s) (Selected duration: ${diffDays} day(s)).`
                                    );
                                    return;
                                  }
                                  handleToggleCoupon(item.product_id, c.id);
                                }}
                                disabled={isUsedElsewhere || (!isSelectedHere && !isEligible)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                                  isSelectedHere
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : isUsedElsewhere || !isEligible
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200 opacity-60'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                }`}
                              >
                                {isSelectedHere && <CheckCircle2 className="w-3 h-3" />}
                                <span>
                                  {c.code} ({label})
                                </span>
                                {!meetsMinRent && (
                                  <span className="text-[9px] text-amber-700 font-normal">
                                    (Min ₹{parseFloat(c.min_order_amount).toFixed(0)})
                                  </span>
                                )}
                                {meetsMinRent && !meetsMinDays && (
                                  <span className="text-[9px] text-amber-700 font-normal">
                                    (Min {c.min_rental_days}d)
                                  </span>
                                )}
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

            {/* Frequently Rented Together Recommendations */}
            {frequentlyRented.length > 0 && (
              <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-extrabold text-gray-900">
                      Frequently Rented Together
                    </h3>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    Popular gear paired by other renters
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {frequentlyRented.map((rec) => {
                    const recImages = parseProductImages(rec.images);
                    const recImg = recImages[0] || 'https://placehold.co/400x300?text=No+Image';

                    return (
                      <div
                        key={rec.id}
                        className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={recImg}
                            alt={rec.title}
                            className="w-12 h-12 object-cover rounded-lg bg-white border border-gray-200 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-gray-900 truncate">
                              {rec.title}
                            </h4>
                            <p className="text-[11px] text-indigo-700 font-semibold">
                              ₹{parseFloat(rec.rent_per_day_1_4).toFixed(0)}/day
                            </p>
                            <p className="text-[10px] text-gray-400">📍 {rec.vendor_city}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleQuickAddRecommendation(rec)}
                          disabled={addingRecId === rec.id}
                          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm flex-shrink-0 disabled:opacity-50"
                          title="Quick add with current cart dates"
                        >
                          {addingRecId === rec.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Plus className="w-3 h-3" />
                          )}
                          <span>Add</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Checkout Summary (4 cols) */}
          <div className="lg:col-span-4">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <h2 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-3">
                Rental Summary
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
                    <span>Store Discounts Applied:</span>
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
                    Refundable Security Deposit:
                  </span>
                  <span className="font-bold text-gray-900">
                    ₹{calculatedDeposit.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
                <span className="font-extrabold text-gray-900">Payable to Store:</span>
                <span className="text-lg font-black text-blue-600">
                  ₹{calculatedGrandTotal.toFixed(2)}
                </span>
              </div>

              {/* Store Operational Warning */}
              {isCheckoutBlocked && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p>
                    {!storeVendor?.hasGatewayConfigured
                      ? 'This store is setting up its payment gateway. Checkout is temporarily unavailable.'
                      : 'This store is temporarily paused for annual licensing renewal. Please check back later.'}
                  </p>
                </div>
              )}

              <button
                onClick={() =>
                  navigate('/customer/checkout', {
                    state: {
                      applied_coupons: appliedCoupons,
                    },
                  })
                }
                disabled={isCheckoutBlocked}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>
                  {storeVendor?.isRenewalDue
                    ? 'Store License Renewal Overdue'
                    : !storeVendor?.hasGatewayConfigured
                    ? 'Gateway Setup Pending'
                    : 'Proceed to Checkout'}
                </span>
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