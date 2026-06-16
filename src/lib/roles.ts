import type { UserRole } from '@/infrastructure/multiTenantCore';

// Single source of truth for role groupings used across API routes and UI guards.
// Import from here instead of duplicating arrays/Sets in individual files.

export const HR_ROLES: UserRole[] = ['super_admin', 'hr_admin', 'hr_manager'];

export const HR_EXTENDED_ROLES: UserRole[] = [
  'super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'finance_auditor', 'compliance_officer',
];

export const PAYROLL_ROLES: UserRole[] = ['super_admin', 'hr_admin', 'payroll_officer'];

export const FINANCE_ROLES: UserRole[] = ['super_admin', 'hr_admin', 'payroll_officer', 'finance_auditor'];

export const ADMIN_ROLES: UserRole[] = ['super_admin', 'hr_admin'];

export const isHR         = (role: string): boolean => HR_ROLES.includes(role as UserRole);
export const isHRExtended = (role: string): boolean => HR_EXTENDED_ROLES.includes(role as UserRole);
export const isPayroll    = (role: string): boolean => PAYROLL_ROLES.includes(role as UserRole);
export const isAdmin      = (role: string): boolean => ADMIN_ROLES.includes(role as UserRole);
