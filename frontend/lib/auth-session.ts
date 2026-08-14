"use client";

/**
 * Plain (non-React) session store for JWT access/refresh tokens.
 *
 * Lives in module scope so both the React AuthProvider and the fetch-based
 * api client (`lib/api.ts`) can read/write the current session without
 * circular imports. State changes notify subscribers (the AuthProvider).
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  provider: "email" | "google";
  email_verified: boolean;
  avatar_url: string;
  created_at: string;
}

/**
 * Public avatar for a user. The backend returns a path relative to the API
 * (e.g. "/auth/avatar/{id}"), which is served through the Next.js proxy.
 */
export function avatarSrc(user: Pick<AuthUser, "avatar_url"> | null): string | null {
  if (!user?.avatar_url) return null;
  return `/api/proxy${user.avatar_url}`;
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

const ACCESS_KEY = "agency-access-token";
const REFRESH_KEY = "agency-refresh-token";
const USER_KEY = "agency-user";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let user: AuthUser | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeAuth(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadStoredSession(): void {
  if (typeof window === "undefined") return;
  accessToken = window.localStorage.getItem(ACCESS_KEY);
  refreshToken = window.localStorage.getItem(REFRESH_KEY);
  const rawUser = window.localStorage.getItem(USER_KEY);
  try {
    user = rawUser ? (JSON.parse(rawUser) as AuthUser) : null;
  } catch {
    user = null;
  }
}

export function setSession(pair: TokenPair): void {
  accessToken = pair.access_token;
  refreshToken = pair.refresh_token;
  user = pair.user;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACCESS_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  emit();
}

/** Replace the cached user without touching tokens (e.g. after a profile edit). */
export function updateStoredUser(next: AuthUser): void {
  user = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  emit();
}

export function clearSession(): void {
  accessToken = null;
  refreshToken = null;
  user = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
  }
  emit();
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function getAuthUser(): AuthUser | null {
  return user;
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Rotate the refresh token and return a fresh access token, or null (and
 * clear the session) when the refresh token is expired/revoked. Only one
 * refresh runs at a time so concurrent 401s share the same promise.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshToken) return Promise.resolve(null);
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch("/api/proxy/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
          cache: "no-store",
        });
        if (!res.ok) {
          clearSession();
          return null;
        }
        const data = (await res.json()) as TokenPair;
        setSession(data);
        return data.access_token;
      } catch {
        clearSession();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}
