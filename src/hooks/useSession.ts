'use client';

import { useEffect, useState } from 'react';
import { type UserRole } from '@/models/workspace.models';

export interface ClientSession {
  userId:     string;
  email:      string;
  name:       string;
  role:       UserRole;
  tenantId:   string;
  employeeId: string | null;
}

interface UseSessionResult {
  session: ClientSession | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Client-side session reader.  Fetches GET /api/auth/me to retrieve the
 * decoded JWT payload and exposes it as React state.  Used by client
 * components that need to gate UI on `role` without round-tripping to
 * the server layout.
 */
export function useSession(): UseSessionResult {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick,    setTick]    = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setSession(d?.session ?? d?.user ?? null); })
      .catch(() => { if (!cancelled) setSession(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tick]);

  return { session, loading, refresh: () => setTick((t) => t + 1) };
}
