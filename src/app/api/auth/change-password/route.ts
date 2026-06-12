import { NextRequest, NextResponse } from 'next/server';
import { withRoute }     from '@/lib/withRoute';
import User              from '@/models/User';
import { WorkspaceUser } from '@/models/workspace.models';
import bcrypt            from 'bcryptjs';
import mongoose          from 'mongoose';

export const POST = withRoute(async (req, session) => {
  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'currentPassword and newPassword are required' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Try legacy User first
  const legacyUser = await User.findById(session.userId);
  if (legacyUser) {
    const valid = await legacyUser.comparePassword(currentPassword);
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    legacyUser.password = newPassword;  // pre-save hook will hash it
    await legacyUser.save();
    return NextResponse.json({ ok: true });
  }

  // Try WorkspaceUser
  const wsQuery = (WorkspaceUser as any).findById(new mongoose.Types.ObjectId(session.userId));
  wsQuery._bypassTenantPlugin = true;
  const wsUser = await wsQuery.lean() as { _id: unknown; passwordHash: string } | null;
  if (!wsUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, wsUser.passwordHash);
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });

  const newHash = await bcrypt.hash(newPassword, 12);
  const upd = (WorkspaceUser as any).updateOne(
    { _id: wsUser._id },
    { $set: { passwordHash: newHash } },
  );
  upd._bypassTenantPlugin = true;
  await upd;

  return NextResponse.json({ ok: true });
});
