import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { formatLocalDate } from '../../utils/dateHelper';
import { parseProductImages } from '../../utils/imageHelper';
import { useAuth } from '../../context/AuthContext';
import {
  Trash2,
  Calendar,
  Layers,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  ShoppingBag,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

const Cart = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cartData, setCartData] = useState({ items: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState('');

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

  useEffect(() => {
    fetchCart();
  }, []);

  // Update Cart Item (Quantity or Dates)
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

      await fetchCart();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update cart configuration.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Remove Item from Cart
  const handleRemoveItem = async (cartId) => {
    try {
      await api.delete(`/user/removeItemFromCart/${cartId}`);
      await fetchCart();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove item.');
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
  const todayStr = formatLocalDate(new Date());

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-blue-600" />
          <span>Your Rental Cart</span>
        </h1>
        <span className="text-xs font-semibold px-3 py-1 bg-gray-100 rounded-full text-gray-600">
          {summary.itemCount || 0} Item{summary.itemCount !== 1 ? 's' : ''}
        </span>
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

              return (
                <div
                  key={item.cart_id}
                  className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 flex flex-col sm:flex-row gap-4 justify-between"
                >
                  {/* Thumbnail & Title */}
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
                      <span className="block font-bold text-gray-900">
                        Rent: ₹{item.quotation.totalRent.toFixed(2)}
                      </span>
                      <span className="block text-gray-500 text-[11px]">
                        Deposit: ₹{item.quotation.totalDeposit.toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleRemoveItem(item.cart_id)}
                      className="text-red-500 hover:text-red-700 p-1 rounded transition"
                      title="Remove from cart"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Total Rental Cost:</span>
                  <span className="font-bold text-gray-900">₹{summary.totalRent?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-1">
                    {user?.kyc_status === 'verified' ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    Total Escrow Deposit:
                  </span>
                  <span className="font-bold text-gray-900">₹{summary.totalDeposit?.toFixed(2) || '0.00'}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
                <span className="font-extrabold text-gray-900 text-sm">Payable Amount:</span>
                <span className="text-lg font-black text-blue-600">
                  ₹{summary.grandTotal?.toFixed(2) || '0.00'}
                </span>
              </div>

              <button
                onClick={() => navigate('/customer/checkout')}
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