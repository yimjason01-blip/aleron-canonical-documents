const INTEGER_UNITS = new Set([
  'bpm',
  'count',
  'min/day',
  'ms',
  'percentile',
  'steps',
  'years',
]);

const ONE_DECIMAL_UNITS = new Set([
  '%',
  'events/hr',
  'h',
  'hr',
  'hours',
  'ml/kg/min',
]);

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function maximumFractionDigits(units) {
  const normalized = String(units ?? '').trim().toLowerCase();
  if (INTEGER_UNITS.has(normalized)) return 0;
  if (ONE_DECIMAL_UNITS.has(normalized)) return 1;
  if (normalized === 'qaly' || normalized === 'qalys') return 2;
  return 2;
}

/**
 * Format a clinical number for physician-facing display without changing its source value.
 * Precision is unit-aware; units remain the caller's responsibility.
 */
export function formatClinicalNumber(value, units = '') {
  if (value === null || value === undefined || value === '') return value;
  const numeric = numericValue(value);
  if (numeric === null) return String(value);
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maximumFractionDigits(units),
    minimumFractionDigits: 0,
    useGrouping: true,
  });
  const parts = formatter.formatToParts(numeric);
  const roundsToZero = !parts.some((part) =>
    (part.type === 'integer' || part.type === 'fraction') && /[1-9]/.test(part.value)
  );
  return formatter.format(roundsToZero ? 0 : numeric);
}
