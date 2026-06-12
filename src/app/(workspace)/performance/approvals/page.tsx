'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeDollarSign, Loader2, RefreshCw, Check, X, Star, ArrowUpRight, ShieldCheck, ShieldAlert, GitBranch } from 'lucide-react';
import { EmptyState }  from '@/components/ui/EmptyState';

interface ApprovalStep { step: string; status: string; approverId?: string }
interface PendingRow {
  _id: string; employeeCode: string; jobTitle?: string; departmentName?: string;
  cycleLabel: string; overallRating?: number;
  compensation: {
    incrementPct: number; promotion: boolean; proposedTitle?: string; proposedBand?: string;
    justification?: string; decision: string; recommendedByManager?: boolean;
    recommenderRelationship?: string; recommendedById?: string;
    requiresTwoStep?: boolean; currentStep?: string | null; skipLevelManagerId?: string;
    approvals?: ApprovalStep[];
  };
}

export default function CompApprovalsPage() {
  const router = useRouter();
  const [rows, setRows]       = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole]       = useState('');
  const [userId, setUserId]   = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [acting, setActing]   = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [note, setNote]       = useState('');

  // Whether the current user may act on THIS row's current step.
  const canActOn = (c: PendingRow['compensation']): boolean => {
    if (c.recommendedById && c.recommendedById === userId) return false;   // SoD: not your own rec
    const step = c.requiresTwoStep ? c.currentStep : 'hr';
    if (step === 'skip_level') {
      const isSkipMgr = !!(employeeId && c.skipLevelManagerId && c.skipLevelManagerId === employeeId);
      return isSkipMgr || role === 'super_admin';
    }
    // HR sign-off
    if (role !== 'hr_admin' && role !== 'super_admin') return false;
    const skipApprover = c.requiresTwoStep ? c.approvals?.[0]?.approverId : undefined;
    return !(skipApprover && skipApprover === userId);
  };

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/performance?compDecision=pending&limit=100')
      .then((r) => r.json())
      .then((d) => setRows(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      setRole(d.user?.role ?? ''); setUserId(d.user?.userId ?? ''); setEmployeeId(d.user?.employeeId ?? '');
    }).catch(() => {});
    load();
  }, [load]);

  const decide = async (id: string, action: 'accept' | 'reject', noteText?: string) => {
    setActing(id + action);
    const res = await fetch(`/api/performance/${id}/compensation`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, note: noteText }),
    });
    setActing(null);
    setRejectFor(null);
    setNote('');
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Action failed');
      return;
    }
    load();
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <BadgeDollarSign size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            Compensation Approvals
          </h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Manager pay recommendations awaiting sign-off. Accepting applies the revision to the next payroll run.
          </p>
        </div>
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}><RefreshCw size={13} /></button>
      </div>

      <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', borderRadius: '0.8rem', background: 'var(--color-vr-blue-1)', border: '1px solid var(--color-vr-blue-2)', fontSize: 'var(--text-fs-12)', color: 'var(--color-vr-blue-8)' }}>
        Promotions and increments above {10}% require two-step approval: the employee&apos;s <strong>skip-level manager</strong> endorses first, then a different <strong>HR approver</strong> signs off. You only see action buttons on steps you&apos;re authorised to decide.
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={BadgeDollarSign} title="Nothing to approve" message="Compensation recommendations from finalized reviews will appear here." />
      ) : (
        <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>{['Employee', 'Cycle', 'Rating', 'Recommendation', 'Source', 'Stage', 'Actions'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td className="hrms-td" onClick={() => router.push(`/performance/${r._id}`)} style={{ cursor: 'pointer' }}>
                    <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{r.employeeCode}</p>
                    <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>{r.jobTitle ?? ''}</p>
                  </td>
                  <td className="hrms-td">{r.cycleLabel}</td>
                  <td className="hrms-td">
                    {typeof r.overallRating === 'number'
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}><Star size={11} style={{ color: 'var(--color-semantics-orange-7)' }} fill="currentColor" />{r.overallRating}</span>
                      : '—'}
                  </td>
                  <td className="hrms-td">
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-semantics-green-7)' }}>+{r.compensation.incrementPct}%</span>
                    {r.compensation.promotion && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8, color: 'var(--color-vr-blue-7)', fontWeight: 600 }}>
                        <ArrowUpRight size={11} /> {r.compensation.proposedTitle ?? 'Promotion'}{r.compensation.proposedBand ? ` (${r.compensation.proposedBand})` : ''}
                      </span>
                    )}
                  </td>
                  <td className="hrms-td">
                    {r.compensation.recommendedByManager ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-semantics-green-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 11 }}>
                        <ShieldCheck size={12} /> Line manager
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-semantics-orange-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 11 }} title="Not from the employee's line manager — review with extra scrutiny.">
                        <ShieldAlert size={12} /> Not line mgr
                      </span>
                    )}
                  </td>
                  <td className="hrms-td">
                    {r.compensation.requiresTwoStep ? (
                      r.compensation.currentStep === 'skip_level'
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-semantics-orange-7)', fontWeight: 600, fontSize: 11 }}><GitBranch size={11} /> Step 1 · Skip-level</span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-vr-blue-7)', fontWeight: 600, fontSize: 11 }}><GitBranch size={11} /> Step 2 · HR sign-off</span>
                    ) : (
                      <span style={{ color: 'var(--color-neutral-7)', fontSize: 11 }}>HR sign-off</span>
                    )}
                  </td>
                  <td className="hrms-td">
                    {!canActOn(r.compensation) ? (
                      <span style={{ color: 'var(--color-neutral-6)', fontSize: 10 }} title="Awaiting another approver for the current step.">
                        Awaiting {r.compensation.requiresTwoStep && r.compensation.currentStep === 'skip_level' ? 'skip-level mgr' : 'HR'}
                      </span>
                    ) : rejectFor === r._id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                        <input className="hrms-input" placeholder="Reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => decide(r._id, 'reject', note)} disabled={!!acting} className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: 10, color: 'var(--color-semantics-red-6)', borderColor: 'var(--color-semantics-red-2)' }}>
                            {acting === r._id + 'reject' ? <Loader2 size={10} className="animate-spin" /> : 'Confirm reject'}
                          </button>
                          <button onClick={() => { setRejectFor(null); setNote(''); }} className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: 10 }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => decide(r._id, 'accept')} disabled={!!acting} className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: 10, color: 'var(--color-semantics-green-7)', borderColor: 'var(--color-semantics-green-3)' }}>
                          {acting === r._id + 'accept' ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} {r.compensation.requiresTwoStep && r.compensation.currentStep === 'skip_level' ? 'Endorse' : 'Approve'}
                        </button>
                        <button onClick={() => { setRejectFor(r._id); setNote(''); }} disabled={!!acting} className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: 10, color: 'var(--color-semantics-red-6)', borderColor: 'var(--color-semantics-red-2)' }}>
                          <X size={10} /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
