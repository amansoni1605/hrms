'use client';

import { useEffect, useRef, useState, type ReactNode, type ElementType } from 'react';

export interface DropdownMenuItem {
  key:       string;
  label:     string;
  icon?:     ElementType;
  onClick?:  () => void;
  destructive?: boolean;
  disabled?: boolean;
  divider?:  boolean;            // render as a separator line instead
}

export interface DropdownMenuProps {
  trigger:  ReactNode;
  items:    DropdownMenuItem[];
  align?:   'left' | 'right';
}

export function DropdownMenu({ trigger, items, align = 'right' }: DropdownMenuProps) {
  const [open,  setOpen]  = useState(false);
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown',   onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown',   onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <span onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer' }}>
        {trigger}
      </span>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)',
            [align]: 0,
            minWidth: 200, zIndex: 40,
            background: 'var(--color-neutral-1)',
            border: '1px solid var(--color-stroke)',
            borderRadius: '0.8rem',
            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
            padding: '0.4rem',
            display: 'flex', flexDirection: 'column',
            animation: 'menuIn 120ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {items.map((it) => {
            if (it.divider) {
              return (
                <div
                  key={it.key}
                  role="separator"
                  style={{ height: 1, margin: '4px 0', background: 'var(--color-stroke)' }}
                />
              );
            }
            const Icon = it.icon;
            return (
              <button
                key={it.key}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { it.onClick?.(); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  padding: '0.6rem 0.8rem', borderRadius: '0.6rem',
                  background: 'transparent', border: 'none',
                  cursor: it.disabled ? 'not-allowed' : 'pointer',
                  color: it.destructive ? 'var(--color-semantics-red-6)' : 'var(--color-neutral-9)',
                  fontSize: 'var(--text-fs-12)',
                  fontFamily: 'var(--font-in-md)', fontWeight: 500,
                  textAlign: 'left',
                  opacity: it.disabled ? 0.5 : 1,
                  transition: 'background 80ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!it.disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-neutral-3)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                {Icon && <Icon size={13} />}
                {it.label}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes menuIn {
          from { transform: translateY(-4px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
