import { NextRequest, NextResponse }           from 'next/server';
import { withFeature }                          from '@/lib/featureGate';
import { TenantContext }                        from '@/infrastructure/multiTenantCore';
import { WorkspacePIP }                         from '@/models/pms.models';
import mongoose                                 from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/performance/pips
//
// Paginated list of PIPs.  Filterable by status and/or employeeId.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withFeature(
  'performance',
  async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const status     = searchParams.get('status');
    const employeeId = searchParams.get('employeeId');
    const page       = Math.max(1, parseInt(searchParams.get('page')  ?? '1'));
    const limit      = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));

    const query: Record<string, unknown> = {};
    if (status)     query['status']     = status;
    if (employeeId && mongoose.isValidObjectId(employeeId)) {
      query['employeeId'] = new mongoose.Types.ObjectId(employeeId);
    }

    const [data, total] = await Promise.all([
      WorkspacePIP.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WorkspacePIP.countDocuments(query),
    ]);

    return NextResponse.json({
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  },
  ['hr_admin', 'super_admin', 'hr_manager'],
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ws/performance/pips
//
// Manually create a PIP (HR-initiated).  PIP is always created with
// status 'draft' so the HR owner can configure objectives before activating.
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withFeature(
  'performance',
  async (req: NextRequest) => {
    const ctx  = TenantContext.requireStore('POST /api/ws/performance/pips');
    const body = await req.json() as Record<string, unknown>;

    const { employeeId, managerId, startDate, reviewDates, objectives } = body as {
      employeeId:   string;
      managerId?:   string;
      startDate?:   string;
      reviewDates?: string[];
      objectives?:  Array<{ description: string; successMetric: string; dueDate: string }>;
    };

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Missing required field: employeeId' },
        { status: 400 },
      );
    }

    if (!mongoose.isValidObjectId(employeeId)) {
      return NextResponse.json({ error: 'Invalid employeeId' }, { status: 400 });
    }

    if (managerId && !mongoose.isValidObjectId(managerId)) {
      return NextResponse.json({ error: 'Invalid managerId' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pip = await (WorkspacePIP as any).create({
      tenantId:    ctx.tenantId,
      employeeId:  new mongoose.Types.ObjectId(employeeId),
      status:      'draft',
      ...(managerId   && { managerId:   new mongoose.Types.ObjectId(managerId) }),
      ...(startDate   && { startDate:   new Date(startDate) }),
      ...(reviewDates && Array.isArray(reviewDates) && {
        reviewDates: reviewDates.map((d) => new Date(d)),
      }),
      ...(objectives && Array.isArray(objectives) && {
        objectives: objectives.map((o) => ({
          description:   o.description,
          successMetric: o.successMetric,
          dueDate:       new Date(o.dueDate),
          status:        'pending',
        })),
      }),
    });

    return NextResponse.json({ data: pip }, { status: 201 });
  },
  ['hr_admin', 'super_admin'],
);
