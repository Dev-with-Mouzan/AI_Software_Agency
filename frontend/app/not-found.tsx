import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-28 text-center">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-primary">
        Page not found
      </p>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-text">
        Not on the floor plan
      </h2>
      <p className="max-w-sm text-sm text-muted">
        Nothing lives at this address. Head back to the overview and pick a
        starting point.
      </p>
      <Link href="/" className="mt-2">
        <Button>Back to overview</Button>
      </Link>
    </div>
  );
}
