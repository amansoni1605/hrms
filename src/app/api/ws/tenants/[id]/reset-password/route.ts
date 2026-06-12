import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession, auditEvent } from '@/lib/withRoute';
import { WorkspaceUser }              from '@/models/workspace.models';
import { createHash }                 from 'node:crypto';
import bcrypt                         from 'bcryptjs';
import mongoose                       from 'mongoose';

// POST /api/ws/tenants/[id]/reset-password
// Body: { userId: string }
// Generates a new temporary password for the given user, hashes and saves it.
// Returns the plain-text temp password once so the super-admin can share it.
// Super-admin only.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body = await req.json() as { userId?: string };
    if (!body.userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    let userOid: mongoose.Types.ObjectId;
    try {
      userOid = new mongoose.Types.ObjectId(body.userId);
    } catch {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }

    // Confirm the user belongs to this tenant
    const user = await (WorkspaceUser as any).findOne({ _id: userOid, tenantId: new mongoose.Types.ObjectId(id) });
    if (!user) {
      return NextResponse.json({ error: 'User not found in this tenant' }, { status: 404 });
    }

    const tempPassword = `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;
    user.passwordHash  = await bcrypt.hash(tempPassword, 12);
    await user.save();

    await auditEvent({
      actionType:       'PASSWORD_RESET',
      targetCollection: 'users',
      targetDocumentId: body.userId,
      newStateHash:     createHash('sha256').update(body.userId + id).digest('hex'),
      changeSummary:    { resetBy: session.userId, tenantId: id },
    });

    return NextResponse.json({ data: { tempPassword, email: user.email } });
  }, ['super_admin']);
}
