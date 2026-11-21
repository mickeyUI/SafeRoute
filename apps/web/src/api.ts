/** Small typed client for the SafeRoute FastAPI backend. */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'saferoute.backend.token';
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || 'demo@safaroute.local';
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'demo-pass-123';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Session lasts only for this page load when storage is unavailable.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // No action needed.
  }
}

function backendUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  retryOnUnauthorized = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(backendUrl(path), { ...init, headers });

  if (response.status === 401 && retryOnUnauthorized && getToken()) {
    clearToken();
    await ensureSession();
    return apiRequest<T>(path, init, false);
  }

  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const envelope = (data ?? {}) as {
      error?: { message?: string; code?: string };
      detail?: string | Array<{ msg?: string }>;
    };
    const message =
      envelope.error?.message ??
      (typeof envelope.detail === 'string'
        ? envelope.detail
        : envelope.detail?.[0]?.msg) ??
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status, envelope.error?.code ?? 'http_error');
  }

  return data as T;
}

let sessionPromise: Promise<string> | null = null;

/** Create or reuse a local demo session so protected endpoints work without a login screen. */
export async function ensureSession(): Promise<string> {
  if (sessionPromise) return sessionPromise;

  const pending = (async () => {
    const existing = getToken();
    if (existing) {
      try {
        await apiRequest('/api/v1/auth/me', {}, false);
        return existing;
      } catch {
        clearToken();
      }
    }

    try {
      await apiRequest(
        '/api/v1/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            email: DEMO_EMAIL,
            password: DEMO_PASSWORD,
            full_name: 'Web Demo User',
          }),
        },
        false,
      );
    } catch (error) {
      // A duplicate demo account simply means this browser was registered before.
      if (!(error instanceof ApiError && error.status === 409)) throw error;
    }

    const tokens = await apiRequest<{ access_token: string }>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      },
      false,
    );
    setToken(tokens.access_token);
    return tokens.access_token;
  })();

  sessionPromise = pending;
  try {
    return await pending;
  } finally {
    sessionPromise = null;
  }
}
