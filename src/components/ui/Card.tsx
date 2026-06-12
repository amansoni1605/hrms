'use client';

import { type ReactNode } from 'react';

// Atomic surface using `.hrms-card` from globals.css —
// 1px border-stroke divider, 0.5px shadow, ghost-white card body.

export interface CardProps {
  children:   ReactNode;
  className?: string;
  padded?:    boolean;
  as?:        'div' | 'section' | 'article';
}

export function Card({
  children,
  className = '',
  padded    = true,
  as: Tag   = 'div',
}: CardProps) {
  const padding = padded ? undefined : { padding: 0 };
  return (
    <Tag className={`hrms-card ${className}`.trim()} style={padding}>
      {children}
    </Tag>
  );
}

export interface CardHeaderProps {
  title:     ReactNode;
  subtitle?: ReactNode;
  action?:   ReactNode;
  icon?:     ReactNode;
}

export function CardHeader({ title, subtitle, action, icon }: CardHeaderProps) {
  return (
    <div
      className="flex items-center"
      style={{
        gap:           '1.2rem',
        paddingBottom: '1.2rem',
        marginBottom:  '1.2rem',
        borderBottom:  '1px solid var(--color-stroke)',
      }}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3
          className="hrms-section-label"
          style={{ color: 'var(--color-neutral-10)', textTransform: 'none', letterSpacing: 0, fontSize: 'var(--text-fs-14)' }}
        >
          {title}
        </h3>
        {subtitle && (
          <p style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', marginTop: '0.2rem' }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
