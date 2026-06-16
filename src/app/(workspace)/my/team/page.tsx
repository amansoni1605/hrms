'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UsersRound, Loader2, Star, ChevronRight, AlertTriangle, ClipboardCheck,
  BadgeDollarSign, TrendingUp, Users, UserCheck, CalendarDays, MapPin,
  CalendarClock, CheckCircle, XCircle, MessageSquare, X,
} from 'lucide-react';
import { StatCard }           from '@/components/ui/StatCard';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { RiskBar }            from '@/components/ui/RiskBar';
import { EmptyState }         from '@/components/ui/EmptyState';
import { useToast }           from '@/components/ui/Toast';

interface Review { _id: string; cycleLabel: string; status: string; overallRating?: number }
interface ReportRow {
  _id: string; employeeCode: string; fullName: string;
  jobTitle: string; departmentName: string;
  employeeStatus: string; employmentType: string;
  burnoutRiskScore: number; flightRiskScore: number; engagementPct: number | null;
  managerName: string | null;
  review: Review | null;
  actionNeeded: string | null;
}
interface JoinerRow {
  _id: string; employeeCode: string; jobTitle: string; departmentName: string;
  hireDate: string; countryCode: string; employmentType: string;
}
interface TeamData {
  isManager: boolean; teamSize: number;
  directReports: ReportRow[]; skipLevelReports: ReportRow[];
  upcomingJoiners: JoinerRow[];
  kpis: { teamSize: number; extendedTeamSize: number; avgEngagement: number | null; atRiskCount: number; reviewsToFinalize: number; pendingEndorsements: number } | null;
  actions: Array<{ type: string; label: string; reviewId?: string; employeeCode: string }>;
}

interface PendingLeave {
  _id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  employeeId: { _id: string; employeeCode: string; jobTitle: string; departmentName: string } | null;
}

function LeaveApprovalsCard() {
  const toast = useToast();
  const [leaves,  setLeaves]  = useState<PendingLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<string | null>(null);

  // Rejection modal state
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting,    setRejecting]    = useState(false);

  const load = () => {
    fetch('/api/me/team/leave-approvals')
      .then((r) => r.json())
      .then((d) => setLeaves(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
      toast.push({ kind: 'success', title: action === 'approve' ? 'Approved — forwarded to HR for final sign-off' : 'Leave rejected' });
      load();
    }
  };

  const openRejectModal = (id: string) => { setRejectTarget(id); setRejectReason(''); };
  const submitReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    await act(rejectTarget, 'reject', rejectReason || undefined);
    setRejecting(false);
    setRejectTarget(null);
  };

  if (!loading && leaves.length === 0) return null;

  return (
    <>
      <div className="hrms-card" style={{ marginBottom: '1.4rem', overflow: 'hidden', border: '1px solid var(--color-vr-blue-2)' }}>
        <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-vr-blue-2)', background: 'var(--color-vr-blue-1)', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <CalendarClock size={15} style={{ color: 'var(--color-vr-blue-6)' }} />
          <h3 className="hrms-section-label" style={{ margin: 0, color: 'var(--color-vr-blue-7)' }}>
            Leave Approvals Pending Your Action
          </h3>
          {leaves.length > 0 && (
            <span style={{ marginLeft: 'auto', padding: '0.2rem 0.8rem', borderRadius: 99, background: '#FFF6E6', border: '1px solid #FFD891', color: 'var(--color-semantics-orange-7)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
              {leaves.length} pending
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>
                {['Employee', 'Type', 'Period', 'Days', 'Reason', 'Actions'].map((h) => (
                  <th key={h} className="hrms-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l._id}>
                  <td className="hrms-td">
                    <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>
                      {l.employeeId?.employeeCode ?? '—'}
                    </p>
                    <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                      {l.employeeId?.jobTitle ?? ''}
                    </p>
                  </td>
                  <td className="hrms-td" style={{ textTransform: 'capitalize' }}>
                    {l.leaveType.replace(/_/g, ' ')}
                  </td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {new Date(l.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {' → '}
                    {new Date(l.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="hrms-td" style={{ textAlign: 'center', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                    {l.totalDays}
                  </td>
                  <td className="hrms-td" style={{ maxWidth: 180, color: 'var(--color-neutral-7)', fontSize: 11 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 160 }}>
                      {l.reason || '—'}
                    </span>
                  </td>
                  <td className="hrms-td">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => act(l._id, 'approve')}
                        disabled={!!acting}
                        className="hrms-btn-ghost"
                        style={{ padding: '0.4rem 0.8rem', fontSize: 10, color: 'var(--color-semantics-green-7)', borderColor: 'var(--color-semantics-green-3)' }}
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
                        style={{ padding: '0.4rem 0.8rem', fontSize: 10, color: 'var(--color-semantics-red-6)', borderColor: 'var(--color-semantics-red-2)' }}
                      >
                        <XCircle size={10} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Rejection modal */}
      {rejectTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setRejectTarget(null)}>
          <div style={{ background: 'var(--color-neutral-1)', borderRadius: '1.2rem', padding: '2rem', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-dialog)' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.4rem' }}>
              <MessageSquare size={18} style={{ color: 'var(--color-semantics-red-6)' }} />
              <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' }}>Reject Leave Request</h3>
              <button onClick={() => setRejectTarget(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-6)' }}>
                <X size={16} />
              </button>
            </div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-8)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
              Reason (shown to employee)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Insufficient notice period or critical deadline that week."
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.8rem', borderRadius: '0.8rem', border: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)', fontSize: 'var(--text-fs-12)', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
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
    </>
  );
}

const ACTION_HINT: Record<string, { label: string; color: string }> = {
  finalize_review:          { label: 'Finalize review', color: 'var(--color-semantics-orange-7)' },
  awaiting_self_assessment: { label: 'Self-assessment pending', color: 'var(--color-neutral-6)' },
  awaiting_employee_ack:    { label: 'Awaiting acknowledgement', color: 'var(--color-vr-blue-7)' },
};

// ── Attendance Regularization Approvals Card ─────────────────────────────────

interface RegApprovalRow {
  _id:               string;
  employee:          { code: string; name: string; title: string };
  date:              string;
  requestedCheckIn:  string;
  requestedCheckOut?: string;
  reason:            string;
}

function AttendanceRegApprovalsCard() {
  const toast    = useToast();
  const [reqs,    setReqs]    = useState<RegApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = () => {
    fetch('/api/me/team/attendance-regularizations')
      .then((r) => r.json())
      .then((d) => setReqs(d.data ?? []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const act = async (id: string, action: 'approve' | 'reject', reason?: string) => {
    setActing(id);
    const res = await fetch(`/api/attendance/regularize/${id}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, rejectionReason: reason }),
    });
    setActing(null);
    const json = await res.json();
    if (!res.ok) {
      toast.push({ kind: 'error', title: json.error ?? 'Action failed' });
    } else {
      toast.push({ kind: 'success', title: action === 'approve' ? 'Attendance regularized' : 'Request rejected' });
      setRejectTarget(null);
      load();
    }
  };

  if (!loading && reqs.length === 0) return null;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="hrms-card" style={{ marginBottom: '1.4rem', overflow: 'hidden', border: '1px solid var(--color-semantics-amber-2)' }}>
        <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-semantics-amber-2)', background: '#FFFBF0', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <CalendarDays size={15} style={{ color: '#D98C00' }} />
          <h3 className="hrms-section-label" style={{ margin: 0, color: '#7C5000' }}>
            Attendance Regularization Pending Your Action
          </h3>
          {reqs.length > 0 && (
            <span style={{ marginLeft: 'auto', padding: '0.2rem 0.8rem', borderRadius: 99, background: '#FFF6E6', border: '1px solid #FFD891', color: 'var(--color-semantics-orange-7)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
              {reqs.length} pending
            </span>
          )}
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: '#D98C00' }} />
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>
                {['Employee', 'Date', 'Req. In', 'Req. Out', 'Reason', 'Actions'].map((h) => (
                  <th key={h} className="hrms-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r._id} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                  <td className="hrms-td">
                    <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{r.employee.name}</p>
                    <p style={{ margin: 0, color: 'var(--color-neutral-6)', fontSize: 10 }}>{r.employee.code} · {r.employee.title}</p>
                  </td>
                  <td className="hrms-td" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="hrms-td">{fmt(r.requestedCheckIn)}</td>
                  <td className="hrms-td">{r.requestedCheckOut ? fmt(r.requestedCheckOut) : '—'}</td>
                  <td className="hrms-td" style={{ maxWidth: 180 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, color: 'var(--color-neutral-7)', fontSize: 11 }}>
                      {r.reason}
                    </span>
                  </td>
                  <td className="hrms-td">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => act(r._id, 'approve')}
                        disabled={acting === r._id}
                        className="hrms-btn-ghost"
                        style={{ padding: '0.4rem 0.8rem', fontSize: 10, color: 'var(--color-semantics-green-7)', borderColor: 'var(--color-semantics-green-3)' }}
                      >
                        {acting === r._id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                        Approve
                      </button>
                      <button
                        onClick={() => { setRejectTarget(r._id); setRejectReason(''); }}
                        disabled={acting === r._id}
                        className="hrms-btn-ghost"
                        style={{ padding: '0.4rem 0.8rem', fontSize: 10, color: 'var(--color-semantics-red-6)', borderColor: 'var(--color-semantics-red-2)' }}
                      >
                        <XCircle size={10} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Rejection modal */}
      {rejectTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setRejectTarget(null)}>
          <div style={{ background: 'var(--color-neutral-1)', borderRadius: 12, padding: '2rem', width: 400, boxShadow: 'var(--shadow-dialog)' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.2rem' }}>
              <X size={16} style={{ color: 'var(--color-semantics-red-6)' }} />
              <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-15)' }}>Reject Regularization</h3>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)…"
              rows={3}
              className="hrms-input"
              style={{ width: '100%', marginBottom: '1rem', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectTarget(null)} className="hrms-btn-ghost">Cancel</button>
              <button
                onClick={() => act(rejectTarget, 'reject', rejectReason || undefined)}
                className="hrms-btn-primary"
                style={{ background: 'var(--color-semantics-red-6)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <XCircle size={12} /> Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function UpcomingJoinersCard({ joiners }: { joiners: JoinerRow[] }) {
  if (joiners.length === 0) return null;
  const today = new Date();
  return (
    <div className="hrms-card" style={{ marginBottom: '1.4rem', overflow: 'hidden', border: '1px solid var(--color-vr-blue-2)' }}>
      <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-vr-blue-2)', background: 'var(--color-vr-blue-1)', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <UserCheck size={15} style={{ color: 'var(--color-vr-blue-6)' }} />
        <h3 className="hrms-section-label" style={{ margin: 0, color: 'var(--color-vr-blue-7)' }}>Upcoming Joiners · {joiners.length}</h3>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-fs-12)', color: 'var(--color-vr-blue-7)' }}>Pre-hire employees assigned to you</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: 'var(--color-stroke)' }}>
        {joiners.map((j) => {
          const hire      = j.hireDate ? new Date(j.hireDate) : null;
          const daysUntil = hire ? Math.ceil((hire.getTime() - today.getTime()) / 86_400_000) : null;
          const isPast    = daysUntil !== null && daysUntil < 0;
          const isToday   = daysUntil === 0;
          return (
            <div key={j._id} style={{ background: 'var(--color-neutral-1)', padding: '1.2rem 1.6rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.8rem' }}>
                <div>
                  <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-13)', color: 'var(--color-neutral-10)' }}>{j.employeeCode}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>{j.jobTitle}</p>
                </div>
                <Badge variant="info">{j.employmentType.replace(/_/g, ' ')}</Badge>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                  <CalendarDays size={12} />
                  {hire ? hire.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                  <MapPin size={12} />{j.countryCode}
                </span>
              </div>
              {daysUntil !== null && (
                <div style={{
                  padding: '0.4rem 0.8rem', borderRadius: '0.6rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                  background: isPast ? 'rgba(255,165,0,0.10)' : isToday ? 'rgba(17,160,74,0.10)' : 'var(--color-vr-blue-1)',
                  color: isPast ? 'var(--color-semantics-orange-7)' : isToday ? 'var(--color-semantics-green-7)' : 'var(--color-vr-blue-7)',
                }}>
                  {isToday ? 'Joining today — HR needs to activate' : isPast ? `Joined ${Math.abs(daysUntil)}d ago — HR yet to activate` : `Joining in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamTable({ rows, title, onOpen }: { rows: ReportRow[]; title: string; onOpen: (r: ReportRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="hrms-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.4rem' }}>
      <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
        <h3 className="hrms-section-label" style={{ margin: 0 }}>{title} · {rows.length}</h3>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
        <thead>
          <tr>{['Member', 'Reports To', 'Status', 'Engagement', 'Risk', 'Review', 'Action', ''].map((h, i) => <th key={i} className="hrms-th">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const burnout = Math.round((r.burnoutRiskScore ?? 0) * 100);
            const flight  = Math.round((r.flightRiskScore ?? 0) * 100);
            const peak    = Math.max(burnout, flight);
            const hint    = r.actionNeeded ? ACTION_HINT[r.actionNeeded] : null;
            return (
              <tr key={r._id} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
                <td className="hrms-td">
                  <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{r.fullName}</p>
                  <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>{r.employeeCode} · {r.jobTitle}</p>
                </td>
                <td className="hrms-td">
                  {r.managerName
                    ? <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)' }}>{r.managerName}</span>
                    : <span style={{ color: 'var(--color-neutral-5)' }}>—</span>
                  }
                </td>
                <td className="hrms-td"><StatusBadge status={r.employeeStatus} /></td>
                <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.engagementPct != null ? `${r.engagementPct}%` : '—'}</td>
                <td className="hrms-td">
                  <span className={peak >= 70 ? 'loss_pill' : peak >= 40 ? 'hrms-badge hrms-badge--warning' : 'gain_pill'}>{peak}%</span>
                </td>
                <td className="hrms-td">
                  {r.review ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <StatusBadge status={r.review.status} />
                      {typeof r.review.overallRating === 'number' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-semantics-orange-7)' }}>
                          <Star size={10} fill="currentColor" />{r.review.overallRating}
                        </span>
                      )}
                    </span>
                  ) : <span style={{ color: 'var(--color-neutral-6)' }}>No review</span>}
                </td>
                <td className="hrms-td">
                  {hint ? <span style={{ color: hint.color, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 11 }}>{hint.label}</span> : <span style={{ color: 'var(--color-neutral-6)' }}>—</span>}
                </td>
                <td className="hrms-td" style={{ textAlign: 'right', color: 'var(--color-neutral-6)' }}><ChevronRight size={14} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MyTeamPage() {
  const router = useRouter();
  const [data, setData]     = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me/team').then((r) => r.json()).then((d) => setData(d.data)).finally(() => setLoading(false));
  }, []);

  const openReport = (r: ReportRow) => { router.push(`/my/team/${r._id}`); };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}><Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} /></div>;

  if (!data || !data.isManager) {
    return (
      <div style={{ padding: '2rem', maxWidth: 700 }}>
        <EmptyState icon={UsersRound} title="No direct reports" message="You don't currently manage anyone. When employees report to you, your team will appear here." />
      </div>
    );
  }

  const k = data.kpis!;
  const upcomingCount = data.upcomingJoiners?.length ?? 0;
  return (
    <div style={{ padding: '2rem', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <UsersRound size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>My Team</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Your direct reports and their performance, engagement, and risk signals.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.2rem', marginBottom: '1.6rem' }}>
        <StatCard title="Direct Reports" value={k.teamSize} subtitle={`${k.extendedTeamSize} incl. skip-level`} icon={Users} accent="blue" />
        <StatCard title="Avg Engagement" value={k.avgEngagement != null ? `${k.avgEngagement}%` : '—'} subtitle="team pulse" icon={TrendingUp} accent="green" />
        <StatCard title="At Risk" value={k.atRiskCount} subtitle="burnout / flight ≥70%" icon={AlertTriangle} accent="amber" />
        <StatCard title="Action Items" value={k.reviewsToFinalize + k.pendingEndorsements} subtitle="reviews + endorsements" icon={ClipboardCheck} accent="cyan" />
        {upcomingCount > 0 && (
          <StatCard title="Upcoming Joiners" value={upcomingCount} subtitle="pre-hire, pending activation" icon={UserCheck} accent="cyan" />
        )}
      </div>

      {/* Action list */}
      {data.actions.length > 0 && (
        <div className="hrms-card" style={{ marginBottom: '1.6rem', border: '1px solid #FFD891', background: 'linear-gradient(90deg, #FFF6E6 0%, var(--color-neutral-1) 80%)' }}>
          <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
            <ClipboardCheck size={15} style={{ color: 'var(--color-semantics-orange-7)' }} /> Needs your attention
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {data.actions.map((a, i) => (
              <button
                key={i}
                onClick={() => router.push(a.type === 'endorse_comp' ? '/performance/approvals' : `/performance/${a.reviewId}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem 1rem', borderRadius: '0.8rem', border: '1px solid var(--color-stroke)', background: 'var(--color-neutral-1)', cursor: 'pointer', textAlign: 'left' }}
              >
                {a.type === 'endorse_comp' ? <BadgeDollarSign size={14} style={{ color: 'var(--color-vr-blue-6)' }} /> : <ClipboardCheck size={14} style={{ color: 'var(--color-semantics-orange-7)' }} />}
                <span style={{ flex: 1, fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{a.label}</span>
                <Badge variant={a.type === 'endorse_comp' ? 'info' : 'warning'}>{a.type === 'endorse_comp' ? 'Endorse' : 'Review'}</Badge>
                <ChevronRight size={14} style={{ color: 'var(--color-neutral-6)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Leave approval queue for this manager */}
      <LeaveApprovalsCard />

      {/* Attendance regularization queue for this manager */}
      <AttendanceRegApprovalsCard />

      {/* Upcoming joiners */}
      <UpcomingJoinersCard joiners={data.upcomingJoiners ?? []} />

      <TeamTable rows={data.directReports} title="Direct Reports" onOpen={openReport} />
      <TeamTable rows={data.skipLevelReports} title="Skip-Level Reports" onOpen={openReport} />
    </div>
  );
}
