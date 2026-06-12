import { NextResponse }                        from 'next/server';
import { withRoute, auditEvent }              from '@/lib/withRoute';
import { WorkspaceEmployee }                  from '@/models/workspace.models';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const MIN_LIVENESS  = 0.90;
const MIN_ANTISPOOF = 0.85;
const MAX_ATTEMPTS  = 5;

// Onboarding/identity actions may be performed by an HR operator (kiosk-assisted)
// or by the subject themselves; never by an arbitrary third employee.
const HR_ROLES = new Set(['super_admin', 'hr_admin', 'hr_manager']);

export const POST = withRoute(async (req, session) => {
  const body = await req.json();
  const { employeeId, verificationSessionId, provider, livenessPayload, sessionSignature, webauthnPayload } = body;

  if (!employeeId || !livenessPayload) {
    return NextResponse.json({ error: 'employeeId and livenessPayload required' }, { status: 400 });
  }

  // Authorization: caller must be HR, or acting on their own employee record.
  const isHR   = HR_ROLES.has(session.role);
  const isSelf = !!session.employeeId && session.employeeId === employeeId;
  if (!isHR && !isSelf) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // Validate provider HMAC signature. When a provider secret is configured the
  // signature is MANDATORY — omitting it must not bypass verification.
  const secretEnvKey   = `LIVENESS_HMAC_SECRET_${String(provider ?? 'default').toUpperCase()}`;
  const providerSecret = process.env[secretEnvKey];

  if (providerSecret) {
    if (!sessionSignature) {
      return NextResponse.json({ error: 'LIVENESS_SIGNATURE_REQUIRED' }, { status: 401 });
    }
    const canon = JSON.stringify({ sessionId: verificationSessionId, employeeId, score: livenessPayload.livenessScore, antiSpoof: livenessPayload.antiSpoofScore, timestamp: livenessPayload.verificationTimestamp });
    const expected = createHmac('sha256', providerSecret).update(canon).digest('base64');
    let sigOk = false;
    try { sigOk = timingSafeEqual(Buffer.from(sessionSignature, 'base64'), Buffer.from(expected, 'base64')); } catch { sigOk = false; }
    if (!sigOk) return NextResponse.json({ error: 'LIVENESS_SIGNATURE_INVALID' }, { status: 401 });
  }

  const emp = await WorkspaceEmployee.findById(employeeId)
    .select('identityVerification employeeStatus')
    .lean() as { identityVerification?: { failedAttempts?: number }; employeeStatus?: string } | null;

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const attempts = emp.identityVerification?.failedAttempts ?? 0;
  if (attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'LIVENESS_MAX_ATTEMPTS_EXCEEDED', failedAttempts: attempts }, { status: 429 });
  }

  const livenessOk  = (livenessPayload.livenessScore  ?? 0) >= MIN_LIVENESS;
  const antiSpoofOk = (livenessPayload.antiSpoofScore ?? 0) >= MIN_ANTISPOOF;
  const passed      = livenessOk && antiSpoofOk;

  // Hash session — NEVER store raw biometric data
  const biometricTemplateHash = createHash('sha256')
    .update(`${verificationSessionId ?? 'no-session'}:${employeeId}:${livenessPayload.token ?? ''}`)
    .digest('hex');

  const webAuthnPublicKeyHash = webauthnPayload?.authenticatorData
    ? createHash('sha256').update(Buffer.from(webauthnPayload.authenticatorData, 'base64url')).digest('hex')
    : undefined;

  const now = new Date();

  await WorkspaceEmployee.findByIdAndUpdate(employeeId, {
    $set: {
      'identityVerification.verificationSessionId':  verificationSessionId,
      'identityVerification.webAuthnPublicKeyHash':  webAuthnPublicKeyHash,
      'identityVerification.livenessCheckPassed':    passed,
      'identityVerification.livenessScore':           livenessPayload.livenessScore,
      'identityVerification.antiSpoofScore':          livenessPayload.antiSpoofScore,
      'identityVerification.biometricTemplateHash':   biometricTemplateHash,
      'identityVerification.verificationProvider':    provider,
      'identityVerification.verificationStatus':      passed ? 'verified' : 'failed',
      'identityVerification.verifiedAt':              passed ? now : undefined,
      'identityVerification.lastFailedAt':            passed ? undefined : now,
      'identityVerification.failedAttempts':          passed ? 0 : attempts + 1,
      ...(passed && emp.employeeStatus === 'pre_hire' ? { employeeStatus: 'active' } : {}),
    },
  });

  await auditEvent({
    actionType:       passed ? 'LIVENESS_VERIFIED' : 'LIVENESS_FAILED',
    targetCollection: 'ws_employees',
    targetDocumentId: employeeId,
    newStateHash:     createHash('sha256').update(`${passed}:${biometricTemplateHash}:${now.toISOString()}`).digest('hex'),
    changeSummary:    { passed, provider, livenessScore: livenessPayload.livenessScore, antiSpoofScore: livenessPayload.antiSpoofScore, biometricTemplateHash },
  });

  if (!passed) {
    return NextResponse.json({
      verificationStatus: 'failed',
      failureReasons: [
        ...(!livenessOk  ? [{ check: 'liveness_score',   actual: livenessPayload.livenessScore,  threshold: MIN_LIVENESS }]  : []),
        ...(!antiSpoofOk ? [{ check: 'anti_spoof_score', actual: livenessPayload.antiSpoofScore, threshold: MIN_ANTISPOOF }] : []),
      ],
      retryAllowed:      MAX_ATTEMPTS - (attempts + 1) > 0,
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - (attempts + 1)),
    }, { status: 422 });
  }

  return NextResponse.json({
    verificationId:         crypto.randomUUID(),
    employeeId,
    verificationStatus:     'verified',
    verifiedAt:             now.toISOString(),
    biometric:              { templateHashRecorded: true, rawBiometricStored: false },
    employeeStatusUpdated:  emp.employeeStatus === 'pre_hire' ? 'active' : emp.employeeStatus,
  });
});
