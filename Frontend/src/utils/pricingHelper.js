/**
 * Resolves refundable deposit based on customer's KYC verification status.
 * Unauthenticated visitors and non_verified users default to deposit_non_verified.
 */
export const getEffectiveDeposit = (product, user) => {
  if (!product) return 0;
  const isVerified = user?.kyc_status === 'verified';
  return isVerified
    ? parseFloat(product.deposit_verified || 0)
    : parseFloat(product.deposit_non_verified || 0);
};

/**
 * Resolves per-day late fee based on KYC verification status.
 */
export const getEffectiveLateFee = (product, user) => {
  if (!product) return 0;
  const isVerified = user?.kyc_status === 'verified';
  return isVerified
    ? parseFloat(product.late_fee_verified || 0)
    : parseFloat(product.late_fee_non_verified || 0);
};

/**
 * Resolves daily rental rate based on duration in days.
 * Tier 1: 1 - 4 days  -> rent_per_day_1_4
 * Tier 2: 5 - 9 days  -> rent_per_day_5_9
 * Tier 3: 10+ days    -> rent_per_day_10_onwards
 */
export const getRatePerDayForDays = (product, totalDays) => {
  if (!product) return 0;
  const days = Math.max(1, parseInt(totalDays, 10) || 1);

  if (days >= 10) {
    return parseFloat(product.rent_per_day_10_onwards || 0);
  } else if (days >= 5) {
    return parseFloat(product.rent_per_day_5_9 || 0);
  } else {
    return parseFloat(product.rent_per_day_1_4 || 0);
  }
};

/**
 * Calculates total rental charge = (Tier Rate * Total Days * Quantity)
 */
export const calculateRentalCost = (product, totalDays, quantity = 1) => {
  if (!product || totalDays <= 0 || quantity <= 0) return 0;
  const ratePerDay = getRatePerDayForDays(product, totalDays);
  return ratePerDay * totalDays * quantity;
};