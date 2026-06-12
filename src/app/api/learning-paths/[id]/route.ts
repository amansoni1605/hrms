import { NextRequest, NextResponse }   from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceLearningPath }      from '@/models/workspace.models';
import mongoose                       from 'mongoose';

// GET /api/learning-paths/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const path = await WorkspaceLearningPath.findById(id)
      .populate('tracks.programId', 'title category isMandatory scheduledAt durationHours status enrollments')
      .lean();
    if (!path) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: path });
  });
}

// PATCH /api/learning-paths/[id] — update name/description/tracks (HR only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const body = await req.json() as Record<string, unknown>;
    const path = await WorkspaceLearningPath.findById(id);
    if (!path) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (body['name']        !== undefined) path.name        = String(body['name']).trim();
    if (body['description'] !== undefined) path.description = String(body['description']);
    if (body['targetRole']  !== undefined) path.targetRole  = String(body['targetRole']);
    if (body['isActive']    !== undefined) path.isActive    = Boolean(body['isActive']);
    if (Array.isArray(body['tracks'])) {
      path.tracks = (body['tracks'] as Array<Record<string, unknown>>).map((t, i) => ({
        programId:   t['programId'] as mongoose.Types.ObjectId,
        order:       Number(t['order'] ?? i + 1),
        isMandatory: t['isMandatory'] !== false,
        delayDays:   Number(t['delayDays'] ?? 0),
      }));
    }

    await path.save();
    return NextResponse.json({ data: path });
  }, ['super_admin', 'hr_admin', 'hr_manager']);
}

// DELETE /api/learning-paths/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    await WorkspaceLearningPath.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  }, ['super_admin', 'hr_admin', 'hr_manager']);
}
