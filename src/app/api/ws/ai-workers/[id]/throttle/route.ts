import { NextRequest, NextResponse }     from 'next/server';
import { runWithSession, auditEvent }    from '@/lib/withRoute';
import { WorkspaceEmployee }             from '@/models/workspace.models';
import { createHash }                    from 'node:crypto';
import mongoose                          from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ws/ai-workers/[id]/throttle
//
// Throttles or unthrottles an AI Digital Worker by updating its token budget,
// access scopes, or deployment environment.
//
// Body fields (all optional, at least one required):
//   • tokenBudgetMonthly  — new monthly token cap
//   • status              — 'active' | 'suspended' | 'revoked'
//   • accessScopes        — string[]   (replaces existing scopes)
//
// Worker IDs:
//   • Real workers:  WorkspaceEmployee._id (ObjectId)
//   • Stub workers:  'AGENT-001' etc (returned from GET /api/ws/ai-workers as stubs;
//                    throttling stubs is a no-op that still emits an audit event)
//
// SUPER_ADMIN only.
// ─────────────────────────────────────────────────────────────────────────────

interface ThrottleBody {
  tokenBudgetMonthly?: number;
  status?:             'active' | 'suspended' | 'revoked';
  accessScopes?:       string[];
}

const VALID_STATUS = new Set(['active', 'suspended', 'revoked']);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body = await req.json().catch(() => ({})) as ThrottleBody;

    if (
      body.tokenBudgetMonthly === undefined &&
      body.status === undefined &&
      !body.accessScopes
    ) {
      return NextResponse.json({
        error: 'At least one of tokenBudgetMonthly / status / accessScopes is required',
      }, { status: 400 });
    }

    if (body.status && !VALID_STATUS.has(body.status)) {
      return NextResponse.json({
        error: `Invalid status. Must be one of: ${[...VALID_STATUS].join(', ')}`,
      }, { status: 400 });
    }

    if (body.tokenBudgetMonthly !== undefined &&
        (typeof body.tokenBudgetMonthly !== 'number' || body.tokenBudgetMonthly < 0)) {
      return NextResponse.json({
        error: 'tokenBudgetMonthly must be a non-negative number',
      }, { status: 400 });
    }

    // Stub workers (AGENT-001 etc) — handle without DB write
    if (id.startsWith('AGENT-')) {
      await auditEvent({
        actionType:       'PERMISSION_ESCALATION',
        targetCollection: 'ai_workers_stub',
        targetDocumentId: undefined,
        newStateHash:     createHash('sha256').update(`${id}:throttle:${Date.now()}`).digest('hex'),
        changeSummary:    { workerId: id, ...body, throttledBy: session.userId },
      });
      return NextResponse.json({
        data: {
          workerId: id,
          isStub:   true,
          applied:  body,
          message:  `Throttle applied to stub agent ${id}. (In-memory only — restart server to reset.)`,
        },
      });
    }

    // Real workers — must be a valid ObjectId backing a WorkspaceEmployee
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid worker id' }, { status: 400 });
    }

    const $set: Record<string, unknown> = {};
    if (body.tokenBudgetMonthly !== undefined) {
      $set['digitalWorkerMeta.tokenBudgetMonthly'] = body.tokenBudgetMonthly;
    }
    if (body.status) {
      $set['digitalWorkerMeta.deploymentEnvironment'] =
        body.status === 'revoked'   ? 'dev' :
        body.status === 'suspended' ? 'staging' :
                                       'production';
      $set['employeeStatus'] = body.status === 'active' ? 'active' : 'suspended';
    }
    if (body.accessScopes) {
      $set['digitalWorkerMeta.accessScopes'] = body.accessScopes;
    }

    const updated = await WorkspaceEmployee.findByIdAndUpdate(
      id, { $set }, { new: true },
    );
    if (!updated) return NextResponse.json({ error: 'Worker not found' }, { status: 404 });

    await auditEvent({
      actionType:       'PERMISSION_ESCALATION',
      targetCollection: 'ws_employees',
      targetDocumentId: id,
      modifiedPaths:    Object.keys($set),
      newStateHash:     createHash('sha256')
        .update(`${id}:throttle:${JSON.stringify($set)}:${Date.now()}`)
        .digest('hex'),
      changeSummary:    { workerId: id, ...body, throttledBy: session.userId },
    });

    return NextResponse.json({
      data: {
        workerId:        updated._id,
        employeeCode:    updated.employeeCode,
        tokenBudget:     updated.digitalWorkerMeta?.tokenBudgetMonthly,
        accessScopes:    updated.digitalWorkerMeta?.accessScopes,
        deploymentEnv:   updated.digitalWorkerMeta?.deploymentEnvironment,
        status:          updated.employeeStatus,
      },
    });
  }, ['super_admin']);
}
