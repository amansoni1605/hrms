'use client';

import { type UserRole } from '@/models/workspace.models';
import { useSession }    from './useSession';

/**
 * Client-side role gate hook.  Returns:
 *   { allowed, loading, role }
 *
 * @example
 *   const { allowed } = useRoleGate(['super_admin','hr_admin']);
 *   if (!allowed) return <Unauthorized />;
 */
export function useRoleGate(allow: UserRole | UserRole[]) {
  const { session, loading } = useSession();
  const allowed = (() => {
    if (!session) return false;
    const permitted = Array.isArray(allow) ? allow : [allow];
    return permitted.includes(session.role);
  })();
  return { allowed, loading, role: session?.role ?? null };
}
