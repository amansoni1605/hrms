'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views, type EventProps } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enIN } from 'date-fns/locale';
import {
  Users, Calendar as CalendarIcon, FilePen, CheckCircle, XCircle, X,
  Search, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { fmtTime } from '@/lib/format';

// ── date-fns localizer ────────────────────────────────────────────────────────
const locales   = { 'en-IN': enIN };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AttendanceRow {
  employee: { _id: string; employeeCode: string; fullName: string; jobTitle: string };
  checkIn: string | null;
  checkOut: string | null;
  workingHours: number;
  status: 'present' | 'half_day' | 'absent';
}

interface RegRequest {
  _id:              string;
  employeeId:       string;
  employee:         { code: string; name: string; title: string };
  date:             string;
  requestedCheckIn: string;
  requestedCheckOut?: string;
  reason:           string;
  status:           'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt:        string;
}

interface MonthDay {
  date:    string;
  present: number;
  absent:  number;
  total:   number;
}

interface MonthCalEvent {
  title:    string;
  start:    Date;
  end:      Date;
  resource: MonthDay;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  present:  { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)', label: 'Present' },
  half_day: { bg: '#FFF3CD', fg: '#856404',                                                label: 'Half Day' },
  absent:   { bg: 'var(--color-semantics-red-1)',   fg: 'var(--color-semantics-red-6)',    label: 'Absent' },
};

function toDateStr(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

// ── Reject Dialog ────────────────────────────────────────────────────────────

function RejectDialog({ onConfirm, onCancel }: {
  onConfirm: (reason: string) => void;
  onCancel:  () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
      <div className="hrms-card" style={{ width: 360, padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>Reject Request</h3>
          <button onClick={onCancel} className="hrms-btn-ghost" style={{ padding: '0.3rem' }}><X size={13} /></button>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-7)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rejection Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this request is being rejected…"
            rows={3} className="hrms-input" style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--text-fs-12)' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="hrms-btn-ghost" style={{ fontSize: 'var(--text-fs-12)' }}>Cancel</button>
          <button onClick={() => onConfirm(reason.trim())} className="hrms-btn-primary"
            style={{ background: 'var(--color-semantics-red-6)', fontSize: 'var(--text-fs-12)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <XCircle size={12} /> Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Regularizations Tab ──────────────────────────────────────────────────────

function RegularizationsPanel() {
  const [reqs,      setReqs]      = useState<RegRequest[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [statusTab, setStatusTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [acting,    setActing]    = useState<string | null>(null);
  const [rejectId,  setRejectId]  = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/attendance/regularize?status=${statusTab}`)
      .then((r) => r.json())
      .then((d) => setReqs(d.data ?? []))
      .finally(() => setLoading(false));
  }, [statusTab]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (id: string, action: 'approve' | 'reject', rejectionReason?: string) => {
    setActing(id);
    await fetch(`/api/attendance/regularize/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, rejectionReason }),
    });
    setActing(null); setRejectId(null); load();
  };

  const fmt = (iso: string | null) => fmtTime(iso);

  const TAB_STYLE = (active: boolean) => ({
    padding: '0.5rem 1.2rem', borderRadius: 99, fontSize: 'var(--text-fs-12)',
    fontWeight: active ? 700 : 400, cursor: 'pointer' as const,
    background: active ? 'var(--color-vr-blue-6)' : 'transparent',
    color: active ? '#fff' : 'var(--color-neutral-7)',
    border: '1px solid', borderColor: active ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-4)',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem' }}>
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button key={s} style={TAB_STYLE(statusTab === s)} onClick={() => setStatusTab(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="hrms-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
          </div>
        ) : reqs.length === 0 ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>
            No {statusTab} regularization requests.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>
                {['Employee', 'Date', 'Req. Check-in', 'Req. Check-out', 'Reason', ...(statusTab === 'pending' ? ['Actions'] : ['Status'])].map((h) => (
                  <th key={h} className="hrms-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r._id} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                  <td className="hrms-td">
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{r.employee.name}</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--color-neutral-6)' }}>{r.employee.code} · {r.employee.title}</span>
                  </td>
                  <td className="hrms-td" style={{ whiteSpace: 'nowrap' }}>
                    {format(new Date(r.date + 'T00:00:00'), 'd MMM yyyy')}
                  </td>
                  <td className="hrms-td">{fmt(r.requestedCheckIn)}</td>
                  <td className="hrms-td">{r.requestedCheckOut ? fmt(r.requestedCheckOut) : '—'}</td>
                  <td className="hrms-td" style={{ maxWidth: 200 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</span>
                    {r.rejectionReason && <span style={{ fontSize: 10, color: 'var(--color-semantics-red-6)' }}>Reason: {r.rejectionReason}</span>}
                  </td>
                  {statusTab === 'pending' ? (
                    <td className="hrms-td">
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => doAction(r._id, 'approve')} disabled={acting === r._id} className="hrms-btn-primary"
                          style={{ fontSize: 11, padding: '0.3rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {acting === r._id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />} Approve
                        </button>
                        <button onClick={() => setRejectId(r._id)} disabled={acting === r._id} className="hrms-btn-ghost"
                          style={{ fontSize: 11, padding: '0.3rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-semantics-red-6)' }}>
                          <XCircle size={10} /> Reject
                        </button>
                      </div>
                    </td>
                  ) : (
                    <td className="hrms-td">
                      <span style={{ padding: '0.2rem 0.7rem', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: r.status === 'approved' ? 'var(--color-semantics-green-1)' : 'var(--color-semantics-red-1)',
                        color:      r.status === 'approved' ? 'var(--color-semantics-green-7)' : 'var(--color-semantics-red-6)' }}>
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rejectId && (
        <RejectDialog
          onConfirm={(reason) => doAction(rejectId, 'reject', reason)}
          onCancel={() => setRejectId(null)}
        />
      )}
    </div>
  );
}

// ── Attendance Register ──────────────────────────────────────────────────────

function AttendanceRegister() {
  const [date,    setDate]    = useState(toDateStr(new Date()));
  const [rows,    setRows]    = useState<AttendanceRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/attendance?date=${date}&page=${page}&limit=50`);
    const json = await res.json();
    setRows(json.data ?? []);
    setTotal(json.pagination?.total ?? 0);
    setLoading(false);
  }, [date, page]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? rows.filter((r) => `${r.employee.fullName} ${r.employee.employeeCode}`.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const counts = {
    present:  rows.filter((r) => r.status === 'present').length,
    halfDay:  rows.filter((r) => r.status === 'half_day').length,
    absent:   rows.filter((r) => r.status === 'absent').length,
  };

  const fmt = (iso: string | null) => fmtTime(iso);

  const shiftDate = (delta: number) => {
    const d = new Date(date); d.setDate(d.getDate() + delta);
    setDate(toDateStr(d)); setPage(1);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem', flexWrap: 'wrap', gap: '1rem' }}>
        <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{total} employees</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <button onClick={() => shiftDate(-1)} className="hrms-btn-ghost" style={{ padding: '0.5rem' }}><ChevronLeft size={16} /></button>
          <DatePicker value={date} onChange={(v) => { setDate(v); setPage(1); }} style={{ width: 160 }} />
          <button onClick={() => shiftDate(1)} className="hrms-btn-ghost" style={{ padding: '0.5rem' }}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.6rem' }}>
        {[
          { label: 'Present',  value: counts.present,  color: 'var(--color-semantics-green-7)', bg: 'var(--color-semantics-green-1)' },
          { label: 'Half Day', value: counts.halfDay,  color: '#856404',                        bg: '#FFF3CD' },
          { label: 'Absent',   value: counts.absent,   color: 'var(--color-semantics-red-6)',   bg: 'var(--color-semantics-red-1)' },
        ].map((kpi) => (
          <div key={kpi.label} className="hrms-kpi-card" style={{ background: kpi.bg, borderColor: 'transparent' }}>
            <p className="hrms-kpi-label">{kpi.label}</p>
            <p className="hrms-kpi-value" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-neutral-6)' }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          className="hrms-input" placeholder="Search employee…" style={{ paddingLeft: '2.8rem', maxWidth: 320 }} />
      </div>

      <div className="hrms-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Employee', 'Code', 'Check In', 'Check Out', 'Hours', 'Status'].map((h) => (
                  <th key={h} className="hrms-th" style={{ textAlign: h === 'Status' ? 'center' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>No records found</td></tr>
              )}
              {filtered.map((row) => {
                const s = STATUS_STYLE[row.status] ?? STATUS_STYLE['absent']!;
                return (
                  <tr key={row.employee._id} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                    <td className="hrms-td" style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                      {row.employee.fullName}
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-7)', fontWeight: 400 }}>{row.employee.jobTitle}</span>
                    </td>
                    <td className="hrms-td">{row.employee.employeeCode}</td>
                    <td className="hrms-td">{fmt(row.checkIn)}</td>
                    <td className="hrms-td">{fmt(row.checkOut)}</td>
                    <td className="hrms-td">{row.workingHours > 0 ? `${row.workingHours}h` : '—'}</td>
                    <td className="hrms-td" style={{ textAlign: 'center' }}>
                      <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: s.bg, color: s.fg, fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                        {s.label}
                      </span>
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

// ── Custom event chip ─────────────────────────────────────────────────────────

function MonthCalEventComponent({ event }: EventProps<MonthCalEvent>) {
  const { present, absent, total } = event.resource;
  const pct   = total > 0 ? Math.round(present / total * 100) : 0;
  const color = pct >= 85 ? '#15803D' : pct >= 60 ? '#854D0E' : '#B91C1C';
  const bg    = pct >= 85 ? '#DCFCE7' : pct >= 60 ? '#FEF9C3' : '#FEE2E2';
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 4,
      padding: '1px 5px', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 4,
    }}>
      <span style={{ flexShrink: 0 }}>{present}/{total}</span>
      <span style={{ opacity: 0.7, fontWeight: 400 }}>present</span>
    </div>
  );
}

function NoToolbar() { return null; }

// ── HR Monthly Calendar ──────────────────────────────────────────────────────

function HRAttendanceCalendar() {
  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [days,     setDays]     = useState<MonthDay[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<MonthDay | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/attendance/monthly?month=${calMonth}&year=${calYear}`);
    const json = await res.json();
    setDays(json.data?.days ?? []);
    setTotal(json.data?.totalEmployees ?? 0);
    setLoading(false);
  }, [calMonth, calYear]);

  useEffect(() => { load(); }, [load]);

  const calEvents = useMemo<MonthCalEvent[]>(() =>
    days.map((d): MonthCalEvent => ({
      title:    `${d.present}/${d.total} present`,
      start:    new Date(d.date + 'T00:00:00'),
      end:      new Date(d.date + 'T23:59:59'),
      resource: d,
    }))
  , [days]);

  const shiftMonth = (delta: number) => {
    let m = calMonth + delta, y = calYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setCalMonth(m); setCalYear(y);
    setSelected(null);
  };

  const calDate = useMemo(() => new Date(calYear, calMonth - 1, 1), [calYear, calMonth]);

  const avgPct = days.length > 0 && total > 0
    ? Math.round(days.reduce((s, d) => s + d.present, 0) / (days.length * total) * 100)
    : null;

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.4rem' }}>
        {[
          { label: 'Total Employees', value: total, color: 'var(--color-vr-blue-6)' },
          { label: 'Working Days',    value: days.length, color: '#15803D' },
          { label: 'Avg Attendance',  value: avgPct !== null ? `${avgPct}%` : '—', color: avgPct !== null && avgPct >= 85 ? '#15803D' : '#B91C1C' },
        ].map((kpi) => (
          <div key={kpi.label} className="hrms-kpi-card">
            <p className="hrms-kpi-label">{kpi.label}</p>
            <p className="hrms-kpi-value" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="hrms-card" style={{ overflow: 'hidden' }}>
        {/* Header with month/year selectors */}
        <div style={{ padding: '1rem 1.4rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button onClick={() => shiftMonth(-1)} className="hrms-btn-ghost" style={{ padding: '0.4rem' }}>
            <ChevronLeft size={14} />
          </button>

          {/* Month + year pickers */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
            <select
              value={calMonth}
              onChange={(e) => { setCalMonth(Number(e.target.value)); setSelected(null); }}
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
                if (y >= 2000 && y <= 2099) { setCalYear(y); setSelected(null); }
              }}
              className="hrms-input"
              style={{ width: 80, padding: '0.35rem 0.8rem', fontSize: 'var(--text-fs-13)', fontWeight: 600 }}
              min={2000} max={2099}
            />
          </div>

          <button onClick={() => shiftMonth(1)} className="hrms-btn-ghost" style={{ padding: '0.4rem' }}>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Legend */}
        <div style={{ padding: '0.5rem 1.4rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', gap: '1.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { bg: '#DCFCE7', fg: '#15803D', label: '≥85% present' },
            { bg: '#FEF9C3', fg: '#854D0E', label: '60–84%' },
            { bg: '#FEE2E2', fg: '#B91C1C', label: '<60% present' },
          ].map(({ bg, fg, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-neutral-7)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: `1px solid ${fg}30` }} />
              {label}
            </div>
          ))}
          <p style={{ margin: '0 0 0 auto', fontSize: 11, color: 'var(--color-neutral-5)', fontStyle: 'italic' }}>
            Click a day for details · {total} employees
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6rem' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
          </div>
        ) : (
          <div style={{ padding: '0.8rem 1.4rem 1.4rem' }}>
            <Calendar<MonthCalEvent>
              localizer={localizer}
              events={calEvents}
              defaultView={Views.MONTH}
              views={[Views.MONTH]}
              date={calDate}
              onNavigate={() => {}}
              components={{ toolbar: NoToolbar, event: MonthCalEventComponent }}
              onSelectEvent={(event: MonthCalEvent) => setSelected(event.resource)}
              eventPropGetter={() => ({ style: { background: 'transparent', border: 'none', padding: 0 } })}
              style={{ height: 520 }}
              popup
              showAllEvents
            />
          </div>
        )}
      </div>

      {/* Day detail panel */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
          onClick={() => setSelected(null)}>
          <div className="hrms-card" onClick={(e) => e.stopPropagation()}
            style={{ width: 300, padding: '1.4rem', borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
                {new Date(selected.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })}
              </h4>
              <button onClick={() => setSelected(null)} className="hrms-btn-ghost" style={{ padding: '0.25rem' }}><X size={13} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
              {[
                { label: 'Present', value: selected.present, color: '#15803D', bg: '#DCFCE7' },
                { label: 'Absent',  value: selected.absent,  color: '#B91C1C', bg: '#FEE2E2' },
                { label: 'Total',   value: selected.total,   color: 'var(--color-vr-blue-7)', bg: '#EFF6FF' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 8, padding: '0.6rem' }}>
                  <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--color-neutral-6)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                  <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontSize: 20, fontWeight: 800, color }}>{value}</p>
                </div>
              ))}
            </div>
            <div>
              <div style={{ height: 8, borderRadius: 99, background: '#E5E7EB', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${selected.total > 0 ? Math.round(selected.present / selected.total * 100) : 0}%`,
                  background: '#22C55E', borderRadius: 99, transition: 'width 0.4s ease' }} />
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-neutral-6)', textAlign: 'right' }}>
                {selected.total > 0 ? Math.round(selected.present / selected.total * 100) : 0}% attendance
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [tab, setTab] = useState<'register' | 'calendar' | 'regularizations'>('register');

  const TAB_STYLE = (active: boolean) => ({
    padding: '0.6rem 1.4rem', borderRadius: 99, fontSize: 'var(--text-fs-13)',
    fontWeight: active ? 700 : 400, cursor: 'pointer' as const,
    background: active ? 'var(--color-vr-blue-6)' : 'transparent',
    color: active ? '#fff' : 'var(--color-neutral-7)',
    border: '1px solid', borderColor: active ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-4)',
    display: 'inline-flex', alignItems: 'center' as const, gap: 6,
  });

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>
          Attendance
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={TAB_STYLE(tab === 'register')} onClick={() => setTab('register')}>
            <Users size={13} /> Register
          </button>
          <button style={TAB_STYLE(tab === 'calendar')} onClick={() => setTab('calendar')}>
            <CalendarIcon size={13} /> Calendar
          </button>
          <button style={TAB_STYLE(tab === 'regularizations')} onClick={() => setTab('regularizations')}>
            <FilePen size={13} /> Regularizations
          </button>
        </div>
      </div>

      {tab === 'register'        && <AttendanceRegister />}
      {tab === 'calendar'        && <HRAttendanceCalendar />}
      {tab === 'regularizations' && <RegularizationsPanel />}
    </div>
  );
}
