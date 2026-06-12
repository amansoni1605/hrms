'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, CheckCircle, Star, Target } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { useToast }    from '@/components/ui/Toast';
import { formatDate }  from '@/lib/utils';

interface Competency {
  key: string; label: string;
  selfRating?: number; selfComment?: string;
  managerRating?: number; managerComment?: string;
}
interface GoalLite { _id: string; title: string; category: string; status: string; progressPct: number; weight: number }
interface Review {
  _id: string; employeeId: string; employeeCode: string; jobTitle?: string; departmentName?: string;
  cycleLabel: string; periodStart: string; periodEnd: string; status: string;
  competencies: Competency[];
  selfAssessment: { summary?: string; achievements?: string; challenges?: string; submittedAt?: string };
  managerReview: { summary?: string; areasOfStrength?: string; areasToImprove?: string; overallRating?: number; submittedAt?: string };
  compensation: {
    recommended: boolean; promotion: boolean; proposedTitle?: string; proposedBand?: string;
    incrementPct: number; justification?: string;
    decision: 'none' | 'pending' | 'accepted' | 'rejected';
    decisionNote?: string; effectiveDate?: string; appliedAt?: string;
  };
  overallRating?: number;
  employeeAck: { acknowledged: boolean; comment?: string; acknowledgedAt?: string };
}

function RatingPicker({ value, onChange, disabled }: { value?: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          aria-label={`${n} star`}
          style={{ background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 2, lineHeight: 0 }}
        >
          <Star
            size={18}
            style={{ color: (value ?? 0) >= n ? 'var(--color-semantics-orange-7)' : 'var(--color-neutral-5)' }}
            fill={(value ?? 0) >= n ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}

const cardStyle: React.CSSProperties = { marginBottom: '1.4rem' };
const sectionTitle: React.CSSProperties = { margin: '0 0 1rem', color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' };
const fieldLabel: React.CSSProperties = { fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-9)', display: 'block', marginBottom: 4 };
const readText: React.CSSProperties = { margin: 0, color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)', whiteSpace: 'pre-wrap', lineHeight: 1.6 };

export default function PerformanceDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const { push: pushToast } = useToast();

  const [review, setReview]   = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<'save' | 'finalize' | null>(null);

  // Editable manager state
  const [comp, setComp]               = useState<Competency[]>([]);
  const [summary, setSummary]         = useState('');
  const [strengths, setStrengths]     = useState('');
  const [improve, setImprove]         = useState('');
  const [overall, setOverall]         = useState<number | undefined>(undefined);

  // Compensation recommendation (attached at finalize)
  const [recommend, setRecommend]     = useState(false);
  const [promotion, setPromotion]     = useState(false);
  const [incrementPct, setIncrementPct] = useState('');
  const [proposedTitle, setProposedTitle] = useState('');
  const [proposedBand, setProposedBand]   = useState('');
  const [justification, setJustification] = useState('');
  const [goals, setGoals]             = useState<GoalLite[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/performance/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const rv: Review | null = d.data ?? null;
        setReview(rv);
        if (rv) {
          setComp(rv.competencies ?? []);
          setSummary(rv.managerReview?.summary ?? '');
          setStrengths(rv.managerReview?.areasOfStrength ?? '');
          setImprove(rv.managerReview?.areasToImprove ?? '');
          setOverall(rv.managerReview?.overallRating);
          // Pull the employee's goals for this cycle (read-only context for the rating).
          fetch(`/api/goals?employeeId=${rv.employeeId}&cycleLabel=${encodeURIComponent(rv.cycleLabel)}`)
            .then((g) => g.json()).then((g) => setGoals(g.data ?? [])).catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const setCompField = (key: string, field: 'managerRating' | 'managerComment', val: number | string) =>
    setComp((prev) => prev.map((c) => c.key === key ? { ...c, [field]: val } : c));

  const submit = async (action: 'save' | 'finalize') => {
    setSaving(action);
    try {
      const res = await fetch(`/api/performance/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, summary, areasOfStrength: strengths, areasToImprove: improve,
          overallRating: overall,
          competencyRatings: comp.map((c) => ({ key: c.key, managerRating: c.managerRating, managerComment: c.managerComment })),
          ...(action === 'finalize' && recommend ? {
            compensation: {
              promotion,
              incrementPct: parseFloat(incrementPct) || 0,
              proposedTitle: promotion ? proposedTitle : undefined,
              proposedBand:  promotion ? proposedBand : undefined,
              justification,
            },
          } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) { pushToast({ kind: 'error', title: json.error ?? 'Save failed' }); return; }
      pushToast({ kind: 'success', title: action === 'finalize' ? 'Review finalized' : 'Draft saved' });
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

  const locked = review.status === 'finalized' || review.status === 'acknowledged';
  const selfSubmitted = !!review.selfAssessment?.submittedAt;

  return (
    <div style={{ padding: '2rem', maxWidth: 960 }}>
      {/* Header */}
      <button onClick={() => router.push('/performance')} className="hrms-btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: '1.2rem', padding: '0.5rem 1rem' }}>
        <ArrowLeft size={13} /> All reviews
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Target size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            {review.employeeCode} · {review.cycleLabel}
          </h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            {review.jobTitle ?? ''}{review.departmentName ? ` · ${review.departmentName}` : ''} · {formatDate(review.periodStart)} → {formatDate(review.periodEnd)}
          </p>
        </div>
        <StatusBadge status={review.status} />
      </div>

      {/* Self-assessment (read-only) */}
      <div className="hrms-card" style={cardStyle}>
        <h3 style={sectionTitle}>Employee Self-Assessment</h3>
        {selfSubmitted ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div><label style={fieldLabel}>Summary</label><p style={readText}>{review.selfAssessment.summary || '—'}</p></div>
            <div><label style={fieldLabel}>Key achievements</label><p style={readText}>{review.selfAssessment.achievements || '—'}</p></div>
            <div><label style={fieldLabel}>Challenges</label><p style={readText}>{review.selfAssessment.challenges || '—'}</p></div>
          </div>
        ) : (
          <p style={{ ...readText, color: 'var(--color-neutral-6)' }}>The employee has not submitted their self-assessment yet.</p>
        )}
      </div>

      {/* Goals this cycle (read-only context for the rating) */}
      {goals.length > 0 && (
        <div className="hrms-card" style={cardStyle}>
          <h3 style={sectionTitle}>Goals — {review.cycleLabel}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {goals.map((g) => (
              <div key={g._id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-10)' }}>{g.title}</span>
                  {g.weight > 0 && <span style={{ fontSize: 10, color: 'var(--color-neutral-6)' }}>{g.weight}%</span>}
                  <StatusBadge status={g.status} />
                  <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>{g.progressPct}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, g.progressPct)}%`, height: '100%', background: g.progressPct >= 100 ? 'var(--color-semantics-green-6)' : 'var(--color-vr-blue-6)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Competency grid */}
      <div className="hrms-card" style={cardStyle}>
        <h3 style={sectionTitle}>Competency Ratings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {comp.map((c) => (
            <div key={c.key} style={{ borderBottom: '1px solid var(--color-stroke)', paddingBottom: '1.2rem' }}>
              <p style={{ margin: '0 0 0.6rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-14)' }}>{c.label}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                <div>
                  <label style={fieldLabel}>Self</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RatingPicker value={c.selfRating} onChange={() => {}} disabled />
                    <span style={{ fontSize: 11, color: 'var(--color-neutral-6)' }}>{c.selfRating ? `${c.selfRating}/5` : 'Not rated'}</span>
                  </div>
                  {c.selfComment && <p style={{ ...readText, marginTop: 6, fontSize: 11 }}>{c.selfComment}</p>}
                </div>
                <div>
                  <label style={fieldLabel}>Manager</label>
                  <RatingPicker value={c.managerRating} onChange={(n) => setCompField(c.key, 'managerRating', n)} disabled={locked} />
                  <textarea
                    className="hrms-input"
                    style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, minHeight: 44, resize: 'vertical' }}
                    placeholder="Comment (optional)"
                    value={c.managerComment ?? ''}
                    disabled={locked}
                    onChange={(e) => setCompField(c.key, 'managerComment', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manager narrative */}
      <div className="hrms-card" style={cardStyle}>
        <h3 style={sectionTitle}>Manager Evaluation</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={fieldLabel}>Overall summary</label>
            <textarea className="hrms-input" style={{ width: '100%', boxSizing: 'border-box', minHeight: 70, resize: 'vertical' }} value={summary} disabled={locked} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            <div>
              <label style={fieldLabel}>Areas of strength</label>
              <textarea className="hrms-input" style={{ width: '100%', boxSizing: 'border-box', minHeight: 60, resize: 'vertical' }} value={strengths} disabled={locked} onChange={(e) => setStrengths(e.target.value)} />
            </div>
            <div>
              <label style={fieldLabel}>Areas to improve</label>
              <textarea className="hrms-input" style={{ width: '100%', boxSizing: 'border-box', minHeight: 60, resize: 'vertical' }} value={improve} disabled={locked} onChange={(e) => setImprove(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={fieldLabel}>Overall rating {locked ? '' : '(optional — defaults to the average of competency ratings)'}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <RatingPicker value={overall} onChange={setOverall} disabled={locked} />
              <span style={{ fontSize: 12, color: 'var(--color-neutral-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{overall ? `${overall}/5` : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Compensation recommendation */}
      {!locked ? (
        <div className="hrms-card" style={cardStyle}>
          <h3 style={sectionTitle}>Compensation Recommendation</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-9)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, marginBottom: recommend ? '1.2rem' : 0 }}>
            <input type="checkbox" checked={recommend} onChange={(e) => setRecommend(e.target.checked)} />
            Recommend a compensation change with this review
          </label>
          {recommend && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                <div>
                  <label style={fieldLabel}>Salary increment %</label>
                  <input className="hrms-input" style={{ width: '100%', boxSizing: 'border-box' }} type="number" min={0} max={100} step={0.5} placeholder="e.g. 8" value={incrementPct} onChange={(e) => setIncrementPct(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-9)' }}>
                    <input type="checkbox" checked={promotion} onChange={(e) => setPromotion(e.target.checked)} />
                    Recommend promotion
                  </label>
                </div>
              </div>
              {promotion && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                  <div>
                    <label style={fieldLabel}>Proposed title</label>
                    <input className="hrms-input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. Senior Operations Lead" value={proposedTitle} onChange={(e) => setProposedTitle(e.target.value)} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Proposed band</label>
                    <input className="hrms-input" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. L5" value={proposedBand} onChange={(e) => setProposedBand(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <label style={fieldLabel}>Justification</label>
                <textarea className="hrms-input" style={{ width: '100%', boxSizing: 'border-box', minHeight: 56, resize: 'vertical' }} value={justification} onChange={(e) => setJustification(e.target.value)} />
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-neutral-6)' }}>
                Submitted for HR approval when you finalize. The raise applies to payroll only after HR accepts.
              </p>
            </div>
          )}
        </div>
      ) : review.compensation?.recommended ? (
        <div className="hrms-card" style={cardStyle}>
          <h3 style={sectionTitle}>
            Compensation Recommendation
            <span style={{ marginLeft: 10 }}><StatusBadge status={review.compensation.decision} /></span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <p style={readText}><strong>Increment:</strong> {review.compensation.incrementPct}%{review.compensation.promotion ? ` · Promotion${review.compensation.proposedTitle ? ` → ${review.compensation.proposedTitle}` : ''}${review.compensation.proposedBand ? ` (${review.compensation.proposedBand})` : ''}` : ''}</p>
            {review.compensation.justification && <p style={readText}><strong>Justification:</strong> {review.compensation.justification}</p>}
            {review.compensation.decision === 'accepted' && (
              <p style={{ ...readText, color: 'var(--color-semantics-green-7)' }}>
                Applied{review.compensation.effectiveDate ? `, effective ${formatDate(review.compensation.effectiveDate)}` : ''} — reflected in the next payroll run.
              </p>
            )}
            {review.compensation.decision === 'rejected' && review.compensation.decisionNote && (
              <p style={{ ...readText, color: 'var(--color-semantics-red-6)' }}><strong>Declined:</strong> {review.compensation.decisionNote}</p>
            )}
            {review.compensation.decision === 'pending' && (
              <p style={{ ...readText, color: 'var(--color-semantics-orange-7)' }}>Awaiting HR approval — see the Comp Approvals queue.</p>
            )}
          </div>
        </div>
      ) : null}

      {/* Acknowledgement (if any) */}
      {review.employeeAck?.acknowledged && (
        <div className="hrms-card" style={cardStyle}>
          <h3 style={sectionTitle}>Employee Acknowledgement</h3>
          <p style={{ ...readText }}>
            <CheckCircle size={13} style={{ color: 'var(--color-semantics-green-7)', verticalAlign: 'middle', marginRight: 6 }} />
            Acknowledged{review.employeeAck.acknowledgedAt ? ` on ${formatDate(review.employeeAck.acknowledgedAt)}` : ''}.
          </p>
          {review.employeeAck.comment && <p style={{ ...readText, marginTop: 6 }}>{review.employeeAck.comment}</p>}
        </div>
      )}

      {/* Actions */}
      {!locked && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
          <button onClick={() => submit('save')} className="hrms-btn-ghost" disabled={!!saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save draft
          </button>
          <button onClick={() => submit('finalize')} className="hrms-btn-primary" disabled={!!saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving === 'finalize' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />} Finalize review
          </button>
        </div>
      )}
    </div>
  );
}
