/**
 * Safely extracts YYYY-MM-DD from any date input without triggering UTC time shifts.
 */
export const formatLocalDate = (dateVal) => {
  if (!dateVal) return '';

  // 1. If it's already a string, extract the leading YYYY-MM-DD
  if (typeof dateVal === 'string') {
    const match = dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  // 2. If it's a JS Date object, convert to local calendar date
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};