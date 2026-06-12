'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Lock, Loader2, Sparkles } from 'lucide-react';
import { FEATURE_LABELS, getPlan, minTierFor, type FeatureKey } from '@/lib/plans';

// Map a path prefix → the feature module that gates it.  Core HR paths are
// absent here, so they're never gated.  Longest-prefix wins is unnecessary —
// these prefixes don't overlap.
const GATED_PREFIXES: Array<{ prefix: string; feature: FeatureKey }> = [
  { prefix: '/payroll',          feature: 'payroll' },
  { prefix: '/performance',      feature: 'performance' },
  { prefix: '/my/goals',         feature: 'performance' },
  { prefix: '/analytics',        feature: 'analytics' },
  { prefix: '/burnout',          feature: 'analytics' },
  { prefix: '/immigration',      feature: 'immigration' },
  { prefix: '/admin/ai-workers', feature: 'immigration' },
];

function gateFor(pathname: string): FeatureKey | null {
  const hit = GATED_PREFIXES.find((g) => pathname === g.prefix || pathname.startsWith(g.prefix + '/'));
  return hit?.feature ?? null;
}

function UpgradePrompt({ feature }: { feature: FeatureKey }) {
  const router = useRouter();
  const tier   = minTierFor(feature);
  const plan   = getPlan(tier);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 160px)', padding: '2rem' }}>
      <div className="hrms-card" style={{ maxWidth: 460, textAlign: 'center', padding: '2.4rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-vr-blue-1)', border: '1px solid var(--color-vr-blue-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.2rem' }}>
          <Lock size={24} style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
        <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
          {FEATURE_LABELS[feature]}
        </h2>
        <p style={{ margin: '0.8rem 0 1.6rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-14)', lineHeight: 1.6 }}>
          This module is part of the <strong>{plan.name}</strong> plan. Upgrade to unlock it for your whole workspace.
        </p>
        <button onClick={() => router.push('/billing')} className="hrms-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.8rem 1.6rem' }}>
          <Sparkles size={14} /> View plans &amp; upgrade
        </button>
      </div>
    </div>
  );
}

export function PremiumGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [features, setFeatures] = useState<FeatureKey[] | null>(null);

  useEffect(() => {
    fetch('/api/me/entitlements')
      .then((r) => r.json())
      .then((d) => setFeatures(d.data?.features ?? []))
      .catch(() => setFeatures([]));   // fail open to a known state; API still enforces
  }, []);

  const needed = gateFor(pathname);
  if (!needed) return <>{children}</>;            // not a gated path
  if (features === null) {                         // entitlements still loading
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}><Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} /></div>;
  }
  if (!features.includes(needed)) return <UpgradePrompt feature={needed} />;
  return <>{children}</>;
}
