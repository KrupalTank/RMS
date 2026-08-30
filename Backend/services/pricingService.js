// services/pricingService.js

/**
 * Calculates rental days, tiered rate, deposit, loyalty discount, and vendor/platform splits
 * @param {Object} product - Product DB record
 * @param {string|Date} startDate - Format YYYY-MM-DD
 * @param {string|Date} endDate - Format YYYY-MM-DD
 * @param {number} quantity - Quantity of units
 * @param {string} kycStatus - 'verified' | 'non_verified' | 'pending' | 'rejected'
 * @param {number} couponDiscountPercent - 0 if no coupon applied to this item, e.g. 10.00
 */
function calculateRentalQuotation(
  product,
  startDate,
  endDate,
  quantity = 1,
  kycStatus = 'non_verified',
  couponDiscountPercent = 0
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

  const grossRent = applicableDailyRent * totalDays * quantity;
  const totalDeposit = depositPerItem * quantity;

  // Read platform commission rate (Default: 10%)
  const commissionRate = parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || 10) / 100;

  // Vendor Net Rent is always: Gross Rent * (1 - Commission Rate) -> e.g., 90%
  const vendorNetRent = parseFloat((grossRent * (1 - commissionRate)).toFixed(2));

  // Compute Discount (if coupon applied to this specific product)
  let discountAmount = 0;
  let platformCommission = parseFloat((grossRent * commissionRate).toFixed(2));

  if (couponDiscountPercent > 0) {
    discountAmount = parseFloat(((grossRent * couponDiscountPercent) / 100).toFixed(2));
    platformCommission = Math.max(0, parseFloat((platformCommission - discountAmount).toFixed(2)));
  }

  // Customer Paid Rent = Gross Rent - Discount
  const customerPaidRent = parseFloat((grossRent - discountAmount).toFixed(2));

  // Customer Checkout Subtotal for this Item
  const grandTotal = customerPaidRent + totalDeposit;

  const maxLateDays = 3;

  return {
    totalDays,
    applicableDailyRent,
    depositPerItem,
    lateFeePerDay,
    grossRent,
    discountAmount,
    customerPaidRent,
    totalRent: customerPaidRent, // <-- Restores compatibility with Cart & Checkout
    platformCommission,
    vendorNetRent,
    totalDeposit,
    grandTotal,
    maxLateDays: Math.max(maxLateDays, 1),
  };
}

module.exports = { calculateRentalQuotation };