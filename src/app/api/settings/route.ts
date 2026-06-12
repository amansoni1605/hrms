import { NextRequest, NextResponse }    from 'next/server';
import { withRoute }                    from '@/lib/withRoute';
import { WorkspaceUserSettings }        from '@/models/workspace.models';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import mongoose                         from 'mongoose';

// GET  /api/settings  — retrieve or initialise caller's settings document
// PUT  /api/settings  — deep-merge patch (only supplied keys are updated)

export const GET = withRoute(async (_req, session) => {
  const ctx    = TenantContext.requireStore('GET /api/settings');
  let settings = await WorkspaceUserSettings.findOne({
    userId: new mongoose.Types.ObjectId(session.userId),
  }).lean();

  if (!settings) {
    // First-time bootstrap — create defaults
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings = await (WorkspaceUserSettings as any).create({
      tenantId: ctx.tenantId,
      userId:   new mongoose.Types.ObjectId(session.userId),
    });
  }

  return NextResponse.json({ data: settings });
});

export const PUT = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('PUT /api/settings');
  const body = await req.json() as Record<string, unknown>;

  // Build a $set payload from allowed top-level sections
  const $set: Record<string, unknown> = {};
  const ALLOWED_SECTIONS = ['profile', 'notifications', 'security', 'ui'];
  for (const section of ALLOWED_SECTIONS) {
    if (body[section] && typeof body[section] === 'object') {
      for (const [key, val] of Object.entries(body[section] as Record<string, unknown>)) {
        // Security: block patching mfaEnabled directly (require dedicated flow)
        if (section === 'security' && key === 'mfaEnabled') continue;
        // Security: block patching trustedDevices directly
        if (section === 'security' && key === 'trustedDevices') continue;
        $set[`${section}.${key}`] = val;
      }
    }
  }

  if (Object.keys($set).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 });
  }

  const updated = await WorkspaceUserSettings.findOneAndUpdate(
    { tenantId: ctx.tenantId, userId: ctx.userId },
    { $set },
    { new: true, upsert: true },
  ).lean();

  return NextResponse.json({ data: updated });
});
