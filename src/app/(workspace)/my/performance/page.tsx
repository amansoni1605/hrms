'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Target, Loader2, ChevronRight, Star } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState }  from '@/components/ui/EmptyState';
import { formatDate }  from '@/lib/utils';

interface Review {
  _id: string; cycleLabel: string; periodStart: string; periodEnd: string;
  status: string; overallRating?: number;
}

// Friendly hint for the employee about what (if anything) they need to do.
const ACTION_HINT: Record<string, string> = {
  self_assessment: 'Action needed — complete your self-assessment',
  manager_review:  'Submitted — awaiting your manager’s evaluation',
  finalized:       'Action needed — review and acknowledge',
  acknowledged:    'Complete',
};

export default function MyPerformancePage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me/performance')
      .then((r) => r.json())
      .then((d) => setReviews(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
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
    </div>
  );
}
