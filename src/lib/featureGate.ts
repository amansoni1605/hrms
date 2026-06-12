/**
 * Server-side feature gating.
 *
 * `withFeature(key, handler, roles)` wraps a route so that, after auth + tenant
 * context are established, the tenant's subscription plan is checked.  If the
 * plan does not include the feature, the request is rejected with HTTP 402
 * (Payment Required) and a machine-readable body the UI turns into an upgrade
 * prompt.  Composes on top of withRoute, so role gating still applies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRoute }                 from './withRoute';
import { Tenant }                    from '@/models/workspace.models';
import { hasFeature, minTierFor, getPlan, type FeatureKey } from './plans';
import type { SessionPayload }       from './auth';
import type { UserRole }             from '@/infrastructure/multiTenantCore';

/** Read the tenant's current plan tier (Tenant is a global collection). */
export async function tenantTier(tenantId: string): Promise<string> {
  const t = await Tenant.findById(tenantId).select('subscription.tier').lean();
  return (t as { subscription?: { tier?: string } } | null)?.subscription?.tier ?? 'starter';
}

/** True if the tenant's plan includes the feature. */
export async function isTenantEntitled(tenantId: string, key: FeatureKey): Promise<boolean> {
  return hasFeature(await tenantTier(tenantId), key);
}

type StaticHandler = (req: NextRequest, session: SessionPayload) => Promise<NextResponse>;

export function withFeature(feature: FeatureKey, handler: StaticHandler, requiredRoles?: UserRole[]) {
  return withRoute(async (req, session) => {
    // tenantId is guaranteed by withRoute's auth gate, but the type is optional.
    if (!session.tenantId || !(await isTenantEntitled(session.tenantId, feature))) {
      const needed = minTierFor(feature);
      return NextResponse.json(
        {
          error:        'FEATURE_NOT_IN_PLAN',
          feature,
          requiredTier: needed,
          message:      `This feature isn't included in your plan. Upgrade to ${getPlan(needed).name} to unlock it.`,
        },
        { status: 402 },
      );
    }
    return handler(req, session);
  }, requiredRoles);
}
