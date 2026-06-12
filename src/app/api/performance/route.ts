import { NextResponse }                  from 'next/server';
import { auditEvent }                     from '@/lib/withRoute';
import { withFeature }                    from '@/lib/featureGate';
import { WorkspacePerformanceReview, WorkspaceEmployee, PERF_COMPETENCIES } from '@/models/workspace.models';
import { TenantContext }                  from '@/infrastructure/multiTenantCore';
import { notify }                         from '@/lib/notificationService';
import { createHash }                     from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/performance
//   HR/Admin: every performance review for the tenant, with filters.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withFeature('performance', async (req) => {
  const { searchParams } = new URL(req.url);
  const page   = parseInt(searchParams.get('page')  ?? '1');
  const limit  = parseInt(searchParams.get('limit') ?? '40');
  const status = searchParams.get('status') ?? '';
  const cycle  = searchParams.get('cycle')  ?? '';
  const compDecision = searchParams.get('compDecision') ?? '';

  const query: Record<string, unknown> = { isActive: true };
  if (status) query['status']     = status;
  if (cycle)  query['cycleLabel'] = cycle;
  if (compDecision) query['compensation.decision'] = compDecision;

  const [data, total] = await Promise.all([
    WorkspacePerformanceReview.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WorkspacePerformanceReview.countDocuments(query),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}, ['super_admin', 'hr_admin', 'hr_manager']);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/performance
//   HR/Admin only — open a review for an employee for a given cycle.
//   The review is created in 'self_assessment' status and the employee is
//   notified to complete their self-assessment.
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withFeature('performance', async (req, session) => {
  const body = await req.json() as {
    employeeId?:  string;
    cycleLabel?:  string;
    periodStart?: string;
    periodEnd?:   string;
    goals?:       Array<{ title: string; description?: string; weight?: number }>;
  };

  const { employeeId, cycleLabel, periodStart, periodEnd } = body;
  if (!employeeId || !cycleLabel || !periodStart || !periodEnd) {
    return NextResponse.json({ error: 'employeeId, cycleLabel, periodStart and periodEnd are required' }, { status: 400 });
  }
  if (!cycleLabel.trim()) {
    return NextResponse.json({ error: 'cycleLabel cannot be blank' }, { status: 400 });
  }

  const pStart = new Date(periodStart);
  const pEnd   = new Date(periodEnd);
  if (isNaN(pStart.getTime())) return NextResponse.json({ error: 'periodStart is not a valid date' }, { status: 400 });
  if (isNaN(pEnd.getTime()))   return NextResponse.json({ error: 'periodEnd is not a valid date' }, { status: 400 });
  if (pEnd <= pStart)          return NextResponse.json({ error: 'periodEnd must be after periodStart' }, { status: 400 });

  const ctx = TenantContext.requireStore('POST /api/performance');

  const emp = await WorkspaceEmployee.findById(employeeId)
    .select('employeeCode jobTitle departmentName')
    .lean() as { employeeCode?: string; jobTitle?: string; departmentName?: string } | null;
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const dup = await WorkspacePerformanceReview.findOne({ employeeId, cycleLabel });
  if (dup) {
    return NextResponse.json({ error: `A "${cycleLabel}" review already exists for this employee` }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const review = await (WorkspacePerformanceReview as any).create({
    tenantId:       ctx.tenantId,
    employeeId,
    employeeCode:   emp.employeeCode,
    jobTitle:       emp.jobTitle,
    departmentName: emp.departmentName,
    reviewerId:     ctx.userId,
    cycleLabel,
    periodStart:    pStart,
    periodEnd:      pEnd,
    status:         'self_assessment',
    competencies:   PERF_COMPETENCIES.map((c) => ({ key: c.key, label: c.label })),
    goals:          (body.goals ?? []).map((g) => ({ title: g.title, description: g.description, weight: g.weight ?? 0, status: 'not_started' })),
  });

  await auditEvent({
    actionType:       'REVIEW_OPENED',
    targetCollection: 'ws_performance_reviews',
    targetDocumentId: review._id.toString(),
    newStateHash:     createHash('sha256').update(review._id.toString() + Date.now()).digest('hex'),
    changeSummary:    { cycleLabel, employeeCode: emp.employeeCode, openedBy: session.userId },
  });

  await notify.reviewOpened({
    tenantId:   ctx.tenantId.toString(),
    employeeId: employeeId,
    cycleLabel,
    reviewId:   review._id.toString(),
  });

  return NextResponse.json({ data: review }, { status: 201 });
}, ['super_admin', 'hr_admin', 'hr_manager']);
