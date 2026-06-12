'use client';

import { useEffect, useState } from 'react';
import {
  Building2, Users, Loader2, RefreshCw, ShieldCheck, AlertTriangle,
  Plus, Trash2, Settings,
} from 'lucide-react';
import { Badge, StatusBadge }  from '@/components/ui/Badge';
import { EmptyState }           from '@/components/ui/EmptyState';
import { Modal }                from '@/components/ui/Modal';
import { AddTenantModal }       from '@/components/widgets/AddTenantModal';
import { TenantDetailDrawer }   from '@/components/widgets/TenantDetailDrawer';
import { useToast }             from '@/components/ui/Toast';
import { formatRelativeTime }   from '@/lib/format';

interface Tenant {
  _id:              string;
  slug:             string;
  legalName:        string;
  displayName?:     string;
  primaryCountry:   string;
  primaryCurrency:  string;
  subscription:     { tier: string; maxSeats: number; usedSeats: number; features?: string[] };
  kmsProvider:      string;
  kmsRotationCycle: number;
  ztPolicy:         { deviceComplianceRequired: boolean; autoRevokeOnNonCompliance: boolean };
  isActive:         boolean;
  liveHeadcount:    number;
  setupComplete:    boolean;
  setupStep:        number;
  createdAt:        string;
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  tenant, onClose, onDeleted,
}: {
  tenant: Tenant | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmSlug, setConfirmSlug] = useState('');
  const [deleting,    setDeleting]    = useState(false);
  const { push: toast }               = useToast();

  useEffect(() => { if (!tenant) setConfirmSlug(''); }, [tenant]);

  const doDelete = async () => {
    if (!tenant || confirmSlug !== tenant.slug) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ws/tenants/${tenant._id}`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirmSlug }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ kind: 'error', title: json.error ?? 'Delete failed' }); return; }
      toast({ kind: 'success', title: `"${tenant.legalName}" permanently deleted` });
      onClose();
      onDeleted();
    } finally { setDeleting(false); }
  };

  return (
    <Modal
      open={!!tenant}
      onClose={onClose}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-semantics-red-7)' }}><Trash2 size={15} /> Delete Tenant</span>}
      subtitle={tenant ? `${tenant.legalName} · ${tenant.slug}` : ''}
      width={480}
      footer={
        <>
          <button className="hrms-btn-ghost" onClick={onClose} disabled={deleting}>Cancel</button>
          <button
            onClick={doDelete}
            disabled={deleting || confirmSlug !== tenant?.slug}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0.6rem 1.2rem', borderRadius: '0.6rem', border: 'none',
              cursor: confirmSlug === tenant?.slug ? 'pointer' : 'not-allowed',
              background: confirmSlug === tenant?.slug ? 'var(--color-semantics-red-6)' : 'var(--color-neutral-4)',
              color: confirmSlug === tenant?.slug ? '#fff' : 'var(--color-neutral-6)',
              fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)',
            }}
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete permanently
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '0.8rem 1rem', borderRadius: '0.6rem', background: '#FFF5F5', border: '1px solid var(--color-semantics-red-3)', fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-red-6)' }}>
          All employees, leave records, payroll, performance data and users will be permanently erased. Audit trail entries are retained. This cannot be undone.
        </div>
        <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-8)' }}>
          Type <strong style={{ fontFamily: 'monospace' }}>{tenant?.slug}</strong> to confirm:
        </p>
        <input
          className="hrms-input"
          style={{ fontFamily: 'monospace' }}
          placeholder={tenant?.slug ?? ''}
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          autoFocus
        />
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenantsDirectoryPage() {
  const [tenants,        setTenants]        = useState<Tenant[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [addOpen,        setAddOpen]        = useState(false);
  const [managingTenant, setManagingTenant] = useState<string | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);

  const load = async () => {
    setLoading(true);
    const res  = await fetch('/api/ws/tenants');
    const json = await res.json();
    setTenants(json.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: '2rem 2.4rem 6rem 2.4rem', maxWidth: 1400, minHeight: 'calc(100vh - 56px)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Building2 size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            All Tenants
          </h2>
          <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Platform-wide tenant directory · KMS providers · seat usage · ZT policies.
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="hrms-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.7rem 1.2rem' }}>
          <Plus size={13} /> New Tenant
        </button>
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      <AddTenantModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />

      <TenantDetailDrawer
        tenantId={managingTenant}
        onClose={() => setManagingTenant(null)}
        onSaved={load}
        onDeleted={() => { setManagingTenant(null); load(); }}
      />

      <DeleteConfirmModal
        tenant={deletingTenant}
        onClose={() => setDeletingTenant(null)}
        onDeleted={() => { setDeletingTenant(null); load(); }}
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : tenants.length === 0 ? (
        <EmptyState icon={Building2} title="No tenants found" message="Add the first tenant using the New Tenant button above." />
      ) : (
        <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
            <thead>
              <tr>
                {['Tenant','Country','Plan','Seats','KMS','Cycle','ZT','Status','Setup','Created','Actions'].map((h) => (
                  <th key={h} className="hrms-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const seatPct  = t.subscription.maxSeats > 0 ? (t.liveHeadcount / t.subscription.maxSeats) : 0;
                const seatBand = seatPct >= 0.90 ? 'danger' : seatPct >= 0.70 ? 'warning' : 'success';
                return (
                  <tr key={t._id}>
                    <td className="hrms-td">
                      <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                        {t.displayName ?? t.legalName}
                      </p>
                      <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10, fontFamily: 'monospace' }}>
                        {t.slug}
                      </p>
                    </td>
                    <td className="hrms-td" style={{ fontFamily: 'monospace' }}>{t.primaryCountry} · {t.primaryCurrency}</td>
                    <td className="hrms-td"><Badge variant="purple">{t.subscription.tier}</Badge></td>
                    <td className="hrms-td">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={11} style={{ color: 'var(--color-neutral-6)' }} />
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                          {t.liveHeadcount}
                        </span>
                        <span style={{ color: 'var(--color-neutral-6)' }}>/ {t.subscription.maxSeats}</span>
                        <Badge variant={seatBand}>{(seatPct * 100).toFixed(0)}%</Badge>
                      </div>
                    </td>
                    <td className="hrms-td">
                      <Badge variant={t.kmsProvider === 'aws_kms' ? 'success' : 'info'}>{t.kmsProvider}</Badge>
                    </td>
                    <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                      #{t.kmsRotationCycle}
                    </td>
                    <td className="hrms-td">
                      {t.ztPolicy.deviceComplianceRequired
                        ? <ShieldCheck size={13} style={{ color: 'var(--color-semantics-green-7)' }} />
                        : <AlertTriangle size={13} style={{ color: 'var(--color-semantics-orange-7)' }} />}
                    </td>
                    <td className="hrms-td"><StatusBadge status={t.isActive ? 'active' : 'suspended'} /></td>
                    <td className="hrms-td">
                      {t.setupComplete
                        ? <Badge variant="success">Done</Badge>
                        : <Badge variant="warning">Step {t.setupStep}/6</Badge>
                      }
                    </td>
                    <td className="hrms-td" style={{ color: 'var(--color-neutral-7)', fontSize: 10 }}>
                      {formatRelativeTime(t.createdAt)}
                    </td>
                    <td className="hrms-td">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          onClick={() => setManagingTenant(t._id)}
                          className="hrms-btn-ghost"
                          style={{ padding: '0.3rem 0.7rem', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                          title="Manage tenant"
                        >
                          <Settings size={11} /> Manage
                        </button>
                        <button
                          onClick={() => setDeletingTenant(t)}
                          style={{
                            padding: '0.3rem 0.5rem', borderRadius: '0.5rem',
                            background: 'transparent', border: '1px solid var(--color-semantics-red-3)',
                            cursor: 'pointer', color: 'var(--color-semantics-red-6)',
                            display: 'flex', alignItems: 'center',
                          }}
                          title="Delete tenant"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
