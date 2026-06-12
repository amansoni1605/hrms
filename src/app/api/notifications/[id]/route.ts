import { NextRequest, NextResponse }   from 'next/server';
import { runWithSession }              from '@/lib/withRoute';
import { WorkspaceInAppNotification }  from '@/models/workspace.models';
import mongoose                        from 'mongoose';

// PATCH /api/notifications/[id]  — mark single notification read/unread
// DELETE /api/notifications/[id] — delete a notification (own only)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const body     = await req.json().catch(() => ({}));
    const isRead   = body.isRead !== false;   // default true
    const update   = isRead
      ? { isRead: true, readAt: new Date() }
      : { isRead: false, readAt: null };

    const notif = await WorkspaceInAppNotification.findOneAndUpdate(
      { _id: id, userId: new mongoose.Types.ObjectId(session.userId) },
      { $set: update },
      { new: true },
    );
    if (!notif) return NextResponse.json({ error: 'Not found or not yours' }, { status: 404 });
    return NextResponse.json({ data: notif });
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    await WorkspaceInAppNotification.findOneAndDelete({
      _id: id, userId: new mongoose.Types.ObjectId(session.userId),
    });
    return NextResponse.json({ ok: true });
  });
}
