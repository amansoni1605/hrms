'use client';

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Building2, Loader2, Copy, CheckCircle2 } from 'lucide-react';
import { Modal }    from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

export interface AddTenantModalProps {
  open:       boolean;
  onClose:    () => void;
  onCreated?: () => void;
}

const TIERS        = ['starter', 'growth', 'enterprise', 'global'];
const KMS_PROVIDERS = ['local', 'aws_kms', 'gcp_kms', 'azure_kv'];
const COUNTRIES    = ['IN','US','GB','DE','SG','AU','CA','JP','FR','NL','AE','BR'];
const CURRENCIES   = ['USD','EUR','INR','GBP','AED','SGD','AUD','CAD','JPY'];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

interface FormState {
  legalName:                string;
  slug:                     string;
  primaryCountry:           string;
  primaryCurrency:          string;
  kmsProvider:              string;
  tier:                     string;
  maxSeats:                 string;
  deviceComplianceRequired: boolean;
  autoRevokeOnNonCompliance:boolean;
  hrAdminEmail:             string;
  hrAdminName:              string;
}

interface CreatedCredentials {
  email:        string;
  tempPassword: string;
  tenantSlug:   string;
}

const EMPTY: FormState = {
  legalName: '', slug: '', primaryCountry: 'IN', primaryCurrency: 'USD',
  kmsProvider: 'local', tier: 'starter', maxSeats: '100',
  deviceComplianceRequired: true, autoRevokeOnNonCompliance: true,
  hrAdminEmail: '', hrAdminName: '',
};

export function AddTenantModal({ open, onClose, onCreated }: AddTenantModalProps) {
  const [form, setForm]             = useState<FormState>(EMPTY);
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied]         = useState(false);
  const { push: pushToast }         = useToast();

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleLegalName = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    set('legalName', v);
    if (!slugEdited) set('slug', slugify(v));
  };

  const handleSlug = (e: ChangeEvent<HTMLInputElement>) => {
    setSlugEdited(true);
    set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  const handleClose = () => {
    if (saving) return;
    setForm(EMPTY);
    setSlugEdited(false);
    setError('');
    setCredentials(null);
    setCopied(false);
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.slug.length < 3) {
      setError('Slug must be at least 3 characters.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/ws/tenants', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug:             form.slug,
          legalName:        form.legalName,
          primaryCountry:   form.primaryCountry,
          primaryCurrency:  form.primaryCurrency,
          kmsProvider:      form.kmsProvider,
          tier:             form.tier,
          maxSeats:         parseInt(form.maxSeats) || 100,
          deviceComplianceRequired:  form.deviceComplianceRequired,
          autoRevokeOnNonCompliance: form.autoRevokeOnNonCompliance,
          hrAdminEmail:     form.hrAdminEmail,
          hrAdminName:      form.hrAdminName,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to create tenant.');
        return;
      }
      pushToast({ kind: 'success', title: `Tenant "${form.legalName}" created.` });
      setCredentials({
        email:        json.data.hrAdmin.email,
        tempPassword: json.data.hrAdmin.tempPassword,
        tenantSlug:   form.slug,
      });
      onCreated?.();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const copyCredentials = () => {
    if (!credentials) return;
    navigator.clipboard.writeText(`Email: ${credentials.email}\nPassword: ${credentials.tempPassword}\nSetup: /onboard`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const fieldRow = (label: string, node: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-9)' }}>
        {label}
      </label>
      {node}
    </div>
  );

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box' };

  // ── Credentials success screen shown after creation ─────────────────────
  if (credentials) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={15} style={{ color: 'var(--color-semantics-green-7)' }} /> Tenant Created</span>}
        subtitle="Share these one-time credentials with the HR admin."
        width={520}
        footer={
          <button className="hrms-btn-primary" onClick={handleClose}>Done</button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div style={{ padding: '1.4rem', borderRadius: '0.8rem', background: '#F0FDF4', border: '1px solid var(--color-semantics-green-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontFamily: 'monospace', fontSize: 'var(--text-fs-12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-neutral-7)' }}>Email</span>
                <span style={{ fontWeight: 700, color: 'var(--color-neutral-10)' }}>{credentials.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-neutral-7)' }}>Password</span>
                <span style={{ fontWeight: 700, color: 'var(--color-neutral-10)', letterSpacing: '0.08em' }}>{credentials.tempPassword}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-neutral-7)' }}>Setup URL</span>
                <span style={{ color: 'var(--color-vr-blue-6)' }}>/onboard</span>
              </div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.6rem', padding: '0.8rem 1rem' }}>
            This password is shown <strong>once</strong>. Copy it now before closing.
          </p>
          <button onClick={copyCredentials} className="hrms-btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
            {copied ? <CheckCircle2 size={13} style={{ color: 'var(--color-semantics-green-7)' }} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy credentials'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Building2 size={15} />New Tenant</span>}
      subtitle="Provision a new isolated workspace on this platform."
      width={520}
      footer={
        <>
          <button type="button" className="hrms-btn-ghost" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="add-tenant-form" className="hrms-btn-primary" disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : 'Create Tenant'}
          </button>
        </>
      }
    >
      <form id="add-tenant-form" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

          {fieldRow('Legal Name *',
            <input
              className="hrms-input"
              style={inputStyle}
              placeholder="Acme Corporation Ltd."
              value={form.legalName}
              onChange={handleLegalName}
              required
              autoFocus
            />
          )}

          {fieldRow('Slug * (URL-safe identifier)',
            <>
              <input
                className="hrms-input"
                style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.02em' }}
                placeholder="acme-corp"
                value={form.slug}
                onChange={handleSlug}
                required
                pattern="^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$"
                title="3–63 chars, lowercase letters, numbers, hyphens only"
              />
              <span style={{ fontSize: 10, color: 'var(--color-neutral-6)' }}>
                3–63 chars · lowercase · letters, numbers, hyphens only
              </span>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            {fieldRow('Country *',
              <select className="hrms-input" style={inputStyle} value={form.primaryCountry} onChange={e => set('primaryCountry', e.target.value)} required>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {fieldRow('Currency',
              <select className="hrms-input" style={inputStyle} value={form.primaryCurrency} onChange={e => set('primaryCurrency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            {fieldRow('Plan Tier',
              <select className="hrms-input" style={inputStyle} value={form.tier} onChange={e => set('tier', e.target.value)}>
                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {fieldRow('Max Seats',
              <input
                className="hrms-input"
                style={inputStyle}
                type="number"
                min={1}
                max={100000}
                value={form.maxSeats}
                onChange={e => set('maxSeats', e.target.value)}
              />
            )}
          </div>

          {fieldRow('KMS Provider',
            <select className="hrms-input" style={inputStyle} value={form.kmsProvider} onChange={e => set('kmsProvider', e.target.value)}>
              {KMS_PROVIDERS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          )}

          <div style={{ borderTop: '1px solid var(--color-stroke)', paddingTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-9)' }}>
              First HR Admin Account
            </p>
            <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>
              A login account will be created for this person. A temporary password will be shown after creation.
            </p>
            {fieldRow('HR Admin Email *',
              <input
                className="hrms-input"
                style={inputStyle}
                type="email"
                placeholder="hr@acme.com"
                value={form.hrAdminEmail}
                onChange={e => set('hrAdminEmail', e.target.value)}
                required
              />
            )}
            {fieldRow('HR Admin Name',
              <input
                className="hrms-input"
                style={inputStyle}
                placeholder="Priya Sharma"
                value={form.hrAdminName}
                onChange={e => set('hrAdminName', e.target.value)}
              />
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--color-stroke)', paddingTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-9)' }}>
              Zero-Trust Policy
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-8)' }}>
              <input
                type="checkbox"
                checked={form.deviceComplianceRequired}
                onChange={e => set('deviceComplianceRequired', e.target.checked)}
              />
              Device compliance required
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-8)' }}>
              <input
                type="checkbox"
                checked={form.autoRevokeOnNonCompliance}
                onChange={e => set('autoRevokeOnNonCompliance', e.target.checked)}
              />
              Auto-revoke on non-compliance
            </label>
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-red-6)', background: '#FFF5F5', border: '1px solid #FFCDD2', borderRadius: '0.6rem', padding: '0.8rem 1rem' }}>
              {error}
            </p>
          )}

        </div>
      </form>
    </Modal>
  );
}
