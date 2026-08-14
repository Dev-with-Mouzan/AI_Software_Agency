"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, ShieldCheck } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";

/**
 * Client-side route guard for pages that require a signed-in user.
 * Renders a sign-in prompt for guests instead of redirecting, so the URL is
 * preserved and the user can return to where they were.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();

  if (status === "loading") {
    return <PageLoader label="Checking your session…" />;
  }

  if (status === "guest") {
    const next = encodeURIComponent(pathname || "/");
    return (
      <div className="mx-auto max-w-[1300px] px-4 py-12 sm:px-6">
        <Card>
          <CardBody className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
              <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="font-display text-lg font-bold tracking-tight text-text">
                Sign in to continue
              </p>
              <p className="max-w-sm text-sm leading-6 text-muted">
                This area is tied to your account. Create a free account or log
                in to keep working on your projects.
              </p>
            </div>
            <Link
              href={`/auth?mode=login&next=${next}`}
              className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink shadow-sm transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              Continue to sign in
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
