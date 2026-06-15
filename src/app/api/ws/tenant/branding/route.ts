import { NextRequest, NextResponse } from 'next/server';
import { runWithSession }            from '@/lib/withRoute';
import { Tenant }                    from '@/models/workspace.models';

// GET /api/ws/tenant/branding — returns current branding settings for HR settings page
export async function GET(req: NextRequest) {
  return runWithSession(async (session) => {
    const tenantId = session.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'No tenantId' }, { status: 400 });

    const tenant = await Tenant.findById(tenantId)
      .select('legalName logoData loginBgData loginBgOverlay brandColor loginTagline')
      .lean() as {
        legalName?: string;
        logoData?: string;
        loginBgData?: string;
        loginBgOverlay?: number;
        brandColor?: string;
        loginTagline?: string;
      } | null;

    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    return NextResponse.json({ data: tenant });
  }, ['super_admin', 'hr_admin']);
}

// PATCH /api/ws/tenant/branding — updates brandColor, loginTagline, loginBgOverlay
export async function PATCH(req: NextRequest) {
  return runWithSession(async (session) => {
    const tenantId = session.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'No tenantId' }, { status: 400 });

    const body = await req.json() as {
      brandColor?: string;
      loginTagline?: string;
      loginBgOverlay?: number;
    };

    const $set: Record<string, unknown> = {};

    if (body.brandColor !== undefined) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(body.brandColor)) {
        return NextResponse.json({ error: 'brandColor must be a valid 6-digit hex color' }, { status: 400 });
      }
      $set['brandColor'] = body.brandColor;
    }

    if (body.loginTagline !== undefined) {
      if (body.loginTagline.length > 120) {
        return NextResponse.json({ error: 'loginTagline must be 120 characters or fewer' }, { status: 400 });
      }
      $set['loginTagline'] = body.loginTagline.trim();
    }

    if (body.loginBgOverlay !== undefined) {
      const v = Number(body.loginBgOverlay);
      if (isNaN(v) || v < 0 || v > 0.9) {
        return NextResponse.json({ error: 'loginBgOverlay must be between 0 and 0.9' }, { status: 400 });
      }
      $set['loginBgOverlay'] = v;
    }

    if (Object.keys($set).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const updated = await Tenant.findByIdAndUpdate(
      tenantId,
      { $set },
      { new: true, strict: false, select: 'brandColor loginTagline loginBgOverlay' },
    ).lean();

    return NextResponse.json({ data: updated });
  }, ['super_admin', 'hr_admin']);
}
