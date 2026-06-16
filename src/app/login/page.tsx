import { connectDB } from '@/lib/mongodb';
import { Tenant }    from '@/models/workspace.models';
import LoginClient   from './LoginClient';

export interface TenantBranding {
  legalName:      string | null;
  logoData:       string | null;
  loginBgData:    string | null;
  loginBgOverlay: number;
  brandColor:     string;
  loginTagline:   string | null;
}

async function getTenantBranding(): Promise<TenantBranding | null> {
  try {
    await connectDB();
    const t = await Tenant
      .findOne({})
      .select('legalName logoData loginBgData loginBgOverlay brandColor loginTagline')
      .lean() as {
        legalName?: string; logoData?: string; loginBgData?: string;
        loginBgOverlay?: number; brandColor?: string; loginTagline?: string;
      } | null;
    if (!t) return null;
    return {
      legalName:      t.legalName      ?? null,
      logoData:       t.logoData       ?? null,
      loginBgData:    t.loginBgData    ?? null,
      loginBgOverlay: t.loginBgOverlay ?? 0.45,
      brandColor:     t.brandColor     ?? '#1C509D',
      loginTagline:   t.loginTagline   ?? null,
    };
  } catch {
    return null;
  }
}

// Server Component — branding is resolved at request time so the initial HTML
// already contains the correct logo/background. No client-side fetch needed.
export default async function LoginPage() {
  const branding = await getTenantBranding();
  return <LoginClient branding={branding} />;
}
