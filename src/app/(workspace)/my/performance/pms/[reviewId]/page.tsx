'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter }                      from 'next/navigation';
import { ArrowLeft, Loader2, Save, Send, Star, Lock, CheckCircle } from 'lucide-react';
import { StatusBadge }  from '@/components/ui/Badge';
import { Modal }        from '@/components/ui/Modal';
import { useToast }     from '@/components/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// Constants — must stay in sync with PERF_COMPETENCIES in workspace.models.ts
// ─────────────────────────────────────────────────────────────────────────────

const COMPETENCIES = [
  { key: 'delivery',      label: 'Delivery & Execution' },
  { key: 'collaboration', label: 'Collaboration' },
  { key: 'expertise',     label: 'Technical Expertise' },
  { key: 'ownership',     label: 'Ownership & Initiative' },
  { key: 'communication', label: 'Communication' },
] as const;

type CompetencyKey = typeof COMPETENCIES[number]['key'];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RatingRow {
  dimension: string;
  score:     number;
  comment:   string;
}

interface ReviewData {
  _id:           string;
  cycleId:       string;
  status:        string;   // 'draft' | 'submitted' | 'locked' | 'recalled'
  draftSavedAt?: string | null;
  submittedAt?:  string | null;
  lockedAt?:     string | null;
  ratings:       Array<{ dimension: string; score: number; comment: string | null }>;
  overallComment: string | null;
}

interface CycleInfo {
  name:      string;
  status:    string;
  type:      string;
  startDate: string;
  endDate:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Star rating picker
// ─────────────────────────────────────────────────────────────────────────────

function RatingPicker({
  value,
  onChange,
  disabled,
}: {
  value:    number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          style={{
            background: 'none', border: 'none',
            cursor:     disabled ? 'default' : 'pointer',
            padding: 2, lineHeight: 0,
          }}
        >
          <Star
            size={20}
            style={{ color: value >= n ? 'var(--color-semantics-orange-7)' : 'var(--color-neutral-5)' }}
            fill={value >= n ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared style tokens
// ─────────────────────────────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  margin: '0 0 1.2rem',
  color: 'var(--color-neutral-10)',
  fontFamily: 'var(--font-jk-bd)',
  fontWeight: 700,
  fontSize: 'var(--text-fs-16)',
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-fs-12)',
  fontFamily: 'var(--font-in-sb)',
  fontWeight: 600,
  color: 'var(--color-neutral-9)',
  marginBottom: 6,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 72,
  resize: 'vertical',
  padding: '0.6rem 0.75rem',
  fontSize: 'var(--text-fs-13)',
  color: 'var(--color-neutral-10)',
  background: 'var(--color-neutral-1)',
  border: '1px solid var(--color-stroke)',
  borderRadius: '0.5rem',
  fontFamily: 'var(--font-in)',
  lineHeight: 1.6,
};

const readText: React.CSSProperties = {
  margin: 0,
  color: 'var(--color-neutral-8)',
  fontSize: 'var(--text-fs-13)',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
};

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function PmsSelfAppraisalPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const router       = useRouter();
  const { push: pushToast } = useToast();

  // ── Remote data ─────────────────────────────────────────────────────────────
  const [review,   setReview]   = useState<ReviewData | null>(null);
  const [cycle,    setCycle]    = useState<CycleInfo  | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [ratings, setRatings] = useState<Record<CompetencyKey, { score: number; comment: string }>>(
    () => Object.fromEntries(COMPETENCIES.map((c) => [c.key, { score: 0, comment: '' }])) as Record<CompetencyKey, { score: number; comment: string }>,
  );
  const [overallComment, setOverallComment] = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [saving,          setSaving]          = useState<'draft' | 'submit' | null>(null);
  const [saveIndicator,   setSaveIndicator]   = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Debounce timer ref for auto-save
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived state ────────────────────────────────────────────────────────────
  const isReadOnly = review?.status === 'submitted' || review?.status === 'locked';

  // ── Load review ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch review
      const reviewRes = await fetch(`/api/me/performance/pms/${reviewId}`);
      if (!reviewRes.ok) {
        const body = await reviewRes.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${reviewRes.status}`);
      }
      const { data } = await reviewRes.json() as { data: ReviewData };
      setReview(data);

      // Initialise form from saved data
      const ratingMap: Record<string, { score: number; comment: string }> = {};
      for (const r of data.ratings ?? []) {
        ratingMap[r.dimension] = { score: r.score ?? 0, comment: r.comment ?? '' };
      }
      setRatings(
        Object.fromEntries(
          COMPETENCIES.map((c) => [c.key, ratingMap[c.key] ?? { score: 0, comment: '' }]),
        ) as Record<CompetencyKey, { score: number; comment: string }>,
      );
      setOverallComment(data.overallComment ?? '');

      // Fetch cycle info for header
      const cycleRes = await fetch(`/api/me/performance/pms`);
      if (cycleRes.ok) {
        const { data: entries } = await cycleRes.json() as {
          data: Array<{ review: { _id: string }; cycle: CycleInfo | null }>
        };
        const match = entries.find((e) => e.review._id === reviewId);
        if (match?.cycle) setCycle(match.cycle);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review');
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => { load(); }, [load]);

  // ── Save (draft or submit) ────────────────────────────────────────────────
  const save = useCallback(async (submit: boolean) => {
    const mode = submit ? 'submit' : 'draft';
    setSaving(mode);
    if (!submit) setSaveIndicator('saving');

    const body = {
      submit,
      ratings: COMPETENCIES.map((c) => ({
        dimension: c.key,
        score:     ratings[c.key].score,
        comment:   ratings[c.key].comment,
      })),
      overallComment,
    };

    try {
      const res = await fetch(`/api/me/performance/pms/${reviewId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const resBody = await res.json();
      if (!res.ok) throw new Error(resBody.error ?? `HTTP ${res.status}`);

      if (submit) {
        pushToast({ kind: 'success', title: 'Self-appraisal submitted successfully' });
        // Reload to show read-only view
        await load();
      } else {
        setSaveIndicator('saved');
        // Refresh review metadata (draftSavedAt)
        setReview((prev) =>
          prev ? { ...prev, status: resBody.data.status, draftSavedAt: resBody.data.draftSavedAt } : prev,
        );
        setTimeout(() => setSaveIndicator('idle'), 3000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      pushToast({ kind: 'error', title: msg });
      if (!submit) setSaveIndicator('idle');
    } finally {
      setSaving(null);
    }
  }, [ratings, overallComment, reviewId, load, pushToast]);

  // ── Auto-save on blur (debounced 1.5s) ───────────────────────────────────
  const scheduleAutoSave = useCallback(() => {
    if (isReadOnly) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { void save(false); }, 1500);
  }, [isReadOnly, save]);

  useEffect(() => () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render — loading / error states
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6rem' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  if (error || !review) {
    return (
      <div style={{ padding: '2rem', maxWidth: 720 }}>
        <p style={{ color: 'var(--color-semantics-red-6)' }}>{error ?? 'Review not found.'}</p>
        <button
          onClick={() => router.back()}
          style={{ marginTop: '1rem', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--color-vr-blue-6)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}
        >
          ← Go back
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '2rem', maxWidth: 760 }}>

      {/* ── Back + header ─────────────────────────────────────────────────── */}
      <button
        onClick={() => router.push('/my/performance')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-13)',
          fontFamily: 'var(--font-in)', marginBottom: '1.4rem', padding: 0,
        }}
      >
        <ArrowLeft size={14} />
        Back to My Performance
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-24)', color: 'var(--color-neutral-10)',
          }}>
            {cycle?.name ?? 'Self-Appraisal'}
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-13)' }}>
            Self-Appraisal
          </p>
        </div>
        <StatusBadge status={review.status} />
      </div>

      {/* ── Auto-save indicator ────────────────────────────────────────────── */}
      {!isReadOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1.6rem', marginTop: '0.6rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
          {saveIndicator === 'saving' && (
            <>
              <Loader2 size={12} className="animate-spin" />
              Saving…
            </>
          )}
          {saveIndicator === 'saved' && (
            <>
              <CheckCircle size={12} style={{ color: 'var(--color-semantics-green-7)' }} />
              Saved just now
            </>
          )}
          {saveIndicator === 'idle' && review.draftSavedAt && (
            <span>Draft saved</span>
          )}
        </div>
      )}

      {/* ── Locked / submitted banner ─────────────────────────────────────── */}
      {isReadOnly && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.75rem 1rem', marginBottom: '1.6rem',
          background: review.status === 'locked'
            ? 'var(--color-semantics-orange-1)'
            : 'var(--color-semantics-green-1)',
          border: `1px solid ${review.status === 'locked' ? 'var(--color-semantics-orange-3)' : 'var(--color-semantics-green-3)'}`,
          borderRadius: '0.6rem',
          fontSize: 'var(--text-fs-13)',
          color: review.status === 'locked'
            ? 'var(--color-semantics-orange-8)'
            : 'var(--color-semantics-green-8)',
        }}>
          {review.status === 'locked' ? (
            <Lock size={14} />
          ) : (
            <CheckCircle size={14} />
          )}
          {review.status === 'locked'
            ? 'This appraisal has been locked by HR and can no longer be edited.'
            : 'You have submitted your self-appraisal. It is now with your manager.'}
        </div>
      )}

      {/* ── Section 1: Competencies ───────────────────────────────────────── */}
      <div className="hrms-card" style={{ marginBottom: '1.4rem', padding: '1.6rem' }}>
        <p style={sectionTitle}>Competency Ratings</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          {COMPETENCIES.map((c) => (
            <div key={c.key}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ ...fieldLabel, marginBottom: 0 }}>{c.label}</span>
                <RatingPicker
                  value={ratings[c.key].score}
                  onChange={(n) => {
                    setRatings((prev) => ({ ...prev, [c.key]: { ...prev[c.key], score: n } }));
                    scheduleAutoSave();
                  }}
                  disabled={isReadOnly}
                />
              </div>

              {isReadOnly ? (
                ratings[c.key].comment ? (
                  <p style={readText}>{ratings[c.key].comment}</p>
                ) : (
                  <p style={{ ...readText, color: 'var(--color-neutral-5)', fontStyle: 'italic' }}>No comment</p>
                )
              ) : (
                <textarea
                  value={ratings[c.key].comment}
                  onChange={(e) =>
                    setRatings((prev) => ({ ...prev, [c.key]: { ...prev[c.key], comment: e.target.value } }))
                  }
                  onBlur={scheduleAutoSave}
                  placeholder={`Optional comment for ${c.label.toLowerCase()}…`}
                  rows={2}
                  style={textareaStyle}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Summary ───────────────────────────────────────────────── */}
      <div className="hrms-card" style={{ marginBottom: '1.4rem', padding: '1.6rem' }}>
        <p style={sectionTitle}>Summary</p>
        <label style={fieldLabel} htmlFor="pms-overall-comment">
          Summarize your achievements this period
        </label>

        {isReadOnly ? (
          overallComment ? (
            <p style={readText}>{overallComment}</p>
          ) : (
            <p style={{ ...readText, color: 'var(--color-neutral-5)', fontStyle: 'italic' }}>No summary provided</p>
          )
        ) : (
          <textarea
            id="pms-overall-comment"
            value={overallComment}
            onChange={(e) => setOverallComment(e.target.value)}
            onBlur={scheduleAutoSave}
            placeholder="Describe your key accomplishments, impact, and any highlights from this review period…"
            rows={5}
            style={{ ...textareaStyle, minHeight: 120 }}
          />
        )}
      </div>

      {/* ── Footer actions ───────────────────────────────────────────────────── */}
      {!isReadOnly && (
        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={() => void save(false)}
            disabled={saving !== null}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.5rem 1.2rem',
              background: 'var(--color-neutral-2)',
              color: 'var(--color-neutral-9)',
              border: '1px solid var(--color-stroke)',
              borderRadius: '0.6rem',
              fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              fontSize: 'var(--text-fs-13)', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving === 'draft' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            Save Draft
          </button>

          <button
            onClick={() => setConfirmModalOpen(true)}
            disabled={saving !== null}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.5rem 1.2rem',
              background: 'var(--color-semantics-green-7)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.6rem',
              fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              fontSize: 'var(--text-fs-13)', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving === 'submit' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            Submit Self-Appraisal
          </button>
        </div>
      )}

      {/* ── Submit confirmation modal ─────────────────────────────────────── */}
      <Modal
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Submit Self-Appraisal?"
        subtitle="Once submitted you will not be able to make further edits."
        width={440}
        footer={
          <>
            <button
              onClick={() => setConfirmModalOpen(false)}
              style={{
                padding: '0.5rem 1.1rem',
                background: 'transparent',
                border: '1px solid var(--color-stroke)',
                borderRadius: '0.6rem',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                fontSize: 'var(--text-fs-13)', cursor: 'pointer',
                color: 'var(--color-neutral-8)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirmModalOpen(false);
                void save(true);
              }}
              style={{
                padding: '0.5rem 1.1rem',
                background: 'var(--color-semantics-green-7)',
                color: '#fff', border: 'none',
                borderRadius: '0.6rem',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                fontSize: 'var(--text-fs-13)', cursor: 'pointer',
              }}
            >
              Confirm &amp; Submit
            </button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-13)', lineHeight: 1.6 }}>
          Your self-appraisal will be sent to your manager for review. Make sure all
          competency ratings and your summary are complete before confirming.
        </p>
      </Modal>
    </div>
  );
}
