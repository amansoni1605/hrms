'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import {
  Building2, Users, Shield, CreditCard, RefreshCw, Loader2,
  CheckCircle2, Copy, ToggleLeft, ToggleRight, Trash2,
} from 'lucide-react';
import { Drawer }       from '@/components/ui/Drawer';
import { Tabs }         from '@/components/ui/Tabs';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { useToast }     from '@/components/ui/Toast';

// ── Types ────────────────────────────────────────────────────────────────────

interface TenantDetail {
  _id:             string;
  slug:            string;
  legalName:       string;
  displayName?:    string;
  industry?:       string;
  companySize?:    string;
  websiteUrl?:     string;
  billingEmail?:   string;
  phone?:          string;
  foundedYear?:    number;
  loginTagline?:   string;
  brandColor?:     string;
  logoData?:       string;
  primaryCountry:  string;
  primaryCurrency: string;
  isActive:        boolean;
  setupComplete:   boolean;
  setupStep:       number;
  subscription:    { tier: string; maxSeats: number; usedSeats: number };
  kmsConfig:       { provider: string; rotationCycle?: number; masterKeyId?: string };
  ztPolicy:        { deviceComplianceRequired: boolean; autoRevokeOnNonCompliance: boolean; heartbeatIntervalSeconds?: number };
}

interface TenantUser {
  _id:      string;
  name:     string;
  email:    string;
  role:     string;
  isActive: boolean;
}

const TIERS    = ['starter', 'growth', 'enterprise', 'global'];
const SIZES    = ['1-50', '51-200', '201-1000', '1001-5000', '5000+'];
const KMS_PROVIDERS = ['local', 'aws_kms', 'gcp_kms', 'azure_kv'];

const TABS = [
  { key: 'overview',     label: 'Overview',     icon: Building2  },
  { key: 'subscription', label: 'Subscription',  icon: CreditCard },
  { key: 'security',     label: 'Security',      icon: Shield     },
  { key: 'team',         label: 'Team',          icon: Users      },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper row renderers
// ─────────────────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-neutral-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.5rem 0.8rem', borderRadius: '0.6rem',
  border: '1px solid var(--color-stroke)',
  background: 'var(--color-neutral-1)',
  color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)',
  fontFamily: 'var(--font-in-rg)',
};

const SectionHead = ({ label }: { label: string }) => (
  <p style={{ margin: '1.6rem 0 0.8rem', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-neutral-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
    {label}
  </p>
);

// ─────────────────────────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ tenant, tenantId, onSaved }: { tenant: TenantDetail; tenantId: string; onSaved: () => void }) {
  const [form, setForm] = useState({
    displayName:  tenant.displayName  ?? '',
    industry:     tenant.industry     ?? '',
    companySize:  tenant.companySize  ?? '',
    websiteUrl:   tenant.websiteUrl   ?? '',
    billingEmail: tenant.billingEmail ?? '',
    phone:        tenant.phone        ?? '',
    foundedYear:  String(tenant.foundedYear ?? ''),
    loginTagline: tenant.loginTagline ?? '',
    brandColor:   tenant.brandColor   ?? '#1C509D',
  });
  const [saving, setSaving] = useState(false);
  const { push: toast }     = useToast();

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ws/tenants/${tenantId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          foundedYear: form.foundedYear ? parseInt(form.foundedYear) : undefined,
        }),
      });
      if (!res.ok) { const j = await res.json(); toast({ kind: 'error', title: j.error ?? 'Failed to save' }); return; }
      toast({ kind: 'success', title: 'Company profile updated' });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Status strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.8rem', borderRadius: '0.8rem', background: 'var(--color-neutral-2)', border: '1px solid var(--color-stroke)' }}>
        <StatusBadge status={tenant.isActive ? 'active' : 'suspended'} />
        {tenant.setupComplete
          ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-green-7)' }}><CheckCircle2 size={12} /> Setup complete</span>
          : <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-orange-7)' }}>Setup in progress — step {tenant.setupStep}/6</span>
        }
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--color-neutral-6)', fontFamily: 'monospace' }}>{tenant.slug}</span>
      </div>

      <SectionHead label="Company" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <FieldRow label="Display Name">
          <input className="hrms-input" style={inputStyle} value={form.displayName} onChange={(e: ChangeEvent<HTMLInputElement>) => set('displayName', e.target.value)} placeholder={tenant.legalName} />
        </FieldRow>
        <FieldRow label="Industry">
          <input className="hrms-input" style={inputStyle} value={form.industry} onChange={(e: ChangeEvent<HTMLInputElement>) => set('industry', e.target.value)} placeholder="Technology" />
        </FieldRow>
        <FieldRow label="Company Size">
          <select className="hrms-input" style={inputStyle} value={form.companySize} onChange={(e) => set('companySize', e.target.value)}>
            <option value="">Select…</option>
            {SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Founded Year">
          <input className="hrms-input" style={inputStyle} type="number" min={1800} max={2100} value={form.foundedYear} onChange={(e: ChangeEvent<HTMLInputElement>) => set('foundedYear', e.target.value)} placeholder="2020" />
        </FieldRow>
      </div>

      <FieldRow label="Website">
        <input className="hrms-input" style={inputStyle} value={form.websiteUrl} onChange={(e: ChangeEvent<HTMLInputElement>) => set('websiteUrl', e.target.value)} placeholder="https://acme.com" />
      </FieldRow>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <FieldRow label="Billing Email">
          <input className="hrms-input" style={inputStyle} type="email" value={form.billingEmail} onChange={(e: ChangeEvent<HTMLInputElement>) => set('billingEmail', e.target.value)} placeholder="billing@acme.com" />
        </FieldRow>
        <FieldRow label="Phone">
          <input className="hrms-input" style={inputStyle} value={form.phone} onChange={(e: ChangeEvent<HTMLInputElement>) => set('phone', e.target.value)} placeholder="+1 555 0100" />
        </FieldRow>
      </div>

      <SectionHead label="Branding" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <FieldRow label="Brand Color">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="color" value={form.brandColor} onChange={(e: ChangeEvent<HTMLInputElement>) => set('brandColor', e.target.value)}
              style={{ width: 36, height: 32, padding: 2, border: '1px solid var(--color-stroke)', borderRadius: '0.5rem', cursor: 'pointer', background: 'var(--color-neutral-1)' }} />
            <input className="hrms-input" style={{ ...inputStyle, fontFamily: 'monospace', flex: 1 }} value={form.brandColor} onChange={(e: ChangeEvent<HTMLInputElement>) => set('brandColor', e.target.value)} />
          </div>
        </FieldRow>
        <FieldRow label="Login Tagline">
          <input className="hrms-input" style={inputStyle} value={form.loginTagline} onChange={(e: ChangeEvent<HTMLInputElement>) => set('loginTagline', e.target.value)} placeholder="Empowering your team." />
        </FieldRow>
      </div>
      {tenant.logoData && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tenant.logoData} alt="logo" style={{ height: 48, objectFit: 'contain', alignSelf: 'flex-start', borderRadius: '0.5rem', border: '1px solid var(--color-stroke)' }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.8rem' }}>
        <button onClick={save} disabled={saving} className="hrms-btn-primary" style={{ padding: '0.6rem 1.4rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Tab
// ─────────────────────────────────────────────────────────────────────────────

function SubscriptionTab({ tenant, tenantId, onSaved }: { tenant: TenantDetail; tenantId: string; onSaved: () => void }) {
  const [tier,     setTier]     = useState(tenant.subscription.tier);
  const [maxSeats, setMaxSeats] = useState(String(tenant.subscription.maxSeats));
  const [saving,   setSaving]   = useState(false);
  const { push: toast }         = useToast();

  const usedPct = tenant.subscription.maxSeats > 0
    ? Math.round((tenant.subscription.usedSeats / tenant.subscription.maxSeats) * 100)
    : 0;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ws/tenants/${tenantId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: {
            ...tenant.subscription,
            tier,
            maxSeats: parseInt(maxSeats) || tenant.subscription.maxSeats,
          },
        }),
      });
      if (!res.ok) { const j = await res.json(); toast({ kind: 'error', title: j.error ?? 'Failed' }); return; }
      toast({ kind: 'success', title: 'Subscription updated' });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <SectionHead label="Plan" />
      <FieldRow label="Tier">
        <select className="hrms-input" style={inputStyle} value={tier} onChange={(e) => setTier(e.target.value)}>
          {TIERS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </FieldRow>

      <FieldRow label="Max Seats">
        <input className="hrms-input" style={inputStyle} type="number" min={1} value={maxSeats} onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxSeats(e.target.value)} />
      </FieldRow>

      <SectionHead label="Current Usage" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-8)' }}>
          <span>Seats filled</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
            {tenant.subscription.usedSeats} / {tenant.subscription.maxSeats}
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{ width: `${usedPct}%`, height: '100%', background: usedPct >= 90 ? 'var(--color-semantics-red-6)' : usedPct >= 70 ? 'var(--color-semantics-orange-6)' : 'var(--color-vr-blue-6)' }} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-6)' }}>{usedPct}% capacity used</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.8rem' }}>
        <button onClick={save} disabled={saving} className="hrms-btn-primary" style={{ padding: '0.6rem 1.4rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Security Tab
// ─────────────────────────────────────────────────────────────────────────────

function SecurityTab({ tenant, tenantId, onSaved }: { tenant: TenantDetail; tenantId: string; onSaved: () => void }) {
  const [kmsProvider,    setKmsProvider]   = useState(tenant.kmsConfig?.provider ?? 'local');
  const [rotationCycle,  setRotationCycle] = useState(String(tenant.kmsConfig?.rotationCycle ?? 0));
  const [deviceRequired, setDeviceReq]    = useState(tenant.ztPolicy?.deviceComplianceRequired ?? true);
  const [autoRevoke,     setAutoRevoke]   = useState(tenant.ztPolicy?.autoRevokeOnNonCompliance ?? true);
  const [heartbeat,      setHeartbeat]    = useState(String(tenant.ztPolicy?.heartbeatIntervalSeconds ?? 300));
  const [saving,         setSaving]       = useState(false);
  const { push: toast }                   = useToast();

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ws/tenants/${tenantId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kmsConfig: {
            ...(tenant.kmsConfig ?? {}),
            provider:      kmsProvider,
            rotationCycle: parseInt(rotationCycle) || 0,
          },
          ztPolicy: {
            deviceComplianceRequired:  deviceRequired,
            autoRevokeOnNonCompliance: autoRevoke,
            heartbeatIntervalSeconds:  parseInt(heartbeat) || 300,
          },
        }),
      });
      if (!res.ok) { const j = await res.json(); toast({ kind: 'error', title: j.error ?? 'Failed' }); return; }
      toast({ kind: 'success', title: 'Security settings updated' });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <SectionHead label="Key Management" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <FieldRow label="KMS Provider">
          <select className="hrms-input" style={inputStyle} value={kmsProvider} onChange={(e) => setKmsProvider(e.target.value)}>
            {KMS_PROVIDERS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Rotation Cycle (n)">
          <input className="hrms-input" style={inputStyle} type="number" min={0} value={rotationCycle} onChange={(e: ChangeEvent<HTMLInputElement>) => setRotationCycle(e.target.value)} />
        </FieldRow>
      </div>

      <SectionHead label="Zero-Trust Policy" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        {[
          { label: 'Device compliance required',   value: deviceRequired, set: setDeviceReq   },
          { label: 'Auto-revoke on non-compliance', value: autoRevoke,    set: setAutoRevoke   },
        ].map(({ label, value, set }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.8rem', borderRadius: '0.6rem', border: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
            <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-9)' }}>{label}</span>
            <button
              onClick={() => set(!value)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: value ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-6)', padding: 2 }}
            >
              {value ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
            </button>
          </div>
        ))}
        <FieldRow label="Heartbeat Interval (seconds)">
          <input className="hrms-input" style={inputStyle} type="number" min={30} value={heartbeat} onChange={(e: ChangeEvent<HTMLInputElement>) => setHeartbeat(e.target.value)} />
        </FieldRow>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.8rem' }}>
        <button onClick={save} disabled={saving} className="hrms-btn-primary" style={{ padding: '0.6rem 1.4rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Tab
// ─────────────────────────────────────────────────────────────────────────────

function TeamTab({ tenantId }: { tenantId: string }) {
  const [users,      setUsers]     = useState<TenantUser[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [resetting,  setResetting] = useState<string | null>(null);
  const [revealed,   setRevealed]  = useState<Record<string, string>>({});
  const [copied,     setCopied]    = useState<string | null>(null);
  const { push: toast }            = useToast();

  useEffect(() => {
    fetch(`/api/ws/tenants/${tenantId}/users`)
      .then((r) => r.json())
      .then((d) => setUsers(d.data ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const resetPassword = async (userId: string, email: string) => {
    setResetting(userId);
    try {
      const res = await fetch(`/api/ws/tenants/${tenantId}/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ kind: 'error', title: json.error ?? 'Failed to reset' }); return; }
      setRevealed((prev) => ({ ...prev, [userId]: json.data.tempPassword }));
      toast({ kind: 'success', title: `Password reset for ${email}` });
    } finally { setResetting(null); }
  };

  const copyPassword = (userId: string) => {
    const pw = revealed[userId];
    if (!pw) return;
    navigator.clipboard.writeText(pw);
    setCopied(userId);
    setTimeout(() => setCopied((c) => c === userId ? null : c), 2500);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', padding: '2rem' }}>
        No users found for this tenant.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {users.map((u) => (
        <div key={u._id} style={{ padding: '0.9rem 1rem', borderRadius: '0.8rem', border: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>
                  {u.name}
                </span>
                <Badge variant={u.role === 'hr_admin' ? 'purple' : 'info'}>{u.role}</Badge>
                <StatusBadge status={u.isActive ? 'active' : 'inactive'} />
              </div>
              <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                {u.email}
              </p>
              {revealed[u._id] && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.6rem', borderRadius: '0.5rem', background: '#F0FDF4', border: '1px solid var(--color-semantics-green-3)', fontSize: 10, fontFamily: 'monospace' }}>
                  <span style={{ color: 'var(--color-neutral-7)' }}>New password:</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-neutral-10)', letterSpacing: '0.06em' }}>{revealed[u._id]}</span>
                  <button
                    onClick={() => copyPassword(u._id)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--color-vr-blue-6)' }}
                    title="Copy"
                  >
                    {copied === u._id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => resetPassword(u._id, u.email)}
              disabled={resetting === u._id}
              className="hrms-btn-ghost"
              style={{ padding: '0.4rem 0.8rem', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
            >
              {resetting === u._id
                ? <Loader2 size={11} className="animate-spin" />
                : <RefreshCw size={11} />
              }
              Reset Password
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TenantDetailDrawer — root export
// ─────────────────────────────────────────────────────────────────────────────

export interface TenantDetailDrawerProps {
  tenantId:  string | null;
  onClose:   () => void;
  onSaved:   () => void;
  onDeleted?: () => void;
}

export function TenantDetailDrawer({ tenantId, onClose, onSaved, onDeleted }: TenantDetailDrawerProps) {
  const [tenant,       setTenant]      = useState<TenantDetail | null>(null);
  const [loading,      setLoading]     = useState(false);
  const [tab,          setTab]         = useState('overview');
  const [toggling,     setToggling]    = useState(false);
  const [showDelete,   setShowDelete]  = useState(false);
  const [confirmSlug,  setConfirmSlug] = useState('');
  const [deleting,     setDeleting]    = useState(false);
  const { push: toast }                = useToast();

  const loadTenant = () => {
    if (!tenantId) return;
    setLoading(true);
    fetch(`/api/ws/tenants/${tenantId}`)
      .then((r) => r.json())
      .then((d) => setTenant(d.data ?? null))
      .catch(() => setTenant(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (tenantId) { setTab('overview'); setShowDelete(false); setConfirmSlug(''); loadTenant(); }
    else setTenant(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const deleteTenant = async () => {
    if (!tenant) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ws/tenants/${tenant._id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmSlug }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ kind: 'error', title: json.error ?? 'Delete failed' }); return; }
      toast({ kind: 'success', title: `Tenant "${tenant.legalName}" permanently deleted` });
      onClose();
      onDeleted?.();
    } finally { setDeleting(false); }
  };

  const handleSaved = () => { onSaved(); loadTenant(); };

  const toggleActive = async () => {
    if (!tenant) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/ws/tenants/${tenant._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !tenant.isActive }),
      });
      if (!res.ok) { toast({ kind: 'error', title: 'Failed to update status' }); return; }
      toast({ kind: 'success', title: tenant.isActive ? 'Tenant suspended' : 'Tenant activated' });
      handleSaved();
    } finally { setToggling(false); }
  };

  const name = tenant ? (tenant.displayName ?? tenant.legalName) : '…';

  return (
    <Drawer
      open={!!tenantId}
      onClose={onClose}
      width={540}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {tenant?.logoData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoData} alt={name} style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }} />
          ) : (
            <div style={{ width: 22, height: 22, borderRadius: 4, background: tenant?.brandColor ?? '#1C509D', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <span>{name}</span>
        </div>
      }
      subtitle={tenant?.slug ?? ''}
      footer={tenant && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%' }}>
          <StatusBadge status={tenant.isActive ? 'active' : 'suspended'} />
          <button
            onClick={toggleActive}
            disabled={toggling}
            className={tenant.isActive ? 'hrms-btn-ghost' : 'hrms-btn-primary'}
            style={{ padding: '0.5rem 1.2rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-fs-12)' }}
          >
            {toggling ? <Loader2 size={13} className="animate-spin" /> : tenant.isActive ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
            {tenant.isActive ? 'Suspend Tenant' : 'Activate Tenant'}
          </button>
        </div>
      )}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : !tenant ? (
        <p style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>Tenant not found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <Tabs tabs={TABS} active={tab} onChange={setTab} size="sm" />

          {tab === 'overview'     && <OverviewTab     tenant={tenant} tenantId={tenant._id} onSaved={handleSaved} />}
          {tab === 'subscription' && <SubscriptionTab tenant={tenant} tenantId={tenant._id} onSaved={handleSaved} />}
          {tab === 'security'     && <SecurityTab     tenant={tenant} tenantId={tenant._id} onSaved={handleSaved} />}
          {tab === 'team'         && <TeamTab         tenantId={tenant._id} />}

          {/* Danger Zone */}
          <div style={{ marginTop: '1.6rem', borderTop: '1px solid var(--color-stroke)', paddingTop: '1.6rem' }}>
            {!showDelete ? (
              <button
                onClick={() => setShowDelete(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0.5rem 1rem', borderRadius: '0.6rem',
                  border: '1px solid var(--color-semantics-red-3)',
                  background: 'transparent', cursor: 'pointer',
                  color: 'var(--color-semantics-red-6)', fontSize: 'var(--text-fs-12)',
                  fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                }}
              >
                <Trash2 size={13} /> Delete Tenant
              </button>
            ) : (
              <div style={{ padding: '1rem', borderRadius: '0.8rem', border: '1px solid var(--color-semantics-red-3)', background: '#FFF5F5', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <p style={{ margin: 0, color: 'var(--color-semantics-red-7)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                  This will permanently delete all tenant data
                </p>
                <p style={{ margin: 0, color: 'var(--color-semantics-red-6)', fontSize: 11 }}>
                  All employees, leave records, payroll, performance data and users will be erased. Audit trail entries are retained. This cannot be undone.
                </p>
                <p style={{ margin: 0, color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-12)' }}>
                  Type <strong style={{ fontFamily: 'monospace' }}>{tenant.slug}</strong> to confirm:
                </p>
                <input
                  className="hrms-input"
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                  placeholder={tenant.slug}
                  value={confirmSlug}
                  onChange={(e) => setConfirmSlug(e.target.value)}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <button
                    onClick={() => { setShowDelete(false); setConfirmSlug(''); }}
                    className="hrms-btn-ghost"
                    style={{ padding: '0.5rem 1rem', fontSize: 'var(--text-fs-12)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={deleteTenant}
                    disabled={deleting || confirmSlug !== tenant.slug}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '0.5rem 1rem', borderRadius: '0.6rem',
                      border: 'none', cursor: confirmSlug === tenant.slug ? 'pointer' : 'not-allowed',
                      background: confirmSlug === tenant.slug ? 'var(--color-semantics-red-6)' : 'var(--color-neutral-4)',
                      color: confirmSlug === tenant.slug ? '#fff' : 'var(--color-neutral-6)',
                      fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                    }}
                  >
                    {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Delete permanently
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
