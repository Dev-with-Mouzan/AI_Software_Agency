"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-28 text-center">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-danger">
        Something broke
      </p>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-text">
        The dashboard hit a snag
      </h2>
      <p className="max-w-sm text-sm text-muted">
        An unexpected error interrupted this view. Reload to recover — your
        projects and data are safe.
      </p>
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="ghost" onClick={() => (window.location.href = "/")}>
          Back to overview
        </Button>
      </div>
    </div>
  );
}
