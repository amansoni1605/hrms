'use client';

import { Globe, AlertTriangle, Plane, CalendarClock } from 'lucide-react';
import { Badge }      from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/format';

// ─────────────────────────────────────────────────────────────────────────────
// ImmigrationNexusTracker — visualises visa expiry timeline and country-day
// tax-nexus tally per active immigration record.
//
// Used in:
//   • HR Command Center bottom row
//   • /immigration page (deep-dive grid across all employees)
//   • Employee deep-dive drawer (Immigration tab)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImmigrationRecord {
  documentType:          string;
  documentNumber?:       string;
  issuingCountry:        string;
  hostCountry:           string;
  validFrom:             string;
  expiresAt:             string;
  visaCategory?:         string;
  physicalDaysInCountry: number;
  nexusTriggerDays:      number;
  nexusRiskLevel:        'safe' | 'watch' | 'at_risk' | 'triggered' | string;
  status:                string;
}

export interface ImmigrationNexusTrackerProps {
  records:  ImmigrationRecord[];
  compact?: boolean;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function urgencyForExpiry(days: number): 'success' | 'warning' | 'danger' {
  if (days <= 30)  return 'danger';
  if (days <= 90)  return 'warning';
  return 'success';
}

const RISK_BADGE_MAP: Record<string, 'success'|'info'|'warning'|'danger'> = {
  safe:      'success',
  watch:     'info',
  at_risk:   'warning',
  triggered: 'danger',
};

export function ImmigrationNexusTracker({ records, compact = false }: ImmigrationNexusTrackerProps) {
  const active = records.filter((r) => r.status === 'active');

  if (active.length === 0) {
    return (
      <EmptyState
        icon={Globe}
        title="No active immigration records"
        message="When a visa or work permit is issued, its nexus timeline will appear here."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {active.map((r, i) => {
        const expiryDays  = daysUntil(r.expiresAt);
        const expiryBadge = urgencyForExpiry(expiryDays);
        const nexusPct    = Math.min(100,
          Math.round((r.physicalDaysInCountry / Math.max(r.nexusTriggerDays, 1)) * 100),
        );
        const nexusBar    = nexusPct >= 90 ? 'var(--color-semantics-red-6)'
                          : nexusPct >= 60 ? 'var(--color-semantics-orange-6)'
                          : 'var(--color-semantics-green-6)';

        return (
          <div
            key={`${r.documentType}-${i}`}
            className="hrms-card"
            style={{ padding: compact ? '1rem 1.2rem' : '1.2rem 1.4rem' }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: '0.6rem',
                  background: 'var(--color-vr-blue-1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Plane size={14} style={{ color: 'var(--color-vr-blue-7)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, color: 'var(--color-neutral-10)',
                  fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                  fontSize: 'var(--text-fs-12)',
                }}>
                  {r.documentType.replace(/_/g, ' ')}
                  {r.visaCategory ? ` · ${r.visaCategory}` : ''}
                  {' '}
                  <span style={{ color: 'var(--color-neutral-7)', fontFamily: 'monospace', fontSize: 10 }}>
                    {r.issuingCountry} → {r.hostCountry}
                  </span>
                </p>
                <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                  {r.documentNumber ? `#${r.documentNumber} · ` : ''}
                  Valid {formatDate(r.validFrom)} → {formatDate(r.expiresAt)}
                </p>
              </div>
              <Badge variant={RISK_BADGE_MAP[r.nexusRiskLevel] ?? 'neutral'} dot={r.nexusRiskLevel === 'triggered'}>
                {r.nexusRiskLevel.replace(/_/g, ' ')}
              </Badge>
            </div>

            {/* Expiry timer */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.6rem 0.8rem', marginBottom: '0.8rem',
              borderRadius: '0.6rem',
              background:
                expiryBadge === 'danger'  ? 'var(--color-semantics-red-1)'
              : expiryBadge === 'warning' ? '#FFF6E6'
              : 'var(--color-semantics-green-1)',
              border: '1px solid ' + (
                expiryBadge === 'danger'  ? 'var(--color-semantics-red-2)'
              : expiryBadge === 'warning' ? '#FFD891'
              : 'var(--color-semantics-green-2)'
              ),
            }}>
              <CalendarClock size={13} style={{
                color: expiryBadge === 'danger'  ? 'var(--color-semantics-red-6)'
                     : expiryBadge === 'warning' ? 'var(--color-semantics-orange-7)'
                     :                              'var(--color-semantics-green-7)',
              }} />
              <p style={{
                margin: 0, fontSize: 'var(--text-fs-12)',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                color: expiryBadge === 'danger'  ? 'var(--color-semantics-red-7)'
                     : expiryBadge === 'warning' ? 'var(--color-semantics-orange-7)'
                     :                              'var(--color-semantics-green-7)',
              }}>
                {expiryDays < 0
                  ? `Expired ${Math.abs(expiryDays)} days ago`
                  : expiryDays === 0
                    ? 'Expires today'
                    : `Expires in ${expiryDays} day${expiryDays === 1 ? '' : 's'}`}
              </p>
              {expiryBadge !== 'success' && (
                <AlertTriangle
                  size={13}
                  style={{
                    marginLeft: 'auto',
                    color: expiryBadge === 'danger' ? 'var(--color-semantics-red-6)' : 'var(--color-semantics-orange-7)',
                  }}
                />
              )}
            </div>

            {/* Nexus day tally */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--color-neutral-7)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Tax-nexus day tally
                </span>
                <span style={{
                  color: 'var(--color-neutral-9)', fontSize: 10,
                  fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                }}>
                  {r.physicalDaysInCountry} / {r.nexusTriggerDays} days
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{
                  width: `${nexusPct}%`, height: '100%',
                  background: nexusBar,
                  transition: 'width 300ms ease',
                }} />
              </div>
              <p style={{
                margin: 0, marginTop: 4,
                color: 'var(--color-neutral-7)', fontSize: 10,
              }}>
                {nexusPct >= 90
                  ? 'Imminent permanent-establishment exposure — alert tax counsel.'
                  : nexusPct >= 60
                    ? 'Monitoring — physical presence approaching threshold.'
                    : 'Within safe limits — no nexus exposure.'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
