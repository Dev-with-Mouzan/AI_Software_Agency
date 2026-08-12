"use client";

import { useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "motion/react";
import { ChevronDown, Play, Sparkles } from "lucide-react";

import { AgentOrbit } from "@/components/home/ai-orb";
import { Button } from "@/components/ui/button";
import { useAgents, useAgentsRuntime } from "@/lib/hooks";
import { useIsMobile } from "@/lib/use-media";

const EASE = [0.22, 1, 0.36, 1] as const;

const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

function HeroStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="glass flex h-full flex-col items-center justify-center gap-1.5 rounded-xl border border-edge px-3 py-4 text-center">
      <span className="font-display text-xl font-bold tracking-tight text-text">
        {value}
      </span>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        {label}
      </span>
    </div>
  );
}

export function Hero() {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const agents = useAgents();
  const runtime = useAgentsRuntime();

  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 120, damping: 20 });
  const sry = useSpring(ry, { stiffness: 120, damping: 20 });

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const heroScale = useSpring(
    useTransform(scrollYProgress, [0, 1], [1, 0.94]),
    { stiffness: 120, damping: 24 },
  );
  const heroRotateX = useSpring(
    useTransform(scrollYProgress, [0, 1], [0, 5]),
    { stiffness: 90, damping: 24 },
  );
  const heroOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.4]);

  const handleMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    ry.set((px - 0.5) * 8);
    rx.set((0.5 - py) * 8);
  };

  const onlineAgents =
    runtime.data?.filter((a) =>
      ["ACTIVE", "ONLINE", "IDLE"].includes((a.status ?? "").toUpperCase()),
    ).length ?? agents.data?.length ?? 0;

  return (
    <div
      style={{ perspective: 1400 }}
      className="mx-auto max-w-[1300px] px-5 pt-4 sm:px-6"
    >
      <motion.section
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={() => {
          rx.set(0);
          ry.set(0);
        }}
        style={{
          scale: isMobile ? 1 : heroScale,
          rotateX: isMobile ? 0 : heroRotateX,
          opacity: isMobile ? 1 : heroOpacity,
          transformStyle: "preserve-3d",
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative overflow-hidden lg:rounded-2xl lg:border lg:border-edge lg:bg-surface lg:shadow-panel"
      >
        {/* Backdrop layers — reduced on mobile so they glow softly behind
            the content without pushing past the viewport edges */}
        <div className="bg-grid-fade pointer-events-none absolute inset-0 opacity-[0.08] lg:opacity-50" />
        <div className="aurora-blob left-1/2 top-[-12%] h-56 w-56 -translate-x-1/2 animate-drift-a bg-[var(--color-aurora-a)] opacity-60 lg:left-[-10%] lg:top-[-30%] lg:h-96 lg:w-96 lg:translate-x-0 lg:opacity-100" />
        <div className="aurora-blob bottom-[-18%] left-1/2 h-60 w-60 -translate-x-1/2 animate-drift-b bg-[var(--color-aurora-b)] opacity-60 lg:bottom-[-45%] lg:right-[-5%] lg:left-auto lg:h-[28rem] lg:w-[28rem] lg:translate-x-0 lg:opacity-100" />

        <div className="relative px-5 pb-4 pt-8 sm:px-10 sm:pb-6 sm:pt-8 lg:px-14">
          <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            {/* Copy — mobile-first centered stack, desktop keeps the
                left-aligned column */}
            <motion.div
              variants={heroContainer}
              initial="hidden"
              animate="show"
              className="flex w-full min-w-0 max-w-xl flex-col items-center text-center lg:w-auto lg:items-start lg:text-left"
              style={{ transform: isMobile ? undefined : "translateZ(40px)" }}
            >
              <motion.span
                variants={heroItem}
                className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3 py-1 font-mono text-xs font-medium uppercase tracking-[0.2em] text-primary lg:text-[10px]"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Studio is live
              </motion.span>

              <motion.h1
                variants={heroItem}
                className="mt-4 font-display text-[38px] font-bold leading-[1.1] tracking-tight text-text sm:text-6xl sm:font-extrabold sm:leading-[1.08]"
              >
                Your <span className="text-gradient">AI team</span> builds,
                <br />
                you stay in control.
              </motion.h1>

              <motion.p
                variants={heroItem}
                className="mt-4 max-w-lg text-base leading-6 text-text-dim sm:leading-7"
              >
                Plan, build, review and ship software with five AI specialists
                working in your folders — one command at a time, under your
                supervision.
              </motion.p>

              {/* CTAs — stacked full-width on mobile, inline on desktop */}
              <motion.div
                variants={heroItem}
                className="mt-6 flex w-full flex-col gap-3 lg:mt-5 lg:w-auto lg:flex-row lg:flex-wrap"
              >
                <Link href="/workflows" className="flex-1 sm:flex-none">
                  <Button
                    size="lg"
                    className="max-lg:h-14 max-lg:w-full max-lg:rounded-[18px] max-lg:text-base"
                  >
                    <Play className="h-4 w-4" /> Start a run
                  </Button>
                </Link>
                <Link href="/projects" className="flex-1 sm:flex-none">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="max-lg:h-14 max-lg:w-full max-lg:rounded-[18px] max-lg:text-base"
                  >
                    Browse projects
                  </Button>
                </Link>
              </motion.div>

              {/* Mobile-only quick stats — 2-col glass grid */}
              <motion.div
                variants={heroItem}
                className="mt-8 grid w-full grid-cols-2 gap-3 lg:hidden"
              >
                <HeroStat label="online" value={onlineAgents} />
                <HeroStat label="specialists" value={agents.data?.length ?? "…"} />
                <HeroStat label="delivery" value="24h" />
                <HeroStat label="powered" value="AI" />
              </motion.div>

              {/* Live chips — desktop only */}
              <motion.div
                variants={heroItem}
                className="mt-6 hidden flex-wrap gap-2 lg:flex"
              >
                <span className="glass inline-flex items-center gap-2 rounded-full border border-edge px-3.5 py-1.5 text-xs text-text-dim">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {onlineAgents} online
                </span>
                <span className="glass inline-flex items-center gap-2 rounded-full border border-edge px-3.5 py-1.5 text-xs text-text-dim">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {agents.data?.length ?? "…"} specialists on the team
                </span>
              </motion.div>
            </motion.div>

            {/* 3D orbit — rotation is touch/mouse-driven, disabled on mobile */}
            <motion.div
              style={{
                rotateX: isMobile ? 0 : srx,
                rotateY: isMobile ? 0 : sry,
                transformStyle: "preserve-3d",
              }}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.3 }}
              className="mx-auto w-full max-w-[300px] shrink-0 sm:max-w-[360px] lg:mx-0 lg:w-[40%]"
            >
              <AgentOrbit />
            </motion.div>
          </div>

          {/* Scroll hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="mt-4 hidden justify-center lg:flex"
          >
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
              Scroll to explore
              <ChevronDown className="h-3.5 w-3.5 animate-bounce" aria-hidden />
            </div>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}
