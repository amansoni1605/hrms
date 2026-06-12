import { redirect }                             from 'next/navigation';
import { getSession }                           from '@/lib/auth';
import { Sidebar }                              from '@/components/shell/Sidebar';
import { TopBar }                               from '@/components/shell/TopBar';
import { PremiumGuard }                         from '@/components/shell/PremiumGuard';
import { type UserRole }                        from '@/models/workspace.models';
import { connectDB }                            from '@/lib/mongodb';
import { Tenant, WorkspaceEmployee }            from '@/models/workspace.models';
import mongoose                                 from 'mongoose';

/**
 * Authenticated workspace shell.
 *
 * Layout:
 *   ┌────────────┬─────────────────────────────────────────────┐
 *   │            │  TopBar (sticky, 56px, search + user)       │
 *   │  Sidebar   ├─────────────────────────────────────────────┤
 *   │            │                                             │
 *   │  240px     │  <main>  scrollable, grows to fill          │
 *   │  (collapses│         Ghost White canvas                  │
 *   │   to 60px) │                                             │
 *   └────────────┴─────────────────────────────────────────────┘
 *
 * The <main> uses overflowY: auto so page-level content scrolls
 * naturally.  Full-viewport cockpits (HRCommandCenter) set their
 * own height: calc(100vh - 56px) to avoid depending on the parent.
 *
 * Server component — reads session, redirects unauthenticated → /login.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const role      = (session.role ?? 'employee') as UserRole;
  const userName  = session.name  ?? 'User';
  const userEmail = session.email ?? '';

  // Load tenant branding + enforce setup wizard completion.
  // /onboard is outside (workspace), so redirecting there never loops.
  // super_admin has no tenantId — skip for them.
  let logoData:   string | undefined;
  let brandColor: string | undefined;
  let tenantName: string | undefined;
  let hiddenTabs: string[] = [];

  if (session.tenantId && role !== 'super_admin') {
    await connectDB();
    const [tenant, empDoc] = await Promise.all([
      Tenant.findById(session.tenantId)
        .select('setupComplete logoData brandColor displayName legalName')
        .lean() as Promise<{
          setupComplete?: boolean;
          logoData?: string; brandColor?: string;
          displayName?: string; legalName?: string;
        } | null>,
      // Only employee/manager roles have an employeeId — HR roles won't have one.
      // _bypassTenantPlugin required: layout is a Server Component outside withRoute,
      // so no ALS context exists. tenantId from the verified JWT session is trusted here.
      (() => {
        if (!session.employeeId) return Promise.resolve(null);
        const q = WorkspaceEmployee.findById(
          new mongoose.Types.ObjectId(session.employeeId),
        ).select('hiddenTabs').lean() as unknown as { _bypassTenantPlugin: boolean } & Promise<{ hiddenTabs?: string[] } | null>;
        q._bypassTenantPlugin = true;
        return q as unknown as Promise<{ hiddenTabs?: string[] } | null>;
      })(),
    ]);

    if (tenant) {
      logoData   = tenant.logoData;
      brandColor = tenant.brandColor;
      tenantName = tenant.displayName ?? tenant.legalName;

      if (!tenant.setupComplete) {
        redirect('/onboard');
      }
    }

    hiddenTabs = empDoc?.hiddenTabs ?? [];
  }

  const PAGE_TITLE: Record<string, string> = {
    super_admin:        'Control Room',
    hr_admin:           'HR Command Center',
    hr_manager:         'My Workspace',
    payroll_officer:    'Payroll Console',
    finance_auditor:    'Finance Audit',
    compliance_officer: 'Compliance Center',
    employee:           'My Workspace',
    digital_worker:     'Agent Console',
  };

  return (
    <div
      style={{
        display:    'flex',
        height:     '100vh',
        background: 'var(--color-background)',
        overflow:   'hidden',
      }}
    >
      <Sidebar
        role={role}
        userName={userName}
        userEmail={userEmail}
        logoData={logoData}
        brandColor={brandColor}
        tenantName={tenantName}
        hiddenTabs={hiddenTabs}
      />

      <div
        style={{
          flex:          1,
          minWidth:      0,
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
        }}
      >
        <TopBar
          title={PAGE_TITLE[role] ?? 'Workspace'}
          subtitle={new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
          role={role}
          userName={userName}
        />

        {/*
          <main> is the scroll root for all workspace pages.
          overflow: auto  →  page content can be any height; browser scrolls it.
          overflow-x: visible  →  notification drawer slides in from right without clip.
          Full-height cockpits (HRCommandCenter, AdminControlRoom) manage their own
          height via calc(100vh - 56px) so they don't need the <main> to be fixed.
        */}
        <main
          id="workspace-main"
          className="custom-scroll"
          style={{
            flex:       1,
            minHeight:  0,
            overflowY:  'auto',
            overflowX:  'clip',            /* clip not hidden — allows position:fixed children */
            background: 'var(--color-background)',
          }}
        >
          <PremiumGuard>{children}</PremiumGuard>
        </main>
      </div>
    </div>
  );
}
