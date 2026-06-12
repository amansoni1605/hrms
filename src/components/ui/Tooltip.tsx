'use client';

import { useState, useRef, type ReactNode } from 'react';

export interface TooltipProps {
  content:   ReactNode;
  side?:     'top' | 'right' | 'bottom' | 'left';
  delay?:    number;          // ms before showing, default 300
  children:  ReactNode;
}

export function Tooltip({ content, side = 'top', delay = 300, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  const sideStyle: Record<'top'|'right'|'bottom'|'left', React.CSSProperties> = {
    top:    { bottom: '100%', left: '50%', transform: 'translate(-50%, -8px)' },
    bottom: { top:    '100%', left: '50%', transform: 'translate(-50%,  8px)' },
    left:   { right:  '100%', top:  '50%', transform: 'translate(-8px, -50%)' },
    right:  { left:   '100%', top:  '50%', transform: 'translate( 8px, -50%)' },
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show} onMouseLeave={hide}
      onFocus={show} onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', zIndex: 70,
            padding: '0.4rem 0.8rem', borderRadius: '0.6rem',
            background: 'var(--color-neutral-10)',
            color: 'var(--color-neutral-1)',
            fontSize: 'var(--text-fs-12)',
            fontFamily: 'var(--font-in-md)', fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: 'var(--shadow-card)',
            ...sideStyle[side],
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
