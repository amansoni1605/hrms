'use client';

import { useEffect, useState, useCallback } from 'react';
import { CreditCard, Check, Loader2, Users, Sparkles, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { PLANS, PLAN_ORDER, type PlanTier } from '@/lib/plans';

interface Billing {
  tier:          PlanTier;
  planName:      string;
  maxSeats:      number;
  liveHeadcount: number;
  legalName?:    string;
  renewsAt?:     string | null;
}

// Razorpay checkout options injected into window by the CDN script
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src   = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function BillingPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying,  setPaying]  = useState<PlanTier | null>(null);
  const { push: pushToast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/ws/billing')
      .then((r) => r.json())
      .then((d) => setBilling(d.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpgrade = async (tier: PlanTier) => {
    setPaying(tier);
    try {
      // 1. Load Razorpay checkout.js
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        pushToast({ kind: 'error', title: 'Could not load Razorpay — check your internet connection.' });
        return;
      }

      // 2. Create order on server
      const orderRes = await fetch('/api/ws/billing/order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tier }),
      });
      const orderJson = await orderRes.json();
      if (!orderRes.ok) {
        pushToast({ kind: 'error', title: orderJson.error ?? 'Failed to create order' });
        return;
      }

      const { orderId, amount, currency, keyId, planName, seats } = orderJson;

      // 3. Open Razorpay checkout modal
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key:         keyId,
          amount,
          currency,
          order_id:    orderId,
          name:        'HRMS',
          description: `${planName} Plan — ${seats} seat${seats > 1 ? 's' : ''}`,
          theme:       { color: '#1C509D' },
          prefill: {
            name:  billing?.legalName ?? '',
            email: '',
          },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id:   string;
            razorpay_signature:  string;
          }) => {
            // 4. Verify signature + upgrade plan
            const verifyRes = await fetch('/api/ws/billing/verify', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ ...response, tier }),
            });
            const verifyJson = await verifyRes.json();
            if (!verifyRes.ok) {
              pushToast({ kind: 'error', title: verifyJson.error ?? 'Payment verification failed' });
              reject(new Error(verifyJson.error));
              return;
            }
            pushToast({ kind: 'success', title: `Upgraded to ${verifyJson.data.planName}!`, desc: 'Your new plan is active immediately.' });
            load();
            resolve();
          },
          modal: {
            ondismiss: () => resolve(), // user closed modal — not an error
          },
        });
        rzp.open();
      });
    } catch {
      // error already toasted in handler
    } finally {
      setPaying(null);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
      <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
    </div>
  );

  const currentIdx = billing ? PLAN_ORDER.indexOf(billing.tier) : 0;
  const seatPct    = billing && billing.maxSeats > 0
    ? Math.min(100, Math.round((billing.liveHeadcount / billing.maxSeats) * 100))
    : 0;

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <CreditCard size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            Billing &amp; Plans
          </h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Manage your subscription. Upgrades unlock modules instantly.
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
            {billing.renewsAt && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-neutral-6)' }}>
                Renews {new Date(billing.renewsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)' }}>
                <Users size={12} /> Seat usage
              </span>
              <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {billing.liveHeadcount} / {billing.maxSeats >= 1_000_000 ? '∞' : billing.maxSeats}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{
                width: `${seatPct}%`, height: '100%',
                background: seatPct >= 90 ? 'var(--color-semantics-red-6)' : 'var(--color-vr-blue-6)',
                transition: 'width 200ms ease',
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Test mode badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.6rem',
        padding: '0.7rem 1rem', borderRadius: '0.8rem',
        background: '#FFFBEB', border: '1px solid #FDE68A',
        fontSize: 'var(--text-fs-12)', color: '#92400E',
      }}>
        <ShieldCheck size={14} style={{ flexShrink: 0 }} />
        <span>
          <strong>Test mode active.</strong> Use Razorpay test card <code style={{ background: '#FEF3C7', padding: '1px 5px', borderRadius: 4 }}>4111 1111 1111 1111</code>, any future expiry, CVV <code style={{ background: '#FEF3C7', padding: '1px 5px', borderRadius: 4 }}>any 3 digits</code>. No real money is charged.
        </span>
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.2rem' }}>
        {PLAN_ORDER.map((tier, idx) => {
          const plan      = PLANS[tier];
          const isCurrent = billing?.tier === tier;
          const isUpgrade = idx > currentIdx;
          const isLoading = paying === tier;

          return (
            <div
              key={tier}
              className="hrms-card"
              style={{
                display: 'flex', flexDirection: 'column', gap: '1rem',
                border: isCurrent
                  ? '2px solid var(--color-vr-blue-6)'
                  : '1px solid var(--color-stroke)',
                position: 'relative',
              }}
            >
              {isCurrent && (
                <span style={{
                  position: 'absolute', top: -10, right: 16,
                  background: 'var(--color-vr-blue-6)', color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  padding: '0.2rem 0.7rem', borderRadius: 99,
                }}>
                  CURRENT
                </span>
              )}

              <div>
                <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>
                  {plan.name}
                </p>
                <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 11, minHeight: 30 }}>
                  {plan.tagline}
                </p>
              </div>

              {/* Price */}
              <div>
                {plan.pricePerSeatINR === 0 ? (
                  <span style={{ fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)', color: 'var(--color-neutral-10)' }}>
                    Free
                  </span>
                ) : (
                  <>
                    <span style={{ fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)', color: 'var(--color-neutral-10)' }}>
                      ₹{plan.pricePerSeatINR}
                    </span>
                    <span style={{ color: 'var(--color-neutral-6)', fontSize: 11 }}> / seat / month</span>
                  </>
                )}
                {billing && plan.pricePerSeatINR > 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-neutral-7)' }}>
                    ₹{plan.pricePerSeatINR * Math.max(1, billing.liveHeadcount)}/month for {Math.max(1, billing.liveHeadcount)} seat{billing.liveHeadcount > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Features */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                {plan.highlights.map((h, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-8)' }}>
                    <Check size={13} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0, marginTop: 1 }} />
                    {h}
                  </span>
                ))}
              </div>

              {/* Action button */}
              {isCurrent ? (
                <button disabled className="hrms-btn-ghost" style={{ width: '100%', opacity: 0.6 }}>
                  Current plan
                </button>
              ) : plan.pricePerSeatINR === 0 ? (
                <button
                  onClick={() => {
                    // Free plan — direct switch, no payment
                    setPaying(tier);
                    fetch('/api/ws/billing', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tier }),
                    })
                      .then((r) => r.json())
                      .then((j) => {
                        if (j.data) { pushToast({ kind: 'success', title: `Switched to ${j.data.planName}.` }); load(); }
                        else pushToast({ kind: 'error', title: j.error ?? 'Failed' });
                      })
                      .finally(() => setPaying(null));
                  }}
                  disabled={!!paying}
                  className="hrms-btn-ghost"
                  style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {paying === tier ? <Loader2 size={13} className="animate-spin" /> : 'Switch to Free'}
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(tier)}
                  disabled={!!paying}
                  className="hrms-btn-primary"
                  style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {isLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : isUpgrade ? (
                    <><Sparkles size={13} /> Upgrade — ₹{plan.pricePerSeatINR}/seat</>
                  ) : (
                    'Switch Plan'
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment security note */}
      <p style={{ marginTop: '1.6rem', textAlign: 'center', fontSize: 11, color: 'var(--color-neutral-6)' }}>
        Payments are processed securely by Razorpay. We do not store your card details.
      </p>
    </div>
  );
}
