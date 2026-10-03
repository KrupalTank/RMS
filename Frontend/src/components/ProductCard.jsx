import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getEffectiveDeposit } from '../utils/pricingHelper';
import { MapPin, ShieldCheck, ShieldAlert, ArrowRight, Store, Tag } from 'lucide-react';
import { parseProductImages } from '../utils/imageHelper';

const ProductCard = ({ product }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Parse PostgreSQL text array / JSON array safely
  const images = parseProductImages(product.images);
  const primaryImage = images[0] || 'https://placehold.co/600x400?text=No+Image';

  const effectiveDeposit = getEffectiveDeposit(product, user);
  const isVerified = user?.kyc_status === 'verified';

  // Highlight if product vendor is in the same city as logged-in user
  const isLocalCity =
    user?.city &&
    product.vendor_city &&
    user.city.toLowerCase() === product.vendor_city.toLowerCase();

  // Parse attached store coupons
  const coupons = Array.isArray(product.store_coupons)
    ? product.store_coupons
    : typeof product.store_coupons === 'string'
    ? JSON.parse(product.store_coupons || '[]')
    : [];

  const bestCoupon = coupons.length > 0 ? coupons[0] : null;
  const additionalOffersCount = coupons.length - 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between">
      <div>
        {/* Product Image & Badges */}
        <div className="relative h-48 w-full bg-gray-100 overflow-hidden">
          <img
            src={primaryImage}
            alt={product.title}
            className="w-full h-full object-cover hover:scale-105 transition duration-300"
          />

          {/* Top Left: Locality Badge */}
          {isLocalCity && (
            <span className="absolute top-2 left-2 bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow flex items-center gap-1 z-10">
              <MapPin className="w-3 h-3" /> Same City ({product.vendor_city})
            </span>
          )}

          {/* Top Right / Image Overlay: Best Offer Callout Badge */}
          {bestCoupon && (
            <span className="absolute top-2 right-2 bg-emerald-700/95 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full shadow-md backdrop-blur-xs flex items-center gap-1 border border-emerald-400/30 z-10">
              <Tag className="w-3 h-3 text-emerald-200" />
              <span>
                {bestCoupon.discount_type === 'FLAT'
                  ? `₹${parseFloat(bestCoupon.discount_value)} OFF`
                  : `${parseFloat(bestCoupon.discount_value)}% OFF`}
              </span>
            </span>
          )}

          {/* Bottom Right: Stock Badge */}
          <span className="absolute bottom-2 right-2 bg-gray-900/80 text-white text-xs font-medium px-2 py-0.5 rounded backdrop-blur-sm">
            Stock: {product.total_quantity}
          </span>
        </div>

        {/* Product Details Content */}
        <div className="p-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-blue-600">
              {product.category_name || 'General'}
            </span>
            <span className="flex items-center gap-0.5 text-gray-500">
              <MapPin className="w-3 h-3" /> {product.vendor_city || 'Available'}
            </span>
          </div>

          <h3 className="text-base font-bold text-gray-900 line-clamp-1 mb-0.5" title={product.title}>
            {product.title}
          </h3>

          {/* Explicit Store Label */}
          {product.vendor_name && (
            <p className="text-[11px] text-gray-500 flex items-center gap-1 mb-2">
              <Store className="w-3 h-3 text-gray-400" />
              <span>Offered by <b>{product.vendor_name}</b></span>
            </p>
          )}

          <p className="text-xs text-gray-600 line-clamp-2 mb-3">
            {product.description || 'No description available.'}
          </p>

          {/* Dynamic Store Offers Teaser Strip */}
          {bestCoupon && (
            <div className="mb-2.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Tag className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span className="font-mono font-bold text-emerald-800 text-[11px] truncate">
                  Use {bestCoupon.code}
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/80 px-1 rounded flex-shrink-0">
                  {bestCoupon.discount_type === 'FLAT'
                    ? `₹${parseFloat(bestCoupon.discount_value)} Flat`
                    : `${parseFloat(bestCoupon.discount_value)}%`}
                </span>
              </div>
              {additionalOffersCount > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 bg-white border border-emerald-300 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  +{additionalOffersCount} more
                </span>
              )}
            </div>
          )}

          {/* Pricing Box */}
          <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 space-y-1.5 mb-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">Rent (1–4 days):</span>
              <span className="font-bold text-gray-900 text-sm">
                ₹{parseFloat(product.rent_per_day_1_4 || 0).toFixed(2)}/day
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-1 text-gray-500">
                {isVerified ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                )}
                Deposit:
              </span>
              <span className="font-semibold text-gray-800">
                ₹{effectiveDeposit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* View Details Action */}
      <div className="p-4 pt-0">
        <button
          onClick={() => navigate(`/product/${product.id}`)}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm"
        >
          <span>View Details & Rent</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ProductCard;