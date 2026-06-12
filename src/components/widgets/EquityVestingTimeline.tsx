'use client';

import { TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { Badge }                            from '@/components/ui/Badge';
import { EmptyState }                       from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, formatPercent } from '@/lib/format';

// ─────────────────────────────────────────────────────────────────────────────
// EquityVestingTimeline — visualises a grantee's vesting schedule.
//
// Renders one block per active grant with:
//   • Grant header (id, type, totalUnits, currency)
//   • Progress bar: vestedUnits / totalUnits
//   • Cliff + Fully-vested dates with a horizontal timeline ruler
//   • Inline exercise-window CTA for fully-vested ESOPs
// ─────────────────────────────────────────────────────────────────────────────

export interface VestingGrant {
  grantId:             string;
  grantType:           string;     // 'esop' | 'rsu' | 'sar' | 'phantom'
  grantDate:           string;
  cliffDate:           string;
  fullyVestedDate:     string;
  totalUnits:          number;
  vestedUnits:         number;
  unvestedUnits:       number;
  strikePrice?:        number;
  currencyCode:        string;
  vestingScheduleType: string;
  vestingPeriodMonths: number;
  status:              string;
}

export interface EquityVestingTimelineProps {
  grants:        VestingGrant[];
  onExercise?:   (grantId: string) => void;
}

const GRANT_TYPE_LABEL: Record<string, string> = {
  esop:    'ESOP',
  rsu:     'RSU',
  sar:     'SAR',
  phantom: 'Phantom',
};

function progressOnTimeline(grant: VestingGrant): number {
  const g     = new Date(grant.grantDate).getTime();
  const v     = new Date(grant.fullyVestedDate).getTime();
  const now   = Date.now();
  if (v <= g) return 100;
  return Math.max(0, Math.min(100, ((now - g) / (v - g)) * 100));
}

export function EquityVestingTimeline({ grants, onExercise }: EquityVestingTimelineProps) {
  if (grants.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No equity grants on record"
        message="When the company issues you ESOPs or RSUs, you'll see the vesting schedule here."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {grants.map((g) => {
        const pctVested = g.totalUnits > 0 ? (g.vestedUnits / g.totalUnits) : 0;
        const pctTime   = progressOnTimeline(g);
        const cliffPct  = (() => {
          const gd = new Date(g.grantDate).getTime();
          const cd = new Date(g.cliffDate).getTime();
          const vd = new Date(g.fullyVestedDate).getTime();
          if (vd <= gd) return 0;
          return Math.max(0, Math.min(100, ((cd - gd) / (vd - gd)) * 100));
        })();
        const fullyVested = g.vestedUnits >= g.totalUnits;
        const exerciseAvailable = fullyVested && g.grantType === 'esop' && g.status === 'active';

        return (
          <div key={g.grantId} className="hrms-card" style={{ padding: '1.4rem 1.6rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.2rem' }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: '0.8rem',
                  background: 'var(--color-vr-blue-1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <TrendingUp size={16} style={{ color: 'var(--color-vr-blue-7)' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <h4 style={{
                    margin: 0, color: 'var(--color-neutral-10)',
                    fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                    fontSize: 'var(--text-fs-14)',
                  }}>
                    {GRANT_TYPE_LABEL[g.grantType] ?? g.grantType.toUpperCase()} · {g.grantId}
                  </h4>
                  <Badge variant={fullyVested ? 'success' : 'info'}>
                    {fullyVested ? 'Fully vested' : g.status}
                  </Badge>
                </div>
                <p style={{
                  margin: 0, marginTop: 4,
                  color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
                }}>
                  {g.totalUnits.toLocaleString()} units · {g.vestingPeriodMonths}-mo
                  {' '}{(g.vestingScheduleType ?? 'cliff').replace('_',' ')}
                  {g.strikePrice ? ` · strike ${formatCurrency(g.strikePrice, g.currencyCode)}` : ''}
                </p>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{
                  margin: 0, color: 'var(--color-semantics-green-7)',
                  fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                  fontSize: 'var(--text-fs-20)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {g.vestedUnits.toLocaleString()}
                </p>
                <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                  vested ({formatPercent(pctVested, 0)})
                </p>
              </div>
            </div>

            {/* Vesting progress bar */}
            <div style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--color-neutral-7)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Units vested
                </span>
                <span style={{ color: 'var(--color-neutral-9)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                  {g.vestedUnits.toLocaleString()} / {g.totalUnits.toLocaleString()}
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.round(pctVested * 100)}%`, height: '100%',
                    background: 'linear-gradient(90deg, var(--color-semantics-green-5), var(--color-semantics-green-7))',
                    transition: 'width 400ms ease',
                  }}
                />
              </div>
            </div>

            {/* Timeline ruler */}
            <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
              <div style={{ height: 2, background: 'var(--color-neutral-4)', borderRadius: 2 }} />
              <div
                style={{
                  position: 'absolute', top: 0, left: 0,
                  height: 2, width: `${pctTime}%`,
                  background: 'var(--color-vr-blue-6)', borderRadius: 2,
                }}
              />

              {/* Grant date marker */}
              <TimelineMarker percent={0}
                              label="Grant"
                              date={g.grantDate}
                              color="var(--color-neutral-7)" />

              {/* Cliff marker */}
              <TimelineMarker percent={cliffPct}
                              label="Cliff"
                              date={g.cliffDate}
                              color="var(--color-semantics-orange-7)"
                              emphasis />

              {/* Today marker */}
              {pctTime > 1 && pctTime < 99 && (
                <TimelineMarker percent={pctTime}
                                label="Today"
                                date={new Date().toISOString()}
                                color="var(--color-vr-blue-6)"
                                emphasis />
              )}

              {/* Fully vested marker */}
              <TimelineMarker percent={100}
                              label="Fully vested"
                              date={g.fullyVestedDate}
                              color="var(--color-semantics-green-7)"
                              emphasis />
            </div>

            {/* Exercise CTA */}
            {exerciseAvailable && onExercise && (
              <div style={{
                marginTop: '1rem', padding: '0.8rem 1rem',
                borderRadius: '0.8rem',
                background: 'var(--color-vr-blue-1)',
                border: '1px solid var(--color-vr-blue-2)',
                display: 'flex', alignItems: 'center', gap: '0.8rem',
              }}>
                <DollarSign size={14} style={{ color: 'var(--color-vr-blue-7)', flexShrink: 0 }} />
                <p style={{
                  margin: 0, flex: 1,
                  color: 'var(--color-vr-blue-8)', fontSize: 'var(--text-fs-12)',
                }}>
                  Exercise window open — buy {g.vestedUnits.toLocaleString()} shares
                  {g.strikePrice ? ` at ${formatCurrency(g.strikePrice, g.currencyCode)} / share` : ''}.
                </p>
                <button
                  onClick={() => onExercise(g.grantId)}
                  className="hrms-btn-primary"
                  style={{ padding: '0.4rem 0.8rem', fontSize: 'var(--text-fs-12)' }}
                >
                  Exercise
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TimelineMarker({
  percent, label, date, color, emphasis = false,
}: {
  percent: number; label: string; date: string; color: string; emphasis?: boolean;
}) {
  const align = percent <= 5 ? 'flex-start' : percent >= 95 ? 'flex-end' : 'center';
  const transform = percent <= 5 ? 'translateX(0)' : percent >= 95 ? 'translateX(-100%)' : 'translateX(-50%)';
  return (
    <div
      style={{
        position: 'absolute', top: -4, left: `${percent}%`,
        transform,
        display: 'flex', flexDirection: 'column', alignItems: align,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width:  emphasis ? 10 : 6,
          height: emphasis ? 10 : 6,
          borderRadius: '50%',
          background: color,
          border: emphasis ? '2px solid var(--color-neutral-1)' : 'none',
          boxShadow: emphasis ? `0 0 0 1px ${color}` : 'none',
        }}
      />
      <p style={{
        margin: 0, marginTop: 6,
        color: 'var(--color-neutral-7)',
        fontSize: 9, fontFamily: 'var(--font-in-sb)', fontWeight: 600,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </p>
      <p style={{
        margin: 0, color: 'var(--color-neutral-9)',
        fontSize: 10, fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}>
        {formatDate(date)}
      </p>
    </div>
  );
}
