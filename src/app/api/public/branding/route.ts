import { NextResponse } from 'next/server';
import { connectDB }    from '@/lib/mongodb';
import { Tenant }       from '@/models/workspace.models';

// GET /api/public/branding?slug=<tenant-slug>
// Returns safe public branding fields — no auth required.
// If slug is omitted, returns the first active tenant (single-tenant deployments).
export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');

    const query = slug ? { slug } : {};
    const tenant = await Tenant.findOne(query)
      .select('legalName logoData loginBgData loginBgOverlay brandColor loginTagline')
      .lean() as {
        legalName?: string;
        logoData?: string;
        loginBgData?: string;
        loginBgOverlay?: number;
        brandColor?: string;
        loginTagline?: string;
      } | null;

    if (!tenant) {
      return NextResponse.json({ branding: null });
    }

    return NextResponse.json({
      branding: {
        legalName:      tenant.legalName,
        logoData:       tenant.logoData ?? null,
        loginBgData:    tenant.loginBgData ?? null,
        loginBgOverlay: tenant.loginBgOverlay ?? 0.45,
        brandColor:     tenant.brandColor ?? '#1C509D',
        loginTagline:   tenant.loginTagline ?? null,
      },
    });
  } catch {
    return NextResponse.json({ branding: null });
  }
}
