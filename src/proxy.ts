import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
);

const PUBLIC_PATHS = [
  '/login', '/reset-password',
  '/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password',
  '/api/seed',
];

// Routes only hr_admin / super_admin / payroll / auditor / compliance can visit.
// hr_manager is redirected away from these.
const MANAGER_BLOCKED: string[] = [
  '/employees',
  '/departments',
  '/analytics',
  '/burnout',
  '/recruitment',
  '/onboarding',
  '/training',
  '/separation',
  '/immigration',
  '/audit',
  '/billing',
  '/hr-settings',
  '/admin',
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('hrms_token')?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    const role = payload.role as string | undefined;

    if (role === 'hr_manager') {
      const blocked = MANAGER_BLOCKED.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`)
      );
      if (blocked) {
        const to = pathname.startsWith('/employees') ? '/my/team' : '/dashboard';
        return NextResponse.redirect(new URL(to, req.url));
      }
    }

    return NextResponse.next();
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete('hrms_token');
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
