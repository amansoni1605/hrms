import { type ReactNode } from 'react';
import { type UserRole } from '@/models/workspace.models';

// Server component — renders children only if the active role matches.
//
// Usage:
//   <RoleGate role={session.role} allow="super_admin">…</RoleGate>
//   <RoleGate role={session.role} allow={['hr_admin','hr_manager']}>…</RoleGate>

export interface RoleGateProps {
  role:     UserRole;
  allow:    UserRole | UserRole[];
  children: ReactNode;
}

export function RoleGate({ role, allow, children }: RoleGateProps) {
  const allowed = Array.isArray(allow) ? allow : [allow];
  if (!allowed.includes(role)) return null;
  return <>{children}</>;
}
