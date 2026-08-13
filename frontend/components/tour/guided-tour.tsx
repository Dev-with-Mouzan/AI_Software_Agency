"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  TOURS,
  isTourComplete,
  markTourComplete,
  tourForPath,
  type Tour,
} from "@/lib/tours";

const WAIT_TIMEOUT = 9000;
const WAIT_INTERVAL = 250;
const MARGIN = 12;
const TOUR_START_DELAY = 400;

function findVisible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function waitForElement(selector: string): Promise<HTMLElement | null> {
  const started = Date.now();
  return new Promise((resolve) => {
    const probe = () => {
      const el = findVisible(selector);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - started > WAIT_TIMEOUT) {
        resolve(null);
        return;
      }
      setTimeout(probe, WAIT_INTERVAL);
    };
    probe();
  });
}

function computeTip(
  rect: DOMRect,
  w: number,
  h: number,
  preferred: "top" | "bottom",
): { left: number; top: number; placement: "top" | "bottom" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fitsBottom = rect.bottom + h + MARGIN <= vh - MARGIN;
  const fitsTop = rect.top - h - MARGIN >= MARGIN;
  let placement: "top" | "bottom" = preferred;
  if (placement === "bottom" && !fitsBottom && fitsTop) {
    placement = "top";
  } else if (placement === "top" && !fitsTop && fitsBottom) {
    placement = "bottom";
  }
  const topBase =
    placement === "bottom" ? rect.bottom + MARGIN : rect.top - h - MARGIN;
  const top = Math.min(Math.max(topBase, MARGIN), Math.max(MARGIN, vh - h - MARGIN));
  const leftBase = rect.left + rect.width / 2 - w / 2;
  const left = Math.min(
    Math.max(leftBase, MARGIN),
    Math.max(MARGIN, vw - w - MARGIN),
  );
  return { left, top, placement };
}

export function GuidedTour() {
  const pathname = usePathname();
  const [tour, setTour] = useState<Tour | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tip, setTip] = useState<{ left: number; top: number; placement: "top" | "bottom" } | null>(null);
  const [missing, setMissing] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const stop = useCallback(() => {
    setTour(null);
    setIndex(0);
    setRect(null);
    setTip(null);
    setMissing(false);
  }, []);

  const finish = useCallback(() => {
    if (tour) markTourComplete(tour.id);
    stop();
  }, [tour, stop]);

  const next = useCallback(() => {
    if (!tour) return;
    if (index < tour.steps.length - 1) setIndex((i) => i + 1);
    else finish();
  }, [tour, index, finish]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const startTour = useCallback(
    (t: Tour) => {
      setTour(t);
      setIndex(0);
      setRect(null);
      setTip(null);
      setMissing(false);
    },
    [],
  );

  // Start a tour on the first visit to a tab.
  useEffect(() => {
    const t = tourForPath(pathname);
    if (!t || isTourComplete(t.id)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) startTour(t);
    }, TOUR_START_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, startTour]);

  // Allow the Settings panel to restart a tour.
  useEffect(() => {
    const onRestart = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const t = TOURS.find((x) => x.id === id);
      if (!t) return;
      if (tourForPath(pathname)?.id === id) startTour(t);
    };
    window.addEventListener("devpilot:tour-restart", onRestart);
    return () => window.removeEventListener("devpilot:tour-restart", onRestart);
  }, [pathname, startTour]);

  // Stop the tour if the user navigates away mid-way.
  useEffect(() => {
    if (!tour) return;
    if (tourForPath(pathname)?.id !== tour.id) stop();
  }, [pathname, tour, stop]);

  // Target the element for the current step; auto-advance if it never appears.
  useEffect(() => {
    if (!tour) return;
    const step = tour.steps[index];
    let cancelled = false;
    let settle: number | undefined;
    (async () => {
      const el = await waitForElement(step.selector);
      if (cancelled) return;
      if (!el) {
        setMissing(true);
        return;
      }
      setMissing(false);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const measure = () => {
        if (cancelled) return;
        setRect(el.getBoundingClientRect());
      };
      measure();
      settle = window.setTimeout(measure, 550);
    })();
    return () => {
      cancelled = true;
      if (settle !== undefined) window.clearTimeout(settle);
    };
  }, [tour, index]);

  useEffect(() => {
    if (!missing || !tour) return;
    const timer = window.setTimeout(() => {
      if (index < tour.steps.length - 1) setIndex((i) => i + 1);
      else finish();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [missing, tour, index, finish]);

  // Keep the highlight glued to the target while scrolling/resizing.
  useEffect(() => {
    if (!tour) return;
    const update = () => {
      const el = findVisible(tour.steps[index].selector);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [tour, index]);

  // Escape to dismiss.
  useEffect(() => {
    if (!tour) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, finish]);

  // Measure the tooltip once, then position it near the target.
  useLayoutEffect(() => {
    if (!tour || !rect || !tooltipRef.current) return;
    const w = tooltipRef.current.offsetWidth;
    const h = tooltipRef.current.offsetHeight;
    const placement = tour.steps[index].placement ?? "bottom";
    setTip(computeTip(rect, w, h, placement));
  }, [tour, index, rect]);

  if (!tour || !rect) return null;

  const step = tour.steps[index];
  const isFirst = index === 0;
  const isLast = index === tour.steps.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute rounded-xl border-2 border-primary shadow-glow ring-2 ring-primary/25"
        initial={false}
        animate={{
          left: rect.left - 4,
          top: rect.top - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      />

      <AnimatePresence>
        <motion.div
          key={index}
          ref={tooltipRef}
          role="dialog"
          aria-label={`${step.title} — tour`}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="pointer-events-auto fixed w-[300px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-edge bg-surface shadow-pop"
          style={{
            left: tip?.left ?? 0,
            top: tip?.top ?? 0,
            visibility: tip ? "visible" : "hidden",
          }}
        >
          <span
            aria-hidden
            className={cn(
              "absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-surface",
              tip?.placement === "bottom" ? "-top-[5px]" : "-bottom-[5px]",
            )}
          />
          <div className="flex items-center gap-2 px-4 pt-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary-soft text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            <p className="font-display text-sm font-semibold tracking-tight text-text">
              {step.title}
            </p>
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
              {index + 1}/{tour.steps.length}
            </span>
          </div>
          <p className="px-4 pt-1.5 text-xs leading-5 text-text-dim">
            {step.description}
          </p>
          <div className="mt-3 flex items-center gap-1.5 border-t border-edge-soft px-2.5 py-2">
            {!isFirst ? (
              <button
                type="button"
                onClick={back}
                className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            ) : (
              <span className="flex-1" />
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={finish}
              className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={next}
              className="flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-ink transition-colors hover:bg-primary-hover"
            >
              {isLast ? "Finish" : "Next"}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
