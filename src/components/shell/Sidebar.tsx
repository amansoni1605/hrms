'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { type UserRole } from '@/models/workspace.models';
import {
  LayoutDashboard, Users, DollarSign, Calendar, BarChart3,
  Shield, Settings, Building2, ChevronLeft, ChevronRight,
  Bot, Globe, Cpu, LogOut, Activity, FileText, Target, BadgeDollarSign, User, UsersRound,
  CreditCard, Lock, Flag, Clock, Receipt, Briefcase, BookOpen, UserCheck, UserMinus,
  SlidersHorizontal, GitBranch,
} from 'lucide-react';
import { useEffect } from 'react';
import { type FeatureKey } from '@/lib/plans';

// ─────────────────────────────────────────────────────────────────────────────
// Permanent left rail.  Width: 240px expanded / 60px collapsed.
// Background: var(--color-neutral-1).  Right border: var(--color-stroke).
// All nav items use `.hrms-nav-item` from globals.css.
// ─────────────────────────────────────────────────────────────────────────────

type NavItem  = { label: string; href: string; icon: React.ElementType; badge?: string; feature?: FeatureKey; adminOnly?: boolean };
type NavGroup = { heading: string; items: NavItem[] };

const EMPLOYEE_NAV: NavGroup[] = [
  { heading: 'My Workspace', items: [
    { label: 'Dashboard',    href: '/dashboard',      icon: LayoutDashboard },
    { label: 'My Profile',   href: '/my/profile',     icon: User },
    { label: 'My Attendance',href: '/my/attendance',  icon: Clock },
    { label: 'My Leaves',    href: '/my/leaves',      icon: Calendar },
    { label: 'My Expenses',  href: '/my/expenses',    icon: Receipt },
    { label: 'My Payslips',  href: '/payroll',        icon: DollarSign },
    { label: 'My Reviews',   href: '/my/performance', icon: Target },
    { label: 'My Goals',     href: '/my/goals',       icon: Flag },
    { label: 'My Assets',    href: '/my/assets',      icon: Cpu },
    { label: 'My Equity',    href: '/my/equity',      icon: FileText },
    { label: 'Tax Studio',   href: '/my/tax',         icon: Activity },
  ]},
];

// Manager nav — own workspace + team management only; no org-wide HR sections
const MANAGER_NAV: NavGroup[] = [
  { heading: 'My Workspace', items: [
    { label: 'Dashboard',      href: '/dashboard',      icon: LayoutDashboard },
    { label: 'My Profile',     href: '/my/profile',     icon: User },
    { label: 'My Attendance',  href: '/my/attendance',  icon: Clock },
    { label: 'My Leaves',      href: '/my/leaves',      icon: Calendar },
    { label: 'My Expenses',    href: '/my/expenses',    icon: Receipt },
    { label: 'My Payslips',    href: '/payroll',        icon: DollarSign },
    { label: 'My Reviews',     href: '/my/performance', icon: Target },
    { label: 'My Goals',       href: '/my/goals',       icon: Flag },
    { label: 'My Assets',      href: '/my/assets',      icon: Cpu },
    { label: 'My Equity',      href: '/my/equity',      icon: FileText },
    { label: 'Tax Studio',     href: '/my/tax',         icon: Activity },
  ]},
  { heading: 'My Team', items: [
    { label: 'Team Overview',  href: '/my/team',               icon: UsersRound },
    { label: 'Team Leaves',    href: '/leaves',                icon: Calendar },
    { label: 'Team Attendance',href: '/attendance',            icon: Clock },
    { label: 'Team Expenses',  href: '/expenses',              icon: Receipt },
    { label: 'Performance',    href: '/performance',           icon: Target,          feature: 'performance' },
    { label: 'Comp Approvals', href: '/performance/approvals', icon: BadgeDollarSign, feature: 'performance' },
  ]},
  { heading: 'Configuration', items: [
    { label: 'Settings',       href: '/settings',              icon: Settings },
  ]},
];

const HR_NAV: NavGroup[] = [
  { heading: 'Workforce', items: [
    { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard },
    { label: 'My Team',     href: '/my/team',     icon: UsersRound },
    { label: 'My Goals',    href: '/my/goals',    icon: Flag, feature: 'performance' },
    { label: 'Employees',   href: '/employees',   icon: Users },
    { label: 'Departments', href: '/departments', icon: Building2 },
  ]},
  { heading: 'Operations', items: [
    { label: 'Attendance',    href: '/attendance',  icon: Clock },
    { label: 'Leaves',        href: '/leaves',      icon: Calendar },
    { label: 'Expenses',      href: '/expenses',    icon: Receipt },
    { label: 'Payroll',       href: '/payroll',     icon: DollarSign, feature: 'payroll' },
    { label: 'Performance',   href: '/performance',          icon: Target, feature: 'performance' },
    { label: 'Comp Approvals',href: '/performance/approvals',icon: BadgeDollarSign, feature: 'performance' },
    { label: 'Analytics',     href: '/analytics',            icon: BarChart3, feature: 'analytics' },
    { label: 'Burnout AI',    href: '/burnout',              icon: Activity, feature: 'analytics' },
  ]},
  { heading: 'Talent', items: [
    { label: 'Recruitment',      href: '/recruitment', icon: Briefcase },
    { label: 'Talent Pipeline',  href: '/talent',      icon: GitBranch },
    { label: 'Onboarding',       href: '/onboarding',  icon: UserCheck },
    { label: 'Training',         href: '/training',    icon: BookOpen },
    { label: 'Separation',       href: '/separation',  icon: UserMinus },
  ]},
  { heading: 'Compliance', items: [
    { label: 'Immigration',     href: '/immigration',     icon: Globe, feature: 'immigration' },
    { label: 'Leave Calendar',  href: '/leaves/calendar', icon: Calendar },
    { label: 'Audit Logs',      href: '/audit',           icon: Shield },
  ]},
  { heading: 'Configuration', items: [
    { label: 'HR Settings',     href: '/hr-settings', icon: SlidersHorizontal, adminOnly: true },
    { label: 'Billing & Plans', href: '/billing',     icon: CreditCard, adminOnly: true },
    { label: 'Settings',        href: '/settings',    icon: Settings },
  ]},
];

const ADMIN_NAV: NavGroup[] = [
  { heading: 'Platform', items: [
    { label: 'Control Room',  href: '/dashboard',            icon: LayoutDashboard },
    { label: 'All Tenants',   href: '/admin/tenants',        icon: Building2 },
    { label: 'System Health', href: '/admin/system-health',  icon: Activity },
  ]},
  { heading: 'Workforce', items: [
    { label: 'Employees',     href: '/employees',    icon: Users },
    { label: 'Attendance',    href: '/attendance',   icon: Clock },
    { label: 'Expenses',      href: '/expenses',     icon: Receipt },
    { label: 'Payroll',       href: '/payroll',      icon: DollarSign, feature: 'payroll' },
    { label: 'Performance',   href: '/performance',  icon: Target, feature: 'performance' },
    { label: 'Comp Approvals',href: '/performance/approvals', icon: BadgeDollarSign, feature: 'performance' },
    { label: 'Analytics',     href: '/analytics',    icon: BarChart3, feature: 'analytics' },
  ]},
  { heading: 'Talent', items: [
    { label: 'Recruitment',   href: '/recruitment',  icon: Briefcase },
    { label: 'Onboarding',    href: '/onboarding',   icon: UserCheck },
    { label: 'Training',      href: '/training',     icon: BookOpen },
    { label: 'Separation',    href: '/separation',   icon: UserMinus },
  ]},
  { heading: 'Security', items: [
    { label: 'Audit Ledger',  href: '/audit',                icon: Shield },
    { label: 'AI Workers',    href: '/admin/ai-workers',     icon: Bot, feature: 'immigration' },
    { label: 'DEK Rotation',  href: '/admin/dek-rotation',   icon: Cpu },
  ]},
  { heading: 'Configuration', items: [
    { label: 'HR Settings',     href: '/hr-settings', icon: SlidersHorizontal },
    { label: 'Billing & Plans', href: '/billing',     icon: CreditCard },
    { label: 'App Settings',    href: '/settings',    icon: Settings },
  ]},
];

function getNav(role: UserRole): NavGroup[] {
  if (role === 'super_admin') return ADMIN_NAV;
  if (role === 'hr_manager') return MANAGER_NAV;
  if (['hr_admin','payroll_officer','finance_auditor','compliance_officer'].includes(role)) return HR_NAV;
  return EMPLOYEE_NAV;
}

const ROLE_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  super_admin:        { label: 'Super Admin', bg: '#F6EDF9', fg: '#783489' },
  hr_admin:           { label: 'HR Admin',    bg: '#E8EEF5', fg: '#1C509D' },
  hr_manager:         { label: 'Manager',     bg: '#E8EEF5', fg: '#1C509D' },
  payroll_officer:    { label: 'Payroll',     bg: '#E7F6ED', fg: '#0E883F' },
  finance_auditor:    { label: 'Auditor',     bg: '#FFF6E6', fg: '#D98C00' },
  compliance_officer: { label: 'Compliance',  bg: '#FFF6E6', fg: '#D98C00' },
  employee:           { label: 'Employee',    bg: '#F5F5F5', fg: '#595959' },
  digital_worker:     { label: 'AI Agent',    bg: '#E5F4FF', fg: '#3759BF' },
  readonly:           { label: 'Read Only',   bg: '#F5F5F5', fg: '#8C8C8C' },
};

export interface SidebarProps {
  role:        UserRole;
  userName:    string;
  userEmail:   string;
  logoData?:   string;      // base64 data-URL from tenant.logoData
  brandColor?: string;      // hex, e.g. "#1C509D"
  tenantName?: string;      // display name to show under the logo
  hiddenTabs?: string[];    // hrefs hidden for this employee by HR
}

export function Sidebar({ role, userName, userEmail, logoData, brandColor, tenantName, hiddenTabs = [] }: SidebarProps) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [features, setFeatures]   = useState<FeatureKey[] | null>(null);

  // Tenant plan entitlements — used to lock premium nav modules.
  useEffect(() => {
    fetch('/api/me/entitlements')
      .then((r) => r.json())
      .then((d) => setFeatures(d.data?.features ?? []))
      .catch(() => setFeatures([]));
  }, []);

  const navGroups = getNav(role);
  const badge     = ROLE_BADGE[role] ?? ROLE_BADGE['employee']!;
  const W         = collapsed ? 60 : 240;

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <aside
      style={{
        width:        W,
        minHeight:    '100vh',
        background:   'var(--color-neutral-1)',
        borderRight:  '1px solid var(--color-stroke)',
        flexShrink:   0,
        display:      'flex',
        flexDirection:'column',
        transition:   'width 180ms ease',
      }}
    >
      {/* ── Logo / branding ─────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            '0.8rem',
          padding:        collapsed ? '1.4rem 0' : '1.4rem 1.6rem',
          borderBottom:   '1px solid var(--color-stroke)',
          justifyContent: collapsed ? 'center' : 'flex-start',
          minHeight:      56,
        }}
      >
        {/* Logo mark — shows tenant logo if available, else brand-colored initial */}
        <div
          style={{
            width: 28, height: 28, borderRadius: '0.6rem',
            background: logoData ? 'transparent' : (brandColor ?? 'var(--color-vr-blue-6)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            border: logoData ? '1px solid var(--color-stroke)' : 'none',
          }}
        >
          {logoData
            ? <img src={logoData} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : (
              <span style={{ color: '#fff', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
                {(tenantName ?? 'H').charAt(0).toUpperCase()}
              </span>
            )
          }
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <p style={{
              color: 'var(--color-neutral-10)',
              fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
              fontSize: 'var(--text-fs-14)',
              lineHeight: 1, margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {tenantName ?? 'HRMS Pro'}
            </p>
            <p style={{
              color: 'var(--color-neutral-7)',
              fontSize: 10, marginTop: 2, letterSpacing: '0.12em',
              textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              HR Workspace
            </p>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────── */}
      <nav
        className="custom-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 0.8rem' }}
      >
        {navGroups.map((group) => (
          <div key={group.heading} style={{ marginBottom: '1.6rem' }}>
            {!collapsed && (
              <p
                className="hrms-section-label"
                style={{ padding: '0 0.8rem', marginBottom: '0.4rem' }}
              >
                {group.heading}
              </p>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items
                .filter((item) => !(item.adminOnly && role !== 'hr_admin' && role !== 'super_admin'))
                .filter((item) => !hiddenTabs.includes(item.href))
                .map(({ label, href, icon: Icon, badge: itemBadge, feature }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
                const locked = !!feature && features !== null && !features.includes(feature);
                return (
                  <li key={href}>
                    <Link
                      href={locked ? '/billing' : href}
                      title={collapsed ? (locked ? `${label} — upgrade to unlock` : label) : undefined}
                      className={active ? 'hrms-nav-item hrms-nav-item--active' : 'hrms-nav-item'}
                      style={collapsed
                        ? { justifyContent: 'center', padding: '0.8rem 0' }
                        : (locked ? { opacity: 0.55 } : undefined)}
                    >
                      <Icon size={16} style={{ flexShrink: 0, opacity: active ? 1 : 0.8 }} />
                      {!collapsed && <span style={{ flex: 1, minWidth: 0 }}>{label}</span>}
                      {!collapsed && locked && (
                        <Lock size={12} style={{ flexShrink: 0, color: 'var(--color-neutral-6)' }} />
                      )}
                      {!collapsed && !locked && itemBadge && (
                        <span
                          style={{
                            padding: '0.1rem 0.5rem', borderRadius: '0.4rem',
                            background: 'var(--color-semantics-orange-1)',
                            color: 'var(--color-semantics-orange-7)',
                            fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                          }}
                        >
                          {itemBadge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--color-stroke)', padding: '1rem 0.8rem' }}>
        {/* Role pill */}
        {!collapsed && (
          <div
            style={{
              margin: '0 0.4rem 0.8rem 0.4rem', padding: '0.3rem 0.8rem',
              borderRadius: '0.6rem',
              background: badge.bg, color: badge.fg,
              fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', textAlign: 'center',
            }}
          >
            {badge.label}
          </div>
        )}

        {/* User chip */}
        {!collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.4rem' }}>
            <div
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--color-vr-blue-6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-neutral-1)',
                fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                fontSize: 'var(--text-fs-12)', flexShrink: 0,
              }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)',
                          fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                          margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userName}
              </p>
              <p style={{ color: 'var(--color-neutral-7)', fontSize: 10, margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userEmail}
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '0.4rem' }}>
            <div
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--color-vr-blue-6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-neutral-1)',
                fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                fontSize: 'var(--text-fs-12)',
              }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          className="hrms-nav-item"
          style={{
            width: '100%', justifyContent: collapsed ? 'center' : 'flex-start',
            background: 'transparent', border: 'none', marginTop: '0.4rem',
          }}
        >
          <LogOut size={14} style={{ color: 'var(--color-neutral-7)' }} />
          {!collapsed && <span>Sign out</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hrms-nav-item"
          style={{
            width: '100%', justifyContent: collapsed ? 'center' : 'flex-start',
            background: 'transparent', border: 'none', marginTop: 4,
            color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
          }}
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <><ChevronLeft size={14} /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
