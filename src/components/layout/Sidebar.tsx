'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, DollarSign, Calendar,
  BarChart3, Settings, Building2, Shield, LogOut,
} from 'lucide-react';

const NAV = [
  { label: 'Dashboard',  href: '/dashboard',   icon: LayoutDashboard },
  { label: 'Employees',  href: '/employees',   icon: Users },
  { label: 'Payroll',    href: '/payroll',      icon: DollarSign },
  { label: 'Leaves',     href: '/leaves',       icon: Calendar },
  { label: 'Analytics',  href: '/analytics',    icon: BarChart3 },
  { label: 'Departments',href: '/departments',  icon: Building2 },
  { label: 'Audit Log',  href: '/audit',        icon: Shield },
  { label: 'Settings',   href: '/settings',     icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <aside className="w-64 bg-gray-950 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">H</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">HRMS Pro</p>
            <p className="text-gray-500 text-xs">Enterprise Edition</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-800 space-y-2">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">HR Admin</p>
            <p className="text-gray-500 text-xs truncate">admin@acmecorp.com</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400
                     hover:text-white hover:bg-gray-800 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
