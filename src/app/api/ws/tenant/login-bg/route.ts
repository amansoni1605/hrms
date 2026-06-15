import { NextRequest, NextResponse } from 'next/server';
import { runWithSession }            from '@/lib/withRoute';
import { Tenant }                    from '@/models/workspace.models';

const MAX_BYTES    = 1.5 * 1024 * 1024; // 1.5 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

// POST /api/ws/tenant/login-bg
// Accepts multipart/form-data with a "image" file field.
// Converts to base64 data-URL and stores on the tenant document.
export async function POST(req: NextRequest) {
  return runWithSession(async (session) => {
    const formData = await req.formData();
    const file = formData.get('image');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'No image provided. Send as multipart field "image".' },
        { status: 400 },
      );
    }

    const mimeType = (file as File).type || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, and WebP images are allowed.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `Image must be under 1.5 MB. Received: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB.` },
        { status: 400 },
      );
    }

    const loginBgData = `data:${mimeType};base64,${buffer.toString('base64')}`;

    const tenantId = session.role === 'super_admin'
      ? ((formData.get('tenantId') as string | null) ?? session.tenantId)
      : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'No tenantId in session' }, { status: 400 });
    }

    await Tenant.findByIdAndUpdate(tenantId, { $set: { loginBgData } });

    return NextResponse.json({ loginBgData });
  }, ['super_admin', 'hr_admin']);
}

// DELETE /api/ws/tenant/login-bg
// Removes the custom login background image.
export async function DELETE(req: NextRequest) {
  return runWithSession(async (session) => {
    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenantId in session' }, { status: 400 });
    }
    await Tenant.findByIdAndUpdate(tenantId, { $unset: { loginBgData: 1 } });
    return NextResponse.json({ removed: true });
  }, ['super_admin', 'hr_admin']);
}
