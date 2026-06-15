'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Target,
  BarChart2,
  Loader2,
  RefreshCw,
  Plus,
  ChevronRight,
  Star,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate }  from '@/lib/utils';
import { AddReviewModal } from '@/components/widgets/AddReviewModal';
import { CycleCreateModal } from '@/components/widgets/CycleCreateModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Review {
  _id: string;
  employeeCode: string;
  jobTitle?: string;
  departmentName?: string;
  cycleLabel: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  overallRating?: number;
}

interface CyclePhase {
  phase:    string;
  opensAt:  string;
  closesAt: string;
}

interface Cycle {
  _id:        string;
  name:       string;
  type:       string;
  status:     string;
  startDate:  string;
  endDate:    string;
  phases:     CyclePhase[];
  enable360:  boolean;
  pipThreshold: number;
  isActive:   boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REVIEW_TABS = [
  { value: 'manager_review',  label: 'Manager review'  },
  { value: 'self_assessment', label: 'Self-assessment' },
  { value: 'finalized',       label: 'Finalized'       },
  { value: 'acknowledged',    label: 'Acknowledged'    },
  { value: '',                label: 'All'             },
];

// Ordered list of phase keys used to render the progress bar
const PHASE_ORDER = [
  'draft',
  'cycle_initiated',
  'self_appraisal',
  'manager_review',
  'peer_360',
  'calibration',
  'approved_hr',
  'signed_off',
  'archived',
] as const;

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

const TYPE_LABEL: Record<string, string> = {
  annual:    'Annual',
  half_year: 'Half Year',
  quarterly: 'Quarterly',
  probation: 'Probation',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CycleStatusBadge({ status }: { status: string }) {
  const style = CYCLE_STATUS_STYLE[status] ?? { background: '#F3F4F6', color: '#6B7280' };
  return (
    <span
      style={{
        ...style,
        display: 'inline-block',
        padding: '0.25rem 0.7rem',
        borderRadius: '2rem',
        fontSize: 11,
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

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.6rem',
        borderRadius: '0.4rem',
        fontSize: 10,
        fontFamily: 'var(--font-in-sb)',
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        background: 'var(--color-neutral-3)',
        color: 'var(--color-neutral-8)',
        border: '1px solid var(--color-neutral-4)',
      }}
    >
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

function PhaseProgressBar({ status }: { status: string }) {
  const currentIdx = PHASE_ORDER.indexOf(status as typeof PHASE_ORDER[number]);
  const total      = PHASE_ORDER.length - 1; // exclude 'archived' from denominator
  const progress   = currentIdx < 0 ? 0 : Math.min(currentIdx / (total - 1), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          height: 5,
          background: 'var(--color-neutral-4)',
          borderRadius: 9999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: '100%',
            background:
              status === 'archived' || status === 'signed_off'
                ? '#0D9488'
                : status === 'approved_hr'
                ? '#16A34A'
                : 'var(--color-vr-blue-6)',
            borderRadius: 9999,
            transition: 'width 300ms ease',
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          color: 'var(--color-neutral-7)',
          fontFamily: 'var(--font-in-rg)',
        }}
      >
        Phase {currentIdx < 0 ? '?' : currentIdx + 1} of {PHASE_ORDER.length}
      </span>
    </div>
  );
}

function CycleCard({
  cycle,
  onAdvance,
  advancing,
}: {
  cycle:     Cycle;
  onAdvance: (id: string) => void;
  advancing: string | null;
}) {
  const router     = useRouter();
  const isDraft    = cycle.status === 'draft';
  const isTerminal = cycle.status === 'archived';

  return (
    <div
      className="hrms-card"
      style={{
        padding: '1.4rem 1.6rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        cursor: 'pointer',
        transition: 'box-shadow 140ms ease, border-color 140ms ease',
        border: '1px solid var(--color-neutral-4)',
      }}
      onClick={() => router.push(`/performance/cycles/${cycle._id}`)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-vr-blue-6)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-card)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-neutral-4)';
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3
              style={{
                margin: 0,
                fontSize: 'var(--text-fs-16)',
                fontFamily: 'var(--font-jk-bd)',
                fontWeight: 700,
                color: 'var(--color-neutral-10)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {cycle.name}
            </h3>
            <TypeBadge type={cycle.type} />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
              color: 'var(--color-neutral-7)',
              fontSize: 'var(--text-fs-12)',
            }}
          >
            <Calendar size={11} />
            <span>{formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}</span>
          </div>
        </div>
        <CycleStatusBadge status={cycle.status} />
      </div>

      {/* Phase bar */}
      <PhaseProgressBar status={cycle.status} />

      {/* Bottom row — actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '0.6rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {isDraft && (
          <button
            className="hrms-btn-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '0.45rem 0.9rem',
              fontSize: 'var(--text-fs-12)',
            }}
            disabled={advancing === cycle._id}
            onClick={() => onAdvance(cycle._id)}
          >
            {advancing === cycle._id ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <>
                Advance
                <ArrowRight size={12} />
              </>
            )}
          </button>
        )}
        {!isTerminal && (
          <button
            className="hrms-btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '0.45rem 0.9rem',
              fontSize: 'var(--text-fs-12)',
            }}
            onClick={() => router.push(`/performance/cycles/${cycle._id}`)}
          >
            Open
            <ChevronRight size={12} />
          </button>
        )}
        {isTerminal && (
          <button
            className="hrms-btn-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '0.45rem 0.9rem',
              fontSize: 'var(--text-fs-12)',
            }}
            onClick={() => router.push(`/performance/cycles/${cycle._id}`)}
          >
            View
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const router = useRouter();

  // Top-level tab
  const [tab, setTab] = useState<'cycles' | 'reviews'>('cycles');

  // Cycles state
  const [cycles, setCycles]             = useState<Cycle[]>([]);
  const [cyclesLoading, setCyclesLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [advancing, setAdvancing]       = useState<string | null>(null);

  // Reviews state (preserved from old page)
  const [reviews, setReviews]           = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [statusF, setStatusF]           = useState('manager_review');
  const [addOpen, setAddOpen]           = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────────

  const loadCycles = () => {
    setCyclesLoading(true);
    fetch('/api/ws/performance/cycles')
      .then((r) => r.json())
      .then((d) => setCycles(d.data ?? []))
      .catch(() => setCycles([]))
      .finally(() => setCyclesLoading(false));
  };

  const loadReviews = (s = statusF) => {
    setReviewsLoading(true);
    const p = new URLSearchParams({ limit: '60', ...(s ? { status: s } : {}) });
    fetch(`/api/performance?${p}`)
      .then((r) => r.json())
      .then((d) => setReviews(d.data ?? []))
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  };

  useEffect(() => { loadCycles(); }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadReviews(statusF);
  }, [statusF]);

  // ── Advance handler ───────────────────────────────────────────────────────────

  const handleAdvance = async (id: string) => {
    setAdvancing(id);
    try {
      const res  = await fetch(`/api/ws/performance/cycles/${id}/transition`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        console.error('Advance failed:', json.error);
        return;
      }
      loadCycles();
    } catch (err) {
      console.error('Advance network error:', err);
    } finally {
      setAdvancing(null);
    }
  };

  // ── Tab button style helper ───────────────────────────────────────────────────

  const tabBtn = (t: 'cycles' | 'reviews'): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0.55rem 1.2rem',
    borderRadius: '0.6rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--text-fs-14)',
    fontFamily: 'var(--font-in-sb)',
    fontWeight: 600,
    background: tab === t ? 'var(--color-neutral-1)' : 'transparent',
    color:      tab === t ? 'var(--color-neutral-10)' : 'var(--color-neutral-7)',
    boxShadow:  tab === t ? 'var(--shadow-card)' : 'none',
    transition: 'all 120ms ease',
  });

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '2rem' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Target size={22} style={{ color: 'var(--color-vr-blue-6)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <h2
            style={{
              margin: 0,
              color: 'var(--color-neutral-10)',
              fontFamily: 'var(--font-jk-bd)',
              fontWeight: 700,
              fontSize: 'var(--text-fs-20)',
            }}
          >
            Performance Management
          </h2>
          <p
            style={{
              margin: 0,
              marginTop: 2,
              color: 'var(--color-neutral-7)',
              fontSize: 'var(--text-fs-12)',
            }}
          >
            Manage appraisal cycles, run reviews, and track performance across your organisation.
          </p>
        </div>
      </div>

      {/* Tab bar + contextual actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem',
          marginBottom: '1.6rem',
        }}
      >
        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            background: 'var(--color-neutral-3)',
            padding: 3,
            borderRadius: '0.8rem',
          }}
        >
          <button style={tabBtn('cycles')} onClick={() => setTab('cycles')}>
            <BarChart2 size={14} />
            Cycles
          </button>
          <button style={tabBtn('reviews')} onClick={() => setTab('reviews')}>
            <Target size={14} />
            Reviews
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {tab === 'cycles' && (
          <>
            <button
              onClick={loadCycles}
              className="hrms-btn-ghost"
              style={{ padding: '0.7rem', display: 'inline-flex', alignItems: 'center' }}
              title="Refresh cycles"
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="hrms-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.65rem 1.2rem' }}
            >
              <Plus size={13} />
              New Cycle
            </button>
          </>
        )}

        {tab === 'reviews' && (
          <>
            <div
              style={{
                display: 'flex',
                gap: 4,
                background: 'var(--color-neutral-3)',
                padding: 3,
                borderRadius: '0.8rem',
              }}
            >
              {REVIEW_TABS.map(({ value, label }) => (
                <button
                  key={value || 'all'}
                  onClick={() => setStatusF(value)}
                  style={{
                    padding: '0.4rem 1rem',
                    borderRadius: '0.6rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--text-fs-12)',
                    fontFamily: 'var(--font-in-sb)',
                    fontWeight: 600,
                    background: statusF === value ? 'var(--color-neutral-1)' : 'transparent',
                    color:      statusF === value ? 'var(--color-neutral-10)' : 'var(--color-neutral-7)',
                    boxShadow:  statusF === value ? 'var(--shadow-card)' : 'none',
                    whiteSpace: 'nowrap',
                    transition: 'all 120ms ease',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="hrms-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.65rem 1.2rem' }}
            >
              <Plus size={13} />
              New Review
            </button>
            <button
              onClick={() => loadReviews(statusF)}
              className="hrms-btn-ghost"
              style={{ padding: '0.7rem', display: 'inline-flex', alignItems: 'center' }}
            >
              <RefreshCw size={13} />
            </button>
          </>
        )}
      </div>

      {/* ── Cycles tab ─────────────────────────────────────────────────────────── */}
      {tab === 'cycles' && (
        <>
          {cyclesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '5rem' }}>
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
            </div>
          ) : cycles.length === 0 ? (
            <div
              className="hrms-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem 2rem',
                gap: '0.8rem',
              }}
            >
              <BarChart2 size={36} style={{ color: 'var(--color-neutral-5)' }} />
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-in-sb)',
                  fontWeight: 600,
                  fontSize: 'var(--text-fs-16)',
                  color: 'var(--color-neutral-10)',
                }}
              >
                No appraisal cycles yet
              </p>
              <p
                style={{
                  margin: 0,
                  color: 'var(--color-neutral-7)',
                  fontSize: 'var(--text-fs-12)',
                  textAlign: 'center',
                  maxWidth: 360,
                }}
              >
                Create your first cycle to start managing performance reviews across the organisation.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="hrms-btn-primary"
                style={{ marginTop: '0.4rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={13} />
                New Cycle
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: '1.2rem',
              }}
            >
              {cycles.map((c) => (
                <CycleCard
                  key={c._id}
                  cycle={c}
                  onAdvance={handleAdvance}
                  advancing={advancing}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Reviews tab ────────────────────────────────────────────────────────── */}
      {tab === 'reviews' && (
        <>
          <AddReviewModal
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onCreated={() => loadReviews(statusF)}
          />
          <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 'var(--text-fs-12)',
              }}
            >
              <thead>
                <tr>
                  {['Employee', 'Cycle', 'Period', 'Status', 'Rating', ''].map((h, i) => (
                    <th key={i} className="hrms-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviewsLoading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                      <Loader2
                        size={18}
                        className="animate-spin"
                        style={{ color: 'var(--color-vr-blue-6)' }}
                      />
                    </td>
                  </tr>
                ) : reviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                      <p
                        style={{
                          margin: 0,
                          color: 'var(--color-neutral-10)',
                          fontFamily: 'var(--font-in-sb)',
                          fontWeight: 600,
                          fontSize: 'var(--text-fs-14)',
                        }}
                      >
                        No reviews in this stage
                      </p>
                      <p
                        style={{
                          margin: '0.4rem 0 0',
                          color: 'var(--color-neutral-7)',
                          fontSize: 'var(--text-fs-12)',
                        }}
                      >
                        Click &ldquo;New Review&rdquo; to open a review cycle for an employee.
                      </p>
                    </td>
                  </tr>
                ) : (
                  reviews.map((r) => (
                    <tr
                      key={r._id}
                      onClick={() => router.push(`/performance/${r._id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="hrms-td">
                        <p
                          style={{
                            margin: 0,
                            color: 'var(--color-neutral-10)',
                            fontFamily: 'var(--font-in-sb)',
                            fontWeight: 600,
                          }}
                        >
                          {r.employeeCode}
                        </p>
                        <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                          {r.jobTitle ?? ''}
                        </p>
                      </td>
                      <td
                        className="hrms-td"
                        style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}
                      >
                        {r.cycleLabel}
                      </td>
                      <td
                        className="hrms-td"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                      </td>
                      <td className="hrms-td">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="hrms-td">
                        {typeof r.overallRating === 'number' ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontFamily: 'var(--font-in-sb)',
                              fontWeight: 700,
                              color: 'var(--color-neutral-10)',
                            }}
                          >
                            <Star
                              size={12}
                              style={{ color: 'var(--color-semantics-orange-7)' }}
                              fill="currentColor"
                            />
                            {r.overallRating}/5
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-neutral-6)' }}>—</span>
                        )}
                      </td>
                      <td
                        className="hrms-td"
                        style={{ textAlign: 'right', color: 'var(--color-neutral-6)' }}
                      >
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modals */}
      <CycleCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadCycles}
      />
    </div>
  );
}
