'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Drawer — right-side sliding detail pane.
// Used for: Employee deep-dive, audit-entry detail, leave-request detail.
// Escape closes; click on backdrop closes; locks body scroll while open.
// ─────────────────────────────────────────────────────────────────────────────

export interface DrawerProps {
  open:        boolean;
  onClose:     () => void;
  title:       ReactNode;
  subtitle?:   ReactNode;
  width?:      number;          // px, default 520
  children:    ReactNode;
  footer?:     ReactNode;
}

export function Drawer({
  open, onClose, title, subtitle, width = 520, children, footer,
}: DrawerProps) {
  // Escape-to-close + body-scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(33, 36, 39, 0.4)',
          backdropFilter: 'blur(2px)',
          animation: 'fadeIn 120ms ease-out',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          width: `min(${width}px, 100vw)`,
          height: '100vh',
          background: 'var(--color-neutral-1)',
          borderLeft: '1px solid var(--color-stroke)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
          animation: 'slideInRight 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'flex-start',
            gap: '1.2rem', padding: '1.6rem',
            borderBottom: '1px solid var(--color-stroke)',
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0,
              color: 'var(--color-neutral-10)',
              fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
              fontSize: 'var(--text-fs-16)',
            }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{
                margin: 0, marginTop: 4,
                color: 'var(--color-neutral-7)',
                fontSize: 'var(--text-fs-12)',
              }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: 6, borderRadius: '0.6rem',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-neutral-7)',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          className="custom-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '1.6rem' }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: '1.2rem 1.6rem',
              borderTop: '1px solid var(--color-stroke)',
              background: 'var(--color-neutral-2)',
              display: 'flex', justifyContent: 'flex-end', gap: '0.8rem',
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn      { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(40px); opacity: 0; }
                                  to   { transform: translateX(0);    opacity: 1; } }
      `}</style>
    </div>
  );
}
