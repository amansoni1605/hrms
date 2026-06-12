import { redirect }       from 'next/navigation';
import { getSession }     from '@/lib/auth';
import { HRCommandCenter } from '@/components/cockpits/HRCommandCenter';
import { type UserRole }  from '@/models/workspace.models';

const HR_ROLES: UserRole[] = [
  'super_admin', 'hr_admin',
  'payroll_officer', 'finance_auditor', 'compliance_officer',
];

export default async function EmployeesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!HR_ROLES.includes(session.role as UserRole)) redirect('/dashboard');
  return <HRCommandCenter />;
}
