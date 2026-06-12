// ─────────────────────────────────────────────────────────────────────────────
// Typed fetch wrapper with retry, JSON parsing, and auth-aware redirect.
// All client components should route HTTP through this helper instead of
// raw fetch() so that 401 responses uniformly bounce to /login.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiClientOptions {
  method?:   'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?:     unknown;
  headers?:  Record<string, string>;
  retries?:  number;        // default 0 (non-idempotent ops should not retry)
  signal?:   AbortSignal;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?:  string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name   = 'ApiError';
    this.status = status;
    this.code   = code;
  }
}

const isBrowser = typeof window !== 'undefined';

async function apiRequest<T>(
  path: string,
  opts: ApiClientOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {}, retries = 0, signal } = opts;

  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    signal,
  };
  if (body !== undefined && body !== null) init.body = JSON.stringify(body);

  let attempt    = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    try {
      const res = await fetch(path, init);

      // Auth-aware redirect for client navigation
      if (res.status === 401 && isBrowser) {
        if (!path.startsWith('/api/auth/')) {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        }
        throw new ApiError(401, 'Unauthenticated');
      }

      let payload: unknown = null;
      const text = await res.text();
      if (text) {
        try { payload = JSON.parse(text); } catch { payload = text; }
      }

      if (!res.ok) {
        const err = (payload as { error?: string; code?: string }) ?? {};
        throw new ApiError(res.status, err.error ?? res.statusText, err.code);
      }
      return payload as T;
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError && err.status < 500) throw err;  // don't retry 4xx
      attempt++;
      if (attempt <= retries) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ApiError(500, 'Network error');
}

export const api = {
  get:    <T>(p: string, o?: Omit<ApiClientOptions, 'method' | 'body'>) => apiRequest<T>(p, { ...o, method: 'GET' }),
  post:   <T>(p: string, body?: unknown, o?: Omit<ApiClientOptions, 'method'>) => apiRequest<T>(p, { ...o, method: 'POST',   body }),
  put:    <T>(p: string, body?: unknown, o?: Omit<ApiClientOptions, 'method'>) => apiRequest<T>(p, { ...o, method: 'PUT',    body }),
  patch:  <T>(p: string, body?: unknown, o?: Omit<ApiClientOptions, 'method'>) => apiRequest<T>(p, { ...o, method: 'PATCH',  body }),
  delete: <T>(p: string, o?: Omit<ApiClientOptions, 'method' | 'body'>)         => apiRequest<T>(p, { ...o, method: 'DELETE' }),
};
