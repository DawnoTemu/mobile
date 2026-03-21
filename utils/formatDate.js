/**
 * Format a date value for display in pl-PL locale.
 * Returns '—' for null, undefined, or invalid dates.
 */
const formatDate = (value, { monthFormat = 'long' } = {}) => {
  if (!value) return '\u2014';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  return date.toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: monthFormat,
    day: 'numeric'
  });
};

export { formatDate };
