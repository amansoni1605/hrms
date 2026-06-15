import { NextRequest, NextResponse }           from 'next/server';
import { runWithSession }                       from '@/lib/withRoute';
import { TenantContext, getTenantDEK }          from '@/infrastructure/multiTenantCore';
import { WorkspaceFeedbackEvent }               from '@/models/pms.models';
import { createDecipheriv }                     from 'node:crypto';
import mongoose                                 from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/performance/feedback/[id]
//
// Return a single feedback event with decrypted body.
// Access allowed to: the sender (fromId), the recipient (toId),
// or hr_admin / super_admin.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid feedback event id' }, { status: 400 });
    }

    const ctx = TenantContext.requireStore('GET /api/ws/performance/feedback/[id]');

    const event = await WorkspaceFeedbackEvent.findById(id).lean();
    if (!event) {
      return NextResponse.json({ error: 'Feedback event not found' }, { status: 404 });
    }

    // ── Access control ────────────────────────────────────────────────────────
    const isHRAdmin   = session.role === 'hr_admin' || session.role === 'super_admin';
    const isSender    = ctx.employeeId && event.fromId.equals(ctx.employeeId);
    const isRecipient = ctx.employeeId && event.toId.equals(ctx.employeeId);

    if (!isHRAdmin && !isSender && !isRecipient) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    // ── Decrypt body ──────────────────────────────────────────────────────────
    let decryptedBody: string | null = null;
    try {
      const { key }   = await getTenantDEK(ctx.tenantId.toString());
      const stored    = event.bodyEnc as Buffer;
      const iv        = event.bodyIv  as Buffer;
      const authTag   = stored.subarray(0, 16);
      const enc       = stored.subarray(16);
      const decipher  = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      decryptedBody   = decipher.update(enc) + decipher.final('utf8');
    } catch (err) {
      console.error('[GET /api/ws/performance/feedback/[id]] decrypt failed:', err);
      // Decryption failures must not leak detail to the client; return null body
    }

    // Strip raw encrypted fields from response
    const { bodyEnc: _bEnc, bodyIv: _bIv, ...rest } = event;

    return NextResponse.json({
      data: { ...rest, body: decryptedBody },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/ws/performance/feedback/[id]
//
// Hard-delete.  Only the creator (fromId) or hr_admin / super_admin may delete.
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid feedback event id' }, { status: 400 });
    }

    const ctx = TenantContext.requireStore('DELETE /api/ws/performance/feedback/[id]');

    const event = await WorkspaceFeedbackEvent.findById(id).lean();
    if (!event) {
      return NextResponse.json({ error: 'Feedback event not found' }, { status: 404 });
    }

    // ── Access control ────────────────────────────────────────────────────────
    const isHRAdmin  = session.role === 'hr_admin' || session.role === 'super_admin';
    const isCreator  = ctx.employeeId && event.fromId.equals(ctx.employeeId);

    if (!isHRAdmin && !isCreator) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    await WorkspaceFeedbackEvent.findByIdAndDelete(id);

    return new NextResponse(null, { status: 204 });
  });
}
