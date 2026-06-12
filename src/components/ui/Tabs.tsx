'use client';

import { type ReactNode, type ElementType } from 'react';

export interface TabItem {
  key:     string;
  label:   string;
  icon?:   ElementType;
  count?:  number;
  badge?:  ReactNode;
}

export interface TabsProps {
  tabs:     TabItem[];
  active:   string;
  onChange: (key: string) => void;
  size?:    'sm' | 'md';
}

export function Tabs({ tabs, active, onChange, size = 'md' }: TabsProps) {
  const fontSize    = size === 'sm' ? 'var(--text-fs-12)' : 'var(--text-fs-14)';
  const padY        = size === 'sm' ? '0.8rem' : '1.2rem';

  return (
    <div
      role="tablist"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        borderBottom: '1px solid var(--color-stroke)',
        overflowX: 'auto',
      }}
      className="custom-scroll"
    >
      {tabs.map(({ key, label, icon: Icon, count, badge }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: `${padY} 1.2rem`,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: isActive ? 'var(--color-vr-blue-7)' : 'var(--color-neutral-7)',
              fontFamily: isActive ? 'var(--font-in-sb)' : 'var(--font-in-rg)',
              fontWeight: isActive ? 600 : 500,
              fontSize,
              borderBottom: isActive
                ? '2px solid var(--color-vr-blue-6)'
                : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 120ms ease, border-color 120ms ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-neutral-10)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-neutral-7)';
            }}
          >
            {Icon && <Icon size={size === 'sm' ? 13 : 14} />}
            <span>{label}</span>
            {typeof count === 'number' && (
              <span
                style={{
                  padding: '0.1rem 0.5rem', borderRadius: '0.6rem',
                  background: isActive ? 'var(--color-vr-blue-1)' : 'var(--color-neutral-3)',
                  color: isActive ? 'var(--color-vr-blue-7)' : 'var(--color-neutral-7)',
                  fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {count.toLocaleString()}
              </span>
            )}
            {badge}
          </button>
        );
      })}
    </div>
  );
}
