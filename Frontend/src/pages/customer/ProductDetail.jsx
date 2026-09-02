// src/pages/customer/ProductDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import { parseProductImages } from '../../utils/imageHelper';
import ProductCard from '../../components/ProductCard';
import {
  getEffectiveDeposit,
  getEffectiveLateFee,
  getRatePerDayForDays,
  calculateRentalCost,
} from '../../utils/pricingHelper';
import {
  User,
  MapPin,
  Phone,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Star,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const similarScrollRef = useRef(null);

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Form State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState({ success: '', error: '' });

  // Fetch product data & similar recommendations
  useEffect(() => {
    const fetchProductAndRecommendations = async () => {
      setLoading(true);
      setActiveImageIndex(0);
      setStatus({ success: '', error: '' });

      try {
        const [prodRes, similarRes] = await Promise.all([
          api.get(`/user/getProduct/${id}`),
          api.get(`/user/recommendations/similar/${id}?limit=6`),
        ]);

        if (prodRes.data.success) {
          setProduct(prodRes.data.product);
          setReviews(prodRes.data.reviews || []);
        }

        if (similarRes.data.success) {
          setSimilarProducts(similarRes.data.products || []);
        }
      } catch (err) {
        setStatus({
          success: '',
          error: err.response?.data?.message || 'Failed to load product details.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProductAndRecommendations();
  }, [id]);

  const handleScrollSimilar = (direction) => {
    if (similarScrollRef.current) {
      const scrollAmount = direction === 'left' ? -340 : 340;
      similarScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-gray-800">Product Not Found</h2>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
        >
          Return to Catalog
        </button>
      </div>
    );
  }

  // Parse images (up to 6)
  const images = parseProductImages(product.images);
  const mainImage = images[activeImageIndex] || 'https://placehold.co/600x400?text=No+Image';

  // Calculate rental duration in days (inclusive)
  let totalDays = 0;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end >= start) {
      const diffTime = Math.abs(end - start);
      totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  const effectiveDepositPerUnit = getEffectiveDeposit(product, user);
  const effectiveLateFeePerDay = getEffectiveLateFee(product, user);
  const activeRatePerDay = totalDays > 0 ? getRatePerDayForDays(product, totalDays) : null;
  const totalRentCost = totalDays > 0 ? calculateRentalCost(product, totalDays, quantity) : 0;
  const totalDeposit = effectiveDepositPerUnit * quantity;
  const grandTotal = totalRentCost + totalDeposit;

  // Add to Cart Handler
  const handleAddToCart = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (user.role !== 'customer') {
      setStatus({
        success: '',
        error: 'Only registered customer accounts can book and rent equipment.',
      });
      return;
    }

    if (!startDate || !endDate) {
      setStatus({ success: '', error: 'Please choose both start and end rental dates.' });
      return;
    }

    if (totalDays <= 0) {
      setStatus({ success: '', error: 'End date must be greater than or equal to start date.' });
      return;
    }

    if (quantity > product.total_quantity) {
      setStatus({
        success: '',
        error: `Only ${product.total_quantity} item(s) currently available in stock.`,
      });
      return;
    }

    setActionLoading(true);
    setStatus({ success: '', error: '' });

    try {
      const payload = {
        product_id: product.id,
        quantity: parseInt(quantity, 10),
        start_date: startDate,
        end_date: endDate,
      };

      const res = await api.post('/user/addToCart', payload);
      if (res.data.success) {
        setStatus({
          success: 'Item successfully added to your rental cart!',
          error: '',
        });
      }
    } catch (err) {
      setStatus({
        success: '',
        error: err.response?.data?.message || 'Failed to add item to cart.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-blue-600"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Catalog
      </button>

      {/* Main Grid: Gallery & Rental Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Gallery & Details (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            {/* Primary Featured Image */}
            <div className="h-96 w-full bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
              <img
                src={mainImage}
                alt={product.title}
                className="w-full h-full object-contain"
              />
            </div>

            {/* Thumbnail Selector (Max 6) */}
            {images.length > 1 && (
              <div className="flex gap-2.5 mt-4 overflow-x-auto pb-1">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`h-16 w-20 rounded-lg overflow-hidden border-2 flex-shrink-0 transition ${
                      activeImageIndex === idx
                        ? 'border-blue-600'
                        : 'border-gray-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`thumb-${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Description & Vendor Info */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                {product.category_name || 'General Equipment'}
              </span>
              <h1 className="text-2xl font-extrabold text-gray-900 mt-1">{product.title}</h1>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {product.description || 'No detailed specifications provided.'}
            </p>

            {/* Vendor Logistics Info */}
            <div className="pt-4 border-t border-gray-100 space-y-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-gray-800">Vendor Name: </span>
                  <span>{product.vendor_name || 'Verified Vendor'}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-gray-800">Pickup Address: </span>
                  <span>
                    {product.vendor_address || 'Vendor location details available on booking'}, {product.vendor_city}
                    {product.vendor_pincode ? ` - ${product.vendor_pincode}` : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-gray-800">Vendor Contact: </span>
                  <span>{product.vendor_phone}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Quotation & Booking Box (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-semibold text-gray-700">Available Stock:</span>
              </div>
              <span className="text-sm font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {product.total_quantity} Unit(s) In Inventory
              </span>
            </div>

            {/* Tier Breakdown Table */}
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Tiered Rental Pricing
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div
                  className={`p-2.5 rounded-lg border ${
                    totalDays >= 1 && totalDays <= 4
                      ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <span className="block text-gray-500 font-medium">1–4 Days</span>
                  <span className="font-bold text-gray-900 text-sm">
                    ₹{parseFloat(product.rent_per_day_1_4).toFixed(0)}/d
                  </span>
                </div>
                <div
                  className={`p-2.5 rounded-lg border ${
                    totalDays >= 5 && totalDays <= 9
                      ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <span className="block text-gray-500 font-medium">5–9 Days</span>
                  <span className="font-bold text-gray-900 text-sm">
                    ₹{parseFloat(product.rent_per_day_5_9).toFixed(0)}/d
                  </span>
                </div>
                <div
                  className={`p-2.5 rounded-lg border ${
                    totalDays >= 10
                      ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <span className="block text-gray-500 font-medium">10+ Days</span>
                  <span className="font-bold text-gray-900 text-sm">
                    ₹{parseFloat(product.rent_per_day_10_onwards).toFixed(0)}/d
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-between text-gray-600 text-xs">
              <span>Cancellation Policy:</span>
              <span className="font-semibold text-gray-800">
                {parseFloat(product.cancellation_fee || 0) > 0
                  ? `₹${parseFloat(product.cancellation_fee).toFixed(2)} / item fee if cancelled`
                  : 'Free cancellation before handover'}
              </span>
            </div>

            {/* Non-Customer Role Notice */}
            {user && user.role !== 'customer' ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-800">
                <p className="font-bold flex items-center gap-1.5 text-sm">
                  <span>⚠️ {user.role.toUpperCase()} Account Active</span>
                </p>
                <p>
                  Equipment booking is restricted to customer accounts. To place orders, please log in with a customer account.
                </p>
                <div className="pt-2">
                  {user.role === 'vendor' && (
                    <button
                      onClick={() => navigate('/vendor/dashboard')}
                      className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition"
                    >
                      Go to Vendor Hub
                    </button>
                  )}
                  {user.role === 'admin' && (
                    <button
                      onClick={() => navigate('/admin/dashboard')}
                      className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold transition"
                    >
                      Go to Admin Suite
                    </button>
                  )}
                  {user.role === 'kyc_officer' && (
                    <button
                      onClick={() => navigate('/kyc/dashboard')}
                      className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold transition"
                    >
                      Go to KYC Console
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Date & Quantity Selectors */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Start Date</label>
                      <input
                        type="date"
                        min={todayStr}
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full text-xs p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">End Date</label>
                      <input
                        type="date"
                        min={startDate || todayStr}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full text-xs p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Required Quantity (Max: {product.total_quantity})
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={product.total_quantity}
                        value={quantity}
                        onChange={(e) =>
                          setQuantity(
                            Math.max(1, Math.min(product.total_quantity, parseInt(e.target.value, 10) || 1))
                          )
                        }
                        className="w-24 text-sm p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-bold text-center"
                      />
                      <span className="text-xs text-gray-500">Unit(s)</span>
                    </div>
                  </div>
                </div>

                {/* Dynamic Quotation Box */}
                {totalDays > 0 ? (
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2.5 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Selected Duration:</span>
                      <span className="font-bold text-gray-900">{totalDays} Day{totalDays > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Applied Daily Rate:</span>
                      <span className="font-bold text-gray-900">₹{activeRatePerDay.toFixed(2)}/day</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total Rental Fee ({quantity} item × {totalDays}d):</span>
                      <span className="font-bold text-gray-900">₹{totalRentCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span className="flex items-center gap-1">
                        {user?.kyc_status === 'verified' ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        Refundable Deposit ({quantity} × ₹{effectiveDepositPerUnit}):
                      </span>
                      <span className="font-bold text-gray-900">₹{totalDeposit.toFixed(2)}</span>
                    </div>

                    {user?.kyc_status !== 'verified' && (
                      <p className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-100">
                        💡 <b>Save on deposit:</b> Complete KYC verification to reduce deposit to <b>₹{parseFloat(product.deposit_verified).toFixed(2)}</b> per unit (Currently ₹{parseFloat(product.deposit_non_verified).toFixed(2)}).
                      </p>
                    )}
                    <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-sm">
                      <span className="font-extrabold text-gray-900">Grand Total:</span>
                      <span className="text-base font-extrabold text-blue-600">₹{grandTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 italic">
                      * Deposit is 100% refundable upon undamaged return. Late fee: ₹{effectiveLateFeePerDay}/day.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 text-center">
                    Select start & end rental dates above to generate quotation.
                  </div>
                )}

                {/* Notifications */}
                {status.success && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>{status.success}</span>
                  </div>
                )}
                {status.error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{status.error}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2">
                  <button
                    onClick={handleAddToCart}
                    disabled={actionLoading || product.total_quantity <= 0}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition disabled:opacity-50"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>
                      {actionLoading
                        ? 'Updating Cart...'
                        : user
                        ? 'Add to Rental Cart'
                        : 'Sign In as Customer to Rent'}
                    </span>
                  </button>

                  {user && status.success && (
                    <button
                      onClick={() => navigate('/customer/cart')}
                      className="w-full py-2.5 text-center text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 rounded-lg transition"
                    >
                      View Rental Cart & Checkout &rarr;
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Customer Reviews Section */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <span>Customer Reviews & Ratings</span>
          <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full">
            {reviews.length}
          </span>
        </h3>

        {reviews.length === 0 ? (
          <p className="text-xs text-gray-500 italic py-4">No verified customer reviews posted yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.map((rev) => (
              <div key={rev.id} className="p-3.5 bg-gray-50 rounded-lg border border-gray-100 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800">{rev.customer_name}</span>
                  <div className="flex text-amber-500">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3.5 h-3.5 ${
                          i < rev.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-gray-600">{rev.comment}</p>
                <span className="text-[10px] text-gray-400 block">
                  {new Date(rev.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NEW: Similar Products / Alternatives Recommendation Section */}
      {similarProducts.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Similar Equipment You Might Also Like
                </h3>
                <p className="text-xs text-gray-500">
                  Ranked by category match, locality proximity, and verified ratings
                </p>
              </div>
            </div>

            {similarProducts.length > 3 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleScrollSimilar('left')}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                  title="Scroll Left"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleScrollSimilar('right')}
                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                  title="Scroll Right"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div
            ref={similarScrollRef}
            className="flex gap-5 overflow-x-auto pb-4 pt-1 scrollbar-none scroll-smooth"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {similarProducts.map((simProd) => (
              <div
                key={simProd.id}
                className="w-[280px] sm:w-[300px] flex-shrink-0 flex flex-col"
              >
                <ProductCard product={simProd} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;


/*
What is being added:API Call: Automatically fetches recommendations from GET /api/v1/rms/user/recommendations/similar/:productId when the product details load.  Horizontal Carousel: Renders a "Similar Equipment You Might Also Like" section directly below the Customer Reviews section.  Smooth Scroll Controls: Includes scroll arrows (ChevronLeft, ChevronRight) matching the styling in Catalog.jsx.  Reusing ProductCard: Directly uses the verified ProductCard component so city proximity badges, images, and pricing details stay consistent.
*/