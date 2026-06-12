'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, User, ArrowRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface PipelineCard {
  _id: string; name: string; email: string;
  jobTitle: string; candidateStatus: string;
  hiredAt?: string; employeeId?: string; onboardingId?: string;
  updatedAt: string;
}
interface Column {
  stage: string; count: number; cards: PipelineCard[];
}

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  SHORTLISTED:          { label: 'Shortlisted',       color: 'var(--color-vr-blue-6)',          bg: '#E8EEF5' },
  OFFER_EXTENDED:       { label: 'Offer Extended',    color: '#3759BF',                         bg: '#EEF0FF' },
  OFFER_ACCEPTED:       { label: 'Offer Accepted',    color: '#856404',                         bg: '#FFF3CD' },
  ONBOARDING_ACTIVE:    { label: 'Onboarding',        color: '#7C3AED',                         bg: '#F5F3FF' },
  ONBOARDING_COMPLETED: { label: 'Onboarding Done',   color: 'var(--color-semantics-green-7)',  bg: 'var(--color-semantics-green-1)' },
  TRAINING_IN_PROGRESS: { label: 'In Training',       color: '#B45309',                         bg: '#FFFBEB' },
  FULLY_RAMPED:         { label: 'Fully Ramped',      color: 'var(--color-semantics-green-7)',  bg: '#D1FAE5' },
};

export default function TalentPipelinePage() {
  const [columns, setColumns]  = useState<Column[]>([]);
  const [loading, setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/talent/pipeline');
    const json = await res.json();
    setColumns(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = columns.reduce((s, c) => s + c.count, 0);

  return (
    <div style={{ padding: '2rem', height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>Talent Pipeline</h2>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{total} candidate{total !== 1 ? 's' : ''} in the pipeline</p>
        </div>
        <button onClick={load} className="hrms-btn-ghost" disabled={loading}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', flex: 1, minHeight: 0, paddingBottom: '1rem' }}>
          {columns.map((col) => {
            const cfg = STAGE_CONFIG[col.stage] ?? { label: col.stage, color: 'var(--color-neutral-7)', bg: '#F5F5F5' };
            return (
              <div key={col.stage} style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Column header */}
                <div style={{ padding: '0.8rem', borderRadius: '0.8rem', background: cfg.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, color: cfg.color }}>{col.count}</span>
                </div>

                {/* Cards */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {col.cards.length === 0 && (
                    <div style={{ padding: '1.2rem', textAlign: 'center', color: 'var(--color-neutral-5)', fontSize: 12 }}>Empty</div>
                  )}
                  {col.cards.map((card) => (
                    <div key={card._id} className="hrms-card" style={{ padding: '1rem', cursor: 'default' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={13} style={{ color: cfg.color }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 12, color: 'var(--color-neutral-10)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name}</p>
                          <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.jobTitle}</p>
                        </div>
                      </div>
                      <p style={{ margin: '0 0 0.6rem', fontSize: 10, color: 'var(--color-neutral-6)' }}>{card.email}</p>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {card.employeeId && (
                          <Link href={`/employees/${card.employeeId}`} style={{ fontSize: 10, color: 'var(--color-vr-blue-6)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <ArrowRight size={9} /> View Employee
                          </Link>
                        )}
                        {card.onboardingId && (
                          <Link href="/onboarding" style={{ fontSize: 10, color: '#7C3AED', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <ArrowRight size={9} /> Onboarding
                          </Link>
                        )}
                      </div>
                      <p style={{ margin: '0.6rem 0 0', fontSize: 9, color: 'var(--color-neutral-5)' }}>
                        {new Date(card.updatedAt).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
