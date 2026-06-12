import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceExpenseClaim }      from '@/models/workspace.models';
import mongoose                       from 'mongoose';

// PATCH /api/me/expenses/[id] — submit draft or add items
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async (session) => {
    if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

    const claim = await WorkspaceExpenseClaim.findOne({
      _id: new mongoose.Types.ObjectId(id),
      employeeId: new mongoose.Types.ObjectId(session.employeeId),
    });
    if (!claim) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (claim.status !== 'draft') return NextResponse.json({ error: 'Only draft claims can be edited' }, { status: 400 });

    const body = await req.json() as Record<string, unknown>;
    if (body['items'])  claim.items = body['items'] as typeof claim.items;
    if (body['notes'])  claim.notes = String(body['notes']);
    if (body['submit'] === true) {
      claim.status       = 'submitted';
      claim.totalClaimed = claim.items.reduce((s, i) => s + i.amount, 0);
    }
    await claim.save();
    return NextResponse.json({ data: claim });
  });
}

// DELETE /api/me/expenses/[id] — delete a draft claim
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async (session) => {
    if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

    const claim = await WorkspaceExpenseClaim.findOne({
      _id: new mongoose.Types.ObjectId(id),
      employeeId: new mongoose.Types.ObjectId(session.employeeId),
    });
    if (!claim) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (claim.status !== 'draft') return NextResponse.json({ error: 'Only draft claims can be deleted' }, { status: 400 });

    await claim.deleteOne();
    return NextResponse.json({ ok: true });
  });
}
