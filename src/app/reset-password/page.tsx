'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams }           from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

type Stage = 'validating' | 'form' | 'expired' | 'success';

function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ['#E5E7EB', '#EF4444', '#F59E0B', '#3B82F6', '#10B981'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  if (!password) return null;
  return (
    <div style={{ marginTop: '0.6rem' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: '0.3rem' }}>
        {[1,2,3,4].map((i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= score ? colors[score] : '#E5E7EB',
            transition: 'background 200ms',
          }} />
        ))}
      </div>
      <p style={{ margin: 0, fontSize: '1.1rem', color: colors[score] }}>{labels[score]}</p>
    </div>
  );
}

export default function ResetPasswordPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';
  const source       = searchParams.get('source') ?? '';

  const [stage,    setStage]   = useState<Stage>('validating');
  const [password, setPass]    = useState('');
  const [confirm,  setConfirm] = useState('');
  const [showPw,   setShowPw]  = useState(false);
  const [showCf,   setShowCf]  = useState(false);
  const [loading,  setLoad]    = useState(false);
  const [error,    setError]   = useState('');

  // Validate token on mount
  useEffect(() => {
    if (!token) { setStage('expired'); return; }
    const qs = source ? `?token=${token}&source=${source}` : `?token=${token}`;
    fetch(`/api/auth/reset-password${qs}`)
      .then((r) => r.json())
      .then((d) => setStage(d.valid ? 'form' : 'expired'))
      .catch(() => setStage('expired'));
  }, [token, source]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoad(true);
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, source: source || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to reset password'); return; }
      setStage('success');
      setTimeout(() => router.push('/login'), 3000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoad(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F7F9FC', padding: '2rem', position: 'relative', overflow: 'hidden',
    }}>
      {/* Background orbs */}
      <div style={{ position: 'fixed', top: -120, right: -120, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(28,80,157,0.07), transparent)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -100, left: -100, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(120,52,137,0.06), transparent)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '2.4rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: '0.8rem', background: 'linear-gradient(135deg, #1C509D, #783489)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: '1.6rem' }}>H</span>
          </div>
          <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, color: '#212427', fontSize: '1.8rem' }}>HRMS Pro</p>
        </div>

        <div style={{ background: '#fff', borderRadius: '1.2rem', padding: '2.4rem 2.8rem', boxShadow: '0 4px 24px rgba(0,0,0,0.07)', border: '1px solid #E8EEF5' }}>

          {/* Validating */}
          {stage === 'validating' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <Loader2 size={32} style={{ color: '#1C509D', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
              <p style={{ margin: 0, color: '#8C8C8C', fontSize: '1.4rem' }}>Validating your reset link…</p>
            </div>
          )}

          {/* Expired */}
          {stage === 'expired' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FFF1F0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.4rem' }}>
                <AlertCircle size={26} style={{ color: '#CF1322' }} />
              </div>
              <h2 style={{ margin: '0 0 0.6rem', fontFamily: 'var(--font-jk-bd)', fontSize: '2rem', color: '#212427' }}>Link expired</h2>
              <p style={{ margin: '0 0 2rem', fontSize: '1.3rem', color: '#8C8C8C', lineHeight: 1.6 }}>
                This password reset link is invalid or has expired. Reset links are valid for 1 hour.
              </p>
              <button onClick={() => router.push('/login')} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.9rem 1.6rem', borderRadius: '0.8rem', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #1C509D, #14396F)', color: '#fff',
                fontSize: '1.3rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              }}>
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </div>
          )}

          {/* Success */}
          {stage === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.4rem' }}>
                <CheckCircle2 size={26} style={{ color: '#16A34A' }} />
              </div>
              <h2 style={{ margin: '0 0 0.6rem', fontFamily: 'var(--font-jk-bd)', fontSize: '2rem', color: '#212427' }}>Password updated!</h2>
              <p style={{ margin: '0 0 0.4rem', fontSize: '1.3rem', color: '#8C8C8C' }}>
                Your password has been changed successfully.
              </p>
              <p style={{ margin: 0, fontSize: '1.2rem', color: '#BFBFBF' }}>Redirecting to sign in…</p>
            </div>
          )}

          {/* Form */}
          {stage === 'form' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: '2.2rem', color: '#212427', letterSpacing: '-0.01em' }}>
                  Set new password
                </h2>
                <p style={{ margin: 0, fontSize: '1.3rem', color: '#8C8C8C' }}>
                  Choose a strong password for your account.
                </p>
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.9rem 1.1rem', marginBottom: '1.4rem', borderRadius: '0.8rem', background: '#FFF1F0', color: '#CF1322', border: '1px solid #FFA39E', fontSize: '1.3rem' }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />{error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
                {/* New password */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '1.2rem', fontWeight: 600, color: '#595959', fontFamily: 'var(--font-in-sb)' }}>
                    New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#BFBFBF', pointerEvents: 'none' }} />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPass(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      autoComplete="new-password"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '1.1rem 4rem 1.1rem 3.8rem', borderRadius: '0.9rem', border: '1.5px solid #E8EEF5', background: '#fff', fontSize: '1.4rem', color: '#212427', outline: 'none', transition: 'border-color 150ms', fontFamily: 'var(--font-in-rg)' }}
                      onFocus={(e) => (e.target.style.borderColor = '#1C509D')}
                      onBlur={(e)  => (e.target.style.borderColor = '#E8EEF5')}
                    />
                    <button type="button" onClick={() => setShowPw((v) => !v)} tabIndex={-1} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#BFBFBF', padding: 4 }}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <StrengthBar password={password} />
                </div>

                {/* Confirm password */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '1.2rem', fontWeight: 600, color: '#595959', fontFamily: 'var(--font-in-sb)' }}>
                    Confirm Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#BFBFBF', pointerEvents: 'none' }} />
                    <input
                      type={showCf ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      required
                      autoComplete="new-password"
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '1.1rem 4rem 1.1rem 3.8rem',
                        borderRadius: '0.9rem',
                        border: `1.5px solid ${confirm && confirm !== password ? '#FCA5A5' : '#E8EEF5'}`,
                        background: confirm && confirm !== password ? '#FFF5F5' : '#fff',
                        fontSize: '1.4rem', color: '#212427', outline: 'none', transition: 'border-color 150ms',
                        fontFamily: 'var(--font-in-rg)',
                      }}
                      onFocus={(e) => { if (confirm === password || !confirm) e.target.style.borderColor = '#1C509D'; }}
                      onBlur={(e)  => { e.target.style.borderColor = confirm && confirm !== password ? '#FCA5A5' : '#E8EEF5'; }}
                    />
                    <button type="button" onClick={() => setShowCf((v) => !v)} tabIndex={-1} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#BFBFBF', padding: 4 }}>
                      {showCf ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {confirm && confirm !== password && (
                    <p style={{ margin: '0.4rem 0 0', fontSize: '1.1rem', color: '#EF4444' }}>Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || (!!confirm && confirm !== password)}
                  style={{
                    width: '100%', padding: '1.2rem', marginTop: '0.4rem',
                    borderRadius: '0.9rem', border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    background: loading ? '#678ABD' : 'linear-gradient(135deg, #1C509D 0%, #14396F 100%)',
                    color: '#fff', fontSize: '1.4rem',
                    fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                    boxShadow: loading ? 'none' : '0 4px 16px rgba(28,80,157,0.3)',
                  }}
                >
                  {loading ? <><Loader2 size={15} className="animate-spin" /> Updating…</> : 'Set new password'}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ margin: '1.6rem 0 0', textAlign: 'center', fontSize: '1.2rem', color: '#BFBFBF' }}>
          Remember your password?{' '}
          <button onClick={() => router.push('/login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1C509D', fontSize: '1.2rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
