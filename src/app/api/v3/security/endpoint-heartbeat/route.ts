import { NextResponse }                from 'next/server';
import { withRoute, auditEvent }       from '@/lib/withRoute';
import { WorkspaceEmployee }           from '@/models/workspace.models';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createHmac }                  from 'node:crypto';

const WEIGHTS = { diskEncrypted: 30, mdmProfileActive: 25, osPatchCurrent: 20, edrAgentActive: 15, firewallEnabled: 5, antivirusActive: 5 } as const;
type MetricKey = keyof typeof WEIGHTS;

// A device reports compliance for its own employee; HR/admin tooling may report
// on behalf. An arbitrary employee must not be able to revoke another's device.
const HR_ROLES = new Set(['super_admin', 'hr_admin', 'hr_manager']);

export const POST = withRoute(async (req, session) => {
  const body = await req.json();
  const { employeeId, deviceId, complianceMetrics, signaturePayload, clientTimestamp } = body;

  if (!employeeId || !complianceMetrics) {
    return NextResponse.json({ error: 'employeeId and complianceMetrics required' }, { status: 400 });
  }

  // Authorization: caller must be HR, or reporting on their own employee record.
  const isHR   = HR_ROLES.has(session.role);
  const isSelf = !!session.employeeId && session.employeeId === employeeId;
  if (!isHR && !isSelf) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // Device HMAC. In production a secret MUST be configured and the signature is
  // mandatory — there is no insecure default. In non-production an unset secret
  // skips verification to keep local dev frictionless.
  const deviceSecret = process.env['DEVICE_HMAC_SECRET'];
  if (process.env.NODE_ENV === 'production' && !deviceSecret) {
    return NextResponse.json({ error: 'DEVICE_HMAC_SECRET not configured' }, { status: 503 });
  }
  if (deviceSecret) {
    if (!signaturePayload) {
      return NextResponse.json({ error: 'HEARTBEAT_SIGNATURE_REQUIRED' }, { status: 401 });
    }
    const expected = createHmac('sha256', deviceSecret)
      .update(JSON.stringify({ employeeId, deviceId, metrics: complianceMetrics, timestamp: clientTimestamp }))
      .digest('base64');
    let sigOk = false;
    try { sigOk = timingSafeEqual(Buffer.from(signaturePayload, 'base64'), Buffer.from(expected, 'base64')); } catch { sigOk = false; }
    if (!sigOk) return NextResponse.json({ error: 'HEARTBEAT_SIGNATURE_INVALID' }, { status: 401 });
  }

  const score = (Object.keys(WEIGHTS) as MetricKey[]).reduce(
    (s, k) => s + (complianceMetrics[k] ? WEIGHTS[k] : 0), 0
  );

  let trustLevel: string;
  let accessThrottle: number;
  if (complianceMetrics.jailbreakDetected || complianceMetrics.unauthorizedSoftware) { trustLevel = 'revoked';       accessThrottle = 0; }
  else if (score >= 90) { trustLevel = 'trusted';        accessThrottle = 1.00; }
  else if (score >= 70) { trustLevel = 'conditional';    accessThrottle = 0.75; }
  else if (score >= 50) { trustLevel = 'conditional';    accessThrottle = 0.50; }
  else                  { trustLevel = 'non_compliant';  accessThrottle = 0.10; }

  const now = new Date();

  // Update deviceTrustState on the workspace employee
  await WorkspaceEmployee.findByIdAndUpdate(employeeId, {
    $set: {
      'deviceTrustState.deviceId':             deviceId,
      'deviceTrustState.lastHeartbeatAt':      now,
      'deviceTrustState.diskEncrypted':        complianceMetrics.diskEncrypted,
      'deviceTrustState.osPatchCurrent':       complianceMetrics.osPatchCurrent,
      'deviceTrustState.mdmProfileActive':     complianceMetrics.mdmProfileActive,
      'deviceTrustState.edrAgentActive':       complianceMetrics.edrAgentActive,
      'deviceTrustState.firewallEnabled':      complianceMetrics.firewallEnabled ?? false,
      'deviceTrustState.antivirusActive':      complianceMetrics.antivirusActive ?? false,
      'deviceTrustState.complianceScore':      score,
      'deviceTrustState.trustLevel':           trustLevel,
      'deviceTrustState.accessTokenThrottle':  accessThrottle,
      ...(trustLevel === 'revoked' ? { 'deviceTrustState.autoRevokedAt': now } : {}),
    },
  });

  await auditEvent({
    actionType:       trustLevel === 'revoked' ? 'DEVICE_COMPLIANCE_BREACH' : 'UPDATE',
    targetCollection: 'ws_employees',
    targetDocumentId: employeeId,
    newStateHash:     createHash('sha256').update(`${trustLevel}:${score}:${deviceId ?? ''}:${now.toISOString()}`).digest('hex'),
    changeSummary:    { score, trustLevel, accessThrottle, deviceId },
  });

  return NextResponse.json({
    heartbeatId:     crypto.randomUUID(),
    receivedAt:      now.toISOString(),
    employeeId,
    evaluation:      { complianceScore: score, trustLevel, accessThrottle, accessRestricted: accessThrottle < 1 },
    action:          trustLevel === 'revoked' ? 'ACCESS_REVOKED' : 'NONE',
  });
});
