import { NextResponse }               from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceInAppNotification } from '@/models/workspace.models';
import mongoose                       from 'mongoose';

// POST /api/notifications/mark-all-read
export const POST = withRoute(async (_req, session) => {
  const result = await WorkspaceInAppNotification.updateMany(
    { userId: new mongoose.Types.ObjectId(session.userId), isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  return NextResponse.json({ markedRead: result.modifiedCount });
});
