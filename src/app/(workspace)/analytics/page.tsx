'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { RiskBar }  from '@/components/ui/RiskBar';
import { Users, TrendingUp, AlertTriangle, Loader2, Building2 } from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer,
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
  const [data,    setData]    = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

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
          <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>
            Burnout vs Flight Risk (by Department)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: -12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E5EAF1" />
              <XAxis
                dataKey="x" name="Burnout" unit="%" type="number" domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#8C8C8C' }}
              />
              <YAxis
                dataKey="y" name="Flight" unit="%" type="number" domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#8C8C8C' }}
              />
              <Tooltip
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload as ScatterDatum;
                  return (
                    <div className="hrms-card" style={{ padding: '0.8rem', fontSize: 'var(--text-fs-12)' }}>
                      <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                        {d.name}
                      </p>
                      <p style={{ margin: 0, color: 'var(--color-neutral-7)' }}>Burnout: {d.x}%</p>
                      <p style={{ margin: 0, color: 'var(--color-neutral-7)' }}>Flight:  {d.y}%</p>
                      <p style={{ margin: 0, color: 'var(--color-neutral-7)' }}>Headcount: {d.z}</p>
                    </div>
                  );
                }}
              />
              <Scatter data={scatter}>
                {scatter.map((e, i) => (
                  <Cell
                    key={i}
                    fill={
                      e.x >= 60 || e.y >= 60 ? '#EE0000'
                      : e.x >= 40 || e.y >= 40 ? '#FFA500'
                      : '#0E883F'
                    }
                    fillOpacity={0.85}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Department leaderboard */}
        <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '1rem 1.6rem',
            borderBottom: '1px solid var(--color-stroke)',
            background: 'var(--color-neutral-2)',
          }}>
            <h3 className="hrms-section-label" style={{ margin: 0 }}>Department Risk Leaderboard</h3>
          </div>
          {(data?.departmentMetrics ?? [])
            .slice()
            .sort((a, b) => b.avgBurnoutRisk - a.avgBurnoutRisk)
            .map((d, i) => (
              <div
                key={i}
                style={{
                  padding: '1rem 1.6rem',
                  borderBottom: '1px solid var(--color-neutral-4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>
                    {d.department}
                  </span>
                  <span style={{ color: 'var(--color-neutral-7)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                    {d.headcount} employees
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <RiskBar score={d.avgBurnoutRisk} label="Burnout" size="sm" />
                  <RiskBar score={d.avgFlightRisk}  label="Flight"  size="sm" />
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
