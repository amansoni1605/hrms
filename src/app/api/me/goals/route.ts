import { NextResponse }       from 'next/server';
import { withFeature }         from '@/lib/featureGate';
import { WorkspaceGoal, WorkspaceEmployee } from '@/models/workspace.models';
import { TenantContext }       from '@/infrastructure/multiTenantCore';
import mongoose                from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/goals   — the authenticated employee's own goals (newest first).
// Gated by the `performance` plan feature.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withFeature('performance', async (_req, session) => {
  if (!session.employeeId) return NextResponse.json({ data: [] });
  const goals = await WorkspaceGoal.find({
    employeeId: new mongoose.Types.ObjectId(session.employeeId),
    isActive:   true,
  }).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ data: goals });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/me/goals   — create a goal/objective for myself.
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withFeature('performance', async (req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });
  const ctx  = TenantContext.requireStore('POST /api/me/goals');
  const body = await req.json() as {
    title?: string; description?: string; category?: string; cycleLabel?: string;
    periodStart?: string; periodEnd?: string; weight?: number;
    keyResults?: Array<{ title: string; targetValue?: number; unit?: string }>;
  };
  if (!body.title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const emp = await WorkspaceEmployee.findById(session.employeeId).select('employeeCode').lean();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goal = await (WorkspaceGoal as any).create({
    tenantId:     ctx.tenantId,
    employeeId:   new mongoose.Types.ObjectId(session.employeeId),
    employeeCode: (emp as { employeeCode?: string } | null)?.employeeCode ?? session.name,
    title:        body.title,
    description:  body.description,
    category:     body.category ?? 'business',
    cycleLabel:   body.cycleLabel,
    periodStart:  body.periodStart ? new Date(body.periodStart) : undefined,
    periodEnd:    body.periodEnd ? new Date(body.periodEnd) : undefined,
    weight:       body.weight ?? 0,
    status:       'active',
    progressPct:  0,
    keyResults:   (body.keyResults ?? []).map((k) => ({ title: k.title, targetValue: k.targetValue ?? 100, currentValue: 0, unit: k.unit ?? '%', done: false })),
    checkIns:     [],
    createdById:  ctx.userId,
  });

  return NextResponse.json({ data: goal }, { status: 201 });
});
