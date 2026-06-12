import { NextRequest, NextResponse } from 'next/server';
import { runWithSession }            from '@/lib/withRoute';
import { Tenant }                    from '@/models/workspace.models';

const MAX_BYTES   = 200 * 1024;  // 200 KB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ws/tenant/logo
//
// Accepts a multipart/form-data body with a single "logo" file field.
// Validates MIME type + size, converts to a base64 data-URL, and writes it
// to the caller's tenant document (or the tenantId in the body for super_admin).
//
// Returns: { logoData: "data:image/png;base64,..." }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return runWithSession(async (session) => {
    const formData = await req.formData();
    const file = formData.get('logo');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No logo file provided. Send as multipart field "logo".' }, { status: 400 });
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type "${mimeType}". Allowed: PNG, JPEG, SVG, WebP.` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `Logo must be under 200 KB. Received: ${Math.round(buffer.byteLength / 1024)} KB.` },
        { status: 400 },
      );
    }

    const base64   = buffer.toString('base64');
    const logoData = `data:${mimeType};base64,${base64}`;

    // super_admin may pass an explicit tenantId; everyone else writes to own tenant
    const tenantId = session.role === 'super_admin'
      ? (formData.get('tenantId') as string | null) ?? session.tenantId
      : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'No tenantId in session' }, { status: 400 });
    }

    await Tenant.findByIdAndUpdate(tenantId, { $set: { logoData } });

    return NextResponse.json({ logoData });
  }, ['super_admin', 'hr_admin']);
}
