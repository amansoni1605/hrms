'use client';

import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize    = 'sm' | 'md';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'hrms-btn-primary',
  ghost:   'hrms-btn-ghost',
  danger:  'hrms-btn-primary',                  // base, overridden below by inline style
};

const SIZE_STYLE: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '0.4rem 1.0rem', fontSize: 'var(--text-fs-12)' },
  md: { padding: '0.8rem 1.6rem', fontSize: 'var(--text-fs-14)' },
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  loading?:  boolean;
  leftIcon?: ReactNode;
  children:  ReactNode;
}

export function Button({
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  leftIcon,
  disabled,
  children,
  className = '',
  style,
  ...rest
}: ButtonProps) {
  const dangerOverride: React.CSSProperties =
    variant === 'danger'
      ? { backgroundColor: 'var(--color-semantics-red-6)', color: 'var(--color-neutral-1)' }
      : {};

  return (
    <button
      className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
      style={{ ...SIZE_STYLE[size], ...dangerOverride, ...style }}
      disabled={disabled || loading}
      {...rest}
    >
      {loading
        ? <Loader2 size={14} className="animate-spin" />
        : leftIcon}
      {children}
    </button>
  );
}
