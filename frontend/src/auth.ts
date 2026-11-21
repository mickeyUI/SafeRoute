/**
 * SafeRoute Auth Service
 * Handles register, login, token storage, and user profile validation.
 */

const DEFAULT_API_BASE_URL = 'https://saferoute-ezbz.onrender.com/api/v1';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
const TOKEN_KEY = 'saferoute-auth-token';
const USER_KEY = 'saferoute-auth-user';
const PREFS_KEY = 'saferoute-user-preferences';

export interface UserRead {
  id: string;
  email: string;
  full_name?: string | null;
  username?: string | null;
  role?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface AuthResponse {
  user: UserRead;
  access_token: string;
  token_type: string;
}

export interface UserPreferences {
  city?: string;
  commuteMode?: 'walking' | 'transit' | 'driving' | 'night-shift';
  safetyPriority?: 'well-lit' | 'safe-havens' | 'shortest-safe';
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

// ─── Token and user helpers ───────────────────────────────────────────────────

export function saveToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}

export function saveUser(user: UserRead): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
}

export function getCachedUser(): UserRead | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserRead) : null;
  } catch { return null; }
}

export function savePreferences(prefs: UserPreferences): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export function getPreferences(): UserPreferences | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as UserPreferences) : null;
  } catch { return null; }
}

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function authFetch<T>(
  endpoint: string,
  options?: RequestInit,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined ?? {}),
  };
  const effectiveToken = token || getToken();
  if (effectiveToken) {
    headers['Authorization'] = `Bearer ${effectiveToken}`;
  }

  const tryFetch = async (base: string): Promise<T> => {
    const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg =
        (body?.detail as string) ||
        (body?.error as Record<string, unknown>)?.message as string ||
        `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return res.json() as Promise<T>;
  };

  try {
    return await tryFetch(API_BASE_URL);
  } catch (err) {
    // Fallback to deployed Render backend if not already targeted
    if (!API_BASE_URL.includes('onrender.com')) {
      try {
        return await tryFetch('https://saferoute-ezbz.onrender.com/api/v1');
      } catch {
        // continue to next fallback
      }
    }
    // Fallback to direct localhost when proxy is unavailable
    if (!API_BASE_URL.includes('127.0.0.1') && !API_BASE_URL.includes('localhost')) {
      try {
        return await tryFetch('http://127.0.0.1:8000/api/v1');
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

// ─── Auth actions ─────────────────────────────────────────────────────────────

export async function register(
  email: string,
  password: string,
  fullName: string,
): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      full_name: fullName.trim() || undefined,
    }),
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function loginWithGoogle(
  email: string,
  fullName?: string,
  avatarUrl?: string,
  idToken?: string,
): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({
      email,
      full_name: fullName?.trim() || undefined,
      avatar_url: avatarUrl || undefined,
      id_token: idToken || undefined,
    }),
  });
}

export async function getMe(token?: string | null): Promise<UserRead> {
  const user = await authFetch<UserRead>('/auth/me', {}, token);
  // Merge cached full_name if available since /auth/me returns id, email, username
  const cached = getCachedUser();
  if (cached && cached.email === user.email && cached.full_name && !user.full_name) {
    user.full_name = cached.full_name;
  }
  return user;
}
