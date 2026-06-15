import { NextRequest, NextResponse }  from 'next/server';
import { connectDB }                  from '@/lib/mongodb';
import { Tenant }                     from '@/models/workspace.models';
import { PLANS, type PlanTier }       from '@/lib/plans';
import { createHmac }                 from 'node:crypto';

// POST /api/razorpay-webhook
// Razorpay sends payment events here. Register this URL in Razorpay dashboard.
// No auth middleware — verified via webhook secret signature instead.
export async function POST(req: NextRequest) {
  const webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const rawBody  = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';

  // Verify webhook signature
  const expectedSig = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (expectedSig !== signature) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  let event: {
    event: string;
    payload?: {
      payment?: {
        entity?: {
          order_id?: string;
          notes?: Record<string, string>;
          status?: string;
        };
      };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Handle payment captured event
  if (event.event === 'payment.captured') {
    const notes    = event.payload?.payment?.entity?.notes ?? {};
    const tenantId = notes['tenantId'];
    const tier     = notes['tier'] as PlanTier;
    const plan     = PLANS[tier];

    if (tenantId && plan) {
      await connectDB();
      await Tenant.findByIdAndUpdate(tenantId, {
        $set: {
          'subscription.tier':     tier,
          'subscription.features': plan.features,
          'subscription.maxSeats': plan.maxSeats === -1 ? 1_000_000 : plan.maxSeats,
          'subscription.renewsAt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
