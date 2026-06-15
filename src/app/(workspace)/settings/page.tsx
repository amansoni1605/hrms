'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  User, Bell, Shield, Monitor, Building2,
  Save, Loader2, CheckCircle, Key, LogOut,
  Eye, EyeOff, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { Tabs }        from '@/components/ui/Tabs';
import { useToast }    from '@/components/ui/Toast';
import { useSession }  from '@/hooks/useSession';

// ─────────────────────────────────────────────────────────────────────────────
// Settings page — adapts to role:
//   All roles:       Profile, Notifications, Security, Appearance
//   HR+ roles:       + Team Management (invite user, reset password)
//   super_admin:     + Tenant Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface SettingsDoc {
  profile: {
    displayName?: string; avatarUrl?: string;
    preferredLang: string; timezone: string; dateFormat: string;
  };
  notifications: {
    emailEnabled: boolean; inAppEnabled: boolean;
    leaveUpdates: boolean; payrollReady: boolean;
    securityAlerts: boolean; announcements: boolean;
    visaExpiry: boolean;
    digestFrequency: string;
  };
  security: {
    mfaEnabled: boolean;
    lastPasswordChanged?: string;
    sessionTimeout: number;
  };
  ui: {
    sidebarCollapsed: boolean; compactMode: boolean; colorScheme: string;
  };
}

const TIMEZONES = [
  'UTC','Asia/Kolkata','America/New_York','America/Los_Angeles',
  'Europe/London','Europe/Berlin','Asia/Singapore','Asia/Tokyo','Australia/Sydney',
  'America/Chicago','America/Denver','America/Toronto','Asia/Dubai','Asia/Seoul',
];

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/12/2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/31/2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-12-31)' },
];

const DIGEST_OPTIONS = [
  { value: 'realtime', label: 'Real-time (instant)' },
  { value: 'daily',    label: 'Daily digest' },
  { value: 'weekly',   label: 'Weekly digest' },
  { value: 'off',      label: 'Off' },
];

const HR_ROLES = new Set(['super_admin','hr_admin','hr_manager','payroll_officer']);

export default function SettingsPage() {
  const { session } = useSession();
  const toast       = useToast();
  const [settings,  setSettings]  = useState<SettingsDoc | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [tab,       setTab]       = useState('profile');
  const [dirty,     setDirty]     = useState(false);

  // Password change state
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/settings');
      const json = await res.json();
      if (res.ok) setSettings(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = (section: keyof SettingsDoc, key: string, value: unknown) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [section]: { ...prev[section], [key]: value },
      };
    });
    setDirty(true);
  };

  const save = async () => {
    if (!settings || !dirty) return;
    setSaving(true);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile:       settings.profile,
        notifications: settings.notifications,
        ui:            settings.ui,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Settings saved' });
      setDirty(false);
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: 'Save failed', desc: j.error });
    }
  };

  const handlePasswordChange = async () => {
    if (!newPw || !currentPw) {
      toast.push({ kind: 'error', title: 'Fill all password fields' }); return;
    }
    if (newPw !== confirmPw) {
      toast.push({ kind: 'error', title: 'Passwords do not match' }); return;
    }
    if (newPw.length < 8) {
      toast.push({ kind: 'error', title: 'Password must be at least 8 characters' }); return;
    }
    setChangingPw(true);
    const res  = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    setChangingPw(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Password changed', desc: 'You will be signed out of other sessions.' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: 'Password change failed', desc: j.error });
    }
  };

  const isHR = session ? HR_ROLES.has(session.role) : false;
  const isAdmin = session?.role === 'super_admin';

  const TABS = [
    { key: 'profile',       label: 'Profile',        icon: User },
    { key: 'notifications', label: 'Notifications',  icon: Bell },
    { key: 'security',      label: 'Security',       icon: Shield },
    { key: 'appearance',    label: 'Appearance',     icon: Monitor },
    ...(isHR ? [{ key: 'team', label: 'Team', icon: User }] : []),
    ...(isAdmin ? [{ key: 'tenant', label: 'Tenant Config', icon: Building2 }] : []),
  ];

  if (loading || !settings) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{
            margin: 0, color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)',
          }}>
            Settings
          </h2>
          <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Manage your profile, preferences, and security settings.
          </p>
        </div>
        {dirty && (
          <button onClick={save} disabled={saving} className="hrms-btn-primary">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ marginTop: '1.6rem' }}>

        {/* ── Profile ─────────────────────────────────────────────────── */}
        {tab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Personal Information</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', marginBottom: '1.4rem' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'var(--color-vr-blue-6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-neutral-1)',
                  fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)',
                  flexShrink: 0,
                }}>
                  {(settings.profile.displayName ?? session?.name ?? 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{
                    margin: 0, color: 'var(--color-neutral-10)',
                    fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)',
                  }}>
                    {settings.profile.displayName ?? session?.name}
                  </p>
                  <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                    {session?.email} · {session?.role?.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <SF label="Display Name">
                  <input value={settings.profile.displayName ?? ''}
                         onChange={(e) => patch('profile', 'displayName', e.target.value)}
                         className="hrms-input" placeholder={session?.name ?? 'Your name'} />
                </SF>
                <SF label="Preferred Language">
                  <select value={settings.profile.preferredLang}
                          onChange={(e) => patch('profile', 'preferredLang', e.target.value)}
                          className="hrms-input">
                    <option value="en">English</option>
                    <option value="hi">हिन्दी</option>
                    <option value="de">Deutsch</option>
                    <option value="fr">Français</option>
                    <option value="es">Español</option>
                    <option value="ja">日本語</option>
                  </select>
                </SF>
                <SF label="Timezone">
                  <select value={settings.profile.timezone}
                          onChange={(e) => patch('profile', 'timezone', e.target.value)}
                          className="hrms-input">
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </SF>
                <SF label="Date Format">
                  <select value={settings.profile.dateFormat}
                          onChange={(e) => patch('profile', 'dateFormat', e.target.value)}
                          className="hrms-input">
                    {DATE_FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </SF>
              </div>
            </div>
          </div>
        )}

        {/* ── Notifications ───────────────────────────────────────────── */}
        {tab === 'notifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Channels</h3>
              <Toggle
                label="In-app notifications"
                desc="Show notifications in the bell icon within the platform."
                checked={settings.notifications.inAppEnabled}
                onChange={(v) => patch('notifications', 'inAppEnabled', v)}
              />
              <Toggle
                label="Email notifications"
                desc="Receive email summaries and critical alerts."
                checked={settings.notifications.emailEnabled}
                onChange={(v) => patch('notifications', 'emailEnabled', v)}
              />
              <SF label="Email digest frequency" style={{ marginTop: '1rem' }}>
                <select value={settings.notifications.digestFrequency}
                        onChange={(e) => patch('notifications', 'digestFrequency', e.target.value)}
                        className="hrms-input">
                  {DIGEST_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </SF>
            </div>
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Event Types</h3>
              <Toggle label="Leave request updates" desc="When your leave is approved or rejected."
                      checked={settings.notifications.leaveUpdates}
                      onChange={(v) => patch('notifications', 'leaveUpdates', v)} />
              <Toggle label="Payroll notifications" desc="When payslips are ready or payroll is processed."
                      checked={settings.notifications.payrollReady}
                      onChange={(v) => patch('notifications', 'payrollReady', v)} />
              <Toggle label="Security alerts" desc="Device compliance, access revocation, liveness checks."
                      checked={settings.notifications.securityAlerts}
                      onChange={(v) => patch('notifications', 'securityAlerts', v)} />
              <Toggle label="Company announcements" desc="Platform-wide messages from HR or administration."
                      checked={settings.notifications.announcements}
                      onChange={(v) => patch('notifications', 'announcements', v)} />
              <Toggle label="Visa & immigration alerts" desc="Expiry reminders for work permits and visas."
                      checked={settings.notifications.visaExpiry}
                      onChange={(v) => patch('notifications', 'visaExpiry', v)} />
            </div>
          </div>
        )}

        {/* ── Security ────────────────────────────────────────────────── */}
        {tab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            {/* MFA status */}
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 className="hrms-section-label" style={{ margin: 0 }}>Multi-Factor Authentication</h3>
                <span style={{
                  padding: '0.2rem 0.8rem', borderRadius: 99,
                  background: settings.security.mfaEnabled ? 'var(--color-semantics-green-1)' : 'var(--color-semantics-red-1)',
                  color: settings.security.mfaEnabled ? 'var(--color-semantics-green-7)' : 'var(--color-semantics-red-6)',
                  fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 700,
                }}>
                  {settings.security.mfaEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p style={{ margin: '0 0 1rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                {settings.security.mfaEnabled
                  ? 'Your account is protected with a TOTP authenticator app.'
                  : 'Add an extra layer of security by enabling TOTP-based MFA.'}
              </p>
              <button className={settings.security.mfaEnabled ? 'hrms-btn-ghost' : 'hrms-btn-primary'}
                      style={{ width: '100%' }}
                      onClick={() => toast.push({ kind: 'info', title: 'MFA setup', desc: 'MFA enrollment flow — connect your authenticator app.' })}>
                <Key size={13} />
                {settings.security.mfaEnabled ? 'Manage MFA device' : 'Enable MFA'}
              </button>
            </div>

            {/* Change password */}
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Change Password</h3>
              {settings.security.lastPasswordChanged && (
                <p style={{ margin: '0 0 1rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                  Last changed: {new Date(settings.security.lastPasswordChanged).toLocaleDateString()}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <SF label="Current Password">
                  <PwInput value={currentPw} onChange={setCurrentPw} show={showPw} onToggle={() => setShowPw(!showPw)} placeholder="Current password" />
                </SF>
                <SF label="New Password">
                  <PwInput value={newPw} onChange={setNewPw} show={showPw} onToggle={() => setShowPw(!showPw)} placeholder="Minimum 8 characters" />
                </SF>
                <SF label="Confirm New Password">
                  <PwInput value={confirmPw} onChange={setConfirmPw} show={showPw} onToggle={() => setShowPw(!showPw)} placeholder="Repeat new password" />
                </SF>
                {newPw && confirmPw && newPw !== confirmPw && (
                  <p style={{ margin: 0, color: 'var(--color-semantics-red-6)', fontSize: 'var(--text-fs-12)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={12} /> Passwords do not match
                  </p>
                )}
                <button onClick={handlePasswordChange} disabled={changingPw || !currentPw || !newPw}
                        className="hrms-btn-primary">
                  {changingPw ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                  {changingPw ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </div>

            {/* Session timeout */}
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Session</h3>
              <SF label="Session timeout (minutes)">
                <select value={settings.security.sessionTimeout}
                        onChange={(e) => patch('security', 'sessionTimeout', Number(e.target.value))}
                        className="hrms-input">
                  {[60, 120, 240, 480, 720].map((m) => (
                    <option key={m} value={m}>{m >= 60 ? `${m / 60}h` : `${m}min`}</option>
                  ))}
                </select>
              </SF>
              <button className="hrms-btn-ghost" style={{ marginTop: '1rem', width: '100%' }}
                      onClick={async () => {
                        await fetch('/api/auth/logout', { method: 'POST' });
                        window.location.href = '/login';
                      }}>
                <LogOut size={13} />
                Sign out all sessions
              </button>
            </div>
          </div>
        )}

        {/* ── Appearance ──────────────────────────────────────────────── */}
        {tab === 'appearance' && (
          <div className="hrms-card" style={{ padding: '1.6rem' }}>
            <h3 className="hrms-section-label" style={{ marginBottom: '1.2rem' }}>Display</h3>
            <SF label="Color scheme" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['light','system','dark'] as const).map((scheme) => (
                  <button
                    key={scheme}
                    onClick={() => patch('ui', 'colorScheme', scheme)}
                    style={{
                      flex: 1, padding: '0.8rem',
                      borderRadius: '0.8rem', cursor: 'pointer',
                      border: settings.ui.colorScheme === scheme
                        ? '2px solid var(--color-vr-blue-6)'
                        : '2px solid var(--color-stroke)',
                      background: settings.ui.colorScheme === scheme
                        ? 'var(--color-vr-blue-1)' : 'var(--color-neutral-1)',
                      color: settings.ui.colorScheme === scheme
                        ? 'var(--color-vr-blue-7)' : 'var(--color-neutral-8)',
                      fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                      fontSize: 'var(--text-fs-12)', textTransform: 'capitalize',
                      transition: 'all 120ms ease',
                    }}
                  >
                    {scheme === 'system' ? '⚙ System' : scheme === 'light' ? '☀ Light' : '🌙 Dark'}
                  </button>
                ))}
              </div>
            </SF>
            <Toggle label="Compact mode" desc="Reduce padding and spacing for a denser layout."
                    checked={settings.ui.compactMode}
                    onChange={(v) => patch('ui', 'compactMode', v)} />
          </div>
        )}

        {/* ── Team Management (HR+) ────────────────────────────────────── */}
        {tab === 'team' && isHR && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Invite User</h3>
              <p style={{ margin: '0 0 1rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                Send an invitation to a team member. They will receive a login link via email.
              </p>
              <InviteUserForm toast={toast} />
            </div>
          </div>
        )}

        {/* ── Tenant Configuration (super_admin) ──────────────────────── */}
        {tab === 'tenant' && isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <TenantConfigSection toast={toast} />
          </div>
        )}

      </div>

      {/* Sticky save footer */}
      {dirty && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
          padding: '1rem 2rem',
          background: 'var(--color-neutral-10)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: 'var(--shadow-top)',
        }}>
          <p style={{ margin: 0, color: 'var(--color-neutral-4)', fontSize: 'var(--text-fs-12)' }}>
            You have unsaved changes.
          </p>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <button onClick={() => { load(); setDirty(false); }} className="hrms-btn-ghost"
                    style={{ color: 'var(--color-neutral-4)', borderColor: 'var(--color-neutral-8)' }}>
              <RefreshCw size={12} /> Discard
            </button>
            <button onClick={save} disabled={saving} className="hrms-btn-primary">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helper sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SF({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{
        display: 'block', marginBottom: 4,
        color: 'var(--color-neutral-8)', fontSize: 10,
        fontFamily: 'var(--font-in-sb)', fontWeight: 600,
        letterSpacing: '0.07em', textTransform: 'uppercase',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: {
  label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.8rem 0',
      borderBottom: '1px solid var(--color-neutral-4)',
    }}>
      <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
        <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
          {label}
        </p>
        {desc && (
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 11 }}>{desc}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer',
          background: checked ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-5)',
          position: 'relative', transition: 'background 150ms ease', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 2,
          left: checked ? 20 : 2,
          width: 18, height: 18, borderRadius: '50%',
          background: 'var(--color-neutral-1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 150ms ease',
        }} />
      </button>
    </div>
  );
}

function PwInput({ value, onChange, show, onToggle, placeholder }: {
  value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void; placeholder: string;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="hrms-input"
        placeholder={placeholder}
        style={{ paddingRight: '3.2rem' }}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--color-neutral-6)',
        }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function InviteUserForm({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [email, setEmail]   = useState('');
  const [role,  setRole]    = useState('employee');
  const [busy,  setBusy]    = useState(false);

  const invite = async () => {
    if (!email) { toast.push({ kind: 'error', title: 'Email required' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.push({ kind: 'error', title: 'Invalid email address' }); return; }
    setBusy(true);
    // Real implementation would send invitation email via WorkspaceNotifLog / SendGrid
    await new Promise((r) => setTimeout(r, 800));
    toast.push({ kind: 'success', title: 'Invitation sent', desc: `${email} will receive an email to set up their account.` });
    setEmail(''); setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.8rem' }}>
        <SF label="Email Address">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 className="hrms-input" placeholder="colleague@acmecorp.com" />
        </SF>
        <SF label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value)} className="hrms-input">
            <option value="employee">Employee</option>
            <option value="hr_manager">HR Manager</option>
            <option value="payroll_officer">Payroll Officer</option>
            <option value="finance_auditor">Finance Auditor</option>
            <option value="compliance_officer">Compliance Officer</option>
          </select>
        </SF>
      </div>
      <button onClick={invite} disabled={busy} className="hrms-btn-primary">
        {busy ? <Loader2 size={12} className="animate-spin" /> : null}
        Send Invitation
      </button>
    </div>
  );
}

function TenantConfigSection({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [tenant, setTenant] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoad]  = useState(true);

  useEffect(() => {
    fetch('/api/ws/departments')  // use any HR endpoint to get tenantId from session
      .then(() => {})
      .finally(() => setLoad(false));
    // Load tenant info from analytics or dedicated endpoint
    fetch('/api/analytics')
      .then((r) => r.json())
      .then((d) => setTenant(d.summary ?? null))
      .catch(() => null)
      .finally(() => setLoad(false));
  }, []);

  return (
    <div className="hrms-card" style={{ padding: '1.6rem' }}>
      <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Tenant Configuration</h3>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <ConfRow label="Tenant Slug"    value="acme-corp" />
          <ConfRow label="Legal Name"     value="Acme Corporation Ltd." />
          <ConfRow label="KMS Provider"   value={process.env.NODE_ENV === 'production' ? 'AWS KMS' : 'Local (dev)'} />
          <ConfRow label="Plan"           value="Enterprise" />
          <ConfRow label="Employees"      value={String(tenant?.totalEmployees ?? '—')} />
          <ConfRow label="Departments"    value={String(tenant?.departments ?? '—')} />
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-stroke)' }}>
            <button
              className="hrms-btn-ghost"
              style={{ width: '100%' }}
              onClick={() => toast.push({ kind: 'info', title: 'DEK Rotation', desc: 'Key rotation is a scheduled operation. Use the CLI tool or contact platform support.' })}
            >
              <Key size={13} /> Rotate Encryption Keys (DEK)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{label}</span>
      <span style={{ color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>{value}</span>
    </div>
  );
}
