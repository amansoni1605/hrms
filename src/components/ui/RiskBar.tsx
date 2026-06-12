'use client';

// Risk score bar consuming `.hrms-risk-bar__*` classes from globals.css.
// Bands: low (< 0.4), medium (0.4–0.7), high (≥ 0.7).

export interface RiskBarProps {
  score:     number;                 // 0..1
  label?:    string;
  size?:     'sm' | 'md';
  showValue?: boolean;
}

function band(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

const PCT_COLOR: Record<'low'|'medium'|'high', string> = {
  low:    'var(--color-semantics-green-7)',
  medium: 'var(--color-semantics-orange-7)',
  high:   'var(--color-semantics-red-6)',
};

export function RiskBar({ score, label, size = 'md', showValue = true }: RiskBarProps) {
  const clamped = Math.max(0, Math.min(1, score));
  const pct     = Math.round(clamped * 100);
  const b       = band(clamped);
  const height  = size === 'sm' ? 4 : 6;

  return (
    <div style={{ width: '100%' }}>
      {(label || showValue) && (
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 4, fontSize: 'var(--text-fs-12)',
          }}
        >
          {label && <span style={{ color: 'var(--color-neutral-7)' }}>{label}</span>}
          {showValue && (
            <span
              style={{
                color:      PCT_COLOR[b],
                fontFamily: 'var(--font-in-sb)',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {pct}%
            </span>
          )}
        </div>
      )}
      <div className="hrms-risk-bar__track" style={{ height }}>
        <div
          className={`hrms-risk-bar__fill--${b}`}
          style={{ height: '100%', width: `${pct}%`, transition: 'width 200ms ease' }}
        />
      </div>
    </div>
  );
}
