// Re-exports + domain-specific formatters.  All UI components import money /
// date / risk formatters from here so we have a single point of truth.

export { formatCurrency, formatDate, getInitials, cn } from './utils';

export function formatNumber(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatCompact(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(fraction: number, decimals = 0, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(fraction);
}

export function formatRelativeTime(date: Date | string, locale = 'en-US'): string {
  const d        = typeof date === 'string' ? new Date(date) : date;
  const seconds  = Math.floor((Date.now() - d.getTime()) / 1000);
  const rtf      = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (seconds < 60)        return rtf.format(-seconds, 'second');
  if (seconds < 3600)      return rtf.format(-Math.floor(seconds / 60),   'minute');
  if (seconds < 86_400)    return rtf.format(-Math.floor(seconds / 3600), 'hour');
  if (seconds < 2_592_000) return rtf.format(-Math.floor(seconds / 86_400), 'day');
  if (seconds < 31_536_000) return rtf.format(-Math.floor(seconds / 2_592_000), 'month');
  return rtf.format(-Math.floor(seconds / 31_536_000), 'year');
}

export function formatDateRange(start: Date | string, end: Date | string, locale = 'en-US'): string {
  const s   = typeof start === 'string' ? new Date(start) : start;
  const e   = typeof end   === 'string' ? new Date(end)   : end;
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    const sameMonth = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
    return `${sameMonth.format(s)} – ${sameMonth.format(e)}, ${e.getFullYear()}`;
  }
  return `${fmt.format(s)} – ${fmt.format(e)}`;
}

export function riskBand(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export function riskLabel(score: number): string {
  return riskBand(score).charAt(0).toUpperCase() + riskBand(score).slice(1);
}

export function obfuscateAccount(value: string | null | undefined): string {
  if (!value) return '••••';
  const tail = value.slice(-4);
  return `•••• ${tail}`;
}
