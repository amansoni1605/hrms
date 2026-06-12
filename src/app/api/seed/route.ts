import { NextRequest, NextResponse } from 'next/server';
import { seedDatabase } from '@/lib/seed';
import { timingSafeEqual } from 'node:crypto';

// Seed wipes and recreates the demo tenant + bootstrap super_admin, so it cannot
// require a session (there is no user before the first seed). Instead: free in
// non-production; in production it requires an `x-seed-secret` header matching
// process.env.SEED_SECRET (and refuses outright if SEED_SECRET is unset).
function seedAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;

  const expected = process.env.SEED_SECRET;
  if (!expected) return false;

  const provided = req.headers.get('x-seed-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!seedAuthorized(req)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    await seedDatabase();
    return NextResponse.json({ message: 'Database seeded successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Seed failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
