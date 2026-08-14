"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  AuthUser,
  avatarSrc,
  clearSession,
  getAccessToken,
  getAuthUser,
  getRefreshToken,
  loadStoredSession,
  refreshAccessToken,
  setSession,
  subscribeAuth,
  updateStoredUser,
} from "@/lib/auth-session";
import { api } from "@/lib/api";

type AuthStatus = "loading" | "authenticated" | "guest";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  isAuthenticated: boolean;
  avatarUrl: string | null;
  login: (email: string, password: string) => Promise<void>;
  /** `verificationToken` comes from POST /auth/verify-code (mandatory email verification). */
  signup: (
    email: string,
    name: string,
    password: string,
    verificationToken: string,
  ) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  /** Update the profile (name / avatar data URL / null-to-remove) and refresh the session user. */
  updateProfile: (input: { name?: string; avatar?: string | null }) => Promise<void>;
  logout: () => Promise<void>;
  /** True when the user is signed in; otherwise redirects to /auth and returns false. */
  requireAuth: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function validateSession(): Promise<void> {
  const token = getAccessToken();
  if (!token) return;
  try {
    await api.get<AuthUser>("/auth/me");
  } catch (err) {
    // Access token expired — try to rotate once; otherwise drop the session.
    const fresh = await refreshAccessToken();
    if (!fresh && !(err instanceof Error && err.message.includes("account"))) {
      // session already cleared by refresh failure
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    loadStoredSession();
    const apply = () => {
      const u = getAuthUser();
      setUser(u);
      setStatus(u ? "authenticated" : "guest");
    };
    apply();
    const unsubscribe = subscribeAuth(apply);

    // Verify the stored access token (and rotate if needed) once on boot.
    if (getAccessToken()) {
      void validateSession().finally(() => {
        const u = getAuthUser();
        setUser(u);
        setStatus(u ? "authenticated" : "guest");
      });
    } else {
      setStatus("guest");
    }
    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const pair = await api.post<{ access_token: string; refresh_token: string; token_type: string; user: AuthUser }>(
      "/auth/login",
      { email, password },
    );
    setSession(pair);
    setUser(pair.user);
    setStatus("authenticated");
  }, []);

  const signup = useCallback(
    async (email: string, name: string, password: string, verificationToken: string) => {
      const pair = await api.post<{
        access_token: string;
        refresh_token: string;
        token_type: string;
        user: AuthUser;
      }>("/auth/signup", { email, name, password, verification_token: verificationToken });
      setSession(pair);
      setUser(pair.user);
      setStatus("authenticated");
    },
    [],
  );

  const updateProfile = useCallback(async (input: { name?: string; avatar?: string | null }) => {
    const updated = await api.patch<AuthUser>("/auth/me", input);
    updateStoredUser(updated);
    setUser(updated);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const pair = await api.post<{
      access_token: string;
      refresh_token: string;
      token_type: string;
      user: AuthUser;
    }>("/auth/google", { id_token: idToken });
    setSession(pair);
    setUser(pair.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await fetch("/api/proxy/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
          cache: "no-store",
        });
      } catch {
        // ignore network errors — revoke locally regardless
      }
    }
    clearSession();
    setUser(null);
    setStatus("guest");
  }, []);

  const requireAuth = useCallback(() => {
    if (status === "authenticated") return true;
    if (typeof window !== "undefined") {
      const current = window.location.pathname + window.location.search;
      window.location.assign(`/auth?mode=login&next=${encodeURIComponent(current)}`);
    }
    return false;
  }, [status]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAuthenticated: status === "authenticated",
      avatarUrl: avatarSrc(user),
      login,
      signup,
      loginWithGoogle,
      updateProfile,
      logout,
      requireAuth,
    }),
    [status, user, login, signup, loginWithGoogle, updateProfile, logout, requireAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
