import { redirect }         from 'next/navigation';
import { getSession }       from '@/lib/auth';
import { RoleGate }         from '@/components/shell/RoleGate';
import { EmployeeCockpit }  from '@/components/cockpits/EmployeeCockpit';
import { HRCommandCenter }  from '@/components/cockpits/HRCommandCenter';
import { AdminControlRoom } from '@/components/cockpits/AdminControlRoom';
import { type UserRole }    from '@/models/workspace.models';

/**
 * Single dashboard route — dynamically mounts the right cockpit based on the
 * active session role.  Server component: zero client-side bundle for the
 * decision logic.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const role       = (session.role ?? 'employee') as UserRole;
  const userName   = session.name  ?? 'User';
  const employeeId = session.employeeId ?? null;

  const HR_ROLES: UserRole[] = [
    'hr_admin', 'payroll_officer', 'finance_auditor', 'compliance_officer',
  ];

  return (
    <>
      <RoleGate role={role} allow="super_admin">
        <AdminControlRoom />
      </RoleGate>

      <RoleGate role={role} allow={HR_ROLES}>
        <HRCommandCenter />
      </RoleGate>

      {/* Managers and employees both see their personal workspace cockpit */}
      <RoleGate role={role} allow={['hr_manager', 'employee', 'digital_worker', 'readonly']}>
        <EmployeeCockpit userName={userName} employeeId={employeeId} />
      </RoleGate>
    </>
  );
}
