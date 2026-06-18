'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views, type EventProps } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enIN } from 'date-fns/locale';
import {
  CheckCircle, XCircle, Loader2, MapPin,
  FilePen, X, ChevronLeft, ChevronRight,
  CalendarDays, LogOut,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { DatePicker } from '@/components/ui/DatePicker';

// ── date-fns localizer ────────────────────────────────────────────────────────
const locales   = { 'en-IN': enIN };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

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

interface HolidayInfo {
  date: string;
  name: string;
  type: string;
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

interface CalEvent {
  title:    string;
  start:    Date;
  end:      Date;
  resource: {
    kind:      'attendance' | 'holiday' | 'pending';
    status?:   'present' | 'half_day' | 'absent';
    dateStr:   string;
    hours?:    number;
    checkIn?:  Date | null;
    checkOut?: Date | null;
    holiday?:  HolidayInfo;
  };
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const LEAVE_TYPES = ['annual','sick','maternity','paternity','unpaid','compensatory'] as const;
type LeaveType = typeof LEAVE_TYPES[number];

const STATUS_STYLE = {
  present:  { bg: '#DCFCE7', fg: '#15803D', border: '#86EFAC', dot: '#22C55E', label: 'Present' },
  half_day: { bg: '#FEF9C3', fg: '#854D0E', border: '#FDE047', dot: '#EAB308', label: 'Half Day' },
  absent:   { bg: '#FEE2E2', fg: '#B91C1C', border: '#FCA5A5', dot: '#EF4444', label: 'Absent' },
  holiday:  { bg: '#FFF7ED', fg: '#C2410C', border: '#FDBA74', dot: '#F97316', label: 'Holiday' },
  pending:  { bg: '#FFFBEB', fg: '#92400E', border: '#FCD34D', dot: '#F59E0B', label: 'Pending' },
};

const REG_STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending:  { bg: '#FFF3CD', fg: '#856404', label: 'Pending' },
  approved: { bg: '#DCFCE7', fg: '#15803D', label: 'Approved' },
  rejected: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Rejected' },
};

function fmtDate(d: string) {
  return format(new Date(d + 'T00:00:00'), 'd MMM');
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Event Chip
// ─────────────────────────────────────────────────────────────────────────────

function AttendanceEvent({ event }: EventProps<CalEvent>) {
  const { kind, status, checkIn, holiday } = event.resource;

  if (kind === 'holiday') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700,
        color: STATUS_STYLE.holiday.fg, background: STATUS_STYLE.holiday.bg,
        border: `1px solid ${STATUS_STYLE.holiday.border}`, borderRadius: 4,
        padding: '1px 5px', overflow: 'hidden',
      }}>
        🎉 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{holiday!.name}</span>
      </div>
    );
  }

  if (kind === 'pending') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700,
        color: STATUS_STYLE.pending.fg, background: STATUS_STYLE.pending.bg,
        border: `1px solid ${STATUS_STYLE.pending.border}`, borderRadius: 4, padding: '1px 5px',
      }}>
        ⏳ Reg. Pending
      </div>
    );
  }

  if (!status) return null;
  const s = STATUS_STYLE[status];
  const timeStr = checkIn
    ? format(new Date(checkIn), 'HH:mm')
    : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700,
      color: s.fg, background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 4, padding: '1px 5px', overflow: 'hidden',
    }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {s.label}{timeStr ? ` · ${timeStr}` : ''}
      </span>
    </div>
  );
}

function NoToolbar() { return null; }

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

  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <Modal onClose={onClose} title="Apply for Leave" icon={<CalendarDays size={15} style={{ color: '#D97706' }} />}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
        <div>
          <FieldLabel>Start Date</FieldLabel>
          <DatePicker value={start} min={today} onChange={(v) => { setStart(v); if (v > end) setEnd(v); }} />
        </div>
        <div>
          <FieldLabel>End Date</FieldLabel>
          <DatePicker value={end} min={start} onChange={setEnd} />
        </div>
      </div>
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
// Day Detail Popover
// ─────────────────────────────────────────────────────────────────────────────

function DayDetailPanel({
  dateStr, summary, holiday, isPending, onRegularize, onApplyLeave, onClose,
}: {
  dateStr:    string;
  summary:    DaySummary | undefined;
  holiday:    HolidayInfo | undefined;
  isPending:  boolean;
  onRegularize: () => void;
  onApplyLeave: () => void;
  onClose:    () => void;
}) {
  const today   = format(new Date(), 'yyyy-MM-dd');
  const isFuture = dateStr > today;

  const fmt = (v: Date | null | undefined) =>
    v ? format(new Date(v), 'HH:mm') : '—';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.3)',
    }} onClick={onClose}>
      <div className="hrms-card" onClick={(e) => e.stopPropagation()}
        style={{ width: 320, padding: '1.4rem', borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
            {format(new Date(dateStr + 'T00:00:00'), 'EEE, d MMMM')}
          </h4>
          <button onClick={onClose} className="hrms-btn-ghost" style={{ padding: '0.25rem' }}><X size={13} /></button>
        </div>

        {holiday && (
          <div style={{ background: STATUS_STYLE.holiday.bg, border: `1px solid ${STATUS_STYLE.holiday.border}`, borderRadius: 6, padding: '0.5rem 0.8rem', fontSize: 12, color: STATUS_STYLE.holiday.fg, fontWeight: 600 }}>
            🎉 {holiday.name}
            <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 6, textTransform: 'capitalize' }}>({holiday.type})</span>
          </div>
        )}

        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
            {[
              { label: 'Status', value: summary.status.replace('_', ' ') },
              { label: 'Hours', value: summary.hours > 0 ? `${summary.hours.toFixed(1)}h` : '—' },
              { label: 'Check In', value: fmt(summary.checkIn as Date | null | undefined) },
              { label: 'Check Out', value: fmt(summary.checkOut as Date | null | undefined) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--color-neutral-6)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-neutral-10)', textTransform: 'capitalize' }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {!summary && !holiday && !isFuture && (
          <p style={{ margin: 0, fontSize: 12, color: '#9B1C1C', fontWeight: 600 }}>No attendance data recorded.</p>
        )}

        {isPending && (
          <div style={{ background: STATUS_STYLE.pending.bg, border: `1px solid ${STATUS_STYLE.pending.border}`, borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: 11, color: STATUS_STYLE.pending.fg, fontWeight: 600 }}>
            ⏳ Regularization request pending approval
          </div>
        )}

        {!isFuture && !holiday && (
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', borderTop: '1px solid var(--color-stroke)', paddingTop: '0.8rem' }}>
            {!summary && (
              <button onClick={onRegularize} className="hrms-btn-ghost"
                style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--color-vr-blue-7)' }}>
                <FilePen size={12} /> Regularize
              </button>
            )}
            <button onClick={onApplyLeave} className="hrms-btn-primary"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, background: '#D97706' }}>
              <CalendarDays size={12} /> Apply Leave
            </button>
          </div>
        )}
      </div>
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
  const [holidays,    setHolidays]    = useState<HolidayInfo[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [checking,    setChecking]    = useState(false);

  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [modal,      setModal]      = useState<'regularize' | 'leave' | null>(null);
  const [leaveStart, setLeaveStart] = useState<string | null>(null);
  const [leaveEnd,   setLeaveEnd]   = useState<string | null>(null);
  const [regDate,    setRegDate]    = useState<string | null>(null);

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
    setHolidays(histJson.data?.holidays ?? []);
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

  const summaryMap   = useMemo(() => new Map(summary.map((d) => [d.date.slice(0, 10), d])), [summary]);
  const pendingDates = useMemo(() => new Set(requests.filter((r) => r.status === 'pending').map((r) => r.date.slice(0, 10))), [requests]);
  const holidayMap   = useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays]);

  const calEvents = useMemo<CalEvent[]>(() => {
    const today  = format(new Date(), 'yyyy-MM-dd');
    const events: CalEvent[] = [];

    for (const d of summary) {
      const dateStr = d.date.slice(0, 10);
      if (dateStr > today) continue;
      events.push({
        title: `${d.status.replace('_', ' ')}${d.checkIn ? ` · ${format(new Date(d.checkIn), 'HH:mm')}` : ''}`,
        start: new Date(dateStr + 'T00:00:00'),
        end:   new Date(dateStr + 'T23:59:59'),
        resource: { kind: 'attendance', status: d.status, dateStr, hours: d.hours, checkIn: d.checkIn as Date | null | undefined, checkOut: d.checkOut as Date | null | undefined },
      });
    }

    for (const h of holidays) {
      events.push({
        title: `🎉 ${h.name}`,
        start: new Date(h.date + 'T00:00:00'),
        end:   new Date(h.date + 'T23:59:59'),
        resource: { kind: 'holiday', dateStr: h.date, holiday: h },
      });
    }

    for (const dateStr of pendingDates) {
      if (!summaryMap.has(dateStr)) {
        events.push({
          title: '⏳ Reg. Pending',
          start: new Date(dateStr + 'T00:00:00'),
          end:   new Date(dateStr + 'T23:59:59'),
          resource: { kind: 'pending', dateStr },
        });
      }
    }

    return events;
  }, [summary, holidays, pendingDates, summaryMap]);

  const dayPropGetter = useCallback((date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const today   = new Date().toISOString().slice(0, 10);
    const s       = summaryMap.get(dateStr);
    const isHol   = holidayMap.has(dateStr);

    if (dateStr > today) return {};
    if (s)     return { style: { background: STATUS_STYLE[s.status].bg } };
    if (isHol) return { style: { background: STATUS_STYLE.holiday.bg } };
    if (dateStr < today) return { style: { background: '#FFF5F5' } };
    return {};
  }, [summaryMap, holidayMap]);

  const eventPropGetter = useCallback(() => {
    return { style: { background: 'transparent', border: 'none', padding: 0 } };
  }, []);

  const handleSelectEvent = useCallback((event: CalEvent) => {
    setDetailDate(event.resource.dateStr);
  }, []);

  const handleSelectSlot = useCallback(({ start }: { start: Date }) => {
    const today   = new Date().toISOString().slice(0, 10);
    const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    if (dateStr >= today) return;
    setDetailDate(dateStr);
  }, []);

  const shiftMonth = (delta: number) => {
    let m = calMonth + delta, y = calYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setCalMonth(m); setCalYear(y);
  };

  const calDate = useMemo(() => new Date(calYear, calMonth - 1, 1), [calYear, calMonth]);

  const detailSummary = detailDate ? summaryMap.get(detailDate) : undefined;
  const detailHoliday = detailDate ? holidayMap.get(detailDate) : undefined;
  const detailPending = detailDate ? pendingDates.has(detailDate) : false;

  const fmt = (iso: string | null) =>
    iso ? format(new Date(iso), 'HH:mm') : '—';

  const todayDate     = format(now, 'EEEE, d MMMM');
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
            { label: 'Present',      value: stats.presentDays,   color: '#15803D' },
            { label: 'Half Day',     value: stats.halfDays,       color: '#854D0E' },
            { label: 'Working Days', value: stats.days,           color: 'var(--color-vr-blue-6)' },
            { label: 'Attendance %', value: `${attendancePct}%`,  color: attendancePct >= 90 ? '#15803D' : '#B91C1C' },
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
        {/* Header with month/year selectors */}
        <div style={{ padding: '1rem 1.4rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button onClick={() => shiftMonth(-1)} className="hrms-btn-ghost" style={{ padding: '0.4rem' }}>
            <ChevronLeft size={14} />
          </button>

          {/* Month + year pickers */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
            <select
              value={calMonth}
              onChange={(e) => setCalMonth(Number(e.target.value))}
              className="hrms-input"
              style={{ width: 130, padding: '0.35rem 0.8rem', fontSize: 'var(--text-fs-13)', fontWeight: 600, cursor: 'pointer' }}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
            <input
              type="number"
              value={calYear}
              onChange={(e) => {
                const y = Number(e.target.value);
                if (y >= 2000 && y <= 2099) setCalYear(y);
              }}
              className="hrms-input"
              style={{ width: 80, padding: '0.35rem 0.8rem', fontSize: 'var(--text-fs-13)', fontWeight: 600 }}
              min={2000} max={2099}
            />
          </div>

          <button
            onClick={() => shiftMonth(1)}
            className="hrms-btn-ghost"
            style={{ padding: '0.4rem' }}
            disabled={calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth() + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Legend */}
        <div style={{ padding: '0.5rem 1.4rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { dot: '#22C55E', label: 'Present' },
            { dot: '#EAB308', label: 'Half Day' },
            { dot: '#EF4444', label: 'Absent / No data' },
            { dot: '#F97316', label: 'Public Holiday' },
            { dot: '#F59E0B', label: 'Regularization pending' },
          ].map(({ dot, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-neutral-7)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />{label}
            </div>
          ))}
          <p style={{ margin: '0 0 0 auto', fontSize: 11, color: 'var(--color-neutral-5)', fontStyle: 'italic' }}>
            Click a day to view details or apply leave
          </p>
        </div>

        {/* Calendar — font-size wrapper resets em base to 16 px (html is 62.5 %) */}
        <div style={{ padding: '0.8rem 1.4rem 1.4rem', fontSize: 16 }}>
          <Calendar<CalEvent>
            localizer={localizer}
            events={calEvents}
            defaultView={Views.MONTH}
            views={[Views.MONTH]}
            date={calDate}
            onNavigate={() => {}}
            components={{ toolbar: NoToolbar, event: AttendanceEvent }}
            selectable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            dayPropGetter={dayPropGetter}
            eventPropGetter={eventPropGetter}
            style={{ height: 520 }}
            popup
            showAllEvents
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
                    <td className="hrms-td">{format(new Date(r.date + 'T00:00:00'), 'd MMM yyyy')}</td>
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

      {/* ── Day Detail Panel ── */}
      {detailDate && (
        <DayDetailPanel
          dateStr={detailDate}
          summary={detailSummary}
          holiday={detailHoliday}
          isPending={detailPending}
          onRegularize={() => { setDetailDate(null); setRegDate(detailDate); setModal('regularize'); }}
          onApplyLeave={() => { setDetailDate(null); setLeaveStart(detailDate); setLeaveEnd(detailDate); setModal('leave'); }}
          onClose={() => setDetailDate(null)}
        />
      )}

      {/* ── Modals ── */}
      {modal === 'regularize' && regDate && (
        <RegularizeModal
          date={regDate}
          onClose={() => setModal(null)}
          onSuccess={() => { loadData(); setRegDate(null); }}
        />
      )}
      {modal === 'leave' && leaveStart && (
        <ApplyLeaveModal
          startDate={leaveStart}
          endDate={leaveEnd ?? leaveStart}
          onClose={() => setModal(null)}
          onSuccess={() => { loadData(); setLeaveStart(null); setLeaveEnd(null); }}
        />
      )}
    </div>
  );
}
