'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open:      boolean;
  onClose:   () => void;
  title:     ReactNode;
  subtitle?: ReactNode;
  width?:    number;            // px, default 480
  children:  ReactNode;
  footer?:   ReactNode;
  closeOnBackdrop?: boolean;    // default true
}

export function Modal({
  open, onClose, title, subtitle,
  width = 480, children, footer,
  closeOnBackdrop = true,
}: ModalProps) {
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
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(33, 36, 39, 0.45)',
          backdropFilter: 'blur(2px)',
          animation: 'modalFadeIn 120ms ease-out',
        }}
      />

      <div
        className="hrms-card"
        style={{
          position: 'relative',
          width: `min(${width}px, 100%)`,
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          padding: 0,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.16)',
          animation: 'modalIn 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '1.2rem',
            padding: '1.4rem 1.6rem',
            borderBottom: '1px solid var(--color-stroke)',
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, color: 'var(--color-neutral-10)',
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
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={15} />
          </button>
        </div>

        <div
          className="custom-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '1.6rem' }}
        >
          {children}
        </div>

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
        @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalIn     { from { transform: scale(0.96); opacity: 0; }
                                  to  { transform: scale(1);    opacity: 1; } }
      `}</style>
    </div>
  );
}
