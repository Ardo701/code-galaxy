const numberFormat = new Intl.NumberFormat('en-US');
const dateFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const monthFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

export const formatNumber = (value: number) => numberFormat.format(value);
export const formatDate = (seconds: number) => dateFormat.format(seconds * 1000);
export const formatDateTime = (seconds: number) => dateTimeFormat.format(seconds * 1000);
export const formatMonth = (seconds: number) => monthFormat.format(seconds * 1000);

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function formatRelative(seconds: number, now = Date.now() / 1000): string {
  const delta = seconds - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(delta) >= size) return relativeFormat.format(Math.round(delta / size), unit);
  }
  return 'just now';
}

/** "1.2k" style compact numbers for tight spaces. */
export function formatCompact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}
