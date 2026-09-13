// services/pricingService.js

/**
 * Calculates rental days, tiered rate, deposit, vendor discounts, and customer checkout totals.
 * In this vendor-direct SaaS model, platform commission per order is 0%.
 *
 * @param {Object} product - Product DB record
 * @param {string|Date} startDate - Format YYYY-MM-DD
 * @param {string|Date} endDate - Format YYYY-MM-DD
 * @param {number} quantity - Quantity of units
 * @param {string} kycStatus - 'verified' | 'non_verified' | 'pending' | 'rejected'
 * @param {Object|number} couponInput - Vendor coupon object or legacy numeric discount percent
 */
function calculateRentalQuotation(
  product,
  startDate,
  endDate,
  quantity = 1,
  kycStatus = 'non_verified',
  couponInput = null
) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Inclusive duration formula: (end_date - start_date) + 1
  const diffTime = Math.abs(end - start);
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  let applicableDailyRent = 0;

  // Day Range Tiers: 1-4, 5-9, 10+
  if (totalDays <= 4) {
    applicableDailyRent = parseFloat(product.rent_per_day_1_4);
  } else if (totalDays <= 9) {
    applicableDailyRent = parseFloat(product.rent_per_day_5_9);
  } else {
    applicableDailyRent = parseFloat(product.rent_per_day_10_onwards);
  }

  const isVerified = kycStatus === 'verified';
  const depositPerItem = isVerified
    ? parseFloat(product.deposit_verified)
    : parseFloat(product.deposit_non_verified);

  const lateFeePerDay = isVerified
    ? parseFloat(product.late_fee_verified)
    : parseFloat(product.late_fee_non_verified);

  const grossRent = parseFloat((applicableDailyRent * totalDays * quantity).toFixed(2));
  const totalDeposit = parseFloat((depositPerItem * quantity).toFixed(2));

  // Handle Vendor-Managed Coupons
  let discountAmount = 0;
  let couponApplied = false;

  if (couponInput) {
    if (typeof couponInput === 'object') {
      const minDays = parseInt(couponInput.min_rental_days || 1, 10);
      const minOrderAmt = parseFloat(couponInput.min_order_amount || 0);

      // Check duration and gross amount criteria
      if (totalDays >= minDays && grossRent >= minOrderAmt) {
        if (couponInput.discount_type === 'FLAT') {
          discountAmount = Math.min(parseFloat(couponInput.discount_value), grossRent);
          couponApplied = true;
        } else {
          // PERCENT type
          const pct = parseFloat(couponInput.discount_value || 0);
          let rawDiscount = (grossRent * pct) / 100;
          if (couponInput.max_discount_amount) {
            rawDiscount = Math.min(rawDiscount, parseFloat(couponInput.max_discount_amount));
          }
          discountAmount = Math.min(rawDiscount, grossRent);
          couponApplied = true;
        }
      }
    } else if (typeof couponInput === 'number' && couponInput > 0) {
      // Legacy fallback
      discountAmount = Math.min((grossRent * couponInput) / 100, grossRent);
      couponApplied = true;
    }
  }

  discountAmount = parseFloat(discountAmount.toFixed(2));

  // Customer Paid Rent (Net rent received by vendor - base for 5% annual royalty)
  const customerPaidRent = parseFloat((grossRent - discountAmount).toFixed(2));

  // Zero-intermediation: Vendor gets 100% of the rent paid by customer
  const vendorNetRent = customerPaidRent;
  const platformCommission = 0.0;

  // Checkout grand total (Customer pays Net Rent + Security Deposit directly to Vendor)
  const grandTotal = parseFloat((customerPaidRent + totalDeposit).toFixed(2));

  const maxLateDays = 3;

  return {
    totalDays,
    applicableDailyRent,
    depositPerItem,
    lateFeePerDay,
    grossRent,
    discountAmount,
    couponApplied,
    customerPaidRent,
    totalRent: customerPaidRent, // Backward compatibility with frontend
    platformCommission,
    vendorNetRent,
    totalDeposit,
    grandTotal,
    maxLateDays: Math.max(maxLateDays, 1),
  };
}

module.exports = { calculateRentalQuotation };