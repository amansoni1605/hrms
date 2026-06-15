import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import {
  WorkspaceAppraisalCycle,
  WorkspacePMSReview,
}                                      from '@/models/pms.models';
import { TenantContext }               from '@/infrastructure/multiTenantCore';
import mongoose                        from 'mongoose';

// GET /api/ws/performance/cycles/[id]/reviews
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const reviewerRole = searchParams.get('reviewerRole') ?? '';
    const status       = searchParams.get('status')       ?? '';
    const page         = Math.max(1, parseInt(searchParams.get('page')  ?? '1'));
    const limit        = Math.max(1, parseInt(searchParams.get('limit') ?? '20'));

    const query: Record<string, unknown> = { cycleId: new mongoose.Types.ObjectId(id) };
    if (reviewerRole) query['reviewerRole'] = reviewerRole;
    if (status)       query['status']       = status;

    const [data, total] = await Promise.all([
      WorkspacePMSReview.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WorkspacePMSReview.countDocuments(query),
    ]);

    return NextResponse.json({
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }, ['super_admin', 'hr_admin', 'hr_manager']);
}

// POST /api/ws/performance/cycles/[id]/reviews
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const ctx  = TenantContext.requireStore('POST /api/ws/performance/cycles/[id]/reviews');
    const body = await req.json() as { revieweeId?: string };

    if (!body.revieweeId || !mongoose.isValidObjectId(body.revieweeId)) {
      return NextResponse.json({ error: 'revieweeId is required and must be valid' }, { status: 400 });
    }

    const cycle = await WorkspaceAppraisalCycle.findById(id).lean();
    if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

    if (cycle.status !== 'self_appraisal') {
      return NextResponse.json(
        { error: 'Cycle must be in self_appraisal status to open self-reviews' },
        { status: 409 },
      );
    }

    const revieweeId = new mongoose.Types.ObjectId(body.revieweeId);

    const existing = await WorkspacePMSReview.findOne({
      cycleId:      new mongoose.Types.ObjectId(id),
      revieweeId,
      reviewerRole: 'self',
    }).lean();

    if (existing) {
      return NextResponse.json(
        { error: 'A self-review already exists for this employee in this cycle' },
        { status: 409 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const review = await (WorkspacePMSReview as any).create({
      tenantId:       ctx.tenantId,
      cycleId:        new mongoose.Types.ObjectId(id),
      revieweeId,
      reviewerId:     revieweeId,
      reviewerUserId: ctx.userId,
      reviewerRole:   'self',
      isAnonymous:    false,
      status:         'draft',
      ratings:        [],
      pipTriggered:   false,
    });

    return NextResponse.json({ data: review }, { status: 201 });
  }, ['super_admin', 'hr_admin']);
}
