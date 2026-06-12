'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { RiskBar }     from '@/components/ui/RiskBar';

interface Department {
  _id: string;
  name: string;
  code: string;
  costCenterCode?: string;
  liveHeadcount: number;
  avgBurnoutRisk: number;
  isActive: boolean;
}

export default function DepartmentsPage() {
  const [depts,   setDepts]   = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/ws/departments')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else { setDepts(d.data ?? []); setError(''); }
      })
      .catch(() => setError('Failed to load departments'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
        <Building2 size={16} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{
            margin: 0, color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-20)',
          }}>
            Departments
          </h2>
          <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Live headcount and aggregated burnout risk per cost-center.
          </p>
        </div>
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {error && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.8rem 1rem', marginBottom: '1rem', borderRadius: '0.8rem',
            background: 'var(--color-semantics-red-1)',
            color: 'var(--color-semantics-red-7)',
            border: '1px solid var(--color-semantics-red-2)',
            fontSize: 'var(--text-fs-12)',
          }}
        >
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
          <thead>
            <tr>
              {['Department','Code','Cost Center','Headcount','Burnout Risk','Status'].map((h) => (
                <th key={h} className="hrms-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
                </td>
              </tr>
            ) : depts.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-neutral-7)' }}>
                  No departments found. POST /api/seed to populate.
                </td>
              </tr>
            ) : depts.map((d) => (
              <tr key={d._id}>
                <td className="hrms-td">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 24, height: 24, borderRadius: '0.6rem',
                        background: 'var(--color-vr-blue-1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Building2 size={12} style={{ color: 'var(--color-vr-blue-6)' }} />
                    </div>
                    <span style={{
                      color: 'var(--color-neutral-10)',
                      fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                    }}>
                      {d.name}
                    </span>
                  </div>
                </td>
                <td className="hrms-td" style={{ fontFamily: 'monospace', color: 'var(--color-neutral-7)' }}>
                  {d.code}
                </td>
                <td className="hrms-td" style={{ color: 'var(--color-neutral-7)' }}>
                  {d.costCenterCode ?? '—'}
                </td>
                <td className="hrms-td">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-neutral-10)' }}>
                    <Users size={11} style={{ color: 'var(--color-neutral-6)' }} />
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {d.liveHeadcount}
                    </span>
                  </span>
                </td>
                <td className="hrms-td" style={{ minWidth: 160 }}>
                  <RiskBar score={d.avgBurnoutRisk} size="sm" />
                </td>
                <td className="hrms-td">
                  <StatusBadge status={d.isActive ? 'active' : 'cancelled'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && depts.length > 0 && (
        <p style={{
          textAlign: 'right', marginTop: '0.8rem',
          color: 'var(--color-neutral-7)', fontSize: 10,
        }}>
          {depts.length} departments · headcount pulled live from employee records
        </p>
      )}
    </div>
  );
}
