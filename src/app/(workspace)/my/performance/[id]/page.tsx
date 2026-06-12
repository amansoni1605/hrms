'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Send, CheckCircle, Star, Target } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { useToast }    from '@/components/ui/Toast';
import { formatDate }  from '@/lib/utils';

interface Competency {
  key: string; label: string;
  selfRating?: number; selfComment?: string;
  managerRating?: number; managerComment?: string;
}
interface Review {
  _id: string; cycleLabel: string; periodStart: string; periodEnd: string; status: string;
  competencies: Competency[];
  selfAssessment: { summary?: string; achievements?: string; challenges?: string; submittedAt?: string };
  managerReview: { summary?: string; areasOfStrength?: string; areasToImprove?: string; overallRating?: number; submittedAt?: string };
  compensation: {
    promotion: boolean; proposedTitle?: string; proposedBand?: string;
    incrementPct: number; decision: string; effectiveDate?: string; appliedAt?: string;
  };
  overallRating?: number;
  employeeAck: { acknowledged: boolean; comment?: string; acknowledgedAt?: string };
}

function RatingPicker({ value, onChange, disabled }: { value?: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={disabled} onClick={() => onChange(n)} aria-label={`${n} star`}
          style={{ background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 2, lineHeight: 0 }}>
          <Star size={18} style={{ color: (value ?? 0) >= n ? 'var(--color-semantics-orange-7)' : 'var(--color-neutral-5)' }} fill={(value ?? 0) >= n ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}

const cardStyle: React.CSSProperties = { marginBottom: '1.4rem' };
const sectionTitle: React.CSSProperties = { margin: '0 0 1rem', color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' };
const fieldLabel: React.CSSProperties = { fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-9)', display: 'block', marginBottom: 4 };
const readText: React.CSSProperties = { margin: 0, color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)', whiteSpace: 'pre-wrap', lineHeight: 1.6 };
const taStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 60, resize: 'vertical' };

export default function MyPerformanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { push: pushToast } = useToast();

  const [review, setReview]   = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<'save' | 'submit' | 'acknowledge' | null>(null);

  const [comp, setComp]               = useState<Competency[]>([]);
  const [summary, setSummary]         = useState('');
  const [achievements, setAchievements] = useState('');
  const [challenges, setChallenges]   = useState('');
  const [ackComment, setAckComment]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/me/performance/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const rv: Review | null = d.data ?? null;
        setReview(rv);
        if (rv) {
          setComp(rv.competencies ?? []);
          setSummary(rv.selfAssessment?.summary ?? '');
          setAchievements(rv.selfAssessment?.achievements ?? '');
          setChallenges(rv.selfAssessment?.challenges ?? '');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const setCompField = (key: string, field: 'selfRating' | 'selfComment', val: number | string) =>
    setComp((prev) => prev.map((c) => c.key === key ? { ...c, [field]: val } : c));

  const submit = async (action: 'save' | 'submit' | 'acknowledge') => {
    setSaving(action);
    try {
      const res = await fetch(`/api/me/performance/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, summary, achievements, challenges, ackComment,
          competencyRatings: comp.map((c) => ({ key: c.key, selfRating: c.selfRating, selfComment: c.selfComment })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { pushToast({ kind: 'error', title: json.error ?? 'Save failed' }); return; }
      pushToast({
        kind: 'success',
        title: action === 'submit' ? 'Self-assessment submitted' : action === 'acknowledge' ? 'Review acknowledged' : 'Draft saved',
      });
      load();
    } catch {
      pushToast({ kind: 'error', title: 'Network error' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}><Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} /></div>;
  }
  if (!review) {
    return <div style={{ padding: '2rem' }}><p>Review not found.</p></div>;
  }

  const editingSelf = review.status === 'self_assessment';
  const canAck      = review.status === 'finalized';
  const showManager = review.status === 'finalized' || review.status === 'acknowledged';

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <button onClick={() => router.push('/my/performance')} className="hrms-btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: '1.2rem', padding: '0.5rem 1rem' }}>
        <ArrowLeft size={13} /> My reviews
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Target size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            {review.cycleLabel}
          </h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            {formatDate(review.periodStart)} → {formatDate(review.periodEnd)}
          </p>
        </div>
        <StatusBadge status={review.status} />
      </div>

      {/* Self-assessment — editable while open, read-only afterwards */}
      <div className="hrms-card" style={cardStyle}>
        <h3 style={sectionTitle}>Self-Assessment</h3>
        {editingSelf ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div><label style={fieldLabel}>Summary of your performance</label>
              <textarea className="hrms-input" style={{ ...taStyle, minHeight: 80 }} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
            <div><label style={fieldLabel}>Key achievements</label>
              <textarea className="hrms-input" style={taStyle} value={achievements} onChange={(e) => setAchievements(e.target.value)} /></div>
            <div><label style={fieldLabel}>Challenges faced</label>
              <textarea className="hrms-input" style={taStyle} value={challenges} onChange={(e) => setChallenges(e.target.value)} /></div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div><label style={fieldLabel}>Summary</label><p style={readText}>{review.selfAssessment.summary || '—'}</p></div>
            <div><label style={fieldLabel}>Key achievements</label><p style={readText}>{review.selfAssessment.achievements || '—'}</p></div>
            <div><label style={fieldLabel}>Challenges</label><p style={readText}>{review.selfAssessment.challenges || '—'}</p></div>
          </div>
        )}
      </div>

      {/* Competencies */}
      <div className="hrms-card" style={cardStyle}>
        <h3 style={sectionTitle}>Competencies</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {comp.map((c) => (
            <div key={c.key} style={{ borderBottom: '1px solid var(--color-stroke)', paddingBottom: '1.2rem' }}>
              <p style={{ margin: '0 0 0.6rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-14)' }}>{c.label}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                <div>
                  <label style={fieldLabel}>Your rating</label>
                  <RatingPicker value={c.selfRating} onChange={(n) => setCompField(c.key, 'selfRating', n)} disabled={!editingSelf} />
                  {editingSelf ? (
                    <textarea className="hrms-input" style={{ ...taStyle, minHeight: 44, marginTop: 6 }} placeholder="Comment (optional)" value={c.selfComment ?? ''} onChange={(e) => setCompField(c.key, 'selfComment', e.target.value)} />
                  ) : c.selfComment ? <p style={{ ...readText, marginTop: 6, fontSize: 11 }}>{c.selfComment}</p> : null}
                </div>
                <div>
                  <label style={fieldLabel}>Manager rating</label>
                  {showManager ? (
                    <>
                      <RatingPicker value={c.managerRating} onChange={() => {}} disabled />
                      {c.managerComment && <p style={{ ...readText, marginTop: 6, fontSize: 11 }}>{c.managerComment}</p>}
                    </>
                  ) : <p style={{ ...readText, color: 'var(--color-neutral-6)' }}>Pending</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manager evaluation (visible once finalized) */}
      {showManager && (
        <div className="hrms-card" style={cardStyle}>
          <h3 style={sectionTitle}>
            Manager Evaluation
            {typeof review.overallRating === 'number' && (
              <span style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-semantics-orange-7)', fontSize: 'var(--text-fs-14)' }}>
                <Star size={14} fill="currentColor" /> {review.overallRating}/5
              </span>
            )}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div><label style={fieldLabel}>Summary</label><p style={readText}>{review.managerReview.summary || '—'}</p></div>
            <div><label style={fieldLabel}>Areas of strength</label><p style={readText}>{review.managerReview.areasOfStrength || '—'}</p></div>
            <div><label style={fieldLabel}>Areas to improve</label><p style={readText}>{review.managerReview.areasToImprove || '—'}</p></div>
          </div>
        </div>
      )}

      {/* Compensation outcome — only shown to the employee once approved & applied */}
      {review.compensation?.decision === 'accepted' && (
        <div className="hrms-card" style={{ ...cardStyle, background: 'linear-gradient(90deg, var(--color-semantics-green-1) 0%, var(--color-neutral-1) 80%)', border: '1px solid var(--color-semantics-green-3)' }}>
          <h3 style={sectionTitle}>Compensation Outcome</h3>
          <p style={{ margin: 0, color: 'var(--color-semantics-green-7)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' }}>
            +{review.compensation.incrementPct}% salary increment
            {review.compensation.promotion ? ` · Promotion${review.compensation.proposedTitle ? ` to ${review.compensation.proposedTitle}` : ''}` : ''}
          </p>
          <p style={{ ...readText, marginTop: 6 }}>
            {review.compensation.effectiveDate ? `Effective ${formatDate(review.compensation.effectiveDate)}. ` : ''}
            This will be reflected in your next payroll run.
          </p>
        </div>
      )}

      {/* Acknowledgement */}
      {canAck && (
        <div className="hrms-card" style={cardStyle}>
          <h3 style={sectionTitle}>Acknowledge</h3>
          <p style={{ ...readText, marginBottom: '0.8rem' }}>Confirm that you have read and discussed this review with your manager. You may add an optional comment.</p>
          <textarea className="hrms-input" style={taStyle} placeholder="Your comment (optional)" value={ackComment} onChange={(e) => setAckComment(e.target.value)} />
        </div>
      )}
      {review.employeeAck?.acknowledged && (
        <div className="hrms-card" style={cardStyle}>
          <p style={readText}>
            <CheckCircle size={13} style={{ color: 'var(--color-semantics-green-7)', verticalAlign: 'middle', marginRight: 6 }} />
            You acknowledged this review{review.employeeAck.acknowledgedAt ? ` on ${formatDate(review.employeeAck.acknowledgedAt)}` : ''}.
          </p>
          {review.employeeAck.comment && <p style={{ ...readText, marginTop: 6 }}>{review.employeeAck.comment}</p>}
        </div>
      )}

      {/* Actions */}
      {editingSelf && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
          <button onClick={() => submit('save')} className="hrms-btn-ghost" disabled={!!saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save draft
          </button>
          <button onClick={() => submit('submit')} className="hrms-btn-primary" disabled={!!saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving === 'submit' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Submit self-assessment
          </button>
        </div>
      )}
      {canAck && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
          <button onClick={() => submit('acknowledge')} className="hrms-btn-primary" disabled={!!saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving === 'acknowledge' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />} Acknowledge review
          </button>
        </div>
      )}
    </div>
  );
}
