"use client";

import { usePathname } from "next/navigation";

import { AuthGate } from "@/components/auth/auth-gate";

const PROTECTED_PREFIXES = ["/projects", "/workflows", "/activity", "/settings", "/chat"];

/**
 * Applies the sign-in gate to protected routes. Public routes (/, /agents,
 * /auth) render for everyone so guests can browse.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const protectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (protectedRoute) return <AuthGate>{children}</AuthGate>;
  return <>{children}</>;
}
