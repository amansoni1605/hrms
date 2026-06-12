import { NextResponse }  from 'next/server';
import { withRoute }     from '@/lib/withRoute';
import { Tenant }        from '@/models/workspace.models';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/tenant
//   Returns the caller's tenant profile + branding.  Used by the onboarding
//   wizard and the sidebar to load logo / brand color.
//   Strips logoData from the response to keep the payload small; the wizard
//   fetches /api/ws/tenants/[id] when it needs the full logo.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (_req, session) => {
  if (!session.tenantId) {
    return NextResponse.json({ error: 'No tenant in session' }, { status: 400 });
  }

  const tenant = await Tenant.findById(session.tenantId)
    .select('-logoData -kmsConfig.wrappedDek -commProvider.apiKeyEnc')
    .lean();

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  return NextResponse.json({ data: tenant });
});
