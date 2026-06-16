'use client';

import { useState, type FormEvent } from 'react';
import { useRouter }                from 'next/navigation';
import {
  Eye, EyeOff, Loader2, Lock, Mail, AlertCircle,
  Users, BarChart3, Shield, Zap, ArrowRight, ChevronLeft, CheckCircle2,
} from 'lucide-react';
import type { TenantBranding } from './page';

const DEMO_ACCOUNTS = [
  { role: 'HR Admin',   email: 'meera.iyer@valueresearch.in',  pw: 'Welcome@1234', color: '#783489' },
  { role: 'Manager',    email: 'dhruv.mehta@valueresearch.in', pw: 'Welcome@1234', color: '#1C509D' },
  { role: 'Employee',   email: 'aarav.shah@valueresearch.in',  pw: 'Welcome@1234', color: '#0F7B6C' },
];

const FEATURES = [
  { icon: Users,    text: '60+ employees across 10 departments' },
  { icon: BarChart3,text: 'Real-time analytics & burnout AI'    },
  { icon: Shield,   text: 'Zero-trust · AES-256-GCM encrypted' },
  { icon: Zap,      text: 'Talent pipeline · Learning paths'    },
];

export default function LoginClient({ branding }: { branding: TenantBranding | null }) {
  const router = useRouter();
  const [email,      setEmail]     = useState('');
  const [password,   setPassword]  = useState('');
  const [showPw,     setShowPw]    = useState(false);
  const [loading,    setLoading]   = useState(false);
  const [error,      setError]     = useState('');
  const [forgotMode, setForgotMode]= useState(false);
  const [fpEmail,    setFpEmail]   = useState('');
  const [fpLoading,  setFpLoading] = useState(false);
  const [fpDone,     setFpDone]    = useState(false);
  const [fpError,    setFpError]   = useState('');

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setFpError('');
    setFpLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail }),
      });
      setFpDone(true);
    } catch {
      setFpError('Network error. Please try again.');
    } finally {
      setFpLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
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
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0C1628' }}>

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'none',
        width: '46%', flexShrink: 0, position: 'relative', overflow: 'hidden',
        background: branding?.loginBgData
          ? 'transparent'
          : 'linear-gradient(145deg, #0C1628 0%, #0F2C56 45%, #1C3A6E 70%, #2B1A4A 100%)',
      }}
        className="login-left-panel"
      >
        {/* Custom background image */}
        {branding?.loginBgData && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${branding.loginBgData})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }} />
        )}

        {/* Dark overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `rgba(0,0,0,${branding?.loginBgData ? (branding.loginBgOverlay ?? 0.45) : 0})`,
          pointerEvents: 'none',
        }} />

        {/* Default gradient orbs — only shown without custom image */}
        {!branding?.loginBgData && (<>
          <div style={{
            position: 'absolute', top: -120, right: -120,
            width: 400, height: 400, borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(120,52,137,0.35), transparent)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: -80, left: -80,
            width: 300, height: 300, borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(28,80,157,0.4), transparent)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', top: '40%', left: '60%',
            width: 180, height: 180, borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(73,115,177,0.2), transparent)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.04, pointerEvents: 'none',
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }} />
        </>)}

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 1, height: '100%',
          display: 'flex', flexDirection: 'column',
          padding: '3.2rem 3.6rem',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            {branding?.logoData ? (
              <img src={branding.logoData} alt="logo" style={{ height: 42, width: 42, objectFit: 'contain', borderRadius: '0.6rem' }} />
            ) : (
              <div style={{
                width: 42, height: 42, borderRadius: '0.9rem',
                background: 'linear-gradient(135deg, #1C509D, #783489)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(28,80,157,0.5)',
              }}>
                <span style={{ color: '#fff', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: '1.8rem' }}>H</span>
              </div>
            )}
            <div>
              <p style={{ margin: 0, color: '#fff', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: '1.8rem', lineHeight: 1 }}>
                {branding?.legalName ?? 'HRMS Pro'}
              </p>
              <p style={{ margin: 0, marginTop: 3, color: 'rgba(255,255,255,0.45)', fontSize: '1.0rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                Enterprise Platform
              </p>
            </div>
          </div>

          {/* Hero text */}
          <div style={{ marginTop: 'auto', marginBottom: '2.4rem' }}>
            <h1 style={{
              margin: 0, color: '#fff',
              fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
              fontSize: 'clamp(2.4rem, 3vw, 3.2rem)', lineHeight: 1.2,
              letterSpacing: '-0.02em',
            }}>
              Your entire
              <span style={{
                display: 'block',
                background: 'linear-gradient(90deg, #97AFD2, #C89FD8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                workforce, unified.
              </span>
            </h1>
            <p style={{
              margin: '1.2rem 0 0', color: 'rgba(255,255,255,0.55)',
              fontSize: '1.4rem', lineHeight: 1.7, maxWidth: 340,
            }}>
              {branding?.loginTagline ?? 'From hire to retire — recruitment, onboarding, payroll, and performance in one zero-trust platform.'}
            </p>
          </div>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.0rem', marginBottom: '3rem' }}>
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '0.6rem', flexShrink: 0,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={13} color="rgba(255,255,255,0.7)" />
                </div>
                <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1.3rem' }}>{text}</span>
              </div>
            ))}
          </div>

          {/* Status badge */}
          <div style={{
            padding: '0.8rem 1.2rem', borderRadius: '0.8rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
            alignSelf: 'flex-start',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px #34D399' }} />
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem' }}>
              Value Research Pvt Ltd · All systems operational
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (form) ──────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#F7F9FC', padding: '2rem',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -100, right: -100,
          width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(28,80,157,0.06), transparent)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -80, left: -80,
          width: 260, height: 260, borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(120,52,137,0.05), transparent)',
          pointerEvents: 'none',
        }} />

        <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

          {/* Mobile-only logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '2.8rem' }} className="login-mobile-logo">
            {branding?.logoData ? (
              <img src={branding.logoData} alt="logo" style={{ height: 36, width: 36, objectFit: 'contain', borderRadius: '0.6rem' }} />
            ) : (
              <div style={{
                width: 36, height: 36, borderRadius: '0.8rem',
                background: 'linear-gradient(135deg, #1C509D, #783489)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#fff', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: '1.6rem' }}>H</span>
              </div>
            )}
            <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, color: '#212427', fontSize: '1.8rem' }}>
              {branding?.legalName ?? 'HRMS Pro'}
            </p>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: '2.4rem' }}>
            <h2 style={{
              margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
              fontSize: '2.4rem', color: '#212427', letterSpacing: '-0.01em',
            }}>
              Welcome back
            </h2>
            <p style={{ margin: '0.4rem 0 0', fontSize: '1.3rem', color: '#8C8C8C' }}>
              Sign in to your workspace to continue
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.7rem',
              padding: '1rem 1.2rem', marginBottom: '1.6rem',
              borderRadius: '0.9rem', fontSize: '1.3rem',
              background: '#FFF1F0', color: '#CF1322',
              border: '1px solid #FFA39E',
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
            <div>
              <label style={{
                display: 'block', marginBottom: '0.6rem',
                fontSize: '1.2rem', fontWeight: 600, color: '#595959',
                fontFamily: 'var(--font-in-sb)',
              }}>
                Work Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{
                  position: 'absolute', left: 14, top: '50%',
                  transform: 'translateY(-50%)', color: '#BFBFBF', pointerEvents: 'none',
                }} />
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com" required autoComplete="email"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '1.1rem 1.4rem 1.1rem 3.8rem', borderRadius: '0.9rem',
                    border: '1.5px solid #E8EEF5', background: '#fff',
                    fontSize: '1.4rem', color: '#212427',
                    outline: 'none', transition: 'border-color 150ms',
                    fontFamily: 'var(--font-in-rg)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#1C509D')}
                  onBlur={(e)  => (e.target.style.borderColor = '#E8EEF5')}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '1.2rem', fontWeight: 600, color: '#595959', fontFamily: 'var(--font-in-sb)' }}>
                  Password
                </label>
                <button type="button" onClick={() => { setForgotMode(true); setFpEmail(email); setFpDone(false); setFpError(''); }} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '1.2rem', color: '#1C509D', fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                }}>
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{
                  position: 'absolute', left: 14, top: '50%',
                  transform: 'translateY(-50%)', color: '#BFBFBF', pointerEvents: 'none',
                }} />
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '1.1rem 4rem 1.1rem 3.8rem', borderRadius: '0.9rem',
                    border: '1.5px solid #E8EEF5', background: '#fff',
                    fontSize: '1.4rem', color: '#212427',
                    outline: 'none', transition: 'border-color 150ms',
                    fontFamily: 'var(--font-in-rg)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#1C509D')}
                  onBlur={(e)  => (e.target.style.borderColor = '#E8EEF5')}
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} tabIndex={-1} style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#BFBFBF', padding: 4,
                }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '1.2rem', borderRadius: '0.9rem',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#678ABD' : 'linear-gradient(135deg, #1C509D 0%, #14396F 100%)',
                color: '#fff', fontSize: '1.4rem',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(28,80,157,0.35)',
                transition: 'all 150ms ease', marginTop: '0.4rem',
              }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Authenticating…</>
                : <><span>Sign in</span><ArrowRight size={15} /></>
              }
            </button>
          </form>

          {/* ── Forgot password panel ──────────────────────────────────── */}
          {forgotMode && (
            <div style={{
              marginTop: '1.6rem', padding: '1.6rem',
              borderRadius: '1rem', background: '#F7F9FC',
              border: '1.5px solid #E8EEF5',
            }}>
              {!fpDone ? (
                <>
                  <button onClick={() => setForgotMode(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#8C8C8C', fontSize: '1.2rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600, padding: 0, marginBottom: '1rem' }}>
                    <ChevronLeft size={14} /> Back to sign in
                  </button>
                  <p style={{ margin: '0 0 0.3rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: '1.6rem', color: '#212427' }}>Reset password</p>
                  <p style={{ margin: '0 0 1.2rem', fontSize: '1.2rem', color: '#8C8C8C' }}>
                    Enter your work email and we&apos;ll send you a reset link.
                  </p>
                  {fpError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 0.9rem', marginBottom: '1rem', borderRadius: '0.7rem', background: '#FFF1F0', color: '#CF1322', border: '1px solid #FFA39E', fontSize: '1.2rem' }}>
                      <AlertCircle size={13} />{fpError}
                    </div>
                  )}
                  <form onSubmit={handleForgot} style={{ display: 'flex', gap: '0.6rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Mail size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#BFBFBF', pointerEvents: 'none' }} />
                      <input
                        type="email" value={fpEmail} onChange={(e) => setFpEmail(e.target.value)}
                        placeholder="your@email.com" required autoComplete="email"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '0.9rem 1rem 0.9rem 3.2rem', borderRadius: '0.8rem', border: '1.5px solid #E8EEF5', background: '#fff', fontSize: '1.3rem', color: '#212427', outline: 'none', fontFamily: 'var(--font-in-rg)' }}
                        onFocus={(e) => (e.target.style.borderColor = '#1C509D')}
                        onBlur={(e)  => (e.target.style.borderColor = '#E8EEF5')}
                      />
                    </div>
                    <button type="submit" disabled={fpLoading} style={{ padding: '0.9rem 1.4rem', borderRadius: '0.8rem', border: 'none', cursor: fpLoading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #1C509D, #14396F)', color: '#fff', fontSize: '1.3rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {fpLoading ? <Loader2 size={14} className="animate-spin" /> : 'Send link'}
                    </button>
                  </form>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '0.4rem 0' }}>
                  <CheckCircle2 size={32} style={{ color: '#16A34A', marginBottom: '0.8rem' }} />
                  <p style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: '1.5rem', color: '#212427' }}>Check your inbox</p>
                  <p style={{ margin: '0 0 1.2rem', fontSize: '1.2rem', color: '#8C8C8C', lineHeight: 1.6 }}>
                    If <strong>{fpEmail}</strong> is registered, a reset link has been sent. Check your spam folder too.
                  </p>
                  <button onClick={() => { setForgotMode(false); setFpDone(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1C509D', fontSize: '1.2rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                    Back to sign in
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '2rem 0' }}>
            <div style={{ flex: 1, height: 1, background: '#E8EEF5' }} />
            <span style={{ fontSize: '1.1rem', color: '#BFBFBF', fontFamily: 'var(--font-in-rg)', whiteSpace: 'nowrap' }}>
              Demo accounts
            </span>
            <div style={{ flex: 1, height: 1, background: '#E8EEF5' }} />
          </div>

          {/* Demo accounts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {DEMO_ACCOUNTS.map((d) => (
              <button
                key={d.role} type="button"
                onClick={() => { setEmail(d.email); setPassword(d.pw); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '0.85rem 1.1rem', borderRadius: '0.8rem',
                  background: '#fff', border: '1.5px solid #E8EEF5',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 120ms ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = d.color;
                  (e.currentTarget as HTMLButtonElement).style.background  = '#FAFBFF';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8EEF5';
                  (e.currentTarget as HTMLButtonElement).style.background  = '#fff';
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '0.5rem', flexShrink: 0,
                  background: d.color + '15',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem', fontWeight: 700, color: d.color,
                  fontFamily: 'var(--font-jk-bd)',
                }}>
                  {d.role[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: '#212427', fontFamily: 'var(--font-in-sb)' }}>
                    {d.role}
                  </p>
                  <p style={{ margin: 0, fontSize: '1.1rem', color: '#8C8C8C', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.email}
                  </p>
                </div>
                <span style={{ fontSize: '1.1rem', color: '#BFBFBF', flexShrink: 0 }}>click to fill →</span>
              </button>
            ))}
          </div>

          <p style={{
            margin: '2.4rem 0 0', textAlign: 'center',
            fontSize: '1.1rem', color: '#BFBFBF',
          }}>
            © 2026 HRMS Pro · Enterprise Edition ·{' '}
            <span style={{ color: '#1C509D' }}>Zero-Trust Security</span>
          </p>
        </div>
      </div>

      <style>{`
        @media (min-width: 900px) {
          .login-left-panel  { display: flex !important; }
          .login-mobile-logo { display: none !important; }
        }
        @media (max-width: 899px) {
          .login-mobile-logo { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
