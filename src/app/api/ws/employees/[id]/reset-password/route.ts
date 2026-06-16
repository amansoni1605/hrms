import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceUser }              from '@/models/workspace.models';
import bcrypt                         from 'bcryptjs';

// POST /api/ws/employees/[id]/reset-password
// HR resets an employee's login password. Returns the new temp password.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async (session) => {
    if (!['super_admin', 'hr_admin'].includes(session.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as { password?: string };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userQuery = (WorkspaceUser as any).findOne({ employeeId: id });
    userQuery._bypassTenantPlugin = true;
    const user = await userQuery;

    if (!user)
      return NextResponse.json({ error: 'No login account found for this employee' }, { status: 404 });

    const newPassword = body.password?.trim() || `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    return NextResponse.json({ data: { email: user.email, tempPassword: newPassword } });
  });
}
