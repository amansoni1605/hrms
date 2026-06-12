'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Check, Loader2, Users, Sparkles, Info } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { PLANS, PLAN_ORDER, type PlanTier } from '@/lib/plans';

interface Billing { tier: PlanTier; planName: string; maxSeats: number; liveHeadcount: number; legalName?: string }

export default function BillingPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState<PlanTier | null>(null);
  const { push: pushToast } = useToast();

  const load = () => {
    setLoading(true);
    fetch('/api/ws/billing').then((r) => r.json()).then((d) => setBilling(d.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const changePlan = async (tier: PlanTier) => {
    setChanging(tier);
    try {
      const res = await fetch('/api/ws/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier }) });
      const json = await res.json();
      if (!res.ok) { pushToast({ kind: 'error', title: json.error ?? 'Could not change plan' }); return; }
      pushToast({ kind: 'success', title: `Switched to ${json.data.planName}.` });
      load();
    } catch { pushToast({ kind: 'error', title: 'Network error' }); }
    finally { setChanging(null); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}><Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} /></div>;

  const currentIdx = billing ? PLAN_ORDER.indexOf(billing.tier) : 0;
  const seatPct = billing && billing.maxSeats > 0 ? Math.min(100, Math.round((billing.liveHeadcount / billing.maxSeats) * 100)) : 0;

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <CreditCard size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>Billing &amp; Plans</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Manage your subscription. Upgrades unlock modules instantly across your workspace.
          </p>
        </div>
      </div>

      {/* Current plan + seat usage */}
      {billing && (
        <div className="hrms-card" style={{ marginBottom: '1.6rem', display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Plan</p>
            <p style={{ margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
              {billing.planName} <Badge variant="purple">{billing.tier}</Badge>
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)' }}><Users size={12} /> Seat usage</span>
              <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {billing.liveHeadcount} / {billing.maxSeats >= 1_000_000 ? '∞' : billing.maxSeats}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ width: `${seatPct}%`, height: '100%', background: seatPct >= 90 ? 'var(--color-semantics-red-6)' : 'var(--color-vr-blue-6)', transition: 'width 200ms ease' }} />
            </div>
          </div>
        </div>
      )}

      {/* Mock-checkout disclaimer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: '1.6rem', padding: '0.8rem 1rem', borderRadius: '0.8rem', background: 'var(--color-neutral-2)', border: '1px solid var(--color-stroke)', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Demo billing — plan changes apply instantly with no payment. In production this routes through Stripe Checkout and confirms via webhook.</span>
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.2rem' }}>
        {PLAN_ORDER.map((tier, idx) => {
          const plan = PLANS[tier];
          const isCurrent = billing?.tier === tier;
          const isUpgrade = idx > currentIdx;
          return (
            <div key={tier} className="hrms-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: isCurrent ? '2px solid var(--color-vr-blue-6)' : '1px solid var(--color-stroke)', position: 'relative' }}>
              {isCurrent && <span style={{ position: 'absolute', top: -10, right: 16, background: 'var(--color-vr-blue-6)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.2rem 0.7rem', borderRadius: 99 }}>CURRENT</span>}
              <div>
                <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>{plan.name}</p>
                <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 11, minHeight: 30 }}>{plan.tagline}</p>
              </div>
              <div>
                <span style={{ fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)', color: 'var(--color-neutral-10)' }}>
                  {plan.pricePerSeat === 0 ? 'Free' : `$${plan.pricePerSeat}`}
                </span>
                {plan.pricePerSeat > 0 && <span style={{ color: 'var(--color-neutral-6)', fontSize: 11 }}> / seat / mo</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                {plan.highlights.map((h, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-8)' }}>
                    <Check size={13} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0, marginTop: 1 }} /> {h}
                  </span>
                ))}
              </div>
              <button
                onClick={() => changePlan(tier)}
                disabled={isCurrent || !!changing}
                className={isCurrent ? 'hrms-btn-ghost' : 'hrms-btn-primary'}
                style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: isCurrent ? 0.6 : 1 }}
              >
                {changing === tier ? <Loader2 size={13} className="animate-spin" />
                  : isCurrent ? 'Current plan'
                  : isUpgrade ? <><Sparkles size={13} /> Upgrade</>
                  : 'Switch'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
