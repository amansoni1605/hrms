import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function formatDate(date: Date | string | null | undefined, locale = 'en-US') {
  if (date == null || date === '') return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
}

export function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export function getRiskColor(score: number): string {
  if (score >= 0.7) return 'text-red-600';
  if (score >= 0.4) return 'text-yellow-600';
  return 'text-green-600';
}

export function getRiskLabel(score: number): string {
  if (score >= 0.7) return 'High';
  if (score >= 0.4) return 'Medium';
  return 'Low';
}

export function getRiskBg(score: number): string {
  if (score >= 0.7) return 'bg-red-100 text-red-700';
  if (score >= 0.4) return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}
