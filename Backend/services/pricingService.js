// services/pricingService.js

/**
 * Calculates rental days, applicable tiered rate, deposit, and late fees
 * @param {Object} product - Product DB record
 * @param {string|Date} startDate - Format YYYY-MM-DD
 * @param {string|Date} endDate - Format YYYY-MM-DD
 * @param {number} quantity - Quantity of units
 * @param {string} kycStatus - 'verified' | 'non_verified' | 'pending' | 'rejected'
 */
function calculateRentalQuotation(product, startDate, endDate, quantity = 1, kycStatus = 'non_verified') {
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

  const totalRent = applicableDailyRent * totalDays * quantity;
  const totalDeposit = depositPerItem * quantity;
  const totalLateFee = lateFeePerDay * quantity;

  // Maximum allowed late return days
  // const maxLateDays = totalLateFee > 0 ? Math.floor(totalDeposit / totalLateFee) : 3;
  const maxLateDays = 3
  return {
    totalDays,
    applicableDailyRent,
    depositPerItem,
    lateFeePerDay,
    totalRent,
    totalDeposit,
    grandTotal: totalRent + totalDeposit,
    maxLateDays: Math.max(maxLateDays, 1),
  };
}

module.exports = { calculateRentalQuotation };