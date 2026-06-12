'use client';

import { type CSSProperties } from 'react';

export interface SkeletonProps {
  width?:  number | string;
  height?: number | string;
  circle?: boolean;
  className?: string;
  style?:  CSSProperties;
}

export function Skeleton({ width, height = 12, circle = false, className = '', style }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: 'inline-block',
        width:  width  ?? '100%',
        height,
        borderRadius: circle ? '50%' : '0.4rem',
        background:
          'linear-gradient(90deg, var(--color-neutral-3) 0%, var(--color-neutral-4) 50%, var(--color-neutral-3) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeletonPulse 1.4s ease-in-out infinite',
        ...style,
      }}
    >
      <style>{`
        @keyframes skeletonPulse {
          0%   { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </span>
  );
}

// Convenience composite for rows of skeleton lines
export function SkeletonRows({ rows = 3, gap = 8 }: { rows?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={12} width={`${85 - i * 10}%`} />
      ))}
    </div>
  );
}
