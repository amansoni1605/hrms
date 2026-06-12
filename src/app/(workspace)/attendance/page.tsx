'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Calendar, Download, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface AttendanceRow {
  employee: { _id: string; employeeCode: string; fullName: string; jobTitle: string };
  checkIn: string | null;
  checkOut: string | null;
  workingHours: number;
  status: 'present' | 'half_day' | 'absent';
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  present:  { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)', label: 'Present' },
  half_day: { bg: '#FFF3CD', fg: '#856404', label: 'Half Day' },
  absent:   { bg: 'var(--color-semantics-red-1)',   fg: 'var(--color-semantics-red-6)',   label: 'Absent' },
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AttendancePage() {
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
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>
            Attendance Register
          </h2>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{total} employees</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <button onClick={() => shiftDate(-1)} className="hrms-btn-ghost" style={{ padding: '0.5rem' }}><ChevronLeft size={16} /></button>
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }}
            className="hrms-input" style={{ width: 150 }} />
          <button onClick={() => shiftDate(1)} className="hrms-btn-ghost" style={{ padding: '0.5rem' }}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* KPI strip */}
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

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-neutral-6)' }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          className="hrms-input" placeholder="Search employee…" style={{ paddingLeft: '2.8rem', maxWidth: 320 }} />
      </div>

      {/* Table */}
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
