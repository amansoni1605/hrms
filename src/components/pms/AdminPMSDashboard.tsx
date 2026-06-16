'use client';

import { useState, useCallback } from 'react';
import {
  Calendar, Settings, Bell, BellRing, Lock, Unlock, RefreshCw,
  CheckCircle2, AlertTriangle, Play, Users, ChevronRight, Loader2,
  Clock, BarChart3, Send, Info,
} from 'lucide-react';
import type { AppraisalPolicy, AppraisalPhase } from './types';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_POLICIES: AppraisalPolicy[] = [
  {
    id: 'pol_2027',
    assessmentYear: 'FY 2026-27',
    goalSetting:  { opensAt: '2026-04-01', closesAt: '2026-04-30' },
    midYear:      { opensAt: '2026-10-01', closesAt: '2026-10-31' },
    evaluation:   { opensAt: '2027-02-01', closesAt: '2027-02-28' },
    calibration:  { opensAt: '2027-03-01', closesAt: '2027-03-15' },
    currentPhase: 'goal_setting',
    isActive: true,
    remindersSent: 2,
    pendingCount: 14,
    totalEmployees: 62,
  },
  {
    id: 'pol_2026',
    assessmentYear: 'FY 2025-26',
    goalSetting:  { opensAt: '2025-04-01', closesAt: '2025-04-30' },
    midYear:      { opensAt: '2025-10-01', closesAt: '2025-10-31' },
    evaluation:   { opensAt: '2026-02-01', closesAt: '2026-02-28' },
    calibration:  { opensAt: '2026-03-01', closesAt: '2026-03-15' },
    currentPhase: 'calibration',
    isActive: false,
    remindersSent: 5,
    pendingCount: 0,
    totalEmployees: 58,
  },
];

const LAGGING_EMPLOYEES = [
  { id: 'e1', name: 'Riya Kapoor',     role: 'Sr. Engineer',     dept: 'Engineering',  daysLeft: 4, initials: 'RK', color: '#783489' },
  { id: 'e2', name: 'Karan Mehta',     role: 'Product Manager',  dept: 'Product',       daysLeft: 4, initials: 'KM', color: '#1C509D' },
  { id: 'e3', name: 'Sneha Pillai',    role: 'UX Designer',      dept: 'Design',        daysLeft: 4, initials: 'SP', color: '#0F7B6C' },
  { id: 'e4', name: 'Arjun Nair',      role: 'Sales Executive',  dept: 'Sales',         daysLeft: 4, initials: 'AN', color: '#B45309' },
  { id: 'e5', name: 'Deepa Sharma',    role: 'Data Analyst',     dept: 'Analytics',     daysLeft: 4, initials: 'DS', color: '#DC2626' },
  { id: 'e6', name: 'Varun Joshi',     role: 'DevOps Engineer',  dept: 'Engineering',  daysLeft: 4, initials: 'VJ', color: '#7C3AED' },
  { id: 'e7', name: 'Meena Krishnan',  role: 'HR Business Partner', dept: 'HR',         daysLeft: 4, initials: 'MK', color: '#0891B2' },
  { id: 'e8', name: 'Rohan Shetty',    role: 'Finance Analyst',  dept: 'Finance',       daysLeft: 4, initials: 'RS', color: '#059669' },
];

// ─── Phase metadata ───────────────────────────────────────────────────────────

const PHASE_META: Record<AppraisalPhase, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  goal_setting: { label: 'Goal Setting',  color: '#1C509D', bg: '#EBF0F9', icon: Settings  },
  mid_year:     { label: 'Mid-Year',      color: '#B45309', bg: '#FEF3C7', icon: BarChart3  },
  evaluation:   { label: 'Evaluation',    color: '#7C3AED', bg: '#F3E8FF', icon: CheckCircle2 },
  calibration:  { label: 'Calibration',  color: '#0F7B6C', bg: '#E7F6ED', icon: RefreshCw  },
};

const PHASE_ORDER: AppraisalPhase[] = ['goal_setting', 'mid_year', 'evaluation', 'calibration'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function isLocked(closesAt: string): boolean {
  return new Date(closesAt) < new Date();
}

// ─── PhaseTimeline ─────────────────────────────────────────────────────────────

function PhaseTimeline({ policy }: { policy: AppraisalPolicy }) {
  const currentIdx = PHASE_ORDER.indexOf(policy.currentPhase);

  const phaseWindows: Record<AppraisalPhase, { opensAt: string; closesAt: string }> = {
    goal_setting: policy.goalSetting,
    mid_year:     policy.midYear,
    evaluation:   policy.evaluation,
    calibration:  policy.calibration,
  };

  return (
    <div style={{ display: 'flex', gap: 0, position: 'relative', marginTop: '0.8rem' }}>
      {/* connector line */}
      <div style={{ position: 'absolute', top: 18, left: 24, right: 24, height: 2, background: 'var(--color-neutral-4)', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: 18, left: 24, height: 2, background: 'var(--color-vr-blue-6)', zIndex: 0, width: `calc(${(currentIdx / (PHASE_ORDER.length - 1)) * 100}% - 0px)`, transition: 'width 400ms ease' }} />

      {PHASE_ORDER.map((phase, i) => {
        const meta = PHASE_META[phase];
        const Icon = meta.icon;
        const win  = phaseWindows[phase];
        const past = i < currentIdx;
        const curr = i === currentIdx;
        const locked = isLocked(win.closesAt);

        return (
          <div
            key={phase}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}
          >
            <div
              style={{
                width: 36, height: 36, borderRadius: '50%',
                border: `2.5px solid ${curr ? meta.color : past ? 'var(--color-semantics-green-6)' : 'var(--color-neutral-5)'}`,
                background: curr ? meta.color : past ? 'var(--color-semantics-green-6)' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: curr ? `0 0 0 4px ${meta.color}25` : 'none',
                transition: 'all 200ms',
              }}
            >
              {past
                ? <CheckCircle2 size={16} color="#fff" />
                : <Icon size={14} color={curr ? '#fff' : 'var(--color-neutral-6)'} />
              }
            </div>
            <p style={{ margin: '0.5rem 0 0', fontFamily: 'var(--font-in-sb)', fontWeight: curr ? 700 : 600, fontSize: 'var(--text-fs-11)', color: curr ? meta.color : past ? 'var(--color-semantics-green-7)' : 'var(--color-neutral-6)', textAlign: 'center', whiteSpace: 'nowrap' }}>
              {meta.label}
            </p>
            <p style={{ margin: '0.15rem 0 0', fontSize: 9, color: 'var(--color-neutral-6)', textAlign: 'center' }}>
              {fmt(win.opensAt)} – {fmt(win.closesAt)}
            </p>
            {locked && i <= currentIdx && (
              <span style={{ marginTop: 3, fontSize: 9, padding: '1px 5px', borderRadius: 99, background: '#FEE2E2', color: '#991B1B', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
                Closed
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── WorkspaceLockBadge ───────────────────────────────────────────────────────

function WorkspaceLockBadge({ closesAt }: { closesAt: string }) {
  const locked = isLocked(closesAt);
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.5rem 1.2rem', borderRadius: '2rem',
        border: `1.5px solid ${locked ? '#FCA5A5' : '#6EE7B7'}`,
        background: locked ? '#FEF2F2' : '#ECFDF5',
        fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700,
        color: locked ? '#991B1B' : '#065F46',
      }}
    >
      {locked
        ? <><Lock size={12} /> LOCKED — Past Deadline</>
        : <><Unlock size={12} /> ACTIVE — Accepting Submissions</>
      }
    </div>
  );
}

// ─── ReinitModal ──────────────────────────────────────────────────────────────

function ReinitModal({ policy, onClose, onConfirm }: {
  policy:    AppraisalPolicy;
  onClose:   () => void;
  onConfirm: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1800));
    setLoading(false);
    onConfirm();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="hrms-card" style={{ maxWidth: 480, width: '100%', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.4rem' }}>
          <div style={{ width: 42, height: 42, borderRadius: '0.8rem', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <RefreshCw size={20} color="#B45309" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-18)', color: 'var(--color-neutral-10)' }}>
              Reinitiate Appraisal Cycle
            </h3>
            <p style={{ margin: '0.3rem 0 0', fontSize: 'var(--text-fs-13)', color: 'var(--color-neutral-7)' }}>
              This will broadcast a fresh goal-setting window to all employees in {policy.assessmentYear}.
            </p>
          </div>
        </div>

        <div style={{ padding: '1rem', borderRadius: '0.8rem', background: '#FEF3C7', border: '1px solid #FCD34D', marginBottom: '1.6rem' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: '#92400E', fontFamily: 'var(--font-in-rg)', lineHeight: 1.6 }}>
            ⚠ Existing draft goals will be retained. Approved goals will NOT be altered. Employees who already submitted will see their workspace in read-only mode until a new submission window opens.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.7rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="hrms-btn-ghost" style={{ padding: '0.7rem 1.4rem', fontSize: 'var(--text-fs-13)' }} disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.7rem 1.5rem', borderRadius: 'var(--radius-md)',
              border: 'none', background: '#B45309', color: '#fff',
              fontSize: 'var(--text-fs-13)', fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <><Loader2 size={13} className="animate-spin" /> Broadcasting…</> : <><Play size={13} /> Reinitiate Cycle</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AdminPMSDashboard ────────────────────────────────────────────────────────

export function AdminPMSDashboard() {
  const [selectedId,    setSelectedId]    = useState<string>(MOCK_POLICIES[0].id);
  const [policies,      setPolicies]      = useState<AppraisalPolicy[]>(MOCK_POLICIES);
  const [showReinit,    setShowReinit]    = useState(false);
  const [reinitOk,      setReinitOk]      = useState(false);
  const [reminderState, setReminderState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [cutoffDates,   setCutoffDates]   = useState<Record<AppraisalPhase, { opensAt: string; closesAt: string }>>({
    goal_setting: MOCK_POLICIES[0].goalSetting,
    mid_year:     MOCK_POLICIES[0].midYear,
    evaluation:   MOCK_POLICIES[0].evaluation,
    calibration:  MOCK_POLICIES[0].calibration,
  });

  const policy = policies.find((p) => p.id === selectedId) ?? policies[0];

  const handleReinitConfirm = useCallback(() => {
    setShowReinit(false);
    setReinitOk(true);
  }, []);

  const handleSendReminders = async () => {
    setReminderState('sending');
    await new Promise((r) => setTimeout(r, 2200));
    setPolicies((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, remindersSent: p.remindersSent + 1 } : p,
      ),
    );
    setReminderState('sent');
    setTimeout(() => setReminderState('idle'), 4000);
  };

  const handleCutoffChange = (phase: AppraisalPhase, field: 'opensAt' | 'closesAt', value: string) => {
    setCutoffDates((prev) => ({ ...prev, [phase]: { ...prev[phase], [field]: value } }));
  };

  const completionPct = Math.round(
    ((policy.totalEmployees - policy.pendingCount) / policy.totalEmployees) * 100,
  );

  return (
    <div>
      {/* ── Section: Process Control ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', marginBottom: '1.4rem' }}>

        {/* Assessment Year Selector */}
        <div className="hrms-card" style={{ padding: '1.4rem 1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.2rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '0.6rem', background: 'var(--color-vr-blue-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={15} color="var(--color-vr-blue-6)" />
            </div>
            <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
              Active Assessment Year
            </p>
          </div>

          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setReinitOk(false); setReminderState('idle'); }}
            className="hrms-input"
            style={{ marginBottom: '1rem', fontSize: 'var(--text-fs-14)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}
          >
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.assessmentYear} {p.isActive ? '(Active)' : '(Closed)'}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <div>
              <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>Current phase</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: 3, padding: '0.25rem 0.8rem', borderRadius: 99, background: PHASE_META[policy.currentPhase].bg, color: PHASE_META[policy.currentPhase].color }}>
                <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
                  {PHASE_META[policy.currentPhase].label}
                </span>
              </div>
            </div>
            <button
              onClick={() => { setShowReinit(true); setReinitOk(false); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '0.6rem 1.1rem', borderRadius: '0.7rem',
                border: '1.5px solid #FCD34D', background: '#FFFBEB',
                fontSize: 'var(--text-fs-12)', cursor: 'pointer',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: '#B45309',
                transition: 'all 120ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF3C7'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#FFFBEB'; }}
            >
              <RefreshCw size={12} /> Re-initiate Cycle
            </button>
          </div>

          {reinitOk && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.9rem', borderRadius: '0.7rem', background: '#D1FAE5', color: '#065F46', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
              <CheckCircle2 size={13} /> Broadcast sent. Employees have been notified.
            </div>
          )}

          <PhaseTimeline policy={{ ...policy, goalSetting: cutoffDates.goal_setting, midYear: cutoffDates.mid_year, evaluation: cutoffDates.evaluation, calibration: cutoffDates.calibration }} />
        </div>

        {/* Completion Stats */}
        <div className="hrms-card" style={{ padding: '1.4rem 1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.2rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '0.6rem', background: '#E7F6ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={15} color="#0F7B6C" />
            </div>
            <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
              Goal Setting Completion
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1.6rem', marginBottom: '1.2rem' }}>
            {[
              { label: 'Completed', value: policy.totalEmployees - policy.pendingCount, color: '#065F46', bg: '#D1FAE5' },
              { label: 'Pending',   value: policy.pendingCount,                          color: '#991B1B', bg: '#FEE2E2' },
              { label: 'Total',     value: policy.totalEmployees,                        color: 'var(--color-neutral-8)', bg: 'var(--color-neutral-3)' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} style={{ flex: 1, padding: '0.9rem', borderRadius: '0.8rem', background: bg, textAlign: 'center' }}>
                <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)', color }}>{value}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: 'var(--text-fs-11)', color, fontFamily: 'var(--font-in-rg)', opacity: 0.8 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>Completion rate</span>
              <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: completionPct >= 80 ? '#065F46' : '#B45309' }}>
                {completionPct}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 9999, background: 'var(--color-neutral-4)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${completionPct}%`, borderRadius: 9999, background: completionPct >= 80 ? '#059669' : completionPct >= 50 ? '#D97706' : '#DC2626', transition: 'width 400ms ease' }} />
            </div>
          </div>

          <div style={{ marginTop: '1rem', padding: '0.8rem', borderRadius: '0.7rem', background: 'var(--color-neutral-3)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Bell size={13} color="var(--color-neutral-7)" />
            <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)', fontFamily: 'var(--font-in-rg)' }}>
              {policy.remindersSent} reminder batch{policy.remindersSent !== 1 ? 'es' : ''} sent this cycle.
            </span>
          </div>
        </div>
      </div>

      {/* ── Section: Hard Cut-off Configuration ──────────────────────────────── */}
      <div className="hrms-card" style={{ padding: '1.4rem 1.6rem', marginBottom: '1.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '0.6rem', background: 'var(--color-semantics-red-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={15} color="var(--color-semantics-red-6)" />
            </div>
            <div>
              <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
                Hard Cut-off Date Configuration
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                Employee workspaces lock immediately once the closesAt date passes.
              </p>
            </div>
          </div>
          <WorkspaceLockBadge closesAt={cutoffDates[policy.currentPhase].closesAt} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.2rem' }}>
          {(PHASE_ORDER as AppraisalPhase[]).map((phase) => {
            const meta   = PHASE_META[phase];
            const Icon   = meta.icon;
            const window = cutoffDates[phase];
            const active = phase === policy.currentPhase;
            const locked = isLocked(window.closesAt);

            return (
              <div
                key={phase}
                style={{
                  padding: '1.1rem', borderRadius: '0.9rem',
                  border: `1.5px solid ${active ? meta.color + '60' : 'var(--color-stroke)'}`,
                  background: active ? meta.bg : 'var(--color-neutral-2)',
                  opacity: !active && !locked ? 1 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                  <Icon size={14} color={meta.color} />
                  <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-13)', color: meta.color }}>
                    {meta.label}
                  </p>
                  {active && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 7px', borderRadius: 99, background: meta.color, color: '#fff', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
                      CURRENT
                    </span>
                  )}
                  {locked && !active && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 7px', borderRadius: 99, background: '#FEE2E2', color: '#991B1B', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
                      CLOSED
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  {(['opensAt', 'closesAt'] as const).map((field) => (
                    <div key={field}>
                      <label style={{ display: 'block', marginBottom: 3, fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {field === 'opensAt' ? 'Opens At' : 'Closes At'}
                      </label>
                      <input
                        type="date"
                        value={window[field]}
                        onChange={(e) => handleCutoffChange(phase, field, e.target.value)}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '0.55rem 0.7rem', borderRadius: '0.6rem',
                          border: `1.5px solid ${active ? meta.color + '40' : 'var(--color-stroke)'}`,
                          background: '#fff', fontSize: 'var(--text-fs-12)',
                          fontFamily: 'var(--font-in-rg)', color: 'var(--color-neutral-10)',
                          outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section: Bulk Reminder Trigger ────────────────────────────────────── */}
      <div className="hrms-card" style={{ padding: '1.4rem 1.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '0.6rem', background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BellRing size={15} color="#7C3AED" />
            </div>
            <div>
              <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
                Bulk Reminder Trigger
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                {policy.pendingCount} employee{policy.pendingCount !== 1 ? 's' : ''} haven't completed goal setting yet.
              </p>
            </div>
          </div>

          <button
            onClick={handleSendReminders}
            disabled={reminderState !== 'idle' || policy.pendingCount === 0}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.75rem 1.4rem', borderRadius: '0.8rem', border: 'none',
              background: reminderState === 'sent' ? '#059669' : '#7C3AED',
              color: '#fff', fontSize: 'var(--text-fs-13)',
              fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              cursor: (reminderState !== 'idle' || policy.pendingCount === 0) ? 'not-allowed' : 'pointer',
              opacity: (reminderState !== 'idle' || policy.pendingCount === 0) ? 0.7 : 1,
              transition: 'all 200ms',
            }}
          >
            {reminderState === 'sending' && <><Loader2 size={13} className="animate-spin" /> Sending…</>}
            {reminderState === 'sent'    && <><CheckCircle2 size={13} /> Sent Successfully!</>}
            {reminderState === 'idle'    && <><Send size={13} /> Send Reminders ({policy.pendingCount})</>}
          </button>
        </div>

        {/* Lagging employees table */}
        {LAGGING_EMPLOYEES.length > 0 ? (
          <div style={{ overflowX: 'auto', borderRadius: '0.8rem', border: '1px solid var(--color-stroke)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
              <thead>
                <tr>
                  {['Employee', 'Role', 'Department', 'Deadline', 'Status'].map((h) => (
                    <th key={h} className="hrms-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LAGGING_EMPLOYEES.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{ transition: 'background 100ms' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td className="hrms-td">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: emp.color + '20', border: `1.5px solid ${emp.color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 10, color: emp.color, flexShrink: 0 }}>
                          {emp.initials}
                        </div>
                        <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>
                          {emp.name}
                        </span>
                      </div>
                    </td>
                    <td className="hrms-td" style={{ color: 'var(--color-neutral-7)' }}>{emp.role}</td>
                    <td className="hrms-td">
                      <span style={{ padding: '2px 8px', borderRadius: 99, background: 'var(--color-neutral-3)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)' }}>
                        {emp.dept}
                      </span>
                    </td>
                    <td className="hrms-td">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#DC2626' }}>
                        <Clock size={11} />
                        <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                          {fmt(cutoffDates.goal_setting.closesAt)}
                        </span>
                      </div>
                    </td>
                    <td className="hrms-td">
                      <span style={{ padding: '2px 9px', borderRadius: 99, background: '#FEE2E2', color: '#991B1B', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
                        Goals Not Set
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-13)' }}>
            <CheckCircle2 size={28} style={{ color: '#059669', marginBottom: '0.6rem' }} />
            <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: '#065F46' }}>
              All employees have completed their goal setting!
            </p>
          </div>
        )}

        {reminderState === 'sent' && (
          <div style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1rem', borderRadius: '0.7rem', background: '#D1FAE5', border: '1px solid #6EE7B7', fontSize: 'var(--text-fs-12)', color: '#065F46', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
            <CheckCircle2 size={13} />
            Reminder batch #{policy.remindersSent} dispatched to {policy.pendingCount} employees via email + in-app notification.
          </div>
        )}
      </div>

      {showReinit && (
        <ReinitModal
          policy={policy}
          onClose={() => setShowReinit(false)}
          onConfirm={handleReinitConfirm}
        />
      )}
    </div>
  );
}
