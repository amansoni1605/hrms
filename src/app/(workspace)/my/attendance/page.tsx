'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle, XCircle, Loader2, MapPin,
  FilePen, X, ChevronLeft, ChevronRight,
  CalendarDays, LogOut,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DaySummary {
  date: string;
  checkIn?: Date | null;
  checkOut?: Date | null;
  hours: number;
  status: 'present' | 'half_day' | 'absent';
}

interface AttendanceStats {
  presentDays: number;
  halfDays: number;
  totalLogged: number;
  days: number;
}

interface RegRequest {
  _id:               string;
  date:              string;
  requestedCheckIn:  string;
  requestedCheckOut?: string;
  reason:            string;
  status:            'pending' | 'approved' | 'rejected';
  rejectionReason?:  string;
}

const WEEKDAYS    = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const LEAVE_TYPES = ['annual','sick','maternity','paternity','unpaid','compensatory'] as const;
type LeaveType = typeof LEAVE_TYPES[number];

const STATUS_COLOR = {
  present:  { bg: '#DCFCE7', fg: '#15803D', dot: '#22C55E' },
  half_day: { bg: '#FEF9C3', fg: '#854D0E', dot: '#EAB308' },
  absent:   { bg: '#FEE2E2', fg: '#B91C1C', dot: '#EF4444' },
};

const REG_STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending:  { bg: '#FFF3CD', fg: '#856404', label: 'Pending' },
  approved: { bg: '#DCFCE7', fg: '#15803D', label: 'Approved' },
  rejected: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Rejected' },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Regularize Modal
// ─────────────────────────────────────────────────────────────────────────────

function RegularizeModal({
  date, onClose, onSuccess,
}: { date: string; onClose: () => void; onSuccess: () => void }) {
  const toast = useToast();
  const [checkIn,    setCheckIn]    = useState('09:00');
  const [checkOut,   setCheckOut]   = useState('18:00');
  const [includeOut, setIncludeOut] = useState(true);
  const [reason,     setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { toast.push({ kind: 'warning', title: 'Please provide a reason' }); return; }
    setSubmitting(true);
    const res = await fetch('/api/me/attendance/regularize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        requestedCheckIn:  new Date(`${date}T${checkIn}:00`).toISOString(),
        requestedCheckOut: includeOut ? new Date(`${date}T${checkOut}:00`).toISOString() : undefined,
        reason: reason.trim(),
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Regularization request sent to your manager' });
      onSuccess(); onClose();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.push({ kind: 'error', title: j.error ?? 'Failed to submit' });
    }
  };

  return (
    <Modal onClose={onClose} title="Regularize Attendance" icon={<FilePen size={15} style={{ color: 'var(--color-vr-blue-6)' }} />}>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-neutral-7)', background: '#EFF6FF', padding: '0.6rem 0.9rem', borderRadius: 6, border: '1px solid #BFDBFE' }}>
        Regularizing <strong>{fmtDate(date)}</strong> — will be sent to your manager for approval.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
        <div>
          <FieldLabel>Check-in Time</FieldLabel>
          <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="hrms-input" style={{ width: '100%' }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <input type="checkbox" id="inclOut" checked={includeOut} onChange={(e) => setIncludeOut(e.target.checked)} style={{ cursor: 'pointer' }} />
            <label htmlFor="inclOut" style={{ fontSize: 11, color: 'var(--color-neutral-7)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Check-out</label>
          </div>
          <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)}
            disabled={!includeOut} className="hrms-input"
            style={{ width: '100%', opacity: includeOut ? 1 : 0.4 }} />
        </div>
      </div>

      <div>
        <FieldLabel required>Reason</FieldLabel>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., Forgot to punch out, WFH not captured, biometric failure…"
          rows={3} maxLength={500} className="hrms-input"
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--text-fs-12)' }} />
        <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--color-neutral-5)', textAlign: 'right' }}>{reason.length}/500</p>
      </div>

      <ModalActions onClose={onClose} onSubmit={submit} submitting={submitting} label="Submit Request" />
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply Leave Modal
// ─────────────────────────────────────────────────────────────────────────────

function ApplyLeaveModal({
  startDate, endDate, onClose, onSuccess,
}: { startDate: string; endDate: string; onClose: () => void; onSuccess: () => void }) {
  const toast = useToast();
  const [start,      setStart]      = useState(startDate);
  const [end,        setEnd]        = useState(endDate);
  const [leaveType,  setLeaveType]  = useState<LeaveType>('annual');
  const [reason,     setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalDays = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1);

  const submit = async () => {
    if (!reason.trim()) { toast.push({ kind: 'warning', title: 'Please provide a reason' }); return; }
    if (end < start)    { toast.push({ kind: 'warning', title: 'End date must be on or after start date' }); return; }
    setSubmitting(true);
    const res = await fetch('/api/me/leaves', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaveType, startDate: start, endDate: end, reason: reason.trim() }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: `Leave request submitted (${totalDays} day${totalDays > 1 ? 's' : ''})` });
      onSuccess(); onClose();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.push({ kind: 'error', title: j.error ?? 'Failed to submit leave' });
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal onClose={onClose} title="Apply for Leave" icon={<CalendarDays size={15} style={{ color: '#D97706' }} />}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
        <div>
          <FieldLabel>Start Date</FieldLabel>
          <input type="date" value={start} min={today} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }}
            className="hrms-input" style={{ width: '100%' }} />
        </div>
        <div>
          <FieldLabel>End Date</FieldLabel>
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)}
            className="hrms-input" style={{ width: '100%' }} />
        </div>
      </div>

      {/* Duration badge */}
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '0.5rem 0.9rem', fontSize: 12, color: '#15803D', fontWeight: 600 }}>
        {totalDays} working day{totalDays > 1 ? 's' : ''} · {fmtDate(start)}{start !== end ? ` → ${fmtDate(end)}` : ''}
      </div>

      <div>
        <FieldLabel>Leave Type</FieldLabel>
        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}
          className="hrms-input" style={{ width: '100%' }}>
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel required>Reason</FieldLabel>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Brief reason for leave…"
          rows={3} maxLength={500} className="hrms-input"
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--text-fs-12)' }} />
      </div>

      <ModalActions onClose={onClose} onSubmit={submit} submitting={submitting} label="Submit Leave" submitStyle={{ background: '#D97706' }} />
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared modal shell + helpers
// ─────────────────────────────────────────────────────────────────────────────

function Modal({ children, onClose, title, icon }: {
  children: React.ReactNode; onClose: () => void; title: string; icon?: React.ReactNode;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.48)' }}>
      <div className="hrms-card" style={{ width: 440, padding: '1.6rem', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon}{title}
          </h3>
          <button onClick={onClose} className="hrms-btn-ghost" style={{ padding: '0.3rem' }}><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-7)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}{required && <span style={{ color: 'var(--color-semantics-red-6)', marginLeft: 2 }}>*</span>}
    </label>
  );
}

function ModalActions({ onClose, onSubmit, submitting, label, submitStyle }: {
  onClose: () => void; onSubmit: () => void; submitting: boolean; label: string; submitStyle?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: 4 }}>
      <button onClick={onClose} className="hrms-btn-ghost" style={{ fontSize: 'var(--text-fs-12)' }}>Cancel</button>
      <button onClick={onSubmit} disabled={submitting} className="hrms-btn-primary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...submitStyle }}>
        {submitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
        {label}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Grid
// ─────────────────────────────────────────────────────────────────────────────

function AttendanceCalendar({
  year, month, summaryMap, pendingDates,
  selStart, selEnd,
  onDayClick,
}: {
  year: number; month: number;
  summaryMap:  Map<string, DaySummary>;
  pendingDates:Set<string>;
  selStart:    string | null;
  selEnd:      string | null;
  onDayClick:  (date: string) => void;
}) {
  const today       = new Date().toISOString().slice(0, 10);
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const fmtTime = (v: Date | null | undefined) =>
    v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;

  // Range highlight helpers
  const rangeStart = selStart && selEnd ? (selStart < selEnd ? selStart : selEnd) : selStart;
  const rangeEnd   = selStart && selEnd ? (selStart < selEnd ? selEnd : selStart) : selStart;

  const inRange = (d: string) => !!rangeStart && !!rangeEnd && d >= rangeStart && d <= rangeEnd;
  const isEdge  = (d: string) => d === rangeStart || d === rangeEnd;

  return (
    <div>
      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
        {WEEKDAYS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--color-neutral-6)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />;

          const dateStr  = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday  = dateStr === today;
          const isFuture = dateStr > today;
          const data     = summaryMap.get(dateStr);
          const colors   = data ? STATUS_COLOR[data.status] : null;
          const hasPending = pendingDates.has(dateStr);
          const selected = inRange(dateStr);
          const isEdgeDay = isEdge(dateStr);
          const checkInTime  = fmtTime(data?.checkIn as Date | null | undefined);
          const checkOutTime = fmtTime(data?.checkOut as Date | null | undefined);

          let bg = isToday
            ? '#EFF6FF'
            : isFuture
              ? 'var(--color-neutral-2)'
              : colors ? colors.bg : '#FEF2F2';

          if (selected) bg = isEdgeDay ? '#1E40AF' : '#BFDBFE';

          return (
            <div
              key={dateStr}
              onClick={() => !isFuture && !isToday && onDayClick(dateStr)}
              style={{
                borderRadius: 8,
                padding: '6px 5px',
                minHeight: 72,
                cursor:    isFuture || isToday ? 'default' : 'pointer',
                background: bg,
                border:    isToday
                  ? '2px solid var(--color-vr-blue-6)'
                  : isEdgeDay
                    ? '2px solid #1E40AF'
                    : selected
                      ? '1px solid #93C5FD'
                      : '1px solid transparent',
                position:  'relative',
                transition:'box-shadow 100ms, background 100ms',
                userSelect:'none',
              }}
              onMouseEnter={(e) => {
                if (!isFuture && !isToday) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
            >
              {/* Day number */}
              <div style={{
                fontSize: 12, fontWeight: isToday || isEdgeDay ? 800 : 600,
                color: isEdgeDay ? '#fff' : selected ? '#1E40AF'
                  : isToday ? 'var(--color-vr-blue-7)'
                  : colors ? colors.fg : isFuture ? 'var(--color-neutral-5)' : '#9B1C1C',
                marginBottom: 2,
              }}>
                {day}
              </div>

              {/* Status dot + label */}
              {colors && !selected && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: colors.dot }} />
                  <span style={{ fontSize: 8, color: colors.fg, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {data!.status.replace('_', ' ')}
                  </span>
                </div>
              )}

              {/* Times */}
              {checkInTime && !selected && (
                <div style={{ fontSize: 9, color: isEdgeDay ? '#fff' : 'var(--color-neutral-7)', lineHeight: 1.4 }}>
                  {checkInTime}{checkOutTime && <><br />{checkOutTime}</>}
                </div>
              )}

              {/* No data label */}
              {!data && !isFuture && !isToday && !selected && (
                <div style={{ fontSize: 9, color: '#9B1C1C', fontWeight: 600, marginTop: 2 }}>No data</div>
              )}

              {/* Selected label on edge */}
              {isEdgeDay && (
                <div style={{ fontSize: 8, color: '#fff', marginTop: 3, fontWeight: 700, opacity: .8 }}>
                  {dateStr === selStart ? 'Start' : 'End'}
                </div>
              )}

              {/* Pending dot */}
              {hasPending && (
                <div style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', border: '1.5px solid #fff' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection Action Bar
// ─────────────────────────────────────────────────────────────────────────────

function SelectionBar({
  selStart, selEnd,
  onRegularize, onApplyLeave, onClear,
}: {
  selStart:     string;
  selEnd:       string | null;
  onRegularize: () => void;
  onApplyLeave: () => void;
  onClear:      () => void;
}) {
  const isRange = selEnd && selEnd !== selStart;
  const label   = isRange
    ? `${fmtDate(selStart)} → ${fmtDate(selEnd!)}`
    : fmtDate(selStart);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap',
      padding: '0.8rem 1.2rem',
      background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8,
      marginBottom: '0.6rem',
    }}>
      <span style={{ fontSize: 'var(--text-fs-12)', color: '#1E40AF', fontWeight: 600, flex: 1 }}>
        {isRange ? '📅' : '📌'} Selected: <strong>{label}</strong>
        {isRange
          ? <span style={{ fontWeight: 400, color: '#3B82F6', marginLeft: 6 }}>({Math.ceil((new Date(selEnd!).getTime() - new Date(selStart).getTime()) / 86_400_000) + 1}d)</span>
          : <span style={{ fontWeight: 400, color: '#64748B', fontSize: 11, marginLeft: 6 }}>click another day to extend range</span>
        }
      </span>

      {!isRange && (
        <button onClick={onRegularize} className="hrms-btn-ghost"
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--color-vr-blue-7)', borderColor: '#BFDBFE' }}>
          <FilePen size={12} /> Regularize
        </button>
      )}

      <button onClick={onApplyLeave} className="hrms-btn-primary"
        style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, background: '#D97706' }}>
        <CalendarDays size={12} /> Apply Leave
      </button>

      <button onClick={onClear} className="hrms-btn-ghost"
        style={{ fontSize: 12, padding: '0.4rem 0.6rem', color: 'var(--color-neutral-6)' }}>
        <X size={12} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const toast = useToast();
  const now   = new Date();

  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  const [todayStatus, setTodayStatus] = useState<{ checkedIn: boolean; checkedOut: boolean; checkInAt: string | null } | null>(null);
  const [summary,     setSummary]     = useState<DaySummary[]>([]);
  const [stats,       setStats]       = useState<AttendanceStats | null>(null);
  const [requests,    setRequests]    = useState<RegRequest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [checking,    setChecking]    = useState(false);

  // Selection state
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd,   setSelEnd]   = useState<string | null>(null);

  // Modal state
  const [modal, setModal] = useState<'regularize' | 'leave' | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [todayRes, histRes, regRes] = await Promise.all([
      fetch('/api/me/checkin'),
      fetch(`/api/me/attendance?month=${calMonth}&year=${calYear}`),
      fetch('/api/me/attendance/regularize'),
    ]);
    const [todayJson, histJson, regJson] = await Promise.all([
      todayRes.json(), histRes.json(), regRes.json(),
    ]);
    setTodayStatus(todayJson.data ?? null);
    setSummary(histJson.data?.summary ?? []);
    setStats(histJson.data?.stats ?? null);
    setRequests(regJson.data ?? []);
    setLoading(false);
  }, [calYear, calMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  const doCheckIn = async (eventType: 'check_in' | 'check_out') => {
    setChecking(true);
    const res = await fetch('/api/me/checkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, location: 'Office' }),
    });
    setChecking(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: eventType === 'check_in' ? 'Checked in' : 'Checked out' });
      loadData();
    } else {
      toast.push({ kind: 'error', title: 'Failed to record attendance' });
    }
  };

  const handleDayClick = (date: string) => {
    if (!selStart) {
      // First click — set start
      setSelStart(date); setSelEnd(null);
    } else if (date === selStart && !selEnd) {
      // Same day clicked again — deselect
      setSelStart(null); setSelEnd(null);
    } else {
      // Second click — set end (keep ordered)
      const [s, e] = date < selStart ? [date, selStart] : [selStart, date];
      setSelStart(s); setSelEnd(e);
    }
  };

  const clearSelection = () => { setSelStart(null); setSelEnd(null); };

  const openRegularize = () => setModal('regularize');
  const openLeave      = () => setModal('leave');
  const closeModal     = () => setModal(null);

  const shiftMonth = (delta: number) => {
    let m = calMonth + delta, y = calYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setCalMonth(m); setCalYear(y);
    clearSelection();
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

  const summaryMap  = new Map(summary.map((d) => [d.date.slice(0, 10), d]));
  const pendingDates = new Set(requests.filter((r) => r.status === 'pending').map((r) => r.date.slice(0, 10)));

  const todayDate     = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const attendancePct = stats ? Math.round((stats.presentDays + (stats.halfDays ?? 0) * 0.5) / Math.max(1, stats.days) * 100) : 0;
  const pendingCount  = requests.filter((r) => r.status === 'pending').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 960 }}>
      <h2 style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>
        My Attendance
      </h2>
      <p style={{ margin: '0 0 1.6rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{todayDate}</p>

      {/* ── Check-in widget ── */}
      <div className="hrms-card" style={{ padding: '1.4rem 2rem', marginBottom: '1.4rem', display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 0.3rem', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)', fontWeight: 600 }}>Today&apos;s Status</p>
          <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-22)', color: 'var(--color-neutral-10)' }}>
            {todayStatus?.checkedIn ? (todayStatus.checkedOut ? 'Completed' : 'In Office') : 'Not Started'}
          </p>
          {todayStatus?.checkInAt && (
            <p style={{ margin: '0.3rem 0 0', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={11} /> Checked in at {fmt(todayStatus.checkInAt)}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          {!todayStatus?.checkedIn && (
            <button onClick={() => doCheckIn('check_in')} disabled={checking} className="hrms-btn-primary" style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
              {checking ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />} Check In
            </button>
          )}
          {todayStatus?.checkedIn && !todayStatus?.checkedOut && (
            <button onClick={() => doCheckIn('check_out')} disabled={checking} className="hrms-btn-ghost" style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
              {checking ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />} Check Out
            </button>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.4rem' }}>
          {[
            { label: 'Present',       value: stats.presentDays, color: '#15803D' },
            { label: 'Half Day',      value: stats.halfDays,    color: '#854D0E' },
            { label: 'Working Days',  value: stats.days,        color: 'var(--color-vr-blue-6)' },
            { label: 'Attendance %',  value: `${attendancePct}%`, color: attendancePct >= 90 ? '#15803D' : '#B91C1C' },
          ].map((kpi) => (
            <div key={kpi.label} className="hrms-kpi-card">
              <p className="hrms-kpi-label">{kpi.label}</p>
              <p className="hrms-kpi-value" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Calendar ── */}
      <div className="hrms-card" style={{ overflow: 'hidden', marginBottom: '1.4rem' }}>
        {/* Header */}
        <div style={{ padding: '1rem 1.4rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button onClick={() => shiftMonth(-1)} className="hrms-btn-ghost" style={{ padding: '0.4rem' }}>
            <ChevronLeft size={14} />
          </button>
          <h3 style={{ margin: 0, flex: 1, textAlign: 'center', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>
            {MONTH_NAMES[calMonth - 1]} {calYear}
          </h3>
          <button onClick={() => shiftMonth(1)} className="hrms-btn-ghost" style={{ padding: '0.4rem' }}
            disabled={calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth() + 1)}>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Legend */}
        <div style={{ padding: '0.5rem 1.4rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { dot: '#22C55E', label: 'Present' },
            { dot: '#EAB308', label: 'Half Day' },
            { dot: '#EF4444', label: 'Absent' },
            { dot: '#F59E0B', label: 'Regularization pending' },
            { dot: '#1E40AF', label: 'Selected' },
          ].map(({ dot, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-neutral-7)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />{label}
            </div>
          ))}
          <p style={{ margin: '0 0 0 auto', fontSize: 11, color: 'var(--color-neutral-5)', fontStyle: 'italic' }}>
            Click a day to select · drag to range
          </p>
        </div>

        <div style={{ padding: '1rem 1.4rem' }}>
          {/* Selection action bar */}
          {selStart && (
            <SelectionBar
              selStart={selStart}
              selEnd={selEnd}
              onRegularize={openRegularize}
              onApplyLeave={openLeave}
              onClear={clearSelection}
            />
          )}

          <AttendanceCalendar
            year={calYear}
            month={calMonth}
            summaryMap={summaryMap}
            pendingDates={pendingDates}
            selStart={selStart}
            selEnd={selEnd}
            onDayClick={handleDayClick}
          />
        </div>
      </div>

      {/* ── My Regularization Requests ── */}
      <div className="hrms-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.4rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <FilePen size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
          <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)', flex: 1 }}>
            My Regularization Requests
          </h3>
          {pendingCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#856404', background: '#FFF3CD', padding: '0.15rem 0.7rem', borderRadius: 99 }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        {requests.length === 0 ? (
          <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>
            No regularization requests yet.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>{['Date','Req. In','Req. Out','Reason','Status'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const s = REG_STATUS_STYLE[r.status]!;
                return (
                  <tr key={r._id} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                    <td className="hrms-td">{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="hrms-td">{fmt(r.requestedCheckIn)}</td>
                    <td className="hrms-td">{r.requestedCheckOut ? fmt(r.requestedCheckOut) : '—'}</td>
                    <td className="hrms-td" style={{ maxWidth: 220 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</span>
                      {r.rejectionReason && <span style={{ fontSize: 10, color: '#B91C1C', display: 'block', marginTop: 2 }}>↳ {r.rejectionReason}</span>}
                    </td>
                    <td className="hrms-td">
                      <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600 }}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modals ── */}
      {modal === 'regularize' && selStart && (
        <RegularizeModal
          date={selStart}
          onClose={closeModal}
          onSuccess={() => { loadData(); clearSelection(); }}
        />
      )}
      {modal === 'leave' && selStart && (
        <ApplyLeaveModal
          startDate={selStart}
          endDate={selEnd ?? selStart}
          onClose={closeModal}
          onSuccess={() => { loadData(); clearSelection(); }}
        />
      )}
    </div>
  );
}
