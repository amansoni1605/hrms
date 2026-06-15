import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession, auditEvent } from '@/lib/withRoute';
import { WorkspaceAppraisalCycle }    from '@/models/pms.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import { createHash }                 from 'node:crypto';
import mongoose                       from 'mongoose';

// GET /api/ws/performance/cycles/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const cycle = await WorkspaceAppraisalCycle.findById(id).lean();
    if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

    return NextResponse.json({ data: cycle });
  }, ['super_admin', 'hr_admin']);
}

// PATCH /api/ws/performance/cycles/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const cycle = await WorkspaceAppraisalCycle.findById(id);
    if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

    if (cycle.status !== 'draft') {
      return NextResponse.json(
        { error: 'Cycle is live — only draft cycles can be edited' },
        { status: 409 },
      );
    }

    const body = await req.json() as Record<string, unknown>;
    const allowed = ['name', 'type', 'startDate', 'endDate', 'phases', 'formulaConfig', 'calibrationConfig', 'enable360', 'pipThreshold'];
    const updates: Record<string, unknown> = {};

    for (const field of allowed) {
      if (field in body) {
        if (field === 'startDate' || field === 'endDate') {
          const d = new Date(String(body[field]));
          if (isNaN(d.getTime())) {
            return NextResponse.json({ error: `${field} is not a valid date` }, { status: 400 });
          }
          updates[field] = d;
        } else {
          updates[field] = body[field];
        }
      }
    }

    const startDate = updates['startDate'] ?? cycle.startDate;
    const endDate   = updates['endDate']   ?? cycle.endDate;
    if (new Date(String(endDate)) <= new Date(String(startDate))) {
      return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 });
    }

    const updated = await WorkspaceAppraisalCycle.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true },
    );

    await auditEvent({
      actionType:       'CYCLE_UPDATED',
      targetCollection: 'ws_appraisal_cycles',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(`${id}:updated:${Date.now()}`).digest('hex'),
      changeSummary:    { updatedFields: Object.keys(updates) },
    });

    return NextResponse.json({ data: updated });
  }, ['super_admin', 'hr_admin']);
}

// DELETE /api/ws/performance/cycles/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const cycle = await WorkspaceAppraisalCycle.findById(id);
    if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

    if (cycle.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft cycles can be deleted' },
        { status: 409 },
      );
    }

    await WorkspaceAppraisalCycle.findByIdAndUpdate(id, { $set: { isActive: false } });

    const ctx = TenantContext.requireStore('DELETE /api/ws/performance/cycles/[id]');
    await auditEvent({
      actionType:       'CYCLE_DELETED',
      targetCollection: 'ws_appraisal_cycles',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(`${id}:deleted:${ctx.userId}`).digest('hex'),
      changeSummary:    { name: cycle.name },
    });

    return new NextResponse(null, { status: 204 });
  }, ['super_admin', 'hr_admin']);
}
