'use client';

import { useEffect, useState } from 'react';
import { StatusBadge }       from '@/components/ui/Badge';
import { Play, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

interface PayrollRun {
  _id:               string;
  runCode:           string;
  payPeriodMonth:    number;
  payPeriodYear:     number;
  runStatus:         string;
  currencyCode:      string;
  employeeCount:     number;
  criticalFlagCount: number;
}

const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function PayrollPage() {
  const [runs,    setRuns]    = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/payroll')
      .then((r) => r.json())
      .then((d) => setRuns(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRun = async () => {
    setRunning(true);
    const now = new Date();
    await fetch('/api/payroll', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear() }),
    });
    load();
    setRunning(false);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{
            margin: 0, color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-20)',
          }}>
            Payroll Console
          </h2>
          <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Agentic audit pipeline · cryptographically signed totals · critical-flag gating.
          </p>
        </div>
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
        <button onClick={handleRun} disabled={running} className="hrms-btn-primary">
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {running ? 'Processing…' : 'Run Current Month'}
        </button>
      </div>

      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
          <thead>
            <tr>
              {['Period','Run Code','Employees','Currency','Flags','Status'].map((h) => (
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
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-neutral-7)' }}>
                  No payroll runs yet. Click <strong>Run Current Month</strong> to create one.
                </td>
              </tr>
            ) : runs.map((r) => (
              <tr key={r._id}>
                <td className="hrms-td" style={{ color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                  {MONTHS[r.payPeriodMonth]} {r.payPeriodYear}
                </td>
                <td className="hrms-td" style={{ fontFamily: 'monospace', color: 'var(--color-neutral-7)', fontSize: 10 }}>
                  {r.runCode}
                </td>
                <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {r.employeeCount}
                </td>
                <td className="hrms-td" style={{ fontFamily: 'monospace' }}>
                  {r.currencyCode}
                </td>
                <td className="hrms-td">
                  {r.criticalFlagCount > 0 ? (
                    <span className="loss_pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={11} />
                      {r.criticalFlagCount}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-neutral-6)' }}>—</span>
                  )}
                </td>
                <td className="hrms-td">
                  <StatusBadge status={r.runStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
