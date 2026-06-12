'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Target, Loader2, RefreshCw, Plus, ChevronRight, Star } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate }  from '@/lib/utils';
import { AddReviewModal } from '@/components/widgets/AddReviewModal';

interface Review {
  _id: string; employeeCode: string; jobTitle?: string; departmentName?: string;
  cycleLabel: string; periodStart: string; periodEnd: string;
  status: string; overallRating?: number;
}

const TABS = [
  { value: 'self_assessment', label: 'Self-assessment' },
  { value: 'manager_review',  label: 'Manager review'  },
  { value: 'finalized',       label: 'Finalized'       },
  { value: 'acknowledged',    label: 'Acknowledged'    },
  { value: '',                label: 'All'             },
];

export default function PerformancePage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState('manager_review');
  const [addOpen, setAddOpen] = useState(false);

  const load = (s = statusF) => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '60', ...(s ? { status: s } : {}) });
    fetch(`/api/performance?${p}`)
      .then((r) => r.json())
      .then((d) => setReviews(d.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(statusF); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [statusF]);

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
        <Target size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            Performance Reviews
          </h2>
          <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Open review cycles, evaluate self-assessments, and finalize ratings.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 4, background: 'var(--color-neutral-3)', padding: 3, borderRadius: '0.8rem' }}>
          {TABS.map(({ value, label }) => (
            <button
              key={value || 'all'}
              onClick={() => setStatusF(value)}
              style={{
                padding: '0.4rem 1rem', borderRadius: '0.6rem', border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                background: statusF === value ? 'var(--color-neutral-1)' : 'transparent',
                color:      statusF === value ? 'var(--color-neutral-10)' : 'var(--color-neutral-7)',
                boxShadow:  statusF === value ? 'var(--shadow-card)' : 'none',
                whiteSpace: 'nowrap', transition: 'all 120ms ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button onClick={() => setAddOpen(true)} className="hrms-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.7rem 1.2rem' }}>
          <Plus size={13} /> New Review
        </button>
        <button onClick={() => load(statusF)} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      <AddReviewModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => load(statusF)} />

      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
          <thead>
            <tr>
              {['Employee', 'Cycle', 'Period', 'Status', 'Rating', ''].map((h, i) => (
                <th key={i} className="hrms-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
              </td></tr>
            ) : reviews.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-14)' }}>
                  No reviews in this stage
                </p>
                <p style={{ margin: '0.4rem 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                  Click “New Review” to open a review cycle for an employee.
                </p>
              </td></tr>
            ) : reviews.map((r) => (
              <tr
                key={r._id}
                onClick={() => router.push(`/performance/${r._id}`)}
                style={{ cursor: 'pointer' }}
              >
                <td className="hrms-td">
                  <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{r.employeeCode}</p>
                  <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>{r.jobTitle ?? ''}</p>
                </td>
                <td className="hrms-td" style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{r.cycleLabel}</td>
                <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                </td>
                <td className="hrms-td"><StatusBadge status={r.status} /></td>
                <td className="hrms-td">
                  {typeof r.overallRating === 'number' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-neutral-10)' }}>
                      <Star size={12} style={{ color: 'var(--color-semantics-orange-7)' }} fill="currentColor" />
                      {r.overallRating}/5
                    </span>
                  ) : <span style={{ color: 'var(--color-neutral-6)' }}>—</span>}
                </td>
                <td className="hrms-td" style={{ textAlign: 'right', color: 'var(--color-neutral-6)' }}>
                  <ChevronRight size={14} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
