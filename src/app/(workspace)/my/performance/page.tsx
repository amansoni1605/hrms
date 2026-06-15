'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Target, Loader2, ChevronRight, Star, ClipboardList } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState }  from '@/components/ui/EmptyState';
import { formatDate }  from '@/lib/utils';

interface Review {
  _id: string; cycleLabel: string; periodStart: string; periodEnd: string;
  status: string; overallRating?: number;
}

interface PMSReview {
  _id:          string;
  cycleId:      string;
  status:       string;
  submittedAt?: string | null;
  draftSavedAt?: string | null;
}

interface PMSEntry {
  review: PMSReview;
  cycle:  {
    name:      string;
    status:    string;
    type:      string;
    startDate: string;
    endDate:   string;
  } | null;
}

// Friendly hint for the employee about what (if anything) they need to do.
const ACTION_HINT: Record<string, string> = {
  self_assessment: 'Action needed — complete your self-assessment',
  manager_review:  "Submitted — awaiting your manager's evaluation",
  finalized:       'Action needed — review and acknowledge',
  acknowledged:    'Complete',
};

const CYCLE_STATUS_LABEL: Record<string, string> = {
  draft:           'Draft',
  cycle_initiated: 'Initiated',
  self_appraisal:  'Self-appraisal open',
  manager_review:  'Manager review',
  peer_360:        '360 review',
  calibration:     'Calibration',
  approved_hr:     'HR approved',
  signed_off:      'Signed off',
  archived:        'Archived',
};

export default function MyPerformancePage() {
  const router = useRouter();

  const [reviews, setReviews]       = useState<Review[]>([]);
  const [loading, setLoading]       = useState(true);

  const [pmsEntries, setPmsEntries] = useState<PMSEntry[]>([]);
  const [pmsLoading, setPmsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me/performance')
      .then((r) => r.json())
      .then((d) => setReviews(d.data ?? []))
      .finally(() => setLoading(false));

    fetch('/api/me/performance/pms')
      .then((r) => r.json())
      .then((d) => setPmsEntries(d.data ?? []))
      .finally(() => setPmsLoading(false));
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      {/* ── Section 1: Legacy performance reviews ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Target size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            My Reviews
          </h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Your performance review cycles — self-assessments, ratings, and outcomes.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState icon={Target} title="No reviews yet" message="When HR opens a performance review for you, it will appear here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reviews.map((r) => (
            <button
              key={r._id}
              onClick={() => router.push(`/my/performance/${r._id}`)}
              className="hrms-card"
              style={{ display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--color-stroke)' }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>{r.cycleLabel}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                  {formatDate(r.periodStart)} → {formatDate(r.periodEnd)} · {ACTION_HINT[r.status] ?? ''}
                </p>
              </div>
              {typeof r.overallRating === 'number' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-neutral-10)' }}>
                  <Star size={13} style={{ color: 'var(--color-semantics-orange-7)' }} fill="currentColor" />
                  {r.overallRating}/5
                </span>
              )}
              <ChevronRight size={16} style={{ color: 'var(--color-neutral-6)' }} />
            </button>
          ))}
        </div>
      )}

      {/* ── Section 2: Active Cycle Reviews (PMS) ─────────────────────────── */}
      {(pmsLoading || pmsEntries.length > 0) && (
        <div style={{ marginTop: '2.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
            <ClipboardList size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
            <div>
              <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
                Active Cycle Reviews
              </h2>
              <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                Self-appraisals for ongoing performance cycles.
              </p>
            </div>
          </div>

          {pmsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {pmsEntries.map(({ review, cycle }) => (
                <div
                  key={review._id}
                  className="hrms-card"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    border: '1px solid var(--color-stroke)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Cycle name + status badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                        fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)',
                      }}>
                        {cycle?.name ?? 'Unnamed cycle'}
                      </span>
                      {cycle && (
                        <span style={{
                          fontSize: 'var(--text-fs-11)', fontFamily: 'var(--font-in-sb)',
                          fontWeight: 600, color: 'var(--color-neutral-7)',
                          background: 'var(--color-neutral-3)', borderRadius: 4,
                          padding: '1px 6px',
                        }}>
                          {CYCLE_STATUS_LABEL[cycle.status] ?? cycle.status}
                        </span>
                      )}
                      <StatusBadge status={review.status} />
                    </div>
                    {/* Cycle date range */}
                    {cycle && (
                      <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                        {formatDate(cycle.startDate)} → {formatDate(cycle.endDate)}
                        {review.submittedAt && (
                          <> · Submitted {formatDate(review.submittedAt)}</>
                        )}
                        {!review.submittedAt && review.draftSavedAt && (
                          <> · Draft saved {formatDate(review.draftSavedAt)}</>
                        )}
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  {review.status !== 'submitted' && review.status !== 'locked' ? (
                    <button
                      onClick={() => router.push(`/my/performance/pms/${review._id}`)}
                      style={{
                        flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '0.5rem 1rem',
                        background: 'var(--color-vr-blue-6)', color: '#fff',
                        border: 'none', borderRadius: '0.6rem',
                        fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                        fontSize: 'var(--text-fs-13)', cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Complete Self-Appraisal
                      <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push(`/my/performance/pms/${review._id}`)}
                      style={{
                        flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '0.5rem 1rem',
                        background: 'transparent',
                        color: 'var(--color-neutral-8)',
                        border: '1px solid var(--color-stroke)',
                        borderRadius: '0.6rem',
                        fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                        fontSize: 'var(--text-fs-13)', cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      View
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
