'use client';

import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

// ── Token-anchored KPI tile ──────────────────────────────────────────────────
// Uses `.hrms-kpi-card` shell + design-system colour tokens.

export type StatAccent =
  | 'blue'    // --color-vr-blue-6
  | 'green'   // --color-semantics-green-7
  | 'amber'   // --color-semantics-orange-6
  | 'red'     // --color-semantics-red-6
  | 'purple'  // --color-fund-advisor-7
  | 'cyan';   // --color-semantics-aqua

const ACCENT_TINT: Record<StatAccent, { tile: string; icon: string }> = {
  blue:   { tile: '#E8EEF5', icon: '#1C509D' },
  green:  { tile: '#E7F6ED', icon: '#0E883F' },
  amber:  { tile: '#FFF6E6', icon: '#D98C00' },
  red:    { tile: '#FDE6E6', icon: '#EE0000' },
  purple: { tile: '#F6EDF9', icon: '#783489' },
  cyan:   { tile: '#E5F4FF', icon: '#3759BF' },
};

export interface StatCardProps {
  title:    string;
  value:    ReactNode;
  subtitle?: ReactNode;
  icon?:    LucideIcon;
  accent?:  StatAccent;
  delta?:   { value: number | string; direction: 'up' | 'down' | 'flat' };
}

export function StatCard({ title, value, subtitle, icon: Icon, accent = 'blue', delta }: StatCardProps) {
  const tint = ACCENT_TINT[accent];
  return (
    <div className="hrms-kpi-card" style={{ display: 'flex', gap: '1.2rem', alignItems: 'flex-start' }}>
      {Icon && (
        <div
          style={{
            width:           36,
            height:          36,
            borderRadius:    '0.8rem',
            background:      tint.tile,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            flexShrink:      0,
          }}
        >
          <Icon size={18} style={{ color: tint.icon }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="hrms-kpi-card__label">{title}</p>
        <p className="hrms-kpi-card__value" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
        {(subtitle || delta) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.4rem' }}>
            {delta && (
              <span className={delta.direction === 'down' ? 'loss_pill' : 'gain_pill'}>
                {delta.value}
              </span>
            )}
            {subtitle && <span className="hrms-kpi-card__sub" style={{ margin: 0 }}>{subtitle}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
