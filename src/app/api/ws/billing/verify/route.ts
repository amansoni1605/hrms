import { NextRequest, NextResponse }      from 'next/server';
import { withRoute, auditEvent }           from '@/lib/withRoute';
import { Tenant, WorkspaceEmployee }       from '@/models/workspace.models';
import { TenantContext }                   from '@/infrastructure/multiTenantCore';
import { PLANS, type PlanTier }            from '@/lib/plans';
import { createHmac }                      from 'node:crypto';
import { createHash }                      from 'node:crypto';

// POST /api/ws/billing/verify
// Verifies Razorpay payment signature and upgrades the plan.
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, tier }
export const POST = withRoute(async (req: NextRequest, session) => {
  const body = await req.json() as {
    razorpay_order_id?:   string;
    razorpay_payment_id?: string;
    razorpay_signature?:  string;
    tier?:                string;
  };

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, tier } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !tier) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const plan = PLANS[tier as PlanTier];
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan tier' }, { status: 400 });
  }

  const keySecret = process.env['RAZORPAY_KEY_SECRET'];
  if (!keySecret) {
    return NextResponse.json({ error: 'Razorpay credentials not configured' }, { status: 500 });
  }

  // Verify HMAC-SHA256 signature: order_id + "|" + payment_id
  const expectedSig = createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
  }

  // Block downgrade if over seat cap
  if (plan.maxSeats !== -1) {
    const headcount = await WorkspaceEmployee.countDocuments({ isActive: true });
    if (headcount > plan.maxSeats) {
      return NextResponse.json(
        { error: `Plan allows ${plan.maxSeats} seats but you have ${headcount} active employees.` },
        { status: 409 },
      );
    }
  }

  const ctx = TenantContext.requireStore('POST /api/ws/billing/verify');

  await Tenant.findByIdAndUpdate(session.tenantId, {
    $set: {
      'subscription.tier':     tier,
      'subscription.features': plan.features,
      'subscription.maxSeats': plan.maxSeats === -1 ? 1_000_000 : plan.maxSeats,
      'subscription.renewsAt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await auditEvent({
    actionType:       'PLAN_UPGRADED',
    targetCollection: 'tenants',
    targetDocumentId: ctx.tenantId.toString(),
    newStateHash:     createHash('sha256').update(`plan:${tier}:${razorpay_payment_id}`).digest('hex'),
    changeSummary: {
      tier,
      razorpay_order_id,
      razorpay_payment_id,
      features:  plan.features,
      changedBy: session.userId,
    },
  });

  return NextResponse.json({ data: { tier, planName: plan.name, features: plan.features } });
}, ['super_admin', 'hr_admin']);
