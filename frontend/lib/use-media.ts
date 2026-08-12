"use client";

import { useEffect, useState } from "react";

/**
 * Reactively matches a CSS media query (defaults to "mobile" = ≤768px).
 * Hydrates to false on the server so motion values stay at their
 * rest/identity state on the first paint.
 */
export function useIsMobile(query = "(max-width: 768px)"): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
