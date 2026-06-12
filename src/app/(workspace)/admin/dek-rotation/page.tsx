'use client';

import { useEffect, useState } from 'react';
import {
  Key, ShieldAlert, RefreshCw, Loader2, AlertTriangle,
  CheckCircle, Lock, RotateCcw, Database,
} from 'lucide-react';
import { Badge }    from '@/components/ui/Badge';
import { Modal }    from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

interface DEKStatus {
  tenantId:         string;
  currentCycle:     number;
  lastGeneratedAt:  string;
  masterKeyId:      string;
  wrappedDekLength: number;
}

interface RotationResult {
  tenantId:         string;
  previousCycle:    number;
  newCycle:         number;
  rotatedAt:        string;
  reencryptionStatus: string;
  message:          string;
}

export default function DEKRotationPage() {
  const toast = useToast();
  const [status,   setStatus]   = useState<DEKStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [lastResult, setLastResult] = useState<RotationResult | null>(null);

  const load = async () => {
    setLoading(true);
    const res  = await fetch('/api/ws/dek/rotate');
    const json = await res.json();
    setStatus(json.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const triggerRotation = async () => {
    setRotating(true);
    const res  = await fetch('/api/ws/dek/rotate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ confirm: 'ROTATE' }),
    });
    const json = await res.json();
    setRotating(false);
    setConfirmOpen(false);
    if (!res.ok) {
      toast.push({ kind: 'error', title: json.error ?? 'Rotation failed' });
      return;
    }
    setLastResult(json.data);
    toast.push({ kind: 'success', title: `DEK rotated → cycle ${json.data.newCycle}`, ttl: 8000 });
    await load();
  };

  if (loading || !status) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6rem' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  const daysSinceLastRotation = Math.floor(
    (Date.now() - new Date(status.lastGeneratedAt).getTime()) / 86_400_000,
  );
  const rotationDue = daysSinceLastRotation >= 90;

  return (
    <div style={{ padding: '2rem 2.4rem 6rem 2.4rem', maxWidth: 1100, minHeight: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Key size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            DEK Rotation Console
          </h2>
          <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Per-tenant Data Encryption Key lifecycle. Re-keys all CSFLE fields in background.
          </p>
        </div>
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Current status */}
      <div className="hrms-card" style={{ padding: '1.8rem 2rem', marginBottom: '1.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.4rem', flexWrap: 'wrap' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '0.8rem',
            background: rotationDue ? 'var(--color-semantics-orange-1)' : 'var(--color-semantics-green-1)',
            border: '1px solid ' + (rotationDue ? '#FFD891' : 'var(--color-semantics-green-2)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Lock size={24} style={{ color: rotationDue ? 'var(--color-semantics-orange-7)' : 'var(--color-semantics-green-7)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' }}>
                Current DEK · Rotation Cycle {status.currentCycle}
              </h3>
              {rotationDue
                ? <Badge variant="warning" dot>Rotation due</Badge>
                : <Badge variant="success" dot>Healthy</Badge>}
            </div>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
              Last rotated {daysSinceLastRotation} days ago ({new Date(status.lastGeneratedAt).toLocaleString()})
              {rotationDue && ' · Recommended rotation interval is 90 days.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1.2rem' }}>
              <DetailRow label="Tenant ID"          value={status.tenantId.slice(0, 12) + '…'} mono />
              <DetailRow label="Master Key ID"      value={status.masterKeyId || '—'} mono />
              <DetailRow label="Wrapped DEK Length" value={`${status.wrappedDekLength} bytes`} />
              <DetailRow label="Algorithm"          value="AES-256-GCM" mono />
            </div>
          </div>
        </div>
      </div>

      {/* Recent rotation result */}
      {lastResult && (
        <div className="hrms-card" style={{
          padding: '1.2rem 1.6rem', marginBottom: '1.6rem',
          background: 'var(--color-semantics-green-1)',
          border: '1px solid var(--color-semantics-green-2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
            <CheckCircle size={16} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, color: 'var(--color-semantics-green-9)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>
                Rotation complete · cycle {lastResult.previousCycle} → {lastResult.newCycle}
              </p>
              <p style={{ margin: '0.4rem 0 0', color: 'var(--color-neutral-8)', fontSize: 11, lineHeight: 1.5 }}>
                {lastResult.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rotation runbook */}
      <div className="hrms-card" style={{ padding: '1.6rem 2rem', marginBottom: '1.6rem' }}>
        <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>What happens during rotation</h3>
        <ol style={{ margin: 0, paddingLeft: '1.4rem', color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)', lineHeight: 1.8 }}>
          <li>Capture the current DEK + rotation cycle as the OLD key snapshot.</li>
          <li>Generate a fresh 32-byte cryptographically-random plaintext DEK.</li>
          <li>Wrap the new DEK with the tenant's master key via the active KMS provider.</li>
          <li>Persist the wrapped DEK + bumped cycle number to the Tenant document.</li>
          <li>Invalidate the in-process LRU cache for this tenant — next request re-fetches.</li>
          <li>Queue a background re-encryption pass over <code>ws_employees</code>, <code>ws_payroll_runs</code>, and <code>ws_notification_logs</code> *Enc fields.</li>
          <li>Emit a DEK_ROTATION audit-trail entry with the rotation cycle delta.</li>
        </ol>
        <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '0.6rem', background: 'var(--color-semantics-orange-1)', border: '1px solid #FFD891', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <AlertTriangle size={13} style={{ color: 'var(--color-semantics-orange-7)', marginTop: 2 }} />
          <p style={{ margin: 0, color: 'var(--color-semantics-orange-7)', fontSize: 'var(--text-fs-12)' }}>
            In-flight requests continue using the cached OLD key until the LRU TTL expires (10 min default).
            Re-encryption of existing ciphertext runs asynchronously and may take several minutes for large tenants.
          </p>
        </div>
      </div>

      {/* Rotation CTA */}
      <button onClick={() => setConfirmOpen(true)} className="hrms-btn-primary" style={{ width: '100%', padding: '1rem' }}>
        <RotateCcw size={14} />
        Rotate DEK Now
      </button>

      {/* Confirmation modal */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}
             title="Confirm DEK Rotation"
             subtitle={`Tenant ${status.tenantId.slice(0, 12)}… · current cycle ${status.currentCycle}`}
             width={520}
             footer={
               <>
                 <button onClick={() => setConfirmOpen(false)} className="hrms-btn-ghost">Cancel</button>
                 <button onClick={triggerRotation} disabled={rotating} className="hrms-btn-primary">
                   {rotating ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                   {rotating ? 'Rotating…' : 'Rotate Now'}
                 </button>
               </>
             }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ padding: '1rem 1.2rem', borderRadius: '0.8rem', background: 'var(--color-semantics-red-1)', border: '1px solid var(--color-semantics-red-2)', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
            <ShieldAlert size={16} style={{ color: 'var(--color-semantics-red-6)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ margin: 0, color: 'var(--color-semantics-red-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-12)' }}>
                Cryptographic operation — exercise caution
              </p>
              <p style={{ margin: '0.4rem 0 0', color: 'var(--color-semantics-red-7)', fontSize: 11 }}>
                Existing AES-256-GCM encrypted fields will need re-encryption with the new key.
                A background worker handles this automatically. Until the re-encryption pass
                completes, both old and new keys are kept in memory for transparent decryption.
              </p>
            </div>
          </div>
          <p style={{ margin: 0, color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)' }}>
            This action will increment your DEK rotation cycle from
            <strong> {status.currentCycle}</strong> to <strong>{status.currentCycle + 1}</strong>.
          </p>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 11 }}>
            An audit-trail entry of type <code>DEK_ROTATION</code> will be written with HMAC-chain signature.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '0.2rem 0 0', color: 'var(--color-neutral-10)', fontFamily: mono ? 'monospace' : 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>{value}</p>
    </div>
  );
}
