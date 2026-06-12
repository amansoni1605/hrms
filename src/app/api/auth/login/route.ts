import { NextRequest, NextResponse } from 'next/server';
import { connectDB }           from '@/lib/mongodb';
import User                    from '@/models/User';
import { WorkspaceUser }       from '@/models/workspace.models';
import { createSession }       from '@/lib/auth';
import bcrypt                  from 'bcryptjs';

/**
 * POST /api/auth/login
 *
 * Dual-source authentication:
 *   1. Legacy `users` collection (seeded super_admin / hr_admin / employee accounts)
 *   2. `ws_users` collection (accounts created via POST /api/ws/employees)
 *
 * Checks legacy source first (fast path for seeded accounts), then falls
 * back to WorkspaceUser for programmatically created accounts.
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const normalEmail = email.toLowerCase().trim();

    // ── 1. Try legacy User model (global collection, no ALS required) ─────────
    const legacyUser = await User.findOne({ email: normalEmail, isActive: true });
    if (legacyUser) {
      const valid = await legacyUser.comparePassword(password);
      if (!valid) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

      const tenantId = legacyUser.tenantId?.toString();
      if (!tenantId) {
        return NextResponse.json({
          error: 'Account has no tenant assigned. Please re-run POST /api/seed.',
        }, { status: 403 });
      }

      await User.findByIdAndUpdate(legacyUser._id, { lastLoginAt: new Date() });

      await createSession({
        userId:     legacyUser._id.toString(),
        email:      legacyUser.email,
        name:       legacyUser.name,
        role:       legacyUser.role,
        tenantId,
        employeeId: legacyUser.employeeId?.toString() ?? null,
      });

      return NextResponse.json({
        user: {
          id:         legacyUser._id,
          name:       legacyUser.name,
          email:      legacyUser.email,
          role:       legacyUser.role,
          tenantId,
          employeeId: legacyUser.employeeId ?? null,
        },
      });
    }

    // ── 2. Try WorkspaceUser (tenant-scoped, requires email lookup without ALS) ─
    // WorkspaceUser is in TENANT_SCOPED but we cannot use ALS here because we
    // don't know the tenantId yet.  Use a raw Mongoose query with _bypassTenantPlugin.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsQuery = (WorkspaceUser as any).findOne({ email: normalEmail, isActive: true });
    wsQuery._bypassTenantPlugin = true;
    const wsUser = await wsQuery.lean() as {
      _id: unknown; tenantId: unknown; employeeId: unknown;
      name: string; email: string; passwordHash: string; role: string;
    } | null;

    if (!wsUser) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, wsUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const tenantId = wsUser.tenantId?.toString();
    if (!tenantId) {
      return NextResponse.json({ error: 'Account has no tenant. Contact your administrator.' }, { status: 403 });
    }

    // Update lastLoginAt without ALS
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateQ = (WorkspaceUser as any).updateOne(
      { _id: wsUser._id },
      { $set: { lastLoginAt: new Date() } },
    );
    updateQ._bypassTenantPlugin = true;
    await updateQ;

    await createSession({
      userId:     String(wsUser._id),
      email:      wsUser.email,
      name:       wsUser.name,
      role:       wsUser.role,
      tenantId,
      employeeId: wsUser.employeeId?.toString() ?? null,
    });

    return NextResponse.json({
      user: {
        id:         wsUser._id,
        name:       wsUser.name,
        email:      wsUser.email,
        role:       wsUser.role,
        tenantId,
        employeeId: wsUser.employeeId ?? null,
      },
    });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
