'use client';

import { useEffect, useState, use } from 'react';
import { useRouter }                 from 'next/navigation';
import {
  ArrowLeft, Loader2, User, Mail, Phone, MapPin, Calendar, Briefcase,
  Star, Target, TrendingUp, AlertTriangle, FileText, DollarSign,
  ClipboardList, Users, Globe, Clock, Shield,
} from 'lucide-react';
import { Tabs }        from '@/components/ui/Tabs';
import { RiskBar }     from '@/components/ui/RiskBar';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { EmptyState }  from '@/components/ui/EmptyState';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Skill { skillName: string; category: string; proficiency: string }
interface EmergencyContact { name?: string; relationship?: string; phone?: string; email?: string }

interface EmployeeDetail {
  _id: string; employeeCode: string; fullName: string | null;
  email: string | null; phone: string | null;
  jobTitle: string; departmentName: string; departmentCode: string;
  employeeStatus: string; employmentType: string;
  hireDate: string | null; tenureYears: number | null;
  countryCode: string; timezone: string; salaryBand: string | null;
  managerName: string | null; emergencyContact: EmergencyContact | null;
  burnoutRiskScore: number; flightRiskScore: number; engagementPct: number | null;
  skills: Skill[]; isDirectReport: boolean;
}

interface LeaveBalance { year: number; annual: number; sick: number; earned: number; used: number; remaining: number }
interface LeaveRequest { _id: string; leaveType: string; startDate: string; endDate: string; totalDays: number; status: string; reason: string; createdAt: string }
interface AttendanceDay { date: string; status: string; checkIn: string | null; checkOut: string | null; hours: number }
interface AttendanceStats { presentDays: number; halfDays: number; totalLogged: number; days: number }
interface Review { _id: string; cycleLabel: string; status: string; overallRating: number | null; periodStart: string | null; periodEnd: string | null }
interface KeyResult { title: string; done: boolean; currentValue: number; targetValue: number; unit: string }
interface Goal { _id: string; title: string; category: string; status: string; progressPct: number; cycleLabel: string | null; weight: number; keyResults: KeyResult[] }
interface ExpenseClaim { _id: string; status: string; totalClaimed: number; totalSanctioned: number; month: string | null; itemCount: number; createdAt: string }

interface MemberData {
  employee:      EmployeeDetail;
  leaveBalance:  LeaveBalance | null;
  leaveRequests: LeaveRequest[];
  attendance:    { stats: AttendanceStats; summary: AttendanceDay[] };
  reviews:       Review[];
  goals:         Goal[];
  expenses:      ExpenseClaim[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROFICIENCY_ORDER = ['awareness', 'working', 'practitioner', 'expert', 'authority'];

const GOAL_STATUS_COLOR: Record<string, string> = {
  active:    'var(--color-vr-blue-7)',
  achieved:  'var(--color-semantics-green-7)',
  at_risk:   'var(--color-semantics-orange-7)',
  missed:    'var(--color-semantics-red-6)',
  draft:     'var(--color-neutral-6)',
  cancelled: 'var(--color-neutral-6)',
};

const EXPENSE_STATUS_COLOR: Record<string, string> = {
  draft:            'var(--color-neutral-6)',
  submitted:        'var(--color-vr-blue-7)',
  manager_approved: 'var(--color-semantics-orange-7)',
  finance_approved: 'var(--color-semantics-green-7)',
  paid:             'var(--color-semantics-green-7)',
  rejected:         'var(--color-semantics-red-6)',
};

function fmt(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function initials(name: string | null, code: string) {
  if (!name) return code.slice(0, 2).toUpperCase();
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start', padding: '0.6rem 0', borderBottom: '1px solid var(--color-stroke)' }}>
      <Icon size={13} style={{ color: 'var(--color-neutral-6)', marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)', minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{value || '—'}</span>
    </div>
  );
}

// ─── Tab panels ──────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: MemberData }) {
  const e = data.employee;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.4rem', alignItems: 'start' }}>
      {/* Left: employment + contact */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <div className="hrms-card" style={{ padding: '1.6rem' }}>
          <p style={{ margin: '0 0 1rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Employment</p>
          <InfoRow icon={Briefcase}  label="Job Title"        value={e.jobTitle} />
          <InfoRow icon={Users}      label="Department"       value={`${e.departmentName}${e.departmentCode ? ` (${e.departmentCode})` : ''}`} />
          <InfoRow icon={Calendar}   label="Hire Date"        value={fmt(e.hireDate)} />
          <InfoRow icon={Clock}      label="Tenure"           value={e.tenureYears != null ? `${e.tenureYears} yr${e.tenureYears !== 1 ? 's' : ''}` : '—'} />
          <InfoRow icon={FileText}   label="Employment Type"  value={e.employmentType?.replace(/_/g, ' ')} />
          <InfoRow icon={Shield}     label="Salary Band"      value={e.salaryBand ?? '—'} />
          <InfoRow icon={User}       label="Reports To"       value={e.managerName ?? '—'} />
          <InfoRow icon={Globe}      label="Country"          value={`${e.countryCode}${e.timezone ? ` · ${e.timezone}` : ''}`} />
        </div>

        <div className="hrms-card" style={{ padding: '1.6rem' }}>
          <p style={{ margin: '0 0 1rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact</p>
          <InfoRow icon={Mail}  label="Work Email" value={e.email ?? '—'} />
          <InfoRow icon={Phone} label="Phone"      value={e.phone ?? '—'} />
          <InfoRow icon={MapPin} label="Location"  value={e.countryCode} />
          {e.emergencyContact?.name && (
            <>
              <p style={{ margin: '1rem 0 0.4rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)' }}>Emergency Contact</p>
              <InfoRow icon={User}  label="Name"        value={`${e.emergencyContact.name}${e.emergencyContact.relationship ? ` (${e.emergencyContact.relationship})` : ''}`} />
              {e.emergencyContact.phone && <InfoRow icon={Phone} label="Phone" value={e.emergencyContact.phone} />}
            </>
          )}
        </div>

        {e.skills.length > 0 && (
          <div className="hrms-card" style={{ padding: '1.6rem' }}>
            <p style={{ margin: '0 0 1rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Skills</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              {e.skills.map((s, i) => {
                const level = PROFICIENCY_ORDER.indexOf(s.proficiency);
                const pct   = Math.round((level + 1) / PROFICIENCY_ORDER.length * 100);
                return (
                  <div key={i} title={`${s.proficiency} · ${s.category}`} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', padding: '0.5rem 0.8rem', borderRadius: '0.6rem', border: '1px solid var(--color-stroke)', background: 'var(--color-neutral-1)' }}>
                    <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{s.skillName}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-neutral-6)' }}>{s.proficiency} · {pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right: risk & wellbeing */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <div className="hrms-card" style={{ padding: '1.6rem' }}>
          <p style={{ margin: '0 0 1.2rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wellbeing & Risk</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <RiskBar score={e.burnoutRiskScore} label="Burnout Risk" showValue />
            </div>
            <div>
              <RiskBar score={e.flightRiskScore} label="Flight Risk" showValue />
            </div>
            {e.engagementPct != null && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 'var(--text-fs-12)' }}>
                  <span style={{ color: 'var(--color-neutral-7)' }}>Engagement</span>
                  <span style={{ color: 'var(--color-semantics-green-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{e.engagementPct}%</span>
                </div>
                <div className="hrms-risk-bar__track" style={{ height: 6 }}>
                  <div style={{ height: '100%', width: `${e.engagementPct}%`, background: 'var(--color-semantics-green-7)', borderRadius: 3, transition: 'width 200ms ease' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick review summary */}
        {data.reviews.length > 0 && (
          <div className="hrms-card" style={{ padding: '1.6rem' }}>
            <p style={{ margin: '0 0 1rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Latest Review</p>
            {(() => {
              const r = data.reviews[0];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-fs-13)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{r.cycleLabel}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.overallRating != null && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-semantics-orange-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
                      <Star size={13} fill="currentColor" /> {r.overallRating} / 5
                    </div>
                  )}
                  {(r.periodStart || r.periodEnd) && (
                    <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>{fmt(r.periodStart)} – {fmt(r.periodEnd)}</span>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Goals snapshot */}
        {data.goals.length > 0 && (
          <div className="hrms-card" style={{ padding: '1.6rem' }}>
            <p style={{ margin: '0 0 1rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Goals Snapshot</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {data.goals.slice(0, 3).map((g) => (
                <div key={g._id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{g.title}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: GOAL_STATUS_COLOR[g.status] ?? 'var(--color-neutral-6)' }}>{g.progressPct}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--color-neutral-3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${g.progressPct}%`, background: GOAL_STATUS_COLOR[g.status] ?? 'var(--color-vr-blue-6)', transition: 'width 200ms ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeavesTab({ leaveBalance, leaveRequests }: { leaveBalance: LeaveBalance | null; leaveRequests: LeaveRequest[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      {/* Balance cards */}
      {leaveBalance ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.2rem' }}>
          {[
            { label: 'Annual',    total: leaveBalance.annual,   used: leaveBalance.used, color: 'var(--color-vr-blue-6)' },
            { label: 'Sick',      total: leaveBalance.sick,     used: 0,                 color: 'var(--color-semantics-orange-7)' },
            { label: 'Earned',    total: leaveBalance.earned,   used: 0,                 color: 'var(--color-semantics-green-7)' },
            { label: 'Remaining', total: leaveBalance.remaining,used: 0,                 color: 'var(--color-semantics-green-7)' },
          ].map(({ label, total, color }) => (
            <div key={label} className="hrms-kpi-card" style={{ padding: '1.2rem 1.4rem' }}>
              <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>{label} ({leaveBalance.year})</p>
              <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)', color }}>{total}</p>
              <p style={{ margin: '2px 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>days</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="hrms-card" style={{ padding: '1.4rem', textAlign: 'center', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>
          No leave balance for {new Date().getFullYear()}
        </div>
      )}

      {/* Leave requests */}
      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
          <h3 className="hrms-section-label" style={{ margin: 0 }}>Recent Leave Requests · {leaveRequests.length}</h3>
        </div>
        {leaveRequests.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>No leave requests found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>{['Type', 'Dates', 'Days', 'Status', 'Reason'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {leaveRequests.map((l) => (
                <tr key={l._id}>
                  <td className="hrms-td"><Badge variant="info">{l.leaveType.replace(/_/g, ' ')}</Badge></td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(l.startDate)} – {fmt(l.endDate)}</td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{l.totalDays}</td>
                  <td className="hrms-td"><StatusBadge status={l.status} /></td>
                  <td className="hrms-td" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-neutral-7)' }}>{l.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AttendanceTab({ attendance }: { attendance: { stats: AttendanceStats; summary: AttendanceDay[] } }) {
  const { stats, summary } = attendance;
  const byDate = new Map(summary.map((d) => [d.date, d]));

  // Build a 30-day grid from today backwards
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const STATUS_COLOR: Record<string, string> = {
    present:  'var(--color-semantics-green-7)',
    half_day: 'var(--color-semantics-orange-7)',
    absent:   'var(--color-semantics-red-6)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.2rem' }}>
        {[
          { label: 'Present Days',   value: stats.presentDays,  color: 'var(--color-semantics-green-7)' },
          { label: 'Half Days',      value: stats.halfDays,     color: 'var(--color-semantics-orange-7)' },
          { label: 'Days Logged',    value: stats.totalLogged,  color: 'var(--color-vr-blue-6)' },
          { label: 'Absent / No log',value: stats.days - stats.totalLogged, color: 'var(--color-semantics-red-6)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="hrms-kpi-card" style={{ padding: '1.2rem 1.4rem' }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>{label}</p>
            <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)', color }}>{value}</p>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>last 30 days</p>
          </div>
        ))}
      </div>

      {/* 30-day grid */}
      <div className="hrms-card" style={{ padding: '1.6rem' }}>
        <p style={{ margin: '0 0 1.2rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>30-Day Attendance</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {days.map((date) => {
            const d    = byDate.get(date);
            const stat = d?.status ?? 'no_log';
            const bg   = STATUS_COLOR[stat] ?? 'var(--color-neutral-3)';
            const tip  = d
              ? `${date}\nIn: ${fmtTime(d.checkIn)} · Out: ${fmtTime(d.checkOut)} · ${d.hours}h`
              : `${date} — no log`;
            return (
              <div key={date} title={tip} style={{
                width: 28, height: 28, borderRadius: 4,
                background: d ? bg + '22' : 'var(--color-neutral-3)',
                border: `1px solid ${d ? bg + '66' : 'var(--color-stroke)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'default',
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: d ? bg : 'var(--color-neutral-5)' }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '1.6rem', marginTop: '1rem' }}>
          {[
            { label: 'Present', color: 'var(--color-semantics-green-7)' },
            { label: 'Half Day', color: 'var(--color-semantics-orange-7)' },
            { label: 'Absent', color: 'var(--color-semantics-red-6)' },
            { label: 'No Log', color: 'var(--color-neutral-5)' },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Detail table — only days with logs */}
      {summary.length > 0 && (
        <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
            <h3 className="hrms-section-label" style={{ margin: 0 }}>Daily Log</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>{['Date', 'Check In', 'Check Out', 'Hours', 'Status'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {[...summary].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(d.date)}</td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(d.checkIn)}</td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(d.checkOut)}</td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{d.hours}h</td>
                  <td className="hrms-td">
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '0.4rem', fontSize: 11,
                      fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                      background: (STATUS_COLOR[d.status] ?? 'var(--color-neutral-4)') + '18',
                      color: STATUS_COLOR[d.status] ?? 'var(--color-neutral-7)',
                    }}>
                      {d.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PerformanceTab({ reviews, goals, router }: { reviews: Review[]; goals: Goal[]; router: ReturnType<typeof useRouter> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      {/* Reviews */}
      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
          <h3 className="hrms-section-label" style={{ margin: 0 }}>Performance Reviews · {reviews.length}</h3>
        </div>
        {reviews.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>No reviews found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>{['Cycle', 'Period', 'Status', 'Rating', ''].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r._id} onClick={() => router.push(`/performance/${r._id}`)} style={{ cursor: 'pointer' }}>
                  <td className="hrms-td" style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{r.cycleLabel}</td>
                  <td className="hrms-td" style={{ color: 'var(--color-neutral-7)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.periodStart || r.periodEnd ? `${fmt(r.periodStart)} – ${fmt(r.periodEnd)}` : '—'}
                  </td>
                  <td className="hrms-td"><StatusBadge status={r.status} /></td>
                  <td className="hrms-td">
                    {r.overallRating != null
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-semantics-orange-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
                          <Star size={11} fill="currentColor" /> {r.overallRating}
                        </span>
                      : <span style={{ color: 'var(--color-neutral-6)' }}>—</span>
                    }
                  </td>
                  <td className="hrms-td" style={{ textAlign: 'right', color: 'var(--color-neutral-5)', fontSize: 10 }}>View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Goals */}
      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
          <h3 className="hrms-section-label" style={{ margin: 0 }}>Goals · {goals.length}</h3>
        </div>
        {goals.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>No goals found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {goals.map((g, i) => (
              <div key={g._id} style={{ padding: '1.2rem 1.6rem', borderBottom: i < goals.length - 1 ? '1px solid var(--color-stroke)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-13)', color: 'var(--color-neutral-10)' }}>{g.title}</span>
                      {g.cycleLabel && <Badge variant="info">{g.cycleLabel}</Badge>}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--color-neutral-6)', textTransform: 'capitalize' }}>{g.category}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: GOAL_STATUS_COLOR[g.status] ?? 'var(--color-neutral-7)' }}>{g.status.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 'var(--text-fs-13)', fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: GOAL_STATUS_COLOR[g.status] ?? 'var(--color-neutral-10)' }}>{g.progressPct}%</span>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--color-neutral-3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${g.progressPct}%`, background: GOAL_STATUS_COLOR[g.status] ?? 'var(--color-vr-blue-6)', transition: 'width 200ms ease' }} />
                </div>
                {g.keyResults.length > 0 && (
                  <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {g.keyResults.map((kr, ki) => (
                      <div key={ki} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                        <Target size={10} style={{ flexShrink: 0, color: kr.done ? 'var(--color-semantics-green-7)' : 'var(--color-neutral-5)' }} />
                        <span>{kr.title}</span>
                        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--color-neutral-6)' }}>{kr.currentValue} / {kr.targetValue} {kr.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExpensesTab({ expenses }: { expenses: ExpenseClaim[] }) {
  const totalClaimed    = expenses.reduce((s, e) => s + e.totalClaimed, 0);
  const pendingCount    = expenses.filter((e) => ['submitted', 'manager_approved'].includes(e.status)).length;
  const paidTotal       = expenses.filter((e) => e.status === 'paid').reduce((s, e) => s + e.totalSanctioned, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.2rem' }}>
        {[
          { label: 'Total Claimed',   value: `₹${totalClaimed.toLocaleString()}`,   color: 'var(--color-vr-blue-6)' },
          { label: 'Pending Approval',value: String(pendingCount),                   color: 'var(--color-semantics-orange-7)' },
          { label: 'Total Paid',      value: `₹${paidTotal.toLocaleString()}`,       color: 'var(--color-semantics-green-7)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="hrms-kpi-card" style={{ padding: '1.2rem 1.4rem' }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>{label}</p>
            <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Claims table */}
      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
          <h3 className="hrms-section-label" style={{ margin: 0 }}>Expense Claims · {expenses.length}</h3>
        </div>
        {expenses.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>No expense claims found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>{['Month', 'Items', 'Claimed', 'Sanctioned', 'Status', 'Date'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e._id}>
                  <td className="hrms-td" style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{e.month ?? '—'}</td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{e.itemCount}</td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>₹{e.totalClaimed.toLocaleString()}</td>
                  <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {e.totalSanctioned > 0 ? `₹${e.totalSanctioned.toLocaleString()}` : '—'}
                  </td>
                  <td className="hrms-td">
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '0.4rem', fontSize: 11,
                      fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                      background: (EXPENSE_STATUS_COLOR[e.status] ?? 'var(--color-neutral-4)') + '18',
                      color: EXPENSE_STATUS_COLOR[e.status] ?? 'var(--color-neutral-7)',
                    }}>
                      {e.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="hrms-td" style={{ color: 'var(--color-neutral-6)', fontVariantNumeric: 'tabular-nums' }}>{fmt(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',    label: 'Overview',    icon: User },
  { key: 'leaves',      label: 'Leaves',      icon: Calendar },
  { key: 'attendance',  label: 'Attendance',  icon: ClipboardList },
  { key: 'performance', label: 'Performance', icon: TrendingUp },
  { key: 'expenses',    label: 'Expenses',    icon: DollarSign },
];

export default function TeamMemberPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = use(params);
  const router = useRouter();
  const [data, setData]       = useState<MemberData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetch(`/api/me/team/${employeeId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d.data);
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '2rem', maxWidth: 600 }}>
        <EmptyState icon={User} title="Member not found" message={error ?? 'This team member could not be loaded.'} />
        <button className="hrms-btn-ghost" onClick={() => router.back()} style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> Back to My Team
        </button>
      </div>
    );
  }

  const e = data.employee;
  const displayName = e.fullName ?? e.employeeCode;
  const init        = initials(e.fullName, e.employeeCode);

  return (
    <div style={{ padding: '2rem', maxWidth: 1200 }}>
      {/* Back link */}
      <button
        onClick={() => router.push('/my/team')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: '1.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}
        onMouseEnter={(ev) => (ev.currentTarget.style.color = 'var(--color-vr-blue-6)')}
        onMouseLeave={(ev) => (ev.currentTarget.style.color = 'var(--color-neutral-7)')}
      >
        <ArrowLeft size={13} /> My Team
      </button>

      {/* Profile header */}
      <div className="hrms-card" style={{ marginBottom: '1.4rem', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.6rem', flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'var(--color-vr-blue-2)',
            border: '2px solid var(--color-vr-blue-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-vr-blue-7)' }}>{init}</span>
          </div>

          {/* Name / meta */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>{displayName}</h2>
              <Badge variant="neutral">{e.employeeCode}</Badge>
              <StatusBadge status={e.employeeStatus} />
              <Badge variant={e.isDirectReport ? 'success' : 'info'}>{e.isDirectReport ? 'Direct Report' : 'Skip-Level Report'}</Badge>
            </div>
            <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--text-fs-13)', color: 'var(--color-neutral-7)' }}>
              {e.jobTitle} · {e.departmentName}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
              {e.email && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>
                  <Mail size={11} />{e.email}
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>
                <MapPin size={11} />{e.countryCode}
              </span>
              {e.hireDate && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>
                  <Calendar size={11} />Joined {fmt(e.hireDate)}{e.tenureYears != null ? ` · ${e.tenureYears}yr` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Risk pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 160 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem' }}>
              <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>Burnout</span>
              <span className={e.burnoutRiskScore >= 0.7 ? 'loss_pill' : e.burnoutRiskScore >= 0.4 ? 'hrms-badge hrms-badge--warning' : 'gain_pill'}>
                {Math.round(e.burnoutRiskScore * 100)}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem' }}>
              <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>Flight Risk</span>
              <span className={e.flightRiskScore >= 0.7 ? 'loss_pill' : e.flightRiskScore >= 0.4 ? 'hrms-badge hrms-badge--warning' : 'gain_pill'}>
                {Math.round(e.flightRiskScore * 100)}%
              </span>
            </div>
            {e.engagementPct != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem' }}>
                <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>Engagement</span>
                <span className="gain_pill">{e.engagementPct}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '0 1.6rem', background: 'var(--color-neutral-1)' }}>
          <Tabs
            tabs={TABS.map((t) => ({
              ...t,
              count: t.key === 'leaves'      ? data.leaveRequests.length
                   : t.key === 'attendance'  ? data.attendance.stats.totalLogged
                   : t.key === 'performance' ? data.reviews.length + data.goals.length
                   : t.key === 'expenses'    ? data.expenses.length
                   : undefined,
            }))}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>
        <div style={{ padding: '1.6rem' }}>
          {activeTab === 'overview'    && <OverviewTab    data={data} />}
          {activeTab === 'leaves'      && <LeavesTab      leaveBalance={data.leaveBalance} leaveRequests={data.leaveRequests} />}
          {activeTab === 'attendance'  && <AttendanceTab  attendance={data.attendance} />}
          {activeTab === 'performance' && <PerformanceTab reviews={data.reviews} goals={data.goals} router={router} />}
          {activeTab === 'expenses'    && <ExpensesTab    expenses={data.expenses} />}
        </div>
      </div>
    </div>
  );
}
