'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, IndianRupee, Filter } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface ExpenseClaim {
  _id: string; status: string; totalClaimed: number; totalSanctioned: number;
  items: Array<{ expenseType: string; amount: number; sanctionedAmount?: number }>;
  employeeId: { employeeCode: string; firstName: string; lastName: string; jobTitle: string } | null;
  month: string; createdAt: string; rejectedReason?: string;
}

const STATUS_OPTS = [
  { value: '', label: 'All' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'manager_approved', label: 'Mgr Approved' },
  { value: 'finance_approved', label: 'Finance Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'paid', label: 'Paid' },
];

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  draft:             { bg: '#F5F5F5', fg: 'var(--color-neutral-7)' },
  submitted:         { bg: '#E8EEF5', fg: 'var(--color-vr-blue-6)' },
  manager_approved:  { bg: '#FFF3CD', fg: '#856404' },
  finance_approved:  { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)' },
  rejected:          { bg: 'var(--color-semantics-red-1)',   fg: 'var(--color-semantics-red-6)' },
  paid:              { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)' },
};

export default function ExpensesPage() {
  const toast = useToast();
  const [claims,  setClaims]  = useState<ExpenseClaim[]>([]);
  const [status,  setStatus]  = useState('submitted');
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/expenses?status=${status}&limit=50`);
    const json = await res.json();
    setClaims(json.data ?? []);
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: string, reason?: string) => {
    setActing(id);
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    });
    setActing(null);
    if (res.ok) {
      toast.push({ kind: 'success', title: `Claim ${action.replace(/_/g, ' ')}` });
      load();
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: j.error ?? 'Action failed' });
    }
  };

  const totalPending = claims.filter((c) => c.status === 'submitted').reduce((s, c) => s + c.totalClaimed, 0);

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>Expense Claims</h2>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            {claims.length} claims · ₹{totalPending.toLocaleString('en-IN')} pending approval
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <Filter size={14} style={{ color: 'var(--color-neutral-7)' }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="hrms-input" style={{ width: 180 }}>
            {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="hrms-card" style={{ padding: '1.6rem', width: 420 }}>
            <h3 style={{ margin: '0 0 1rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>Reject Claim</h3>
            <textarea value={rejectModal.reason} onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              className="hrms-input" rows={3} placeholder="Reason for rejection…" style={{ width: '100%', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectModal(null)} className="hrms-btn-ghost">Cancel</button>
              <button onClick={() => { act(rejectModal.id, 'reject', rejectModal.reason); setRejectModal(null); }} className="hrms-btn-primary" style={{ background: 'var(--color-semantics-red-6)' }}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hrms-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Employee', 'Month', 'Items', 'Claimed', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="hrms-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>No claims found</td></tr>
              )}
              {claims.map((c) => {
                const s  = STATUS_STYLE[c.status] ?? STATUS_STYLE['draft']!;
                const em = c.employeeId;
                return (
                  <tr key={c._id} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                    <td className="hrms-td">
                      <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-10)' }}>
                        {em ? `${em.firstName} ${em.lastName}` : '—'}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-neutral-7)' }}>{em?.employeeCode}</p>
                    </td>
                    <td className="hrms-td">{c.month || '—'}</td>
                    <td className="hrms-td">{c.items.length}</td>
                    <td className="hrms-td" style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>₹{c.totalClaimed.toLocaleString('en-IN')}</td>
                    <td className="hrms-td">
                      <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: s.bg, color: s.fg, fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="hrms-td">
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {c.status === 'submitted' && (
                          <button onClick={() => act(c._id, 'manager_approve')} disabled={acting === c._id} className="hrms-btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: 11 }}>
                            {acting === c._id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />} Approve
                          </button>
                        )}
                        {c.status === 'manager_approved' && (
                          <button onClick={() => act(c._id, 'finance_approve')} disabled={acting === c._id} className="hrms-btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: 11 }}>
                            {acting === c._id ? <Loader2 size={11} className="animate-spin" /> : <IndianRupee size={11} />} Finance OK
                          </button>
                        )}
                        {c.status === 'finance_approved' && (
                          <button onClick={() => act(c._id, 'mark_paid')} disabled={acting === c._id} className="hrms-btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: 11 }}>Mark Paid</button>
                        )}
                        {['submitted','manager_approved'].includes(c.status) && (
                          <button onClick={() => setRejectModal({ id: c._id, reason: '' })} className="hrms-btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: 11, color: 'var(--color-semantics-red-6)' }}>
                            <XCircle size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
