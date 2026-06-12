'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown, Settings } from 'lucide-react';
import { type UserRole } from '@/models/workspace.models';
import { NotificationBell, NotificationDrawer } from './NotificationDrawer';

// ─────────────────────────────────────────────────────────────────────────────
// Sticky 56px top bar — Ghost White bg, single bottom border-stroke.
// Real notification bell with unread badge.
// Settings icon → /settings.
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  super_admin:        '#783489',
  hr_admin:           'var(--color-vr-blue-7)',
  hr_manager:         'var(--color-vr-blue-7)',
  payroll_officer:    'var(--color-semantics-green-7)',
  finance_auditor:    'var(--color-semantics-orange-7)',
  compliance_officer: 'var(--color-semantics-orange-7)',
  employee:           'var(--color-neutral-8)',
};

export interface TopBarProps {
  title:    string;
  subtitle?: string;
  role:     UserRole;
  userName: string;
}

export function TopBar({ title, subtitle, role, userName }: TopBarProps) {
  const [search,          setSearch]          = useState('');
  const [notifOpen,       setNotifOpen]       = useState(false);
  const router = useRouter();

  return (
    <>
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: '1.6rem',
          height: 56, padding: '0 2rem',
          background: 'var(--color-neutral-1)',
          borderBottom: '1px solid var(--color-stroke)',
          flexShrink: 0,
        }}
      >
        {/* Title */}
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            margin: 0, color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-14)', lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              margin: 0, marginTop: 2,
              color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Search */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
            <Search size={14} style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--color-neutral-6)',
            }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees, leaves, payroll…"
              className="hrms-input"
              style={{ paddingLeft: '3.2rem', paddingRight: '4rem' }}
            />
            <kbd style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              padding: '0.2rem 0.5rem', borderRadius: '0.4rem',
              background: 'var(--color-neutral-3)',
              color: 'var(--color-neutral-7)', fontSize: 10,
              border: '1px solid var(--color-stroke)',
            }}>
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Live notification bell */}
          <NotificationBell onClick={() => setNotifOpen(true)} />

          {/* Settings */}
          <button
            onClick={() => router.push('/settings')}
            aria-label="Settings"
            style={{
              padding: 8, borderRadius: '0.6rem',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-neutral-7)',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Settings size={16} />
          </button>

          {/* User chip */}
          <button
            onClick={() => router.push('/settings')}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.4rem 0.8rem 0.4rem 0.4rem',
              borderRadius: '0.6rem',
              border: '1px solid var(--color-stroke)',
              background: 'var(--color-neutral-1)',
              cursor: 'pointer', marginLeft: 4,
              transition: 'background 120ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-neutral-1)')}
          >
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--color-vr-blue-6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-neutral-1)',
              fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 10,
            }}>
              {userName.charAt(0).toUpperCase()}
            </span>
            <span style={{
              color: ROLE_COLOR[role] ?? 'var(--color-neutral-8)',
              fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              fontSize: 'var(--text-fs-12)',
            }}>
              {userName.split(' ')[0]}
            </span>
            <ChevronDown size={12} style={{ color: 'var(--color-neutral-6)' }} />
          </button>
        </div>
      </header>

      {/* Notification drawer (portal-style, renders at body level via CSS) */}
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
}
