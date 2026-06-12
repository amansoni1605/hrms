import { NextRequest, NextResponse } from 'next/server';
import { runWithSession }            from '@/lib/withRoute';
import { WorkspaceUser }             from '@/models/workspace.models';
import mongoose                      from 'mongoose';

// GET /api/ws/tenants/[id]/users
// Returns all users (hr_admin, hr_manager) for the given tenant.
// Super-admin only.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    let tenantOid: mongoose.Types.ObjectId;
    try {
      tenantOid = new mongoose.Types.ObjectId(id);
    } catch {
      return NextResponse.json({ error: 'Invalid tenant id' }, { status: 400 });
    }

    const users = await (WorkspaceUser as any).find(
      { tenantId: tenantOid },
      { passwordHash: 0 },           // never return the hash
    ).sort({ role: 1, name: 1 }).lean();

    return NextResponse.json({ data: users });
  }, ['super_admin']);
}
