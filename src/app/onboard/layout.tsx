import { redirect }    from 'next/navigation';
import { getSession }  from '@/lib/auth';
import { connectDB }   from '@/lib/mongodb';
import { Tenant }      from '@/models/workspace.models';
import mongoose        from 'mongoose';

export default async function OnboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  // Only hr_admin (and super_admin doing impersonation) should reach the wizard.
  // Regular employees and managers are sent to the workspace.
  if (session.role !== 'hr_admin' && session.role !== 'super_admin') {
    redirect('/dashboard');
  }

  // super_admin has no tenantId — skip the setupComplete check for them.
  if (session.tenantId) {
    await connectDB();
    const tenant = await Tenant.findById(
      new mongoose.Types.ObjectId(session.tenantId),
    ).select('setupComplete').lean() as { setupComplete?: boolean } | null;

    if (tenant?.setupComplete) redirect('/dashboard');
  }

  return <>{children}</>;
}
