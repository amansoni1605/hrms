import { NextResponse }                from 'next/server';
import { withRoute, auditEvent }        from '@/lib/withRoute';
import { Tenant, WorkspaceEmployee }    from '@/models/workspace.models';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import { PLANS, getPlan, type PlanTier } from '@/lib/plans';
import { createHash }                   from 'node:crypto';
import mongoose                         from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/billing — current plan + live seat usage (HR Admin / Super Admin)
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (_req, session) => {
  const t = await Tenant.findById(session.tenantId).select('subscription legalName').lean() as
    { subscription?: { tier?: string; maxSeats?: number; usedSeats?: number; renewsAt?: Date }; legalName?: string } | null;
  const tier = (t?.subscription?.tier as PlanTier) ?? 'starter';

  // Live headcount = authoritative seat usage.
  const liveHeadcount = await WorkspaceEmployee.countDocuments({ isActive: true });
  const plan = getPlan(tier);

  return NextResponse.json({
    data: {
      legalName:     t?.legalName,
      tier,
      planName:      plan.name,
      maxSeats:      plan.maxSeats,
      liveHeadcount,
      renewsAt:      t?.subscription?.renewsAt ?? null,
    },
  });
}, ['super_admin', 'hr_admin']);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ws/billing — change plan (mock checkout: instant tier change)
//
// In production this would create a Stripe Checkout session and apply the tier
// on webhook confirmation.  Here it switches the tenant's plan immediately and
// syncs subscription.tier / features / maxSeats from the catalog.
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withRoute(async (req, session) => {
  const body = await req.json() as { tier?: string };
  const tier = body.tier as PlanTier;
  if (!tier || !PLANS[tier]) {
    return NextResponse.json({ error: 'Invalid plan tier' }, { status: 400 });
  }
  const ctx  = TenantContext.requireStore('POST /api/ws/billing');
  const plan = PLANS[tier];

  // Block a downgrade that would put the tenant over the new seat cap.
  if (plan.maxSeats !== -1) {
    const headcount = await WorkspaceEmployee.countDocuments({ isActive: true });
    if (headcount > plan.maxSeats) {
      return NextResponse.json(
        { error: `Cannot switch to ${plan.name}: you have ${headcount} active employees but the plan allows ${plan.maxSeats} seats. Reduce headcount or choose a larger plan.` },
        { status: 409 },
      );
    }
  }

  await Tenant.findByIdAndUpdate(session.tenantId, {
    $set: {
      'subscription.tier':     tier,
      'subscription.features': plan.features,
      'subscription.maxSeats': plan.maxSeats === -1 ? 1_000_000 : plan.maxSeats,
    },
  });

  await auditEvent({
    actionType:       'PLAN_CHANGED',
    targetCollection: 'tenants',
    targetDocumentId: ctx.tenantId.toString(),
    newStateHash:     createHash('sha256').update(`plan:${tier}:${Date.now()}`).digest('hex'),
    changeSummary:    { tier, features: plan.features, changedBy: session.userId },
  });

  return NextResponse.json({ data: { tier, planName: plan.name, features: plan.features } });
}, ['super_admin', 'hr_admin']);
