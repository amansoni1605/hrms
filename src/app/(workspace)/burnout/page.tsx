'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter }                         from 'next/navigation';
import {
  Activity, AlertTriangle, TrendingUp, Loader2, RefreshCw,
  Users, ChevronRight, Shield, Award,
} from 'lucide-react';
import { StatCard }            from '@/components/ui/StatCard';
import { Badge, StatusBadge }  from '@/components/ui/Badge';
import { RiskBar }             from '@/components/ui/RiskBar';
import { EmptyState }          from '@/components/ui/EmptyState';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DepartmentSummary {
  departmentCode: string;
  departmentName: string;
  headcount:      number;
  avgScore:       number;
  criticalCount:  number;
  highCount:      number;
  mediumCount:    number;
  lowCount:       number;
  topAtRisk:      Array<{ employeeCode: string; score: number; band: string }>;
}

interface TopAtRiskRow {
  employeeId:   string;
  employeeCode: string;
  jobTitle:     string;
  department:   string;
  manager:      string | null;
  burnout: {
    compositeScore: number;
    band:           'low' | 'medium' | 'high' | 'critical';
    signals:        { attendance: number; pulse: number; skill: number; cadence: number };
    topFactors:     Array<{ factor: string; weight: number; value: string }>;
    confidence:     number;
  };
}

interface WatchlistRow {
  employeeId:   string;
  employeeCode: string;
  jobTitle:     string;
  department:   string;
  manager:      string | null;
  flightRisk: {
    riskProbability:   number;
    band:              'low' | 'medium' | 'high';
    horizon90DayPct:   number;
    topDrivers:        Array<{ family: string; weight: number; description: string }>;
    recommendedAction: string;
    confidence:        number;
  };
}

interface BurnoutResponse {
  departmentSummaries: DepartmentSummary[];
  topAtRisk:           TopAtRiskRow[];
  watchlist:           WatchlistRow[];
  tenantStats: {
    totalEmployees:  number;
    criticalBurnout: number;
    highBurnout:     number;
    highFlightRisk:  number;
  };
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function BurnoutDashboardPage() {
  const router = useRouter();
  const [data,    setData]    = useState<BurnoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'burnout' | 'flight'>('burnout');

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/ws/burnout');
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6rem' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem 2.4rem 6rem 2.4rem', maxWidth: 1400, minHeight: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Activity size={20} style={{ color: 'var(--color-semantics-red-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{
            margin: 0, color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-20)',
          }}>
            Predictive Workforce Analytics
          </h2>
          <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            ML-driven burnout & turnover signals — refreshed nightly. Last computed {new Date(data.computedAt).toLocaleString()}.
          </p>
        </div>
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.6rem' }}>
        <StatCard title="Total Headcount"     value={data.tenantStats.totalEmployees}  icon={Users}        accent="blue"   />
        <StatCard title="Critical Burnout"    value={data.tenantStats.criticalBurnout} icon={AlertTriangle} accent="red"
                  subtitle="composite ≥ 0.80" />
        <StatCard title="High Burnout"        value={data.tenantStats.highBurnout}     icon={TrendingUp}   accent="amber"
                  subtitle="0.60 ≤ score < 0.80" />
        <StatCard title="High Flight Risk"    value={data.tenantStats.highFlightRisk}  icon={Shield}       accent="purple"
                  subtitle="90-day risk ≥ 0.60" />
      </div>

      {/* Department heatmap */}
      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.6rem' }}>
        <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
          <h3 className="hrms-section-label" style={{ margin: 0 }}>Department Burnout Heatmap</h3>
        </div>
        <div style={{ padding: '1.2rem 1.6rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {data.departmentSummaries.map((d) => {
            const bg =
              d.avgScore >= 0.70 ? 'var(--color-semantics-red-1)' :
              d.avgScore >= 0.50 ? '#FFF6E6' :
              d.avgScore >= 0.30 ? '#F4FAFF' :
                                   'var(--color-semantics-green-1)';
            const border =
              d.avgScore >= 0.70 ? 'var(--color-semantics-red-2)' :
              d.avgScore >= 0.50 ? '#FFD891' :
              d.avgScore >= 0.30 ? '#BAE1FF' :
                                   'var(--color-semantics-green-2)';
            return (
              <div key={d.departmentCode}
                   style={{
                     padding: '1rem 1.2rem', borderRadius: '0.8rem',
                     background: bg, border: `1px solid ${border}`,
                   }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>
                    {d.departmentName}
                  </h4>
                  <span style={{ color: 'var(--color-neutral-7)', fontSize: 10, fontFamily: 'monospace' }}>{d.departmentCode}</span>
                </div>
                <p style={{
                  margin: 0, color: 'var(--color-neutral-10)',
                  fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                  fontSize: 'var(--text-fs-20)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {(d.avgScore * 100).toFixed(0)}%
                </p>
                <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                  avg burnout · {d.headcount} employees
                </p>
                <div style={{ marginTop: '0.8rem', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {d.criticalCount > 0 && <Badge variant="danger" dot>{d.criticalCount} critical</Badge>}
                  {d.highCount     > 0 && <Badge variant="warning">{d.highCount} high</Badge>}
                  {d.mediumCount   > 0 && <Badge variant="info">{d.mediumCount} medium</Badge>}
                  {d.lowCount      > 0 && <Badge variant="success">{d.lowCount} low</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs: burnout / flight risk */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1.2rem', background: 'var(--color-neutral-3)', padding: 3, borderRadius: '0.8rem', width: 'fit-content' }}>
        {[
          { value: 'burnout', label: '🔥 Top Burnout Risks' },
          { value: 'flight',  label: '✈ Flight Risk Watchlist' },
        ].map(({ value, label }) => (
          <button key={value} onClick={() => setTab(value as 'burnout' | 'flight')}
                  style={{
                    padding: '0.5rem 1.2rem', borderRadius: '0.6rem', border: 'none',
                    cursor: 'pointer', fontSize: 'var(--text-fs-12)',
                    fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                    background: tab === value ? 'var(--color-neutral-1)' : 'transparent',
                    color:      tab === value ? 'var(--color-neutral-10)' : 'var(--color-neutral-7)',
                    boxShadow:  tab === value ? 'var(--shadow-card)' : 'none',
                  }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'burnout' && (
        <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
          {data.topAtRisk.length === 0 ? (
            <EmptyState icon={Award} title="No high-risk employees" message="Composite burnout scores are healthy across the organisation." />
          ) : data.topAtRisk.map((row) => (
            <div key={row.employeeId}
                 onClick={() => router.push(`/employees/${row.employeeId}`)}
                 style={{
                   display: 'grid', gridTemplateColumns: '120px 1fr 200px 240px 32px',
                   alignItems: 'center', gap: '1rem',
                   padding: '1rem 1.6rem',
                   borderBottom: '1px solid var(--color-neutral-4)',
                   cursor: 'pointer',
                 }}>
              <div>
                <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 10, color: 'var(--color-vr-blue-6)' }}>
                  {row.employeeCode}
                </p>
                <Badge variant={
                    row.burnout.band === 'critical' ? 'danger' :
                    row.burnout.band === 'high'     ? 'warning' :
                    row.burnout.band === 'medium'   ? 'info' :
                                                      'success'
                  }>
                  {row.burnout.band}
                </Badge>
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>
                  {row.jobTitle}
                </p>
                <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                  {row.department} {row.manager && `· reports to ${row.manager}`}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-7)' }}>Composite</p>
                <RiskBar score={row.burnout.compositeScore} size="sm" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-7)' }}>Top driver</p>
                <p style={{ margin: 0, color: 'var(--color-neutral-9)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                  {row.burnout.topFactors[0]?.factor ?? 'n/a'}
                </p>
                <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                  {row.burnout.topFactors[0]?.value ?? ''}
                </p>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-6)' }} />
            </div>
          ))}
        </div>
      )}

      {tab === 'flight' && (
        <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
          {data.watchlist.length === 0 ? (
            <EmptyState icon={Award} title="No flight-risk concerns" message="Retention signals look healthy across the workforce." />
          ) : data.watchlist.map((row) => (
            <div key={row.employeeId}
                 onClick={() => router.push(`/employees/${row.employeeId}`)}
                 style={{
                   padding: '1.2rem 1.6rem',
                   borderBottom: '1px solid var(--color-neutral-4)',
                   cursor: 'pointer',
                   display: 'grid', gridTemplateColumns: '120px 1fr 140px 32px',
                   alignItems: 'flex-start', gap: '1rem',
                 }}>
              <div>
                <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 10, color: 'var(--color-vr-blue-6)' }}>
                  {row.employeeCode}
                </p>
                <Badge variant={row.flightRisk.band === 'high' ? 'danger' : row.flightRisk.band === 'medium' ? 'warning' : 'success'} dot={row.flightRisk.band === 'high'}>
                  {row.flightRisk.band}
                </Badge>
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>
                  {row.jobTitle}
                </p>
                <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                  {row.department}
                </p>
                <div style={{ marginTop: '0.6rem' }}>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-7)' }}>Top drivers:</p>
                  {row.flightRisk.topDrivers.slice(0, 3).map((d) => (
                    <p key={d.family} style={{ margin: 0, color: 'var(--color-neutral-9)', fontSize: 11 }}>
                      • <strong>{d.family}:</strong> {d.description}
                    </p>
                  ))}
                </div>
                <div style={{ marginTop: '0.8rem', padding: '0.6rem 0.8rem', borderRadius: '0.6rem', background: 'var(--color-vr-blue-1)', border: '1px solid var(--color-vr-blue-2)' }}>
                  <p style={{ margin: 0, color: 'var(--color-vr-blue-8)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                    Recommended: {row.flightRisk.recommendedAction}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>90-day risk</p>
                <p style={{
                  margin: 0, color: 'var(--color-semantics-red-7)',
                  fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                  fontSize: 'var(--text-fs-22)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {(row.flightRisk.horizon90DayPct * 100).toFixed(0)}%
                </p>
                <p style={{ margin: 0, color: 'var(--color-neutral-6)', fontSize: 10 }}>
                  confidence {(row.flightRisk.confidence * 100).toFixed(0)}%
                </p>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-6)' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
