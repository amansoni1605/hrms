import { NextResponse }  from 'next/server';
import { withRoute }      from '@/lib/withRoute';
import { Tenant }         from '@/models/workspace.models';
import { getPlan, planFeatures } from '@/lib/plans';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/entitlements
//   The current tenant's plan + unlocked feature keys.  Used by the sidebar and
//   the PremiumGuard to lock/unlock modules client-side.  Available to any
//   authenticated user (read-only, no sensitive data).
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (_req, session) => {
  const t = session.tenantId ? await Tenant.findById(session.tenantId).select('subscription').lean() : null;
  const tier = (t as { subscription?: { tier?: string } } | null)?.subscription?.tier ?? 'starter';
  const plan = getPlan(tier);
  return NextResponse.json({
    data: { tier, planName: plan.name, features: planFeatures(tier) },
  });
});
