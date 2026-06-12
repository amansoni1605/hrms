import { NextResponse }              from 'next/server';
import { withRoute }                 from '@/lib/withRoute';
import { WorkspaceJobApplicant }     from '@/models/workspace.models';
import { TenantContext }             from '@/infrastructure/multiTenantCore';

const PIPELINE_STAGES = [
  'SHORTLISTED',
  'OFFER_EXTENDED',
  'OFFER_ACCEPTED',
  'ONBOARDING_ACTIVE',
  'ONBOARDING_COMPLETED',
  'TRAINING_IN_PROGRESS',
  'FULLY_RAMPED',
] as const;

// GET /api/talent/pipeline — kanban data grouped by candidateStatus
export const GET = withRoute(async () => {
  const ctx = TenantContext.requireStore('GET /api/talent/pipeline');

  const applicants = await WorkspaceJobApplicant.find({
    candidateStatus: { $exists: true, $ne: null },
  })
    .populate('jobOpeningId', 'title designation')
    .sort({ updatedAt: -1 })
    .lean();

  const columns = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: 0,
    cards: [] as Array<{
      _id: string; name: string; email: string;
      jobTitle: string; candidateStatus: string;
      hiredAt?: Date; employeeId?: string; onboardingId?: string;
      updatedAt: Date;
    }>,
  }));

  const colMap = new Map(columns.map((c) => [c.stage, c]));

  for (const app of applicants) {
    const col = colMap.get(app.candidateStatus as typeof PIPELINE_STAGES[number]);
    if (!col) continue;
    const opening = app.jobOpeningId as unknown as { title?: string; designation?: string } | null;
    col.cards.push({
      _id:             (app._id as { toString(): string }).toString(),
      name:            app.name,
      email:           app.email,
      jobTitle:        opening?.title ?? opening?.designation ?? '—',
      candidateStatus: app.candidateStatus ?? '',
      hiredAt:         app.hiredAt,
      employeeId:      app.employeeId?.toString(),
      onboardingId:    app.onboardingId?.toString(),
      updatedAt:       (app as unknown as { updatedAt: Date }).updatedAt,
    });
    col.count++;
  }

  return NextResponse.json({ data: columns, tenantId: ctx.tenantId.toString() });
}, ['super_admin', 'hr_admin', 'hr_manager']);
