'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin, Clock, Calendar, CheckCircle, AlertCircle,
  Award, Loader2, DollarSign, FileText, TrendingUp, Cpu,
  Target, ChevronRight,
} from 'lucide-react';
import { StatCard }             from '@/components/ui/StatCard';
import { StatusBadge, Badge }   from '@/components/ui/Badge';
import { formatDate, formatCurrency } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface LeaveBalance { annual: number; sick: number; earned: number; usedAnnual: number; remaining: number }
interface LeaveRecord  { _id: string; leaveType: string; startDate: string; endDate: string; totalDays: number; status: string }
interface PayslipRecord { _id: string; runCode: string; month: number; year: number; currencyCode: string; status: string;
                          grossSalary: number | null; netSalary: number | null; baseSalary: number | null }
interface AttendanceStatus { checkedIn: boolean; checkedOut: boolean; checkInAt: string | null }
interface ProfileData {
  firstName?: string; lastName?: string; employeeCode: string; jobTitle: string;
  departmentName?: string; hireDate: string; countryCode: string;
  burnoutRiskScore: number; flightRiskScore: number;
  leaveBalance: LeaveBalance; pendingLeaves: number;
}

const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─────────────────────────────────────────────────────────────────────────────
// Milestone Banner
// ─────────────────────────────────────────────────────────────────────────────

function MilestoneBanner({ profile, userName }: { profile: ProfileData | null; userName: string }) {
  const today    = new Date();
  const isMonday = today.getDay() === 1;

  const isAnniversary = profile?.hireDate
    ? new Date(profile.hireDate).getMonth() === today.getMonth() &&
      new Date(profile.hireDate).getDate()  === today.getDate()
    : false;

  return (
    <div
      className="hrms-card"
      style={{
        padding: '1.6rem 2rem',
        background: 'linear-gradient(90deg, var(--color-vr-blue-1) 0%, var(--color-neutral-1) 80%)',
        display: 'flex', alignItems: 'center', gap: '1.4rem',
        border: '1px solid var(--color-vr-blue-2)',
      }}
    >
      <div
        style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--color-neutral-1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {isAnniversary
          ? <Award size={20} style={{ color: 'var(--color-semantics-orange-7)' }} />
          : <CheckCircle size={20} style={{ color: 'var(--color-vr-blue-6)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, color: 'var(--color-neutral-10)',
          fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
          fontSize: 'var(--text-fs-16)',
        }}>
          {isAnniversary
            ? `Happy Work Anniversary, ${userName.split(' ')[0]}`
            : isMonday
              ? `Good Monday, ${userName.split(' ')[0]}`
              : `Welcome back, ${userName.split(' ')[0]}`}
        </p>
        <p style={{
          margin: 0, marginTop: 2,
          color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
        }}>
          {today.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>
      {profile && (
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, color: 'var(--color-neutral-9)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
            {profile.jobTitle}
          </p>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10, fontFamily: 'monospace' }}>
            {profile.employeeCode}
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending Review Banner — surfaces a performance review that needs the
// employee's action (self-assessment to complete, or finalized review to
// acknowledge).  Hidden when there is nothing to act on.
// ─────────────────────────────────────────────────────────────────────────────

interface PendingReview { _id: string; cycleLabel: string; status: string }

function PendingReviewBanner() {
  const router = useRouter();
  const [review, setReview] = useState<PendingReview | null>(null);

  useEffect(() => {
    fetch('/api/me/performance')
      .then((r) => r.json())
      .then((d) => {
        const list: PendingReview[] = d.data ?? [];
        // Self-assessment is the most urgent; acknowledgement next.
        const actionable =
          list.find((r) => r.status === 'self_assessment') ??
          list.find((r) => r.status === 'finalized') ?? null;
        setReview(actionable);
      })
      .catch(() => {});
  }, []);

  if (!review) return null;

  const isSelf = review.status === 'self_assessment';
  const cta    = isSelf ? 'Complete self-assessment' : 'Review & acknowledge';
  const detail = isSelf
    ? `Your ${review.cycleLabel} performance review is open — share your self-assessment.`
    : `Your ${review.cycleLabel} review has been finalized — read it and acknowledge.`;

  return (
    <button
      onClick={() => router.push(`/my/performance/${review._id}`)}
      className="hrms-card"
      style={{
        padding: '1.4rem 2rem', cursor: 'pointer', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: '1.4rem',
        background: 'linear-gradient(90deg, #FFF6E6 0%, var(--color-neutral-1) 80%)',
        border: '1px solid #FFD891',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: '50%', background: 'var(--color-neutral-1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: 'var(--shadow-card)',
      }}>
        <Target size={20} style={{ color: 'var(--color-semantics-orange-7)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' }}>
          Action needed — {cta}
        </p>
        <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
          {detail}
        </p>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        color: 'var(--color-semantics-orange-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)',
      }}>
        {cta} <ChevronRight size={14} />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Check-In Widget (biometric / geofenced)
// ─────────────────────────────────────────────────────────────────────────────

function CheckInWidget() {
  const [status, setStatus]   = useState<AttendanceStatus | null>(null);
  const [time, setTime]       = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(false);

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch('/api/me/checkin')
      .then((r) => r.json())
      .then((d) => setStatus(d.data))
      .catch(() => setStatus({ checkedIn: false, checkedOut: false, checkInAt: null }))
      .finally(() => setLoading(false));
  }, []);

  const handleAction = async (eventType: 'check_in' | 'check_out') => {
    setActing(true);
    await fetch('/api/me/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ eventType, location: 'Office — HQ' }),
    });
    const d = await fetch('/api/me/checkin').then((r) => r.json());
    setStatus(d.data);
    setActing(false);
  };

  const checked    = status?.checkedIn  ?? false;
  const checkedOut = status?.checkedOut ?? false;

  return (
    <div className="hrms-card" style={{ padding: '1.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 className="hrms-section-label">Attendance</h3>
        {loading
          ? <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-neutral-6)' }} />
          : <StatusBadge status={checked && !checkedOut ? 'active' : checked && checkedOut ? 'cancelled' : 'pending'} />}
      </div>

      <div style={{ textAlign: 'center', padding: '1.2rem 0' }}>
        <p style={{
          margin: 0, color: 'var(--color-neutral-10)',
          fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
          fontSize: 'var(--text-fs-32)', fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}>
          {time}
        </p>
        <p style={{
          margin: 0, marginTop: 4,
          color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
        }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
        {status?.checkInAt && (
          <p style={{
            margin: 0, marginTop: 4,
            color: 'var(--color-vr-blue-7)', fontSize: 10,
          }}>
            Checked in at {new Date(status.checkInAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: '1.2rem',
        color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
      }}>
        <MapPin size={12} />
        <span>Office — HQ · Geofence verified</span>
      </div>

      {!checked && (
        <button onClick={() => handleAction('check_in')} disabled={acting}
                className="hrms-btn-primary" style={{ width: '100%' }}>
          {acting ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
          Check In
        </button>
      )}
      {checked && !checkedOut && (
        <button onClick={() => handleAction('check_out')} disabled={acting}
                className="hrms-btn-ghost" style={{ width: '100%' }}>
          {acting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
          Check Out
        </button>
      )}
      {checked && checkedOut && (
        <div style={{
          textAlign: 'center', padding: '0.8rem',
          background: 'var(--color-semantics-green-1)',
          color:      'var(--color-semantics-green-7)',
          borderRadius: '0.8rem',
          fontFamily: 'var(--font-in-sb)', fontWeight: 600,
          fontSize: 'var(--text-fs-12)',
        }}>
          ✓ Day complete
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Leave Balance Card
// ─────────────────────────────────────────────────────────────────────────────

function LeaveBalanceCard({ balance, leaves, onRefresh }: {
  balance:   LeaveBalance | null;
  leaves:    LeaveRecord[];
  onRefresh: () => void;
}) {
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState({ leaveType: 'annual', startDate: '', endDate: '', reason: '' });
  const [submitting, setSubmit]     = useState(false);
  const [error,      setError]      = useState('');
  const [submitted,  setSubmitted]  = useState(false);   // show "pending approval" banner

  const handleSubmit = async () => {
    if (!form.startDate || !form.endDate || !form.reason) { setError('All fields required'); return; }
    setSubmit(true); setError('');
    const res  = await fetch('/api/me/leaves', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Submission failed');
    } else {
      setShowForm(false);
      setForm({ leaveType: 'annual', startDate: '', endDate: '', reason: '' });
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 6000);  // auto-hide after 6 s
      onRefresh();
    }
    setSubmit(false);
  };

  const types = [
    { label: 'Annual',  value: balance?.remaining ?? 0, max: balance?.annual ?? 21, color: 'var(--color-vr-blue-6)' },
    { label: 'Sick',    value: balance?.sick ?? 12,     max: balance?.sick ?? 12,   color: 'var(--color-semantics-orange-6)' },
    { label: 'Earned',  value: balance?.earned ?? 0,    max: balance?.earned ?? 5,  color: 'var(--color-semantics-green-6)' },
  ];

  return (
    <div className="hrms-card" style={{ padding: '1.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
        <h3 className="hrms-section-label">Leave Balance</h3>
        <button
          onClick={() => { setShowForm((s) => !s); setSubmitted(false); }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-vr-blue-6)', fontSize: 'var(--text-fs-12)',
            fontFamily: 'var(--font-in-sb)', fontWeight: 600,
          }}
        >
          {showForm ? 'Cancel' : '+ Request'}
        </button>
      </div>

      {/* Pending approval confirmation banner */}
      {submitted && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
          padding: '0.8rem 1rem', marginBottom: '1rem', borderRadius: '0.8rem',
          background: '#FFF6E6', border: '1px solid #FFD891',
          fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-orange-7)',
        }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <div>
            <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
              Leave request submitted — awaiting HR approval
            </p>
            <p style={{ margin: '0.2rem 0 0', fontSize: 11, color: 'var(--color-neutral-7)' }}>
              Your request is <strong>pending</strong>. It will remain pending until an HR Manager reviews and approves it.
              You will receive a notification once a decision is made.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1rem' }}>
        {types.map(({ label, value, max, color }) => {
          const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
          return (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ color: 'var(--color-neutral-7)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {label}
                </span>
                <span style={{ color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {value} <span style={{ color: 'var(--color-neutral-6)' }}>/ {max}</span>
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 200ms ease' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent leaves */}
      {leaves.slice(0, 2).map((l) => (
        <div key={l._id} style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.6rem 0', borderTop: '1px solid var(--color-neutral-4)',
        }}>
          <span style={{ flex: 1, color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)', textTransform: 'capitalize' }}>
            {l.leaveType.replace('_',' ')}
          </span>
          <span style={{ color: 'var(--color-neutral-7)', fontSize: 10 }}>{l.totalDays}d</span>
          <StatusBadge status={l.status} />
        </div>
      ))}

      {showForm && (
        <div style={{
          marginTop: '1rem', paddingTop: '1rem',
          borderTop: '1px solid var(--color-stroke)',
          display: 'flex', flexDirection: 'column', gap: '0.8rem',
        }}>
          {error && (
            <p style={{
              margin: 0, color: 'var(--color-semantics-red-6)',
              fontSize: 'var(--text-fs-12)',
            }}>
              {error}
            </p>
          )}
          <select
            value={form.leaveType}
            onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
            className="hrms-input"
          >
            <option value="annual">Annual Leave</option>
            <option value="sick">Sick Leave</option>
            <option value="compensatory">Compensatory</option>
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="hrms-input" />
            <input type="date" value={form.endDate}   onChange={(e) => setForm({ ...form, endDate:   e.target.value })} className="hrms-input" />
          </div>
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Reason for leave…"
            rows={2}
            className="hrms-input"
            style={{ resize: 'none' }}
          />
          <button onClick={handleSubmit} disabled={submitting} className="hrms-btn-primary" style={{ width: '100%' }}>
            {submitting && <Loader2 size={12} className="animate-spin" />}
            Submit Request
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payslips Panel
// ─────────────────────────────────────────────────────────────────────────────

function PayslipsPanel({ slips }: { slips: PayslipRecord[] }) {
  return (
    <div className="hrms-card" style={{ padding: '1.6rem' }}>
      <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Recent Payslips</h3>
      {slips.length === 0 ? (
        <p style={{ color: 'var(--color-neutral-7)', textAlign: 'center', padding: '1.2rem 0', fontSize: 'var(--text-fs-12)' }}>
          No payslips yet
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {slips.slice(0, 3).map((s) => (
            <div key={s._id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.8rem', borderRadius: '0.8rem',
              background: 'var(--color-neutral-2)',
              border: '1px solid var(--color-stroke)',
            }}>
              <div>
                <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                  {MONTHS[s.month]} {s.year}
                </p>
                <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 10, fontFamily: 'monospace' }}>
                  {s.runCode}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                {s.netSalary != null
                  ? (
                    <p style={{ margin: 0, color: 'var(--color-semantics-green-7)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
                      {formatCurrency(s.netSalary, s.currencyCode)}
                    </p>
                  )
                  : (
                    <span className="hrms-badge hrms-badge--neutral">Encrypted</span>
                  )}
                <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                  Net pay
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk Snapshot
// ─────────────────────────────────────────────────────────────────────────────

function RiskSnapshot({ profile }: { profile: ProfileData | null }) {
  if (!profile) return null;
  const burnout = Math.round((profile.burnoutRiskScore ?? 0) * 100);
  const flight  = Math.round((profile.flightRiskScore ?? 0) * 100);

  return (
    <div className="hrms-card" style={{ padding: '1.6rem' }}>
      <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Wellbeing Snapshot</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)' }}>Burnout signal</span>
          <span className={burnout >= 70 ? 'loss_pill' : burnout >= 40 ? 'hrms-badge hrms-badge--warning' : 'gain_pill'}>
            {burnout}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)' }}>Flight risk</span>
          <span className={flight >= 70 ? 'loss_pill' : flight >= 40 ? 'hrms-badge hrms-badge--warning' : 'gain_pill'}>
            {flight}%
          </span>
        </div>
        <div style={{
          marginTop: '0.8rem', padding: '0.8rem',
          borderRadius: '0.8rem',
          background: 'var(--color-vr-blue-1)',
          border: '1px solid var(--color-vr-blue-2)',
          display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
        }}>
          <TrendingUp size={14} style={{ color: 'var(--color-vr-blue-7)', flexShrink: 0, marginTop: 2 }} />
          <p style={{
            margin: 0, color: 'var(--color-vr-blue-8)',
            fontSize: 10, lineHeight: 1.4,
          }}>
            Pulse trend over the last 90 days indicates stable engagement.
            Schedule a 1-on-1 with your manager via the calendar widget.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root Employee Cockpit
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeCockpitProps {
  userName:   string;
  employeeId: string | null;
}

export function EmployeeCockpit({ userName }: EmployeeCockpitProps) {
  const [profile, setProfile]   = useState<ProfileData | null>(null);
  const [leaves,  setLeaves]    = useState<LeaveRecord[]>([]);
  const [balance, setBalance]   = useState<LeaveBalance | null>(null);
  const [slips,   setSlips]     = useState<PayslipRecord[]>([]);
  const [loading, setLoading]   = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const [pr, lr, sr] = await Promise.all([
        fetch('/api/me'),
        fetch('/api/me/leaves'),
        fetch('/api/me/payroll'),
      ]);
      const [pd, ld, sd] = await Promise.all([pr.json(), lr.json(), sr.json()]);
      if (pd.data)    setProfile(pd.data);
      if (ld.data)    setLeaves(ld.data);
      if (ld.balance) setBalance(ld.balance);
      if (sd.data)    setSlips(sd.data);
    } catch (e) {
      console.error('Cockpit load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.6rem', maxWidth: 1280 }}>
      <MilestoneBanner profile={profile} userName={userName} />
      <PendingReviewBanner />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.2rem' }}>
        <StatCard
          title="Leave Remaining"
          value={balance?.remaining ?? 0}
          subtitle="days this year"
          icon={Calendar}
          accent="blue"
        />
        <StatCard
          title="Pending Requests"
          value={pendingLeaves}
          subtitle="awaiting approval"
          icon={AlertCircle}
          accent="amber"
        />
        <StatCard
          title="Payslips"
          value={slips.length}
          subtitle="on record"
          icon={FileText}
          accent="green"
        />
        <StatCard
          title="Net Salary"
          value={slips[0]?.netSalary != null
            ? formatCurrency(slips[0].netSalary, slips[0].currencyCode)
            : '—'}
          subtitle="latest month"
          icon={DollarSign}
          accent="cyan"
        />
      </div>

      {/* Widget grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem' }}>
        <CheckInWidget />
        <LeaveBalanceCard balance={balance} leaves={leaves} onRefresh={loadProfile} />
        <PayslipsPanel slips={slips} />
        <RiskSnapshot profile={profile} />
      </div>

      {/* Leave history */}
      {leaves.length > 0 && (
        <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '1rem 1.6rem',
            borderBottom: '1px solid var(--color-stroke)',
            background: 'var(--color-neutral-2)',
          }}>
            <h3 className="hrms-section-label" style={{ margin: 0 }}>My Leave History</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>
                {['Type','From','To','Days','Status'].map((h) => (
                  <th key={h} className="hrms-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaves.slice(0, 8).map((l) => (
                <tr key={l._id}>
                  <td className="hrms-td" style={{ textTransform: 'capitalize' }}>{l.leaveType.replace('_', ' ')}</td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(l.startDate)}</td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(l.endDate)}</td>
                  <td className="hrms-td" style={{ textAlign: 'center', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                    {l.totalDays}
                  </td>
                  <td className="hrms-td"><StatusBadge status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
