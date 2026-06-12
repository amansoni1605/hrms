'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter }                   from 'next/navigation';
import {
  Building2, Palette, User, LayoutList, CalendarDays,
  UserPlus, CheckCircle, ChevronRight, ChevronLeft, Loader2,
  Upload, X, AlertCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantData {
  _id: string; slug: string; legalName: string;
  primaryCountry: string; primaryCurrency: string;
  displayName?: string; industry?: string; companySize?: string;
  websiteUrl?: string; billingEmail?: string; phone?: string; foundedYear?: number;
  brandColor?: string; loginTagline?: string;
  setupStep: number; setupComplete: boolean;
  registeredAddress?: { street?: string; city?: string; state?: string; postalCode?: string; country?: string };
}

const STEPS = [
  { id: 1, label: 'Company Profile',  icon: Building2 },
  { id: 2, label: 'Branding',         icon: Palette },
  { id: 3, label: 'Your Profile',     icon: User },
  { id: 4, label: 'Departments',      icon: LayoutList },
  { id: 5, label: 'Leave Policy',     icon: CalendarDays },
  { id: 6, label: 'Invite Team',      icon: UserPlus },
];

const INDUSTRIES = [
  'Technology', 'Finance & Banking', 'Healthcare', 'Retail & E-Commerce',
  'Manufacturing', 'Education', 'Media & Entertainment', 'Real Estate',
  'Logistics & Supply Chain', 'Professional Services', 'Government', 'Other',
];

const SIZES = ['1-50', '51-200', '201-1000', '1001-5000', '5000+'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Errors = Record<string, string>;

function FieldRow({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-9)' }}>
        {label}{required && <span style={{ color: 'var(--color-semantics-red-6)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-semantics-red-6)', marginTop: 1 }}>
          <AlertCircle size={11} />{error}
        </span>
      )}
    </div>
  );
}

const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box' };
const GRID2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' };

function inputBorder(hasError?: string): React.CSSProperties {
  return hasError ? { border: '1.5px solid var(--color-semantics-red-5)' } : {};
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidUrl   = (v: string) => /^https?:\/\/.+\..+/.test(v);
const isValidHex   = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

// ─── Step 1 — Company Profile ─────────────────────────────────────────────────

function StepCompanyProfile({ tenant, onSave }: { tenant: TenantData; onSave: (data: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({
    displayName:  tenant.displayName  ?? tenant.legalName,
    industry:     tenant.industry     ?? '',
    companySize:  tenant.companySize  ?? '',
    websiteUrl:   tenant.websiteUrl   ?? '',
    billingEmail: tenant.billingEmail ?? '',
    phone:        tenant.phone        ?? '',
    foundedYear:  tenant.foundedYear?.toString() ?? '',
    street:       tenant.registeredAddress?.street     ?? '',
    city:         tenant.registeredAddress?.city       ?? '',
    state:        tenant.registeredAddress?.state      ?? '',
    postalCode:   tenant.registeredAddress?.postalCode ?? '',
    country:      tenant.registeredAddress?.country    ?? tenant.primaryCountry,
  });
  const [errors,  setErrors]  = useState<Errors>({});
  const [saving,  setSaving]  = useState(false);
  const set = (k: string, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    if (errors[k]) setErrors(p => ({ ...p, [k]: '' }));
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!form.displayName.trim())
      e.displayName = 'Display name is required.';
    else if (form.displayName.trim().length < 2)
      e.displayName = 'Must be at least 2 characters.';

    if (form.billingEmail.trim() && !isValidEmail(form.billingEmail.trim()))
      e.billingEmail = 'Enter a valid email address.';

    if (form.websiteUrl.trim() && !isValidUrl(form.websiteUrl.trim()))
      e.websiteUrl = 'Must start with https:// or http://';

    if (form.foundedYear.trim()) {
      const yr = parseInt(form.foundedYear);
      const maxYr = new Date().getFullYear() + 5;
      if (isNaN(yr) || yr < 1800 || yr > maxYr)
        e.foundedYear = `Enter a year between 1800 and ${maxYr}.`;
    }
    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    await onSave({
      displayName:  form.displayName.trim(),
      industry:     form.industry,
      companySize:  form.companySize,
      websiteUrl:   form.websiteUrl.trim() || undefined,
      billingEmail: form.billingEmail.trim() || undefined,
      phone:        form.phone.trim() || undefined,
      foundedYear:  form.foundedYear ? parseInt(form.foundedYear) : undefined,
      registeredAddress: {
        street:     form.street.trim()     || undefined,
        city:       form.city.trim()       || undefined,
        state:      form.state.trim()      || undefined,
        postalCode: form.postalCode.trim() || undefined,
        country:    form.country.trim()    || undefined,
      },
    });
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      <div style={GRID2}>
        <FieldRow label="Display name" required error={errors.displayName}>
          <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.displayName) }}
            value={form.displayName} onChange={e => set('displayName', e.target.value)}
            placeholder="Acme Corp" />
        </FieldRow>
        <FieldRow label="Industry">
          <select className="hrms-input" style={INPUT} value={form.industry} onChange={e => set('industry', e.target.value)}>
            <option value="">Select industry…</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </FieldRow>
      </div>
      <div style={GRID2}>
        <FieldRow label="Company size">
          <select className="hrms-input" style={INPUT} value={form.companySize} onChange={e => set('companySize', e.target.value)}>
            <option value="">Select band…</option>
            {SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Founded year" error={errors.foundedYear}>
          <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.foundedYear) }}
            type="number" min={1800} max={new Date().getFullYear() + 5}
            value={form.foundedYear} onChange={e => set('foundedYear', e.target.value)}
            placeholder="2015" />
        </FieldRow>
      </div>
      <div style={GRID2}>
        <FieldRow label="Website" error={errors.websiteUrl}>
          <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.websiteUrl) }}
            value={form.websiteUrl} onChange={e => set('websiteUrl', e.target.value)}
            placeholder="https://acme.com" />
        </FieldRow>
        <FieldRow label="Billing email" error={errors.billingEmail}>
          <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.billingEmail) }}
            type="email" value={form.billingEmail} onChange={e => set('billingEmail', e.target.value)}
            placeholder="billing@acme.com" />
        </FieldRow>
      </div>
      <FieldRow label="Phone">
        <input className="hrms-input" style={{ ...INPUT, maxWidth: 240 }}
          value={form.phone} onChange={e => set('phone', e.target.value)}
          placeholder="+91 98765 43210" />
      </FieldRow>

      <div style={{ borderTop: '1px solid var(--color-stroke)', paddingTop: '1.2rem' }}>
        <p style={{ margin: '0 0 1rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Registered Address
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FieldRow label="Street">
            <input className="hrms-input" style={INPUT}
              value={form.street} onChange={e => set('street', e.target.value)}
              placeholder="123 Main Street, Floor 4" />
          </FieldRow>
          <div style={GRID2}>
            <FieldRow label="City">
              <input className="hrms-input" style={INPUT}
                value={form.city} onChange={e => set('city', e.target.value)}
                placeholder="Mumbai" />
            </FieldRow>
            <FieldRow label="State / Province">
              <input className="hrms-input" style={INPUT}
                value={form.state} onChange={e => set('state', e.target.value)}
                placeholder="Maharashtra" />
            </FieldRow>
          </div>
          <div style={GRID2}>
            <FieldRow label="Postal code">
              <input className="hrms-input" style={INPUT}
                value={form.postalCode} onChange={e => set('postalCode', e.target.value)}
                placeholder="400001" />
            </FieldRow>
            <FieldRow label="Country">
              <input className="hrms-input" style={INPUT}
                value={form.country} onChange={e => set('country', e.target.value)}
                placeholder="IN" />
            </FieldRow>
          </div>
        </div>
      </div>

      <button onClick={submit} disabled={saving} className="hrms-btn-primary"
        style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6, padding: '0.8rem 1.6rem' }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
        Save & Continue
      </button>
    </div>
  );
}

// ─── Step 2 — Branding ───────────────────────────────────────────────────────

function StepBranding({ tenant, onSave }: { tenant: TenantData; onSave: (data: Record<string, unknown>) => Promise<void> }) {
  const [color,     setColor]     = useState(tenant.brandColor   ?? '#1C509D');
  const [tagline,   setTagline]   = useState(tenant.loginTagline ?? '');
  const [logoSrc,   setLogoSrc]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [colorErr,  setColorErr]  = useState('');
  const [logoErr,   setLogoErr]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/ws/tenants/${tenant._id}`)
      .then(r => r.json())
      .then(d => { if (d.data?.logoData) setLogoSrc(d.data.logoData); })
      .catch(() => {});
  }, [tenant._id]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoErr('');
    if (file.size > 200 * 1024) {
      setLogoErr('Logo must be under 200 KB.');
      e.target.value = '';
      return;
    }
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setLogoErr('Only PNG, JPEG, SVG or WebP files are accepted.');
      e.target.value = '';
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('logo', file);
    const res  = await fetch('/api/ws/tenant/logo', { method: 'POST', body: fd });
    const json = await res.json();
    setUploading(false);
    if (res.ok) {
      setLogoSrc(json.logoData);
    } else {
      setLogoErr(json.error ?? 'Logo upload failed.');
    }
  };

  const handleColorInput = (v: string) => {
    setColor(v);
    setColorErr('');
  };

  const submit = async () => {
    if (!isValidHex(color)) {
      setColorErr('Enter a valid hex colour (e.g. #1C509D).');
      return;
    }
    setSaving(true);
    await onSave({ brandColor: color, loginTagline: tagline.trim() || undefined });
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Logo upload */}
      <div>
        <p style={{ margin: '0 0 0.8rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-9)' }}>
          Company Logo
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.6rem' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '1rem',
            border: '2px dashed var(--color-stroke)',
            background: 'var(--color-neutral-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {logoSrc
              ? <img src={logoSrc} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <Building2 size={28} style={{ color: 'var(--color-neutral-5)' }} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
              style={{ display: 'none' }} onChange={handleLogoChange} />
            <button onClick={() => { setLogoErr(''); fileRef.current?.click(); }}
              disabled={uploading} className="hrms-btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-fs-12)' }}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? 'Uploading…' : 'Upload logo'}
            </button>
            {logoSrc && (
              <button onClick={() => setLogoSrc(null)} className="hrms-btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-red-6)' }}>
                <X size={13} /> Remove
              </button>
            )}
            <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-6)' }}>
              PNG, JPEG, SVG or WebP · max 200 KB<br />Shown in the sidebar and on payslips
            </p>
            {logoErr && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-semantics-red-6)' }}>
                <AlertCircle size={11} />{logoErr}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Brand color */}
      <FieldRow label="Brand colour" required error={colorErr}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <input type="color" value={isValidHex(color) ? color : '#1C509D'}
            onChange={e => handleColorInput(e.target.value)}
            style={{ width: 44, height: 44, borderRadius: '0.6rem', border: '1px solid var(--color-stroke)', cursor: 'pointer', padding: 2, background: 'var(--color-neutral-1)' }} />
          <input className="hrms-input" value={color}
            onChange={e => handleColorInput(e.target.value)}
            style={{ width: 120, fontFamily: 'monospace', ...inputBorder(colorErr) }}
            placeholder="#1C509D" maxLength={7} />
          <div style={{ width: 44, height: 44, borderRadius: '0.6rem', background: isValidHex(color) ? color : '#ccc', flexShrink: 0, border: '1px solid var(--color-stroke)' }} />
          <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
            Used as sidebar accent and in notification emails
          </span>
        </div>
      </FieldRow>

      {/* Login tagline */}
      <FieldRow label="Login page tagline">
        <input className="hrms-input" style={INPUT}
          value={tagline} onChange={e => setTagline(e.target.value)}
          placeholder={`Welcome to ${tenant.displayName ?? tenant.legalName}`}
          maxLength={120} />
        <span style={{ fontSize: 10, color: 'var(--color-neutral-6)', marginTop: 2 }}>
          Shown on the employee login screen · max 120 characters
        </span>
      </FieldRow>

      <button onClick={submit} disabled={saving} className="hrms-btn-primary"
        style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6, padding: '0.8rem 1.6rem' }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
        Save & Continue
      </button>
    </div>
  );
}

// ─── Step 3 — Admin Profile ──────────────────────────────────────────────────

function StepAdminProfile({ onSave }: { onSave: (data: Record<string, unknown>) => Promise<void> }) {
  const [name,        setName]        = useState('');
  const [phone,       setPhone]       = useState('');
  const [designation, setDesignation] = useState('');
  const [oldPwd,      setOldPwd]      = useState('');
  const [newPwd,      setNewPwd]      = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [errors,      setErrors]      = useState<Errors>({});

  const clearErr = (k: string) => setErrors(p => ({ ...p, [k]: '' }));

  const validate = (): Errors => {
    const e: Errors = {};

    if (!name.trim())
      e.name = 'Your full name is required.';
    else if (name.trim().length < 2)
      e.name = 'Must be at least 2 characters.';

    // Only validate password fields if the user has touched any of them
    const pwdTouched = oldPwd || newPwd || confirmPwd;
    if (pwdTouched) {
      if (!oldPwd)
        e.oldPwd = 'Enter your current password to make changes.';
      if (!newPwd)
        e.newPwd = 'Enter the new password.';
      else if (newPwd.length < 8)
        e.newPwd = 'New password must be at least 8 characters.';
      else if (!/[A-Z]/.test(newPwd))
        e.newPwd = 'Must contain at least one uppercase letter.';
      else if (!/[0-9!@#$%^&*]/.test(newPwd))
        e.newPwd = 'Must contain at least one number or special character.';

      if (newPwd && confirmPwd && newPwd !== confirmPwd)
        e.confirmPwd = 'Passwords do not match.';
    }

    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);

    const profRes = await fetch('/api/me/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined, designation: designation.trim() || undefined }),
    });
    if (!profRes.ok) {
      setErrors({ name: 'Failed to save profile. Please try again.' });
      setSaving(false);
      return;
    }

    if (oldPwd && newPwd) {
      const pwRes = await fetch('/api/auth/change-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currentPassword: oldPwd, newPassword: newPwd }),
      });
      if (!pwRes.ok) {
        const j = await pwRes.json().catch(() => ({}));
        setErrors({ oldPwd: j.error ?? 'Password change failed. Check your current password.' });
        setSaving(false);
        return;
      }
    }

    await onSave({});
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
        Set your personal details and change the temporary password that was sent to you.
      </p>
      <div style={GRID2}>
        <FieldRow label="Your full name" required error={errors.name}>
          <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.name) }}
            value={name} onChange={e => { setName(e.target.value); clearErr('name'); }}
            placeholder="Priya Sharma" />
        </FieldRow>
        <FieldRow label="Your designation">
          <input className="hrms-input" style={INPUT}
            value={designation} onChange={e => setDesignation(e.target.value)}
            placeholder="HR Director" />
        </FieldRow>
      </div>
      <FieldRow label="Your phone">
        <input className="hrms-input" style={{ ...INPUT, maxWidth: 240 }}
          value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="+91 98765 43210" />
      </FieldRow>

      <div style={{ borderTop: '1px solid var(--color-stroke)', paddingTop: '1.2rem' }}>
        <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Change Password{' '}
          <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--color-neutral-6)' }}>(recommended)</span>
        </p>
        <p style={{ margin: '0 0 1rem', fontSize: 11, color: 'var(--color-neutral-6)' }}>
          Min 8 characters · one uppercase letter · one number or special character
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 360 }}>
          <FieldRow label="Current password" error={errors.oldPwd}>
            <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.oldPwd) }}
              type="password" value={oldPwd}
              onChange={e => { setOldPwd(e.target.value); clearErr('oldPwd'); }} />
          </FieldRow>
          <FieldRow label="New password" error={errors.newPwd}>
            <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.newPwd) }}
              type="password" value={newPwd}
              onChange={e => { setNewPwd(e.target.value); clearErr('newPwd'); }} />
          </FieldRow>
          <FieldRow label="Confirm new password" error={errors.confirmPwd}>
            <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.confirmPwd) }}
              type="password" value={confirmPwd}
              onChange={e => { setConfirmPwd(e.target.value); clearErr('confirmPwd'); }} />
          </FieldRow>
        </div>
      </div>

      <button onClick={submit} disabled={saving} className="hrms-btn-primary"
        style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6, padding: '0.8rem 1.6rem' }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
        Save & Continue
      </button>
    </div>
  );
}

// ─── Step 4 — Departments ────────────────────────────────────────────────────

interface Dept { name: string; code: string }
const DEFAULT_DEPTS: Dept[] = [
  { name: 'Engineering',  code: 'ENG'  },
  { name: 'Sales',        code: 'SALE' },
  { name: 'HR',           code: 'HR'   },
  { name: 'Finance',      code: 'FIN'  },
  { name: 'Operations',   code: 'OPS'  },
];

function StepDepartments({ onSave }: { onSave: (data: Record<string, unknown>) => Promise<void> }) {
  const [depts,    setDepts]    = useState<Dept[]>(DEFAULT_DEPTS);
  const [saving,   setSaving]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newCode,  setNewCode]  = useState('');
  const [addErr,   setAddErr]   = useState('');
  const [submitErr,setSubmitErr]= useState('');

  const validateNewDept = (): string => {
    if (!newName.trim())  return 'Department name is required.';
    if (!newCode.trim())  return 'Department code is required.';
    if (!/^[A-Z]{2,6}$/.test(newCode.trim().toUpperCase()))
      return 'Code must be 2–6 uppercase letters (A–Z only).';
    if (depts.some(d => d.code === newCode.trim().toUpperCase()))
      return `Code "${newCode.toUpperCase()}" is already used.`;
    if (depts.some(d => d.name.toLowerCase() === newName.trim().toLowerCase()))
      return `Department "${newName.trim()}" already exists.`;
    return '';
  };

  const addDept = () => {
    const err = validateNewDept();
    if (err) { setAddErr(err); return; }
    setDepts(d => [...d, { name: newName.trim(), code: newCode.trim().toUpperCase() }]);
    setNewName(''); setNewCode(''); setAddErr(''); setCreating(false);
  };

  const remove = (i: number) => {
    setDepts(d => d.filter((_, idx) => idx !== i));
    setSubmitErr('');
  };

  const submit = async () => {
    if (depts.length === 0) {
      setSubmitErr('Add at least one department before continuing.');
      return;
    }
    setSubmitErr('');
    setSaving(true);
    const failed: string[] = [];
    for (const dept of depts) {
      const res = await fetch('/api/departments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(dept),
      }).catch(() => null);
      if (!res || !res.ok) failed.push(dept.name);
    }
    if (failed.length) {
      setSubmitErr(`Failed to create: ${failed.join(', ')}. Check for duplicates and try again.`);
      setSaving(false);
      return;
    }
    await onSave({});
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
        We've suggested common departments. Remove ones you don't need, add your own, then continue.
        You can always add more from the Departments page later.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {depts.length === 0 && (
          <div style={{ padding: '1rem', borderRadius: '0.8rem', border: '1.5px dashed var(--color-semantics-red-4)', background: '#FFF5F5', textAlign: 'center', fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-red-6)' }}>
            No departments added yet — add at least one to continue.
          </div>
        )}
        {depts.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.7rem 1rem', borderRadius: '0.8rem', border: '1px solid var(--color-stroke)', background: 'var(--color-neutral-1)' }}>
            <span style={{ flex: 1, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-10)' }}>{d.name}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-neutral-6)', background: 'var(--color-neutral-3)', padding: '0.2rem 0.6rem', borderRadius: 4 }}>{d.code}</span>
            <button onClick={() => remove(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-5)', padding: 4 }}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {creating ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '1rem', borderRadius: '0.8rem', border: '1px solid var(--color-stroke)', background: 'var(--color-neutral-1)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <FieldRow label="Department name" required>
              <input className="hrms-input" value={newName}
                onChange={e => { setNewName(e.target.value); setAddErr(''); }}
                placeholder="Marketing" autoFocus style={{ minWidth: 180 }} />
            </FieldRow>
            <FieldRow label="Code (2–6 letters)" required>
              <input className="hrms-input" value={newCode}
                onChange={e => { setNewCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '')); setAddErr(''); }}
                placeholder="MKT" style={{ width: 90 }} maxLength={6} />
            </FieldRow>
            <button onClick={addDept} className="hrms-btn-primary" style={{ marginBottom: 1 }}>Add</button>
            <button onClick={() => { setCreating(false); setAddErr(''); setNewName(''); setNewCode(''); }}
              className="hrms-btn-ghost" style={{ marginBottom: 1 }}>Cancel</button>
          </div>
          {addErr && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-semantics-red-6)' }}>
              <AlertCircle size={11} />{addErr}
            </span>
          )}
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="hrms-btn-ghost"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-fs-12)' }}>
          + Add department
        </button>
      )}

      {submitErr && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-semantics-red-6)' }}>
          <AlertCircle size={11} />{submitErr}
        </span>
      )}

      <button onClick={submit} disabled={saving} className="hrms-btn-primary"
        style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6, padding: '0.8rem 1.6rem' }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
        Create Departments & Continue
      </button>
    </div>
  );
}

// ─── Step 5 — Leave Policy ───────────────────────────────────────────────────

function StepLeavePolicy({ onSave }: { onSave: (data: Record<string, unknown>) => Promise<void> }) {
  const [annual,    setAnnual]    = useState('21');
  const [sick,      setSick]      = useState('12');
  const [workWeek,  setWorkWeek]  = useState('mon-fri');
  const [yearStart, setYearStart] = useState('jan-1');
  const [saving,    setSaving]    = useState(false);
  const [errors,    setErrors]    = useState<Errors>({});

  const clearErr = (k: string) => setErrors(p => ({ ...p, [k]: '' }));

  const validateDays = (val: string, label: string): string => {
    const n = parseInt(val, 10);
    if (val.trim() === '' || isNaN(n)) return `${label} is required.`;
    if (n < 1)   return `${label} must be at least 1.`;
    if (n > 365) return `${label} cannot exceed 365.`;
    return '';
  };

  const submit = async () => {
    const e: Errors = {};
    const aErr = validateDays(annual, 'Annual leave');
    const sErr = validateDays(sick,   'Sick leave');
    if (aErr) e.annual = aErr;
    if (sErr) e.sick   = sErr;
    if (Object.keys(e).length) { setErrors(e); return; }

    setSaving(true);
    const wdpw = workWeek === 'mon-sat' ? 6 : 5;
    const res = await fetch('/api/hr-settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        workingDaysPerWeek: wdpw,
        leavePolicy: [
          { leaveType: 'Annual Leave',      annualDays: parseInt(annual, 10), carryForward: true,  maxCarryDays: 5,  encashable: true,  isActive: true },
          { leaveType: 'Sick Leave',        annualDays: parseInt(sick,   10), carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
          { leaveType: 'Casual Leave',      annualDays: 8,   carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
          { leaveType: 'Maternity Leave',   annualDays: 182, carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
          { leaveType: 'Paternity Leave',   annualDays: 5,   carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
          { leaveType: 'Bereavement Leave', annualDays: 5,   carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
        ],
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErrors({ annual: j.error ?? 'Failed to save leave policy. Please try again.' });
      setSaving(false);
      return;
    }
    await onSave({});
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
        Set your default leave entitlements. You can fine-tune individual policies from HR Settings → Leave Policy later.
      </p>

      <div style={GRID2}>
        <FieldRow label="Annual leave (days/year)" required error={errors.annual}>
          <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.annual) }}
            type="number" min={1} max={365} value={annual}
            onChange={e => { setAnnual(e.target.value); clearErr('annual'); }} />
        </FieldRow>
        <FieldRow label="Sick leave (days/year)" required error={errors.sick}>
          <input className="hrms-input" style={{ ...INPUT, ...inputBorder(errors.sick) }}
            type="number" min={1} max={365} value={sick}
            onChange={e => { setSick(e.target.value); clearErr('sick'); }} />
        </FieldRow>
      </div>

      <div style={GRID2}>
        <FieldRow label="Work week">
          <select className="hrms-input" style={INPUT} value={workWeek} onChange={e => setWorkWeek(e.target.value)}>
            <option value="mon-fri">Monday – Friday</option>
            <option value="mon-sat">Monday – Saturday</option>
            <option value="sun-thu">Sunday – Thursday</option>
          </select>
        </FieldRow>
        <FieldRow label="Leave year starts">
          <select className="hrms-input" style={INPUT} value={yearStart} onChange={e => setYearStart(e.target.value)}>
            <option value="jan-1">January 1</option>
            <option value="apr-1">April 1 (India FY)</option>
            <option value="hire-anniversary">Hire anniversary</option>
          </select>
        </FieldRow>
      </div>

      <button onClick={submit} disabled={saving} className="hrms-btn-primary"
        style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6, padding: '0.8rem 1.6rem' }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
        Save & Continue
      </button>
    </div>
  );
}

// ─── Step 6 — Invite Team ────────────────────────────────────────────────────

function StepInvite({ tenant, onFinish }: { tenant: TenantData; onFinish: () => Promise<void> }) {
  const [emails,    setEmails]    = useState('');
  const [csvFile,   setCsvFile]   = useState<File | null>(null);
  const [sending,   setSending]   = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [sent,      setSent]      = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [emailErr,  setEmailErr]  = useState('');
  const csvRef = useRef<HTMLInputElement>(null);
  const { push: toastPush } = useToast();

  const parseEmailList = (): Array<{ email: string }> => {
    return emails
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(Boolean)
      .map(e => ({ email: e }));
  };

  const validateEmails = (): string => {
    const list = parseEmailList();
    if (list.length === 0 && !csvFile) return '';
    const invalid = list.filter(e => !isValidEmail(e.email));
    if (invalid.length === 1) return `Invalid email: ${invalid[0].email}`;
    if (invalid.length > 1)   return `${invalid.length} invalid email addresses.`;
    return '';
  };

  const sendInvites = async () => {
    const err = validateEmails();
    if (err) { setEmailErr(err); return; }
    setEmailErr('');

    const invites: Array<{ email: string; name?: string }> = parseEmailList();

    if (csvFile) {
      const text = await csvFile.text();
      const rows = text.split('\n').slice(1);
      for (const row of rows) {
        const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols[0] && cols[1]) invites.push({ name: cols[0], email: cols[1] });
        else if (cols[0] && isValidEmail(cols[0])) invites.push({ email: cols[0] });
      }
    }

    if (invites.length === 0) {
      setEmailErr('Enter at least one email address or upload a CSV.');
      return;
    }

    setSending(true);
    try {
      const res  = await fetch('/api/ws/invites', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ invites }),
      });
      const json = await res.json();
      if (!res.ok) {
        toastPush({ kind: 'error', title: json.error ?? 'Failed to send invites' });
        return;
      }
      setSentCount(json.data?.created ?? invites.length);
      setSent(true);
    } catch {
      toastPush({ kind: 'error', title: 'Network error. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    await onFinish();
    setFinishing(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
        Invite your team members. They'll receive a welcome email with a temporary password.
        You can skip this and add employees manually from the Employees page.
      </p>

      {!sent ? (
        <>
          <FieldRow label="Email addresses (one per line or comma-separated)" error={emailErr}>
            <textarea
              className="hrms-input"
              rows={5}
              value={emails}
              onChange={e => { setEmails(e.target.value); setEmailErr(''); }}
              placeholder={'alice@acme.com\nbob@acme.com'}
              style={{ ...INPUT, ...inputBorder(emailErr), resize: 'vertical', fontFamily: 'monospace', fontSize: 'var(--text-fs-12)' }}
            />
          </FieldRow>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--color-stroke)' }} />
            <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--color-stroke)' }} />
          </div>

          <div>
            <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { setCsvFile(e.target.files?.[0] ?? null); setEmailErr(''); }} />
            <button onClick={() => csvRef.current?.click()} className="hrms-btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-fs-12)' }}>
              <Upload size={13} />
              {csvFile ? csvFile.name : 'Upload CSV (name, email, department, job_title)'}
            </button>
            {csvFile && (
              <button onClick={() => setCsvFile(null)} className="hrms-btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-red-6)', marginTop: 4 }}>
                <X size={12} /> Remove CSV
              </button>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
            <button onClick={sendInvites} disabled={sending || (!emails.trim() && !csvFile)}
              className="hrms-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Send Invites
            </button>
          </div>
        </>
      ) : (
        <div style={{ padding: '1.6rem', borderRadius: '1rem', background: '#F0FDF4', border: '1px solid var(--color-semantics-green-3)', display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <CheckCircle size={20} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-14)', color: 'var(--color-semantics-green-7)' }}>
              {sentCount} invite{sentCount !== 1 ? 's' : ''} sent!
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
              Team members will receive a welcome email with their login credentials shortly.
            </p>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--color-stroke)', paddingTop: '1.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>
          You can always invite more people from the Employees page.
        </p>
        <button onClick={finish} disabled={finishing} className="hrms-btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.8rem 2rem', background: 'var(--color-semantics-green-7)', borderColor: 'var(--color-semantics-green-7)' }}>
          {finishing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          Complete Setup
        </button>
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function OnboardPage() {
  const router = useRouter();
  const toast  = useToast();
  const [tenant,  setTenant]  = useState<TenantData | null>(null);
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me/tenant')
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setTenant(d.data);
          setStep(d.data.setupStep ?? 1);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const patchTenant = async (data: Record<string, unknown>) => {
    if (!tenant) return;
    const res = await fetch(`/api/ws/tenants/${tenant._id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'Failed to save. Please try again.' });
      throw new Error('patch failed');
    }
    const json = await res.json();
    setTenant(json.data);
  };

  const advance = async (extraData: Record<string, unknown> = {}) => {
    const nextStep = step + 1;
    const newSetupStep = Math.min(Math.max(nextStep, tenant?.setupStep ?? 1), 6);
    await patchTenant({ ...extraData, setupStep: newSetupStep });
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finish = async () => {
    if (!tenant) return;
    await patchTenant({ setupComplete: true });
    toast.push({ kind: 'success', title: `Welcome to ${tenant.displayName ?? tenant.legalName}! Setup complete.` });
    router.push('/dashboard');
  };

  if (loading || !tenant) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  const currentStepMeta = STEPS.find(s => s.id === step)!;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 1rem 6rem' }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 720, marginBottom: '2.4rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '1rem', background: 'var(--color-vr-blue-6)', marginBottom: '1.2rem' }}>
          <Building2 size={22} style={{ color: '#fff' }} />
        </div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)', color: 'var(--color-neutral-10)' }}>
          Set up {tenant.displayName ?? tenant.legalName}
        </h1>
        <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-7)' }}>
          Complete these steps to get your HR workspace ready for your team.
        </p>
      </div>

      {/* Step progress bar */}
      <div style={{ width: '100%', maxWidth: 720, marginBottom: '2.4rem' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {STEPS.map((s, i) => {
            const done   = s.id < step;
            const active = s.id === step;
            const Icon   = s.icon;
            return (
              <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i < STEPS.length - 1 && (
                  <div style={{ position: 'absolute', top: 16, left: '50%', width: '100%', height: 2, background: done ? 'var(--color-vr-blue-6)' : 'var(--color-stroke)', zIndex: 0 }} />
                )}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', zIndex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? 'var(--color-vr-blue-6)' : active ? 'var(--color-vr-blue-1)' : 'var(--color-neutral-2)',
                  border: `2px solid ${done || active ? 'var(--color-vr-blue-6)' : 'var(--color-stroke)'}`,
                  transition: 'all 200ms ease',
                }}>
                  {done
                    ? <CheckCircle size={15} style={{ color: '#fff' }} />
                    : <Icon size={13} style={{ color: active ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-6)' }} />}
                </div>
                <span style={{ marginTop: 6, fontSize: 10, textAlign: 'center', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: active ? 'var(--color-vr-blue-7)' : done ? 'var(--color-neutral-7)' : 'var(--color-neutral-5)', whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card */}
      <div className="hrms-card" style={{ width: '100%', maxWidth: 720, padding: '2.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '2rem', paddingBottom: '1.2rem', borderBottom: '1px solid var(--color-stroke)' }}>
          <currentStepMeta.icon size={18} style={{ color: 'var(--color-vr-blue-6)', flexShrink: 0 }} />
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-18)', color: 'var(--color-neutral-10)' }}>
              Step {step} of {STEPS.length} — {currentStepMeta.label}
            </h2>
            <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)', marginTop: 2 }}>
              {step < STEPS.length ? 'Fill in the details and click Save & Continue.' : 'Almost done — one last step!'}
            </p>
          </div>
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} className="hrms-btn-ghost"
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-fs-12)' }}>
              <ChevronLeft size={13} /> Back
            </button>
          )}
        </div>

        {step === 1 && <StepCompanyProfile tenant={tenant} onSave={async d => advance(d)} />}
        {step === 2 && <StepBranding       tenant={tenant} onSave={async d => advance(d)} />}
        {step === 3 && <StepAdminProfile              onSave={async d => advance(d)} />}
        {step === 4 && <StepDepartments               onSave={async d => advance(d)} />}
        {step === 5 && <StepLeavePolicy                onSave={async d => advance(d)} />}
        {step === 6 && <StepInvite         tenant={tenant} onFinish={finish} />}
      </div>
    </div>
  );
}
