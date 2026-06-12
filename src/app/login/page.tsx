'use client';

import { useState, type FormEvent } from 'react';
import { useRouter }                from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, Mail, AlertCircle, Shield } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { role: 'HR Manager', email: 'meera.iyer@valueresearch.in',    pw: 'Welcome@1234' },
  { role: 'Manager',    email: 'dhruv.mehta@valueresearch.in',   pw: 'Welcome@1234' },
  { role: 'Employee',   email: 'aarav.shah@valueresearch.in',    pw: 'Welcome@1234' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight:  '100vh',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background)',
        position:   'relative',
        padding:    '2rem',
      }}
    >
      {/* Subtle grid background */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, opacity: 0.04, pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(var(--color-vr-blue-6) 1px, transparent 1px), ' +
            'linear-gradient(90deg, var(--color-vr-blue-6) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {/* Soft VR-Blue gradient corner accents */}
      <div
        aria-hidden
        style={{
          position: 'fixed', top: -160, left: -160,
          width: 380, height: 380, borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(28,80,157,0.10), transparent)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed', bottom: -160, right: -160,
          width: 380, height: 380, borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(120,52,137,0.10), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Login card ─────────────────────────────────────────────── */}
      <div style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}>
        <div
          className="hrms-card"
          style={{ padding: 0, overflow: 'hidden' }}
        >
          {/* VR Blue accent bar */}
          <div
            style={{
              height: 3,
              background: 'linear-gradient(90deg, var(--color-vr-blue-6), #783489, var(--color-vr-blue-6))',
            }}
          />

          <div style={{ padding: '2.4rem 2.8rem' }}>
            {/* Logo lock-up */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '2.4rem' }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: '0.8rem',
                  background: 'var(--color-vr-blue-6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-neutral-1)',
                  fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                  fontSize: 'var(--text-fs-16)',
                }}
              >
                H
              </div>
              <div>
                <p style={{
                  margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                  color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-16)',
                  lineHeight: 1,
                }}>
                  HRMS Pro
                </p>
                <p style={{
                  margin: 0, marginTop: 4, fontSize: 10,
                  color: 'var(--color-neutral-7)', letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                }}>
                  Enterprise Platform
                </p>
              </div>
            </div>

            {/* Heading */}
            <div style={{ marginBottom: '1.8rem' }}>
              <h1 style={{
                margin: 0, color: 'var(--color-neutral-10)',
                fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                fontSize: 'var(--text-fs-20)',
              }}>
                Sign in to your workspace
              </h1>
              <p style={{
                margin: 0, marginTop: 4, color: 'var(--color-neutral-7)',
                fontSize: 'var(--text-fs-12)',
              }}>
                Enter your credentials to access the platform
              </p>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                  padding: '0.8rem 1.0rem', marginBottom: '1.4rem',
                  borderRadius: '0.8rem',
                  background: 'var(--color-semantics-red-1)',
                  color:      'var(--color-semantics-red-7)',
                  fontSize:   'var(--text-fs-12)',
                  border: '1px solid var(--color-semantics-red-2)',
                }}
              >
                <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* Email */}
              <div>
                <label style={{
                  display: 'block', marginBottom: '0.4rem',
                  color: 'var(--color-neutral-8)', fontSize: 10,
                  fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={13} style={{
                    position: 'absolute', left: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-neutral-6)',
                  }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@acmecorp.com"
                    required
                    autoComplete="email"
                    className="hrms-input"
                    style={{ paddingLeft: '3.4rem' }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{
                    color: 'var(--color-neutral-8)', fontSize: 10,
                    fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>
                    Password
                  </label>
                  <button
                    type="button"
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--color-vr-blue-6)',
                      fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <Lock size={13} style={{
                    position: 'absolute', left: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-neutral-6)',
                  }} />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="hrms-input"
                    style={{ paddingLeft: '3.4rem', paddingRight: '3.4rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    tabIndex={-1}
                    style={{
                      position: 'absolute', right: 12, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--color-neutral-6)',
                    }}
                  >
                    {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="hrms-btn-primary"
                style={{ width: '100%', marginTop: 4, padding: '1.0rem' }}
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Authenticating…</>
                  : 'Sign in'}
              </button>
            </form>

            {/* Demo credentials */}
            <div
              style={{
                marginTop: '1.6rem', padding: '1.0rem',
                borderRadius: '0.8rem',
                background:   'var(--color-vr-blue-1)',
                border:       '1px solid #B9C9E1',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.6rem' }}>
                <Shield size={11} style={{ color: 'var(--color-vr-blue-7)' }} />
                <p style={{
                  margin: 0, fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                  color: 'var(--color-vr-blue-7)', letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}>
                  Demo Credentials
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {DEMO_ACCOUNTS.map((d) => (
                  <button
                    key={d.role}
                    type="button"
                    onClick={() => { setEmail(d.email); setPassword(d.pw); }}
                    style={{
                      width: '100%', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.6rem', borderRadius: '0.6rem',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 120ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.7)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: 'var(--color-neutral-8)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                      {d.role}
                    </span>
                    <span style={{ color: 'var(--color-vr-blue-7)', fontSize: 10, fontFamily: 'monospace' }}>
                      {d.email}
                    </span>
                  </button>
                ))}
              </div>
              <p style={{
                margin: '0.6rem 0 0 0', textAlign: 'center', fontSize: 10,
                color: 'var(--color-neutral-7)',
              }}>
                Click a row to auto-fill · POST /api/seed first
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p style={{
          margin: '1.4rem 0 0 0', textAlign: 'center', fontSize: 10,
          color: 'var(--color-neutral-7)', letterSpacing: '0.04em',
        }}>
          © 2026 HRMS Pro · Enterprise Edition · Zero-Trust Security
        </p>
      </div>
    </div>
  );
}
