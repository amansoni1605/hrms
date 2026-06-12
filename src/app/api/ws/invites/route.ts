import { NextRequest, NextResponse } from 'next/server';
import { withRoute }                 from '@/lib/withRoute';
import { WorkspaceUser, Tenant }     from '@/models/workspace.models';
import { TenantContext }             from '@/infrastructure/multiTenantCore';
import { sendInviteEmail }           from '@/lib/mailer';
import bcrypt                        from 'bcryptjs';
import mongoose                      from 'mongoose';

// POST /api/ws/invites
//
// Body: { invites: Array<{ email: string; name?: string }> }
//
// For each address:
//   - Skip if a WorkspaceUser with that email already exists in the tenant.
//   - Create a WorkspaceUser (role: employee, no employeeId yet).
//   - Generate a temp password and send a welcome email.
//   - HR can later add full employee details from /employees, which links
//     the existing user by email.
//
// Returns: { created: number, skipped: number, results: [...] }
// hr_admin / super_admin only.

export const POST = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('POST /api/ws/invites');
  const body = await req.json() as { invites?: Array<{ email: string; name?: string }> };

  if (!Array.isArray(body.invites) || body.invites.length === 0) {
    return NextResponse.json({ error: 'invites array is required and must not be empty' }, { status: 400 });
  }

  if (body.invites.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 invites per request' }, { status: 400 });
  }

  const tenantId = ctx.tenantId;

  const tenantDoc = await Tenant.findById(tenantId)
    .select('displayName legalName brandColor').lean() as
    { displayName?: string; legalName: string; brandColor?: string } | null;

  const companyName = tenantDoc?.displayName ?? tenantDoc?.legalName ?? 'Your Company';
  const brandColor  = tenantDoc?.brandColor;

  const results: Array<{ email: string; status: 'created' | 'skipped'; reason?: string }> = [];
  let created = 0;
  let skipped = 0;

  for (const item of body.invites) {
    const email = String(item.email ?? '').toLowerCase().trim();
    const name  = String(item.name  ?? '').trim() || email.split('@')[0];

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ email, status: 'skipped', reason: 'invalid email address' });
      skipped++;
      continue;
    }

    // Skip if already has an account in this tenant
    const existing = await (WorkspaceUser as any).findOne({ tenantId, email }).lean();
    if (existing) {
      results.push({ email, status: 'skipped', reason: 'account already exists' });
      skipped++;
      continue;
    }

    const tempPassword = `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await (WorkspaceUser as any).create({
      tenantId,
      name,
      email,
      passwordHash,
      role:     'employee',
      isActive: true,
    });

    // Fire-and-forget — never blocks the response
    void sendInviteEmail({ to: email, inviteeName: name, tempPassword, companyName, brandColor });

    results.push({ email, status: 'created' });
    created++;
  }

  return NextResponse.json({ data: { created, skipped, results } }, { status: 201 });
}, ['super_admin', 'hr_admin']);
