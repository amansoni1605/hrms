'use client';

import { type ReactNode, type ElementType } from 'react';

export interface EmptyStateProps {
  icon?:    ElementType;
  title:    string;
  message?: ReactNode;
  action?:  ReactNode;
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '0.8rem',
        padding: '3.6rem 2rem',
        textAlign: 'center',
      }}
    >
      {Icon && (
        <div
          style={{
            width: 48, height: 48, borderRadius: '0.8rem',
            background: 'var(--color-neutral-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-neutral-6)',
          }}
        >
          <Icon size={22} />
        </div>
      )}
      <p style={{
        margin: 0,
        color: 'var(--color-neutral-10)',
        fontFamily: 'var(--font-in-sb)', fontWeight: 600,
        fontSize: 'var(--text-fs-14)',
      }}>
        {title}
      </p>
      {message && (
        <p style={{
          margin: 0, maxWidth: 360,
          color: 'var(--color-neutral-7)',
          fontSize: 'var(--text-fs-12)',
          lineHeight: 1.5,
        }}>
          {message}
        </p>
      )}
      {action && <div style={{ marginTop: '0.6rem' }}>{action}</div>}
    </div>
  );
}
