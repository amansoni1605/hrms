import { NextRequest, NextResponse } from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceGoal }              from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';

function ownsGoal(g: { employeeId: { toString(): string } }, employeeId?: string | null): boolean {
  return !!employeeId && g.employeeId.toString() === employeeId;
}

/** Derive the canonical progress % from key results when present. */
function deriveProgress(keyResults: Array<{ targetValue: number; currentValue: number }>, fallback: number): number {
  if (!keyResults.length) return fallback;
  const sum = keyResults.reduce((a, kr) => {
    const t = kr.targetValue || 0;
    return a + (t > 0 ? Math.min(100, (kr.currentValue / t) * 100) : 0);
  }, 0);
  return Math.round(sum / keyResults.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/me/goals/[id]
//   action 'checkin'   — log progress (+ optional note); recompute % and status
//   action 'update'    — edit title/description/category/weight/status/keyResults
//   action 'update_kr' — set a key result's currentValue / done by index
// Ownership-guarded: an employee can only touch their own goals.
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body = await req.json() as {
      action?: 'checkin' | 'update' | 'update_kr';
      progressPct?: number; note?: string;
      title?: string; description?: string; category?: string; weight?: number; status?: string;
      keyResults?: Array<{ title: string; targetValue?: number; unit?: string }>;
      krIndex?: number; krCurrentValue?: number; krDone?: boolean;
    };
    const action = body.action ?? 'update';
    const ctx = TenantContext.requireStore('PUT /api/me/goals/[id]');

    const goal = await WorkspaceGoal.findById(id);
    if (!goal || !ownsGoal(goal, session.employeeId)) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    if (action === 'checkin') {
      // A manual check-in is the human's progress call — it's authoritative.
      // (Key-result updates, below, recompute progress from the measurables.)
      const pct = Math.max(0, Math.min(100, body.progressPct ?? goal.progressPct));
      goal.checkIns.push({ progressPct: pct, note: body.note, byUserId: ctx.userId, at: new Date() });
      goal.progressPct = pct;
      if (goal.progressPct >= 100 && goal.status === 'active') goal.status = 'achieved';
      goal.markModified('checkIns');
    } else if (action === 'update_kr') {
      const i = body.krIndex ?? -1;
      if (i < 0 || i >= goal.keyResults.length) return NextResponse.json({ error: 'Invalid key result index' }, { status: 400 });
      if (body.krCurrentValue !== undefined) goal.keyResults[i]!.currentValue = body.krCurrentValue;
      if (body.krDone !== undefined)         goal.keyResults[i]!.done = body.krDone;
      goal.progressPct = deriveProgress(goal.keyResults, goal.progressPct);
      if (goal.progressPct >= 100 && goal.status === 'active') goal.status = 'achieved';
      goal.markModified('keyResults');
    } else {
      if (body.title !== undefined)       goal.title = body.title;
      if (body.description !== undefined) goal.description = body.description;
      if (body.category !== undefined)    goal.category = body.category as typeof goal.category;
      if (body.weight !== undefined)      goal.weight = body.weight;
      if (body.status !== undefined)      goal.status = body.status as typeof goal.status;
      if (Array.isArray(body.keyResults)) {
        goal.keyResults = body.keyResults.map((k) => ({ title: k.title, targetValue: k.targetValue ?? 100, currentValue: 0, unit: k.unit ?? '%', done: false }));
        goal.markModified('keyResults');
      }
    }

    await goal.save();
    return NextResponse.json({ data: goal });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/me/goals/[id]  — soft-delete the employee's own goal.
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const goal = await WorkspaceGoal.findById(id);
    if (!goal || !ownsGoal(goal, session.employeeId)) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    goal.isActive = false;
    await goal.save();
    return NextResponse.json({ data: { ok: true } });
  });
}
