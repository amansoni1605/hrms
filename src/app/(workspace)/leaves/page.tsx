'use client';

import { useEffect, useState } from 'react';
import { StatusBadge }         from '@/components/ui/Badge';
import { formatDate }          from '@/lib/utils';
import { CheckCircle, XCircle, Loader2, RefreshCw, MessageSquare, X } from 'lucide-react';
import { useToast }            from '@/components/ui/Toast';

interface Leave {
  _id: string; leaveType: string; startDate: string; endDate: string;
  totalDays: number; reason: string; status: string;
  employeeId?: { _id: string; employeeCode: string; jobTitle: string } | null;
  rejectionReason?: string;
}

const STATUS_TABS = [
  { value: 'pending',  label: '⏳ Pending'  },
  { value: 'approved', label: '✓ Approved' },
  { value: 'rejected', label: '✗ Rejected' },
  { value: '',         label: 'All'        },
];

export default function LeavesPage() {
  const toast                       = useToast();
  const [leaves,  setLeaves]        = useState<Leave[]>([]);
  const [loading, setLoading]       = useState(true);
  const [statusF, setStatusF]       = useState('pending');
  const [acting,  setActing]        = useState<string | null>(null);
  const [total,   setTotal]         = useState(0);

  // Rejection modal state
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting,    setRejecting]    = useState(false);

  const load = (s = statusF) => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '40', ...(s ? { status: s } : {}) });
    fetch(`/api/leaves?${p}`)
      .then((r) => r.json())
      .then((d) => { setLeaves(d.data ?? []); setTotal(d.pagination?.total ?? 0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(statusF); }, [statusF]);

  const act = async (id: string, action: string, reason?: string) => {
    setActing(id + action);
    const res = await fetch(`/api/leaves/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, rejectionReason: reason }),
    });
    setActing(null);
    const json = await res.json();
    if (!res.ok) {
      toast.push({ kind: 'error', title: json.error ?? 'Action failed' });
    } else {
      const msg = action === 'approve' ? 'Leave approved' : action === 'reject' ? 'Leave rejected' : 'Done';
      toast.push({ kind: 'success', title: msg });
    }
    load(statusF);
  };

  const openRejectModal = (id: string) => { setRejectTarget(id); setRejectReason(''); };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    await act(rejectTarget, 'reject', rejectReason || undefined);
    setRejecting(false);
    setRejectTarget(null);
  };

  const isPendingApproval = (status: string) => status === 'pending';

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <h2 style={{
              margin: 0, color: 'var(--color-neutral-10)',
              fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
              fontSize: 'var(--text-fs-20)',
            }}>
              Leave Management
            </h2>
            {statusF === 'pending' && total > 0 && (
              <span style={{
                padding: '0.2rem 0.8rem', borderRadius: 99,
                background: '#FFF6E6', border: '1px solid #FFD891',
                color: 'var(--color-semantics-orange-7)',
                fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700,
              }}>
                {total} awaiting approval
              </span>
            )}
          </div>
          <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            {statusF === 'pending'
              ? 'Pending leave requests — manager or HR can approve directly.'
              : 'Review, approve, and audit every leave request.'}
          </p>
        </div>

        {/* Status filter tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--color-neutral-3)', padding: 3, borderRadius: '0.8rem', flexWrap: 'wrap' }}>
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusF(value)}
              style={{
                padding: '0.4rem 1rem', borderRadius: '0.6rem', border: 'none',
                cursor: 'pointer', fontSize: 'var(--text-fs-12)',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                background: statusF === value ? 'var(--color-neutral-1)' : 'transparent',
                color:      statusF === value ? 'var(--color-neutral-10)' : 'var(--color-neutral-7)',
                boxShadow:  statusF === value ? 'var(--shadow-card)' : 'none',
                transition: 'all 120ms ease',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button onClick={() => load(statusF)} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Approval flow info banner */}
      <div style={{
        marginBottom: '1.2rem', padding: '0.8rem 1.2rem', borderRadius: '0.8rem',
        background: 'var(--color-vr-blue-1)', border: '1px solid var(--color-vr-blue-2)',
        display: 'flex', alignItems: 'center', gap: '0.8rem',
        fontSize: 'var(--text-fs-12)', color: 'var(--color-vr-blue-8)',
      }}>
        <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>Approval flow:</span>
        <span>Employee applies → Manager OR HR can approve directly → Approved</span>
      </div>

      {/* Table */}
      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
          <thead>
            <tr>
              {['Employee', 'Type', 'Period', 'Days', 'Status', 'Reason', 'Actions'].map((h) => (
                <th key={h} className="hrms-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
                </td>
              </tr>
            ) : leaves.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                  <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-14)' }}>
                    {isPendingApproval(statusF) ? '✓ All caught up — no pending requests' : 'No requests found'}
                  </p>
                  <p style={{ margin: '0.4rem 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                    {isPendingApproval(statusF)
                      ? 'New leave requests will appear here for your review.'
                      : 'Try a different status filter above.'}
                  </p>
                </td>
              </tr>
            ) : leaves.map((l) => (
              <tr key={l._id}>
                <td className="hrms-td">
                  <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                    {l.employeeId?.employeeCode ?? '—'}
                  </p>
                  <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                    {l.employeeId?.jobTitle ?? ''}
                  </p>
                </td>
                <td className="hrms-td" style={{ textTransform: 'capitalize' }}>
                  {l.leaveType.replace('_', ' ')}
                </td>
                <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatDate(l.startDate)} → {formatDate(l.endDate)}
                </td>
                <td className="hrms-td" style={{
                  textAlign: 'center',
                  fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {l.totalDays}
                </td>
                <td className="hrms-td"><StatusBadge status={l.status} /></td>
                <td className="hrms-td" style={{ maxWidth: 200, color: 'var(--color-neutral-7)', fontSize: 11 }}>
                  {l.rejectionReason
                    ? <span style={{ color: 'var(--color-semantics-red-6)' }}>{l.rejectionReason}</span>
                    : l.reason
                      ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 160 }}>{l.reason}</span>
                      : '—'}
                </td>
                <td className="hrms-td">
                  {isPendingApproval(l.status) ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => act(l._id, 'approve')}
                        disabled={!!acting}
                        className="hrms-btn-ghost"
                        style={{
                          padding: '0.4rem 0.8rem', fontSize: 10,
                          color: 'var(--color-semantics-green-7)',
                          borderColor: 'var(--color-semantics-green-3)',
                        }}
                      >
                        {acting === l._id + 'approve'
                          ? <Loader2 size={10} className="animate-spin" />
                          : <CheckCircle size={10} />}
                        Approve
                      </button>
                      <button
                        onClick={() => openRejectModal(l._id)}
                        disabled={!!acting}
                        className="hrms-btn-ghost"
                        style={{
                          padding: '0.4rem 0.8rem', fontSize: 10,
                          color: 'var(--color-semantics-red-6)',
                          borderColor: 'var(--color-semantics-red-2)',
                        }}
                      >
                        <XCircle size={10} /> Reject
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-neutral-6)', fontSize: 10 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reject modal */}
      {rejectTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }} onClick={() => setRejectTarget(null)}>
          <div style={{
            background: 'var(--color-neutral-1)', borderRadius: '1.2rem',
            padding: '2rem', width: '100%', maxWidth: 440,
            boxShadow: 'var(--shadow-dialog)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.4rem' }}>
              <MessageSquare size={18} style={{ color: 'var(--color-semantics-red-6)' }} />
              <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' }}>
                Reject Leave Request
              </h3>
              <button onClick={() => setRejectTarget(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-6)' }}>
                <X size={16} />
              </button>
            </div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-8)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
              Rejection reason (shown to employee)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Insufficient notice period. Please reapply with at least 3 days notice."
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '0.8rem', borderRadius: '0.8rem',
                border: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)',
                fontSize: 'var(--text-fs-12)', fontFamily: 'inherit', resize: 'vertical',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '1.2rem' }}>
              <button onClick={() => setRejectTarget(null)} className="hrms-btn-ghost">Cancel</button>
              <button
                onClick={submitReject}
                disabled={rejecting}
                className="hrms-btn-primary"
                style={{ background: 'var(--color-semantics-red-6)', borderColor: 'var(--color-semantics-red-6)' }}
              >
                {rejecting ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Reject Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
