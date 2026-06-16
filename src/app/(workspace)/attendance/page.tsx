'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Calendar, Download, Search, ChevronLeft, ChevronRight, Loader2, FilePen, CheckCircle, XCircle, X } from 'lucide-react';

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

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  present:  { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)', label: 'Present' },
  half_day: { bg: '#FFF3CD', fg: '#856404', label: 'Half Day' },
  absent:   { bg: 'var(--color-semantics-red-1)',   fg: 'var(--color-semantics-red-6)',   label: 'Absent' },
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Reject Dialog ────────────────────────────────────────────────────────────

function RejectDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void;
  onCancel:  () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)',
    }}>
      <div className="hrms-card" style={{ width: 360, padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
            Reject Request
          </h3>
          <button onClick={onCancel} className="hrms-btn-ghost" style={{ padding: '0.3rem' }}><X size={13} /></button>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-7)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Rejection Reason
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this request is being rejected…"
            rows={3}
            className="hrms-input"
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--text-fs-12)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="hrms-btn-ghost" style={{ fontSize: 'var(--text-fs-12)' }}>Cancel</button>
          <button
            onClick={() => onConfirm(reason.trim())}
            className="hrms-btn-primary"
            style={{ background: 'var(--color-semantics-red-6)', fontSize: 'var(--text-fs-12)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <XCircle size={12} /> Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Regularizations Tab ──────────────────────────────────────────────────────

function RegularizationsPanel() {
  const [reqs,       setReqs]       = useState<RegRequest[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [statusTab,  setStatusTab]  = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [acting,     setActing]     = useState<string | null>(null);
  const [rejectId,   setRejectId]   = useState<string | null>(null);

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
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, rejectionReason }),
    });
    setActing(null);
    setRejectId(null);
    load();
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

  const TAB_STYLE = (active: boolean) => ({
    padding: '0.5rem 1.2rem',
    borderRadius: 99,
    fontSize: 'var(--text-fs-12)',
    fontWeight: active ? 700 : 400,
    cursor: 'pointer' as const,
    background: active ? 'var(--color-vr-blue-6)' : 'transparent',
    color: active ? '#fff' : 'var(--color-neutral-7)',
    border: '1px solid',
    borderColor: active ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-4)',
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
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>
                      {r.employee.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--color-neutral-6)' }}>
                      {r.employee.code} · {r.employee.title}
                    </span>
                  </td>
                  <td className="hrms-td" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="hrms-td">{fmt(r.requestedCheckIn)}</td>
                  <td className="hrms-td">{r.requestedCheckOut ? fmt(r.requestedCheckOut) : '—'}</td>
                  <td className="hrms-td" style={{ maxWidth: 200 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.reason}
                    </span>
                    {r.rejectionReason && (
                      <span style={{ fontSize: 10, color: 'var(--color-semantics-red-6)' }}>
                        Reason: {r.rejectionReason}
                      </span>
                    )}
                  </td>
                  {statusTab === 'pending' ? (
                    <td className="hrms-td">
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          onClick={() => doAction(r._id, 'approve')}
                          disabled={acting === r._id}
                          className="hrms-btn-primary"
                          style={{ fontSize: 11, padding: '0.3rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {acting === r._id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectId(r._id)}
                          disabled={acting === r._id}
                          className="hrms-btn-ghost"
                          style={{ fontSize: 11, padding: '0.3rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-semantics-red-6)' }}
                        >
                          <XCircle size={10} /> Reject
                        </button>
                      </div>
                    </td>
                  ) : (
                    <td className="hrms-td">
                      <span style={{
                        padding: '0.2rem 0.7rem', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: r.status === 'approved' ? 'var(--color-semantics-green-1)' : 'var(--color-semantics-red-1)',
                        color:      r.status === 'approved' ? 'var(--color-semantics-green-7)' : 'var(--color-semantics-red-6)',
                      }}>
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
    ? rows.filter((r) =>
        `${r.employee.fullName} ${r.employee.employeeCode}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : rows;

  const counts = {
    present:  rows.filter((r) => r.status === 'present').length,
    halfDay:  rows.filter((r) => r.status === 'half_day').length,
    absent:   rows.filter((r) => r.status === 'absent').length,
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

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
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }}
            className="hrms-input" style={{ width: 150 }} />
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

// ── Root ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [tab, setTab] = useState<'register' | 'regularizations'>('register');

  const TAB_STYLE = (active: boolean) => ({
    padding: '0.6rem 1.4rem',
    borderRadius: 99,
    fontSize: 'var(--text-fs-13)',
    fontWeight: active ? 700 : 400,
    cursor: 'pointer' as const,
    background: active ? 'var(--color-vr-blue-6)' : 'transparent',
    color: active ? '#fff' : 'var(--color-neutral-7)',
    border: '1px solid',
    borderColor: active ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-4)',
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
            <Calendar size={13} /> Register
          </button>
          <button style={TAB_STYLE(tab === 'regularizations')} onClick={() => setTab('regularizations')}>
            <FilePen size={13} /> Regularizations
          </button>
        </div>
      </div>

      {tab === 'register' ? <AttendanceRegister /> : <RegularizationsPanel />}
    </div>
  );
}
