import { NextRequest, NextResponse } from 'next/server';
import { connectDB }                 from '@/lib/mongodb';
import User                          from '@/models/User';
import { WorkspaceUser }             from '@/models/workspace.models';
import { sendPasswordResetEmail }    from '@/lib/mailer';
import { createHash, randomBytes }   from 'node:crypto';

const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { email } = await req.json() as { email?: string };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const normalEmail = email.toLowerCase().trim();

    // Generate token BEFORE finding the user — always respond with same message
    // to prevent email enumeration
    const rawToken  = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiry    = new Date(Date.now() + EXPIRY_MS);

    // Try legacy User first
    const legacyUser = await User.findOne({ email: normalEmail, isActive: true });
    if (legacyUser) {
      await User.updateOne(
        { _id: legacyUser._id },
        { $set: { passwordResetToken: tokenHash, passwordResetExpiry: expiry } },
      );
      const resetUrl = `${process.env['APP_URL'] ?? 'http://localhost:3000'}/reset-password?token=${rawToken}&source=legacy`;
      void sendPasswordResetEmail({
        to: normalEmail, name: legacyUser.name,
        resetUrl, companyName: 'HRMS Pro', expiresInMinutes: 60,
      }).catch(() => null);
      return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    // Try WorkspaceUser (bypass tenant plugin — no ALS at this point)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findQ = (WorkspaceUser as any).findOne({ email: normalEmail, isActive: true })
      .select('_id name email tenantId').lean();
    findQ._bypassTenantPlugin = true;
    const wsUser = await findQ as {
      _id: unknown; name: string; email: string; tenantId: unknown;
    } | null;

    if (wsUser) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateQ = (WorkspaceUser as any).updateOne(
        { _id: wsUser._id },
        { $set: { passwordResetToken: tokenHash, passwordResetExpiry: expiry } },
      );
      updateQ._bypassTenantPlugin = true;
      await updateQ;

      const resetUrl = `${process.env['APP_URL'] ?? 'http://localhost:3000'}/reset-password?token=${rawToken}`;
      void sendPasswordResetEmail({
        to: normalEmail, name: wsUser.name,
        resetUrl, companyName: 'HRMS Pro', expiresInMinutes: 60,
      }).catch(() => null);
    }

    // Always return 200 — never reveal whether email exists
    return NextResponse.json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[forgot-password]', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
