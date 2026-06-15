'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  ChevronRight,
  FastForward,
  Calculator,
  Plus,
  UserCheck,
  AlertCircle,
  Calendar,
  Check,
  X,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast }   from '@/components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CyclePhase {
  phase:    string;
  opensAt:  string;
  closesAt: string;
}

interface Cycle {
  _id:          string;
  name:         string;
  type:         string;
  status:       string;
  startDate:    string;
  endDate:      string;
  phases:       CyclePhase[];
  enable360:    boolean;
  pipThreshold: number;
  isActive:     boolean;
  createdAt:    string;
}

interface PMSReview {
  _id:             string;
  revieweeId:      string;
  revieweeCode?:   string;
  revieweeName?:   string;
  reviewerRole:    string;
  status:          string;
  finalScore?:     number;
  calibratedScore?: number;
  pipTriggered:    boolean;
  submittedAt?:    string;
}

interface Employee {
  _id:          string;
  employeeCode: string;
  name?:        string;
  jobTitle?:    string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_ORDER = [
  'cycle_initiated',
  'self_appraisal',
  'manager_review',
  'peer_360',
  'calibration',
  'approved_hr',
  'signed_off',
] as const;

type PhaseKey = typeof PHASE_ORDER[number];

const PHASE_LABEL: Record<string, string> = {
  cycle_initiated: 'Initiated',
  self_appraisal:  'Self-appraisal',
  manager_review:  'Manager review',
  peer_360:        '360° Peer',
  calibration:     'Calibration',
  approved_hr:     'HR Approval',
  signed_off:      'Sign-off',
};

const CYCLE_STATUS_STYLE: Record<string, React.CSSProperties> = {
  draft:           { background: '#F3F4F6', color: '#6B7280' },
  cycle_initiated: { background: '#DBEAFE', color: '#1D4ED8' },
  self_appraisal:  { background: '#FEF3C7', color: '#D97706' },
  manager_review:  { background: '#EDE9FE', color: '#7C3AED' },
  peer_360:        { background: '#E0E7FF', color: '#4338CA' },
  calibration:     { background: '#FFEDD5', color: '#C2410C' },
  approved_hr:     { background: '#DCFCE7', color: '#15803D' },
  signed_off:      { background: '#CCFBF1', color: '#0F766E' },
  archived:        { background: '#F3F4F6', color: '#9CA3AF' },
};

const CYCLE_STATUS_LABEL: Record<string, string> = {
  draft:           'Draft',
  cycle_initiated: 'Initiated',
  self_appraisal:  'Self-appraisal',
  manager_review:  'Manager review',
  peer_360:        '360° Review',
  calibration:     'Calibration',
  approved_hr:     'HR Approved',
  signed_off:      'Signed off',
  archived:        'Archived',
};

const REVIEW_STATUS_STYLE: Record<string, React.CSSProperties> = {
  draft:     { background: '#F3F4F6', color: '#6B7280' },
  submitted: { background: '#DCFCE7', color: '#15803D' },
  locked:    { background: '#DBEAFE', color: '#1D4ED8' },
  recalled:  { background: '#FEF3C7', color: '#D97706' },
};

const REVIEWER_ROLE_LABEL: Record<string, string> = {
  self:       'Self',
  manager:    'Manager',
  skip_level: 'Skip-level',
  peer:       'Peer',
  hr:         'HR',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CycleStatusBadge({ status }: { status: string }) {
  const style = CYCLE_STATUS_STYLE[status] ?? { background: '#F3F4F6', color: '#6B7280' };
  return (
    <span
      style={{
        ...style,
        display: 'inline-block',
        padding: '0.3rem 0.8rem',
        borderRadius: '2rem',
        fontSize: 12,
        fontFamily: 'var(--font-in-sb)',
        fontWeight: 700,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {CYCLE_STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
    </span>
  );
}

function ReviewStatusBadge({ status }: { status: string }) {
  const style = REVIEW_STATUS_STYLE[status] ?? { background: '#F3F4F6', color: '#6B7280' };
  return (
    <span
      style={{
        ...style,
        display: 'inline-block',
        padding: '0.2rem 0.6rem',
        borderRadius: '2rem',
        fontSize: 11,
        fontFamily: 'var(--font-in-sb)',
        fontWeight: 600,
      }}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function PhaseStepper({ phases, currentStatus }: { phases: CyclePhase[]; currentStatus: string }) {
  const phaseMap: Record<string, CyclePhase> = {};
  phases.forEach((p) => { phaseMap[p.phase] = p; });

  const currentIdx = PHASE_ORDER.indexOf(currentStatus as PhaseKey);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0,
        overflowX: 'auto',
        paddingBottom: 4,
      }}
    >
      {PHASE_ORDER.map((phase, idx) => {
        const past    = idx < currentIdx;
        const active  = idx === currentIdx;
        const future  = idx > currentIdx;
        const phaseData = phaseMap[phase];

        const dotBg = past
          ? '#16A34A'
          : active
          ? 'var(--color-vr-blue-6)'
          : 'var(--color-neutral-4)';

        const dotColor = past || active ? '#fff' : 'var(--color-neutral-6)';
        const labelColor = active
          ? 'var(--color-neutral-10)'
          : past
          ? 'var(--color-neutral-8)'
          : 'var(--color-neutral-6)';

        return (
          <div
            key={phase}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flex: 1,
              minWidth: 80,
              position: 'relative',
            }}
          >
            {/* Connector line */}
            {idx > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 11,
                  left: 0,
                  width: '50%',
                  height: 2,
                  background: idx <= currentIdx ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-4)',
                }}
              />
            )}
            {idx < PHASE_ORDER.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: 11,
                  left: '50%',
                  width: '50%',
                  height: 2,
                  background: idx < currentIdx ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-4)',
                }}
              />
            )}

            {/* Dot */}
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: dotBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 1,
                boxShadow: active ? '0 0 0 3px rgba(28,80,157,0.18)' : 'none',
                transition: 'all 200ms ease',
              }}
            >
              {past ? (
                <Check size={12} color={dotColor} />
              ) : (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: dotColor,
                    fontFamily: 'var(--font-in-sb)',
                  }}
                >
                  {idx + 1}
                </span>
              )}
            </div>

            {/* Label */}
            <div
              style={{
                marginTop: 6,
                textAlign: 'center',
                fontSize: 10,
                fontFamily: active ? 'var(--font-in-sb)' : 'var(--font-in-rg)',
                fontWeight: active ? 700 : 400,
                color: labelColor,
                lineHeight: 1.3,
              }}
            >
              {PHASE_LABEL[phase] ?? phase}
              {phaseData && !future && (
                <div style={{ fontSize: 9, color: 'var(--color-neutral-6)', marginTop: 2 }}>
                  {formatDate(phaseData.opensAt)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Transition Confirm Modal (inline) ────────────────────────────────────────

function TransitionConfirmModal({
  open,
  currentStatus,
  onConfirm,
  onCancel,
  loading,
}: {
  open:          boolean;
  currentStatus: string;
  onConfirm:     () => void;
  onCancel:      () => void;
  loading:       boolean;
}) {
  if (!open) return null;

  const nextStatus =
    currentStatus === 'draft'           ? 'cycle_initiated' :
    currentStatus === 'cycle_initiated' ? 'self_appraisal'  :
    currentStatus === 'self_appraisal'  ? 'manager_review'  :
    currentStatus === 'manager_review'  ? 'calibration'     :
    currentStatus === 'peer_360'        ? 'calibration'     :
    currentStatus === 'calibration'     ? 'approved_hr'     :
    currentStatus === 'approved_hr'     ? 'signed_off'      :
    currentStatus === 'signed_off'      ? 'archived'        :
    null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        onClick={loading ? undefined : onCancel}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(2px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          background: 'var(--color-neutral-1)',
          borderRadius: '1.2rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
          padding: '2rem',
          width: 'min(440px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FastForward size={18} style={{ color: '#D97706' }} />
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--text-fs-16)',
              fontFamily: 'var(--font-jk-bd)',
              fontWeight: 700,
              color: 'var(--color-neutral-10)',
            }}
          >
            Advance to next phase
          </h3>
          <button
            onClick={loading ? undefined : onCancel}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: 'var(--color-neutral-7)',
              padding: 4,
              borderRadius: '0.4rem',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-fs-14)',
            color: 'var(--color-neutral-8)',
            lineHeight: 1.6,
          }}
        >
          This will transition the cycle from{' '}
          <strong style={{ color: 'var(--color-neutral-10)' }}>
            {CYCLE_STATUS_LABEL[currentStatus] ?? currentStatus}
          </strong>{' '}
          to{' '}
          <strong style={{ color: 'var(--color-vr-blue-6)' }}>
            {nextStatus ? (CYCLE_STATUS_LABEL[nextStatus] ?? nextStatus) : 'the next phase'}
          </strong>
          . This action cannot be undone.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0.8rem 1rem',
            background: '#FFF7ED',
            borderRadius: '0.6rem',
            border: '1px solid #FED7AA',
            fontSize: 'var(--text-fs-12)',
            color: '#9A3412',
          }}
        >
          <AlertCircle size={13} style={{ flexShrink: 0 }} />
          Employees and reviewers will be notified of the phase change.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', paddingTop: '0.4rem' }}>
          <button
            className="hrms-btn-ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="hrms-btn-primary"
            onClick={onConfirm}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <>
                <FastForward size={13} />
                Advance Phase
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function CycleDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const { push: pushToast } = useToast();

  const [cycle, setCycle]               = useState<Cycle | null>(null);
  const [reviews, setReviews]           = useState<PMSReview[]>([]);
  const [employees, setEmployees]       = useState<Employee[]>([]);
  const [loadingCycle, setLoadingCycle] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [transitioning, setTransitioning]             = useState(false);
  const [computing, setComputing]                     = useState(false);
  const [bulkOpening, setBulkOpening]                 = useState(false);

  const [addingReview, setAddingReview]   = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const loadCycle = useCallback(() => {
    setLoadingCycle(true);
    fetch(`/api/ws/performance/cycles/${id}`)
      .then((r) => r.json())
      .then((d) => setCycle(d.data ?? null))
      .catch(() => setCycle(null))
      .finally(() => setLoadingCycle(false));
  }, [id]);

  const loadReviews = useCallback(() => {
    setLoadingReviews(true);
    fetch(`/api/ws/performance/cycles/${id}/reviews`)
      .then((r) => r.json())
      .then((d) => setReviews(d.data ?? []))
      .catch(() => setReviews([]))
      .finally(() => setLoadingReviews(false));
  }, [id]);

  const loadEmployees = useCallback(() => {
    fetch('/api/ws/employees?limit=500')
      .then((r) => r.json())
      .then((d) => setEmployees(d.data ?? []))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    loadCycle();
    loadReviews();
    loadEmployees();
  }, [loadCycle, loadReviews, loadEmployees]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleTransition = async () => {
    setTransitioning(true);
    try {
      const res  = await fetch(`/api/ws/performance/cycles/${id}/transition`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        pushToast({ kind: 'error', title: json.error ?? 'Failed to advance phase.' });
        return;
      }
      pushToast({ kind: 'success', title: 'Phase advanced successfully.' });
      setShowTransitionModal(false);
      loadCycle();
      loadReviews();
    } catch {
      pushToast({ kind: 'error', title: 'Network error — please try again.' });
    } finally {
      setTransitioning(false);
    }
  };

  const handleBulkOpen = async () => {
    setBulkOpening(true);
    try {
      const res  = await fetch(`/api/ws/performance/cycles/${id}/bulk-open-reviews`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        pushToast({ kind: 'error', title: json.error ?? 'Bulk open failed.' });
        return;
      }
      pushToast({ kind: 'success', title: `Opened ${json.created} self-reviews.`, desc: json.skipped > 0 ? `${json.skipped} already existed.` : undefined });
      loadReviews();
    } catch {
      pushToast({ kind: 'error', title: 'Network error — please try again.' });
    } finally {
      setBulkOpening(false);
    }
  };

  const handleComputeScores = async () => {
    setComputing(true);
    try {
      const res  = await fetch(`/api/ws/performance/cycles/${id}/compute-scores`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        pushToast({ kind: 'error', title: json.error ?? 'Failed to compute scores.' });
        return;
      }
      pushToast({ kind: 'success', title: 'Scores computed successfully.', desc: `${json.updated ?? 0} reviews updated.` });
      loadReviews();
    } catch {
      pushToast({ kind: 'error', title: 'Network error — please try again.' });
    } finally {
      setComputing(false);
    }
  };

  const handleAddSelfReview = async () => {
    if (!selectedEmployee) return;
    setAddingReview(true);
    try {
      const res  = await fetch(`/api/ws/performance/cycles/${id}/reviews`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ revieweeId: selectedEmployee, reviewerRole: 'self' }),
      });
      const json = await res.json();
      if (!res.ok) {
        pushToast({ kind: 'error', title: json.error ?? 'Failed to add review.' });
        return;
      }
      pushToast({ kind: 'success', title: 'Self-review added.' });
      setSelectedEmployee('');
      loadReviews();
    } catch {
      pushToast({ kind: 'error', title: 'Network error — please try again.' });
    } finally {
      setAddingReview(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const isTerminal      = cycle?.status === 'archived' || cycle?.status === 'signed_off';
  const canAdvance      = !!cycle && !isTerminal;
  const canCompute      = cycle?.status === 'calibration' || cycle?.status === 'approved_hr' || cycle?.status === 'signed_off';
  const canBulkOpen     = cycle?.status === 'self_appraisal';

  // ── Loading / not-found ───────────────────────────────────────────────────────

  if (loadingCycle) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6rem' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  if (!cycle) {
    return (
      <div style={{ padding: '2rem' }}>
        <button
          onClick={() => router.push('/performance')}
          className="hrms-btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: '1.2rem' }}
        >
          <ArrowLeft size={13} />
          Back to Performance
        </button>
        <p style={{ color: 'var(--color-neutral-7)' }}>Cycle not found.</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '2rem', maxWidth: 1080, margin: '0 auto' }}>

      {/* Back nav */}
      <button
        onClick={() => router.push('/performance')}
        className="hrms-btn-ghost"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: '1.4rem',
          padding: '0.5rem 1rem',
          fontSize: 'var(--text-fs-12)',
        }}
      >
        <ArrowLeft size={13} />
        All cycles
      </button>

      {/* Header */}
      <div
        className="hrms-card"
        style={{ padding: '1.6rem 2rem', marginBottom: '1.4rem' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1.2rem',
            marginBottom: '1.4rem',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 'var(--text-fs-20)',
                  fontFamily: 'var(--font-jk-bd)',
                  fontWeight: 700,
                  color: 'var(--color-neutral-10)',
                }}
              >
                {cycle.name}
              </h1>
              <CycleStatusBadge status={cycle.status} />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
                color: 'var(--color-neutral-7)',
                fontSize: 'var(--text-fs-12)',
              }}
            >
              <Calendar size={12} />
              <span>{formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}</span>
              {cycle.enable360 && (
                <>
                  <span style={{ color: 'var(--color-neutral-5)' }}>·</span>
                  <span
                    style={{
                      padding: '0.15rem 0.5rem',
                      borderRadius: '0.4rem',
                      background: '#E0E7FF',
                      color: '#4338CA',
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: 'var(--font-in-sb)',
                    }}
                  >
                    360° Enabled
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
            {canBulkOpen && (
              <button
                className="hrms-btn-ghost"
                onClick={handleBulkOpen}
                disabled={bulkOpening}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {bulkOpening ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                Bulk Open Reviews
              </button>
            )}
            {canCompute && (
              <button
                className="hrms-btn-ghost"
                onClick={handleComputeScores}
                disabled={computing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {computing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Calculator size={13} />
                )}
                Compute Scores
              </button>
            )}
            {canAdvance && (
              <button
                className="hrms-btn-primary"
                onClick={() => setShowTransitionModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <FastForward size={13} />
                Advance Phase
              </button>
            )}
          </div>
        </div>

        {/* Phase stepper */}
        {cycle.phases.length > 0 || true ? (
          <PhaseStepper phases={cycle.phases} currentStatus={cycle.status} />
        ) : null}
      </div>

      {/* Reviews section */}
      <div className="hrms-card" style={{ padding: 0, overflow: 'visible' }}>

        {/* Reviews header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.2rem 1.6rem',
            borderBottom: '1px solid var(--color-neutral-4)',
          }}
        >
          <h2
            style={{
              margin: 0,
              flex: 1,
              fontSize: 'var(--text-fs-16)',
              fontFamily: 'var(--font-jk-bd)',
              fontWeight: 700,
              color: 'var(--color-neutral-10)',
            }}
          >
            Reviews
            {!loadingReviews && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-neutral-7)',
                  fontFamily: 'var(--font-in-sb)',
                }}
              >
                ({reviews.length})
              </span>
            )}
          </h2>

          {/* Add self-review */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <select
              className="hrms-input"
              style={{ fontSize: 'var(--text-fs-12)', padding: '0.45rem 0.8rem', minWidth: 200 }}
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
            >
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {emp.employeeCode}{emp.jobTitle ? ` · ${emp.jobTitle}` : ''}
                </option>
              ))}
            </select>
            <button
              className="hrms-btn-primary"
              onClick={handleAddSelfReview}
              disabled={!selectedEmployee || addingReview}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.45rem 0.9rem', fontSize: 'var(--text-fs-12)' }}
            >
              {addingReview ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <>
                  <Plus size={12} />
                  Add Self-Review
                </>
              )}
            </button>
          </div>
        </div>

        {/* Reviews table */}
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}
          >
            <thead>
              <tr>
                {['Employee', 'Reviewer Role', 'Status', 'Final Score', 'Calibrated', 'PIP', 'Submitted', ''].map(
                  (h, i) => (
                    <th key={i} className="hrms-th" style={{ whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loadingReviews ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
                  </td>
                </tr>
              ) : reviews.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.6rem',
                      }}
                    >
                      <UserCheck size={28} style={{ color: 'var(--color-neutral-5)' }} />
                      <p
                        style={{
                          margin: 0,
                          fontFamily: 'var(--font-in-sb)',
                          fontWeight: 600,
                          color: 'var(--color-neutral-10)',
                          fontSize: 'var(--text-fs-14)',
                        }}
                      >
                        No reviews yet
                      </p>
                      <p
                        style={{
                          margin: 0,
                          color: 'var(--color-neutral-7)',
                          fontSize: 'var(--text-fs-12)',
                        }}
                      >
                        Select an employee above and click &ldquo;Add Self-Review&rdquo; to get started.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                reviews.map((r) => (
                  <tr
                    key={r._id}
                    style={{ cursor: 'default' }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-neutral-2)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLTableRowElement).style.background = '')
                    }
                  >
                    <td className="hrms-td">
                      <span
                        style={{
                          fontFamily: 'var(--font-in-sb)',
                          fontWeight: 600,
                          color: 'var(--color-neutral-10)',
                        }}
                      >
                        {r.revieweeName ?? r.revieweeCode ?? r.revieweeId.slice(-6)}
                      </span>
                    </td>
                    <td className="hrms-td">
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '0.4rem',
                          fontSize: 11,
                          background: 'var(--color-neutral-3)',
                          color: 'var(--color-neutral-8)',
                          fontFamily: 'var(--font-in-sb)',
                          fontWeight: 600,
                        }}
                      >
                        {REVIEWER_ROLE_LABEL[r.reviewerRole] ?? r.reviewerRole}
                      </span>
                    </td>
                    <td className="hrms-td">
                      <ReviewStatusBadge status={r.status} />
                    </td>
                    <td
                      className="hrms-td"
                      style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}
                    >
                      {typeof r.finalScore === 'number' ? (
                        <span style={{ color: 'var(--color-neutral-10)' }}>
                          {r.finalScore.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-neutral-5)' }}>—</span>
                      )}
                    </td>
                    <td
                      className="hrms-td"
                      style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}
                    >
                      {typeof r.calibratedScore === 'number' ? (
                        <span style={{ color: 'var(--color-vr-purple-5)' }}>
                          {r.calibratedScore.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-neutral-5)' }}>—</span>
                      )}
                    </td>
                    <td className="hrms-td">
                      {r.pipTriggered ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: '#DC2626',
                            fontFamily: 'var(--font-in-sb)',
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        >
                          <AlertCircle size={11} />
                          PIP
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-neutral-5)' }}>—</span>
                      )}
                    </td>
                    <td
                      className="hrms-td"
                      style={{ color: 'var(--color-neutral-7)', whiteSpace: 'nowrap' }}
                    >
                      {r.submittedAt ? formatDate(r.submittedAt) : '—'}
                    </td>
                    <td className="hrms-td" style={{ textAlign: 'right' }}>
                      <button
                        className="hrms-btn-ghost"
                        style={{
                          padding: '0.3rem 0.7rem',
                          fontSize: 11,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        onClick={() => router.push(`/performance/${r._id}`)}
                      >
                        Open
                        <ChevronRight size={11} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transition confirm modal */}
      <TransitionConfirmModal
        open={showTransitionModal}
        currentStatus={cycle.status}
        onConfirm={handleTransition}
        onCancel={() => setShowTransitionModal(false)}
        loading={transitioning}
      />
    </div>
  );
}
