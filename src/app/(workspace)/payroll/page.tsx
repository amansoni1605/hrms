'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatusBadge, Badge }  from '@/components/ui/Badge';
import { EmptyState }          from '@/components/ui/EmptyState';
import { useSession }          from '@/hooks/useSession';
import { formatCurrency }      from '@/lib/format';
import {
  Play, Loader2, AlertTriangle, RefreshCw,
  ChevronRight, X, CheckCircle, RotateCcw,
  DollarSign, Download, FileText,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PayrollRun {
  _id:               string;
  runCode:           string;
  payPeriodMonth:    number;
  payPeriodYear:     number;
  runStatus:         string;
  currencyCode:      string;
  employeeCount:     number;
  criticalFlagCount: number;
  createdAt:         string;
}

interface AuditFlag {
  flagId:        string;
  severity:      'critical' | 'warning' | 'informational';
  checkCode:     string;
  statutoryRef?: string;
  affectedCount: number;
  description:   string;
  remediation?:  string;
  isBlocking:    boolean;
  resolvedAt?:   string;
}

interface LineItemSummary {
  employeeId:    string;
  employeeCode:  string;
  currencyCode:  string;
  varianceFlag:  boolean;
  varianceNotes?: string;
  lineHash?:     string;
}

interface RunDetail {
  _id:             string;
  runCode:         string;
  payPeriodMonth:  number;
  payPeriodYear:   number;
  runStatus:       string;
  employeeCount:   number;
  currencyCode:    string;
  criticalFlagCount: number;
  auditFlags:      AuditFlag[];
  approvedById?:   string;
  approvedAt?:     string;
  lineItemsSummary: LineItemSummary[];
}

interface MyPayslip {
  _id:          string;
  runCode:      string;
  month:        number;
  year:         number;
  currencyCode: string;
  status:       string;
}

const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const FLAG_COLOR: Record<string, string> = {
  critical:     'var(--color-semantics-red-6)',
  warning:      'var(--color-semantics-amber-6)',
  informational:'var(--color-vr-blue-6)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Run Detail Drawer
// ─────────────────────────────────────────────────────────────────────────────

function RunDetailDrawer({
  runId,
  onClose,
  onRefresh,
}: {
  runId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [detail,  setDetail]  = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/payroll/${runId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.data ?? null))
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => { load(); }, [load]);

  const action = async (act: 'approve' | 'reverse' | 'mark_audit_passed') => {
    setActing(act);
    await fetch(`/api/payroll/${runId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: act }),
    });
    load();
    onRefresh();
    setActing(null);
  };

  const variantMap = (s: string) =>
    s === 'critical' ? 'danger' : s === 'warning' ? 'warning' : 'info';

  const varianceItems = detail?.lineItemsSummary.filter((l) => l.varianceFlag) ?? [];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.35)' }} />

      {/* Panel */}
      <div style={{
        width: 540, background: 'var(--color-neutral-1)',
        borderLeft: '1px solid var(--color-stroke)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.8rem',
          padding: '1.2rem 1.6rem',
          borderBottom: '1px solid var(--color-neutral-4)',
          position: 'sticky', top: 0,
          background: 'var(--color-neutral-1)', zIndex: 1,
        }}>
          <FileText size={16} style={{ color: 'var(--color-vr-blue-6)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>
              {detail ? `${MONTHS[detail.payPeriodMonth]} ${detail.payPeriodYear}` : 'Loading…'}
            </p>
            {detail && (
              <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-5)', fontFamily: 'monospace' }}>
                {detail.runCode}
              </p>
            )}
          </div>
          {detail && <StatusBadge status={detail.runStatus} />}
          <button onClick={onClose} className="hrms-btn-ghost" style={{ padding: '0.4rem' }}>
            <X size={14} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
          </div>
        ) : !detail ? (
          <p style={{ padding: '2rem', color: 'var(--color-neutral-7)' }}>Failed to load run details.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem', padding: '1.4rem 1.6rem' }}>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
              {[
                { label: 'Employees',   value: detail.employeeCount },
                { label: 'Currency',    value: detail.currencyCode },
                { label: 'Critical flags', value: detail.criticalFlagCount || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="hrms-card" style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                  <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: detail.criticalFlagCount > 0 && label === 'Critical flags' ? 'var(--color-semantics-red-6)' : 'var(--color-neutral-10)' }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/* Audit Flags */}
            {detail.auditFlags.length > 0 && (
              <div>
                <h3 className="hrms-section-label" style={{ marginBottom: '0.8rem' }}>Audit Flags</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {detail.auditFlags.map((f) => (
                    <div key={f.flagId} className="hrms-card" style={{
                      padding: '0.9rem 1rem',
                      borderLeft: `3px solid ${FLAG_COLOR[f.severity]}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4 }}>
                        <Badge variant={variantMap(f.severity) as 'danger' | 'warning' | 'info'}>
                          {f.severity}
                        </Badge>
                        <code style={{ fontSize: 10, color: 'var(--color-neutral-6)' }}>{f.checkCode}</code>
                        {f.isBlocking && (
                          <Badge variant="danger" dot>blocking</Badge>
                        )}
                        {f.resolvedAt && (
                          <Badge variant="success" dot>resolved</Badge>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-9)' }}>
                        {f.description}
                      </p>
                      {f.statutoryRef && (
                        <p style={{ margin: '3px 0 0', fontSize: 10, color: 'var(--color-neutral-5)' }}>
                          Ref: {f.statutoryRef}
                        </p>
                      )}
                      {f.remediation && (
                        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-semantics-amber-8)', fontStyle: 'italic' }}>
                          {f.remediation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Variance Flags */}
            {varianceItems.length > 0 && (
              <div>
                <h3 className="hrms-section-label" style={{ marginBottom: '0.8rem' }}>
                  Variance Flags <span style={{ color: 'var(--color-semantics-amber-6)' }}>({varianceItems.length})</span>
                </h3>
                <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {varianceItems.map((li, i) => (
                    <div key={li.employeeId} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.8rem',
                      padding: '0.8rem 1rem',
                      borderBottom: i < varianceItems.length - 1 ? '1px solid var(--color-neutral-4)' : undefined,
                      borderLeft: '3px solid var(--color-semantics-amber-6)',
                    }}>
                      <AlertTriangle size={13} style={{ color: 'var(--color-semantics-amber-6)', flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-10)' }}>
                          {li.employeeCode}
                        </p>
                        {li.varianceNotes && (
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-neutral-7)' }}>
                            {li.varianceNotes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All employees (no variance) */}
            {varianceItems.length === 0 && detail.lineItemsSummary.length > 0 && (
              <p style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)', textAlign: 'center', padding: '0.5rem' }}>
                <CheckCircle size={12} style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--color-semantics-green-7)' }} />
                No variance flags — all {detail.lineItemsSummary.length} line items look clean.
              </p>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingTop: '0.4rem' }}>
              {detail.runStatus === 'draft' && (
                <button
                  onClick={() => action('mark_audit_passed')}
                  disabled={!!acting}
                  className="hrms-btn-ghost"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {acting === 'mark_audit_passed' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                  Mark Audit Passed
                </button>
              )}
              {detail.runStatus === 'audit_passed' && (
                <button
                  onClick={() => action('approve')}
                  disabled={!!acting || detail.criticalFlagCount > 0}
                  className="hrms-btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {acting === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                  Approve Run
                </button>
              )}
              {(detail.runStatus === 'approved' || detail.runStatus === 'paid') && (
                <button
                  onClick={() => action('reverse')}
                  disabled={!!acting}
                  className="hrms-btn-ghost"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--color-semantics-red-6)' }}
                >
                  {acting === 'reverse' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Reverse Run
                </button>
              )}
            </div>

            {detail.criticalFlagCount > 0 && detail.runStatus === 'audit_passed' && (
              <p style={{ fontSize: 11, color: 'var(--color-semantics-red-6)', textAlign: 'center', marginTop: -8 }}>
                Resolve {detail.criticalFlagCount} critical flag{detail.criticalFlagCount > 1 ? 's' : ''} before approving.
              </p>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee self-service "My Payslips" view
// ─────────────────────────────────────────────────────────────────────────────

function MyPayslipsView() {
  const [slips,   setSlips]   = useState<MyPayslip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me/payroll')
      .then((r) => r.json())
      .then((d) => setSlips(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
    </div>
  );

  if (slips.length === 0) return (
    <EmptyState icon={DollarSign} title="No payslips yet"
      message="Your payslips will appear here once payroll is processed." />
  );

  const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
    paid: 'success', approved: 'info', processing: 'warning',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {slips.map((s) => (
        <div key={s._id} className="hrms-card" style={{
          display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.4rem',
        }}>
          <DollarSign size={16} style={{ color: 'var(--color-vr-blue-6)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
              {MONTHS[s.month]} {s.year}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-5)', fontFamily: 'monospace' }}>
              {s.runCode}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[s.status] ?? 'neutral'}>
            {s.status.replace(/_/g, ' ')}
          </Badge>
          <a
            href={`/api/payroll/payslip?runId=${s._id}`}
            download={`payslip-${MONTHS[s.month]}-${s.year}.pdf`}
            className="hrms-btn-ghost"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-fs-12)', padding: '0.4rem 0.8rem' }}
          >
            <Download size={12} /> PDF
          </a>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HR Payroll Console
// ─────────────────────────────────────────────────────────────────────────────

function PayrollConsole() {
  const [runs,      setRuns]      = useState<PayrollRun[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [running,   setRunning]   = useState(false);
  const [activeRun, setActiveRun] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/payroll')
      .then((r) => r.json())
      .then((d) => setRuns(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRun = async () => {
    setRunning(true);
    const now = new Date();
    const res = await fetch('/api/payroll', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear() }),
    });
    const json = await res.json();
    load();
    setRunning(false);
    if (json.data?.runId) setActiveRun(json.data.runId);
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            Payroll Console
          </h2>
          <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Agentic audit pipeline · cryptographically signed totals · critical-flag gating.
          </p>
        </div>
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
        <button onClick={handleRun} disabled={running} className="hrms-btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {running ? 'Processing…' : 'Run Current Month'}
        </button>
      </div>

      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
          <thead>
            <tr>
              {['Period','Run Code','Employees','Currency','Variance','Flags','Status',''].map((h) => (
                <th key={h} className="hrms-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-neutral-7)' }}>
                  No payroll runs yet. Click <strong>Run Current Month</strong> to create one.
                </td>
              </tr>
            ) : runs.map((r) => (
              <tr key={r._id}
                onClick={() => setActiveRun(r._id)}
                style={{ cursor: 'pointer', transition: 'background 100ms' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-3)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
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
                  {/* Variance flags shown in detail — just an indicator here */}
                  <span style={{ color: 'var(--color-neutral-5)', fontSize: 10 }}>view →</span>
                </td>
                <td className="hrms-td">
                  {r.criticalFlagCount > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-semantics-red-6)', fontWeight: 600 }}>
                      <AlertTriangle size={11} />
                      {r.criticalFlagCount}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-semantics-green-7)' }}>
                      <CheckCircle size={12} />
                    </span>
                  )}
                </td>
                <td className="hrms-td">
                  <StatusBadge status={r.runStatus} />
                </td>
                <td className="hrms-td">
                  <ChevronRight size={13} style={{ color: 'var(--color-neutral-6)' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeRun && (
        <RunDetailDrawer
          runId={activeRun}
          onClose={() => setActiveRun(null)}
          onRefresh={load}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root — role-aware routing between HR console and employee self-service
// ─────────────────────────────────────────────────────────────────────────────

const HR_ROLES = new Set(['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'finance_auditor']);

export default function PayrollPage() {
  const { session, loading } = useSession();

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
      <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
    </div>
  );

  const isHR = HR_ROLES.has(session?.role ?? '');

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      {isHR ? <PayrollConsole /> : (
        <>
          <div style={{ marginBottom: '1.4rem' }}>
            <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
              My Payslips
            </h2>
            <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
              Your payroll history. Download PDFs for tax filing.
            </p>
          </div>
          <MyPayslipsView />
        </>
      )}
    </div>
  );
}
