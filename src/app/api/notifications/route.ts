import { NextRequest, NextResponse }        from 'next/server';
import { withRoute }                         from '@/lib/withRoute';
import { WorkspaceInAppNotification }        from '@/models/workspace.models';
import mongoose                              from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications
//   ?unreadOnly=true  — filter to unread only
//   ?limit=N          — default 20
//
// Returns the caller's in-app notification inbox.
//
// POST /api/notifications
//   Creates a notification for a target userId (HR/Admin only).
//   Body: { userId, type, title, body?, actionUrl?, priority? }
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const limit      = Math.min(50, parseInt(searchParams.get('limit') ?? '20'));

  const userOid = new mongoose.Types.ObjectId(session.userId);

  // Use $ne: true so legacy docs without isRead field count as unread
  const query: Record<string, unknown> = { userId: userOid };
  if (unreadOnly) query['isRead'] = { $ne: true };

  const [notifications, unreadCount] = await Promise.all([
    WorkspaceInAppNotification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    WorkspaceInAppNotification.countDocuments({
      userId: userOid,
      isRead: { $ne: true },
    }),
  ]);

  return NextResponse.json({ data: notifications, unreadCount });
});

export const POST = withRoute(async (req, session) => {
  const body = await req.json() as {
    userId?:     string;
    type:        string;
    title:       string;
    body?:       string;
    actionUrl?:  string;
    priority?:   string;
    metadata?:   Record<string, unknown>;
  };

  if (!body.type || !body.title) {
    return NextResponse.json({ error: 'type and title are required' }, { status: 400 });
  }

  // If userId not supplied, notify the caller (self-notification for testing)
  const targetUserId = body.userId
    ? new mongoose.Types.ObjectId(body.userId)
    : new mongoose.Types.ObjectId(session.userId);

  const { TenantContext } = await import('@/infrastructure/multiTenantCore');
  const ctx = TenantContext.requireStore('POST /api/notifications');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notif = await (WorkspaceInAppNotification as any).create({
    tenantId:  ctx.tenantId,
    userId:    targetUserId,
    type:      body.type,
    title:     body.title,
    body:      body.body,
    actionUrl: body.actionUrl,
    priority:  body.priority ?? 'normal',
    metadata:  body.metadata ?? {},
  });

  return NextResponse.json({ data: notif }, { status: 201 });
}, ['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer']);
