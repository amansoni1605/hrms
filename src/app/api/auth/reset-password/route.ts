import { NextRequest, NextResponse } from 'next/server';
import { connectDB }                 from '@/lib/mongodb';
import User                          from '@/models/User';
import { WorkspaceUser }             from '@/models/workspace.models';
import { createHash }                from 'node:crypto';
import bcrypt                        from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { token, password, source } = await req.json() as {
      token?: string; password?: string; source?: string;
    };

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now       = new Date();

    // ── Legacy User ───────────────────────────────────────────────────────────
    if (source === 'legacy') {
      const user = await User.findOne({
        passwordResetToken:  tokenHash,
        passwordResetExpiry: { $gt: now },
        isActive: true,
      });
      if (!user) {
        return NextResponse.json({ error: 'Reset link is invalid or has expired' }, { status: 400 });
      }
      user.password            = password; // pre-save hook hashes it
      user.passwordResetToken  = undefined;
      user.passwordResetExpiry = undefined;
      await user.save();
      return NextResponse.json({ message: 'Password updated. You can now sign in.' });
    }

    // ── WorkspaceUser ─────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findQ = (WorkspaceUser as any).findOne({
      passwordResetToken:  tokenHash,
      passwordResetExpiry: { $gt: now },
      isActive: true,
    }).select('_id').lean();
    findQ._bypassTenantPlugin = true;
    const wsUser = await findQ as { _id: unknown } | null;

    if (!wsUser) {
      return NextResponse.json({ error: 'Reset link is invalid or has expired' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateQ = (WorkspaceUser as any).updateOne(
      { _id: wsUser._id },
      { $set: { passwordHash }, $unset: { passwordResetToken: 1, passwordResetExpiry: 1 } },
    );
    updateQ._bypassTenantPlugin = true;
    await updateQ;

    return NextResponse.json({ message: 'Password updated. You can now sign in.' });
  } catch (err) {
    console.error('[reset-password]', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

// GET — validate token without consuming it (used by the page on mount)
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const token  = new URL(req.url).searchParams.get('token') ?? '';
    const source = new URL(req.url).searchParams.get('source') ?? '';
    if (!token) return NextResponse.json({ valid: false });

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now       = new Date();

    if (source === 'legacy') {
      const u = await User.findOne({ passwordResetToken: tokenHash, passwordResetExpiry: { $gt: now } }).lean();
      return NextResponse.json({ valid: !!u });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (WorkspaceUser as any).findOne({
      passwordResetToken: tokenHash, passwordResetExpiry: { $gt: now },
    }).lean();
    q._bypassTenantPlugin = true;
    const u = await q;
    return NextResponse.json({ valid: !!u });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
