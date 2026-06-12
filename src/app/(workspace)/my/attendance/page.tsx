'use client';

import { useEffect, useState, useCallback } from 'react';
import { Clock, CheckCircle, XCircle, Loader2, MapPin, TrendingUp } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface DaySummary {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  workingHours: number;
  status: 'present' | 'half_day' | 'absent';
}

interface AttendanceStats {
  presentDays: number;
  halfDays: number;
  totalLogged: number;
  days: number;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  present:  { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)', label: 'Present' },
  half_day: { bg: '#FFF3CD', fg: '#856404', label: 'Half Day' },
  absent:   { bg: 'var(--color-semantics-red-1)',   fg: 'var(--color-semantics-red-6)',   label: 'Absent' },
};

export default function MyAttendancePage() {
  const toast = useToast();
  const [todayStatus, setTodayStatus]   = useState<{ checkedIn: boolean; checkedOut: boolean; checkInAt: string | null } | null>(null);
  const [summary,     setSummary]       = useState<DaySummary[]>([]);
  const [stats,       setStats]         = useState<AttendanceStats | null>(null);
  const [loading,     setLoading]       = useState(true);
  const [checking,    setChecking]      = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [todayRes, histRes] = await Promise.all([
      fetch('/api/me/checkin'),
      fetch('/api/me/attendance?days=30'),
    ]);
    const [todayJson, histJson] = await Promise.all([todayRes.json(), histRes.json()]);
    setTodayStatus(todayJson.data ?? null);
    setSummary(histJson.data?.summary ?? []);
    setStats(histJson.data?.stats ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const doCheckIn = async (eventType: 'check_in' | 'check_out') => {
    setChecking(true);
    const res  = await fetch('/api/me/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, location: 'Office' }),
    });
    setChecking(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: eventType === 'check_in' ? 'Checked in successfully' : 'Checked out successfully' });
      loadData();
    } else {
      toast.push({ kind: 'error', title: 'Failed to record attendance' });
    }
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  const todayDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const attendancePct = stats ? Math.round((stats.presentDays + stats.halfDays * 0.5) / stats.days * 100) : 0;

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <h2 style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>
        My Attendance
      </h2>
      <p style={{ margin: '0 0 2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{todayDate}</p>

      {/* Check-in widget */}
      <div className="hrms-card" style={{ padding: '2rem', marginBottom: '1.6rem', display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 0.4rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
            Today&apos;s Status
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)', color: 'var(--color-neutral-10)' }}>
            {todayStatus?.checkedIn ? (todayStatus.checkedOut ? 'Completed' : 'In Office') : 'Not Started'}
          </p>
          {todayStatus?.checkInAt && (
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={11} /> Check-in at {fmt(todayStatus.checkInAt)}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          {!todayStatus?.checkedIn && (
            <button onClick={() => doCheckIn('check_in')} disabled={checking} className="hrms-btn-primary" style={{ gap: '0.4rem' }}>
              {checking ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Check In
            </button>
          )}
          {todayStatus?.checkedIn && !todayStatus?.checkedOut && (
            <button onClick={() => doCheckIn('check_out')} disabled={checking} className="hrms-btn-ghost" style={{ gap: '0.4rem' }}>
              {checking ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
              Check Out
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.6rem' }}>
          {[
            { label: 'Present Days',   value: stats.presentDays,  color: 'var(--color-semantics-green-7)' },
            { label: 'Half Days',      value: stats.halfDays,     color: '#D98C00' },
            { label: 'Days Tracked',   value: stats.totalLogged,  color: 'var(--color-vr-blue-6)' },
            { label: 'Attendance %',   value: `${attendancePct}%`, color: attendancePct >= 90 ? 'var(--color-semantics-green-7)' : 'var(--color-semantics-red-6)' },
          ].map((kpi) => (
            <div key={kpi.label} className="hrms-kpi-card">
              <p className="hrms-kpi-label">{kpi.label}</p>
              <p className="hrms-kpi-value" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Daily summary table */}
      <div className="hrms-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <TrendingUp size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
          <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
            Last 30 Days
          </h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Check In', 'Check Out', 'Hours', 'Status'].map((h) => (
                <th key={h} className="hrms-th" style={{ textAlign: h === 'Status' ? 'center' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>No records yet</td></tr>
            )}
            {[...summary].reverse().map((row) => {
              const style = STATUS_STYLE[row.status] ?? STATUS_STYLE['absent']!;
              return (
                <tr key={row.date} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                  <td className="hrms-td">{new Date(row.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}</td>
                  <td className="hrms-td">{fmt(row.checkIn)}</td>
                  <td className="hrms-td">{fmt(row.checkOut)}</td>
                  <td className="hrms-td">{row.workingHours > 0 ? `${row.workingHours}h` : '—'}</td>
                  <td className="hrms-td" style={{ textAlign: 'center' }}>
                    <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: style.bg, color: style.fg, fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                      {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
