'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Toast system — context-provider + useToast() hook.
// Bottom-right stack, auto-dismiss with manual override.
// ─────────────────────────────────────────────────────────────────────────────

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id:    string;
  kind:  ToastKind;
  title: string;
  desc?: string;
  ttl?:  number;        // ms, default 4500
}

interface ToastContextValue {
  push:    (t: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_META: Record<ToastKind, { color: string; bg: string; border: string; icon: typeof CheckCircle }> = {
  success: { color: 'var(--color-semantics-green-7)',  bg: 'var(--color-semantics-green-1)',  border: 'var(--color-semantics-green-3)',  icon: CheckCircle },
  error:   { color: 'var(--color-semantics-red-6)',    bg: 'var(--color-semantics-red-1)',    border: 'var(--color-semantics-red-2)',    icon: XCircle },
  warning: { color: 'var(--color-semantics-orange-7)', bg: '#FFF6E6',                         border: '#FFD891',                         icon: AlertTriangle },
  info:    { color: 'var(--color-vr-blue-7)',          bg: 'var(--color-vr-blue-1)',          border: 'var(--color-vr-blue-2)',          icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((t: Omit<ToastItem, 'id'>): string => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev, { ...t, id }]);
    const ttl = t.ttl ?? 4500;
    if (ttl > 0) setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 80,
          display: 'flex', flexDirection: 'column-reverse', gap: 8,
          maxWidth: 380,
        }}
      >
        {items.map((t) => {
          const meta = KIND_META[t.kind];
          const Icon = meta.icon;
          return (
            <div
              key={t.id}
              role="status"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.8rem',
                padding: '0.8rem 1rem', borderRadius: '0.8rem',
                background: meta.bg, color: meta.color,
                border: `1px solid ${meta.border}`,
                boxShadow: 'var(--shadow-card)',
                fontSize: 'var(--text-fs-12)',
                animation: 'toastIn 200ms cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <Icon size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{t.title}</p>
                {t.desc && (
                  <p style={{ margin: 0, marginTop: 2, opacity: 0.85 }}>{t.desc}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'inherit', padding: 2, flexShrink: 0, opacity: 0.7,
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastIn {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful no-op when used outside a provider (e.g. SSR or unit tests)
    return {
      push:    () => '',
      dismiss: () => undefined,
    };
  }
  return ctx;
}
