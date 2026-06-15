import { NextRequest, NextResponse }    from 'next/server';
import { withRoute }                    from '@/lib/withRoute';
import { WorkspaceEmployee }            from '@/models/workspace.models';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import { PLANS, type PlanTier }         from '@/lib/plans';
import Razorpay from 'razorpay';

// POST /api/ws/billing/order
// Creates a Razorpay order for a plan upgrade.
// Returns: { orderId, amount, currency, keyId, planName, seats }
export const POST = withRoute(async (req: NextRequest) => {
  const body = await req.json() as { tier?: string };
  const tier  = body.tier as PlanTier;
  const plan  = PLANS[tier];

  if (!tier || !plan) {
    return NextResponse.json({ error: 'Invalid plan tier' }, { status: 400 });
  }
  if (plan.pricePerSeatINR === 0) {
    return NextResponse.json({ error: 'Starter plan is free — no payment required' }, { status: 400 });
  }

  const keyId     = process.env['RAZORPAY_KEY_ID'];
  const keySecret = process.env['RAZORPAY_KEY_SECRET'];
  if (!keyId || !keySecret) {
    return NextResponse.json({ error: 'Razorpay credentials not configured' }, { status: 500 });
  }

  const ctx   = TenantContext.requireStore('POST /api/ws/billing/order');
  const seats = await WorkspaceEmployee.countDocuments({ isActive: true });

  // Minimum 1 seat billed even if headcount is 0
  const billableSeats = Math.max(1, seats);
  const amountINR     = plan.pricePerSeatINR * billableSeats;
  const amountPaise   = amountINR * 100; // Razorpay expects amount in paise

  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

  const order = await rzp.orders.create({
    amount:   amountPaise,
    currency: 'INR',
    receipt:  `rzp_${ctx.tenantId.toString().slice(-8)}_${Date.now().toString(36)}`,
    notes: {
      tenantId: ctx.tenantId.toString(),
      tier,
      seats:    billableSeats.toString(),
    },
  });

  return NextResponse.json({
    orderId:   order.id,
    amount:    amountPaise,
    amountINR,
    currency:  'INR',
    keyId,
    planName:  plan.name,
    seats:     billableSeats,
    tier,
  });
}, ['super_admin', 'hr_admin']);
