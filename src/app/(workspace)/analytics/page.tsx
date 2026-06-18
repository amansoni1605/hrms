'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { RiskBar }  from '@/components/ui/RiskBar';
import { Users, TrendingUp, AlertTriangle, Loader2, Building2 } from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer, ZAxis, ReferenceLine,
} from 'recharts';

interface Analytics {
  summary: { totalEmployees: number; activeEmployees: number; onLeave: number; departments: number };
  departmentMetrics: Array<{ department: string; headcount: number; avgBurnoutRisk: number; avgFlightRisk: number }>;
  riskDistribution:  Array<{ label: string; value: number; color: string }>;
}

interface ScatterDatum {
  x: number; y: number; z: number; name: string;
}

export default function AnalyticsPage() {
  const [data,      setData]      = useState<Analytics | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [sortMetric, setSortMetric] = useState<'avgBurnoutRisk' | 'avgFlightRisk' | 'headcount'>('avgBurnoutRisk');

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  const scatter: ScatterDatum[] = (data?.departmentMetrics ?? []).map((d) => ({
    x: parseFloat((d.avgBurnoutRisk * 100).toFixed(1)),
    y: parseFloat((d.avgFlightRisk  * 100).toFixed(1)),
    z: d.headcount,
    name: d.department,
  }));

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      <div>
        <h2 style={{
          margin: 0, color: 'var(--color-neutral-10)',
          fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
          fontSize: 'var(--text-fs-20)',
        }}>
          Workforce Analytics
        </h2>
        <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
          Anonymised pulse telemetry · burnout × flight-risk correlations · department leaderboard.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.2rem' }}>
        <StatCard title="Total Employees" value={data?.summary.totalEmployees  ?? 0} icon={Users}        accent="blue"  />
        <StatCard title="Active"          value={data?.summary.activeEmployees ?? 0} icon={TrendingUp}   accent="green" />
        <StatCard title="On Leave"        value={data?.summary.onLeave         ?? 0} icon={AlertTriangle} accent="amber"/>
        <StatCard title="Departments"     value={data?.summary.departments     ?? 0} icon={Building2}    accent="purple"/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.6rem' }}>
        {/* Scatter */}
        <div className="hrms-card" style={{ padding: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h3 className="hrms-section-label" style={{ margin: 0 }}>
                Burnout vs Flight Risk
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--color-neutral-6)' }}>
                Bubble size = headcount · axes split at 50%
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', fontSize: 9, fontFamily: 'var(--font-in-sb)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />Safe</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />Watch</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />Critical</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: -12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E5EAF1" />
              <XAxis
                dataKey="x" name="Burnout" unit="%" type="number" domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#8C8C8C' }} axisLine={false} tickLine={false}
                label={{ value: 'Burnout Risk →', position: 'insideBottomRight', offset: -4, fontSize: 9, fill: '#8C8C8C' }}
              />
              <YAxis
                dataKey="y" name="Flight" unit="%" type="number" domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#8C8C8C' }} axisLine={false} tickLine={false}
                label={{ value: 'Flight Risk →', angle: -90, position: 'insideTopLeft', offset: 12, fontSize: 9, fill: '#8C8C8C' }}
              />
              <ZAxis dataKey="z" range={[40, 320]} name="Headcount" />
              {/* Quadrant dividers */}
              <ReferenceLine x={50} stroke="#E5EAF1" strokeDasharray="4 3" strokeWidth={1.5} />
              <ReferenceLine y={50} stroke="#E5EAF1" strokeDasharray="4 3" strokeWidth={1.5} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload as ScatterDatum;
                  const risk = (d.x >= 60 || d.y >= 60) ? 'Critical' : (d.x >= 40 || d.y >= 40) ? 'Watch' : 'Safe';
                  const riskColor = risk === 'Critical' ? '#ef4444' : risk === 'Watch' ? '#f59e0b' : '#22c55e';
                  return (
                    <div className="hrms-card" style={{ padding: '0.8rem 1.2rem', fontSize: 'var(--text-fs-12)', minWidth: 150 }}>
                      <p style={{ margin: '0 0 0.4rem', color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                        {d.name}
                      </p>
                      <p style={{ margin: 0, color: 'var(--color-neutral-7)' }}>Burnout: <strong>{d.x}%</strong></p>
                      <p style={{ margin: 0, color: 'var(--color-neutral-7)' }}>Flight risk: <strong>{d.y}%</strong></p>
                      <p style={{ margin: 0, color: 'var(--color-neutral-7)' }}>Headcount: <strong>{d.z}</strong></p>
                      <p style={{ margin: '0.4rem 0 0', color: riskColor, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                        {risk}
                      </p>
                    </div>
                  );
                }}
              />
              <Scatter data={scatter} isAnimationActive>
                {scatter.map((e, i) => (
                  <Cell
                    key={i}
                    fill={
                      e.x >= 60 || e.y >= 60 ? '#ef4444'
                      : e.x >= 40 || e.y >= 40 ? '#f59e0b'
                      : '#22c55e'
                    }
                    fillOpacity={0.8}
                    stroke={
                      e.x >= 60 || e.y >= 60 ? '#b91c1c'
                      : e.x >= 40 || e.y >= 40 ? '#b45309'
                      : '#15803d'
                    }
                    strokeWidth={1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Department leaderboard */}
        <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '0.8rem 1.6rem',
            borderBottom: '1px solid var(--color-stroke)',
            background: 'var(--color-neutral-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem',
          }}>
            <h3 className="hrms-section-label" style={{ margin: 0 }}>Department Leaderboard</h3>
            <div style={{ display: 'flex', gap: 2, background: 'var(--color-neutral-3)', padding: 2, borderRadius: '0.6rem' }}>
              {(['avgBurnoutRisk', 'avgFlightRisk', 'headcount'] as const).map((m) => (
                <button key={m} onClick={() => setSortMetric(m)}
                  style={{
                    padding: '0.2rem 0.7rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer',
                    fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                    background: sortMetric === m ? 'var(--color-neutral-1)' : 'transparent',
                    color: sortMetric === m ? 'var(--color-neutral-10)' : 'var(--color-neutral-6)',
                    boxShadow: sortMetric === m ? 'var(--shadow-card)' : 'none',
                    transition: 'all 120ms',
                  }}>
                  {m === 'avgBurnoutRisk' ? 'Burnout' : m === 'avgFlightRisk' ? 'Flight' : 'Size'}
                </button>
              ))}
            </div>
          </div>
          {(data?.departmentMetrics ?? [])
            .slice()
            .sort((a, b) => b[sortMetric] - a[sortMetric])
            .map((d, i) => {
              const riskScore = sortMetric === 'headcount' ? d.avgBurnoutRisk : d[sortMetric];
              const rankColor = i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : 'var(--color-neutral-5)';
              return (
                <div
                  key={i}
                  style={{
                    padding: '0.8rem 1.6rem',
                    borderBottom: '1px solid var(--color-neutral-4)',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-neutral-2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: rankColor, minWidth: 14, textAlign: 'center' }}>
                        #{i + 1}
                      </span>
                      <span style={{ color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>
                        {d.department}
                      </span>
                    </div>
                    <span style={{ color: 'var(--color-neutral-7)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                      {d.headcount} emp
                      {sortMetric !== 'headcount' && (
                        <span style={{ marginLeft: 6, color: riskScore >= 0.6 ? '#ef4444' : riskScore >= 0.4 ? '#f59e0b' : '#22c55e', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                          · {(riskScore * 100).toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <RiskBar score={d.avgBurnoutRisk} label="Burnout" size="sm" />
                    <RiskBar score={d.avgFlightRisk}  label="Flight"  size="sm" />
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
