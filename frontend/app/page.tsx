"use client";

import Link from "next/link";
import React, { useRef, type MouseEvent as ReactMouseEvent } from "react";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  ClipboardList,
  Database,
  FolderKanban,
  Gauge,
  Monitor,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoader, EmptyState } from "@/components/ui/skeleton";
import { TiltCard } from "@/components/motion/tilt";
import { CountUp } from "@/components/motion/count-up";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { ScrollTilt3D, ScrollOpen3D } from "@/components/motion/scroll3d";
import {
  useAgents,
  useAgentsRuntime,
  useHealth,
  useProjects,
  useWorkflowRuns,
} from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { formatUptime, shortId, timeAgo } from "@/lib/format";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  3D orbit visual — the signature element                           */
/* ------------------------------------------------------------------ */const NODES = [
  {
    label: "Planner",
    icon: ClipboardList,
    stroke: "#63b3ff",
    tone: "border-info/70 bg-info-soft text-info",
    glow: "rgba(99,179,255,0.45)",
    // Orbit: outer ring (0), reverse, initial angle 30°
    ringIndex: 0,
    startDeg: 30,
    duration: "52s",
    reverse: true,
  },
  {
    label: "Reviewer",
    icon: ShieldCheck,
    stroke: "#5b8cff",
    tone: "border-accent/70 bg-accent-soft text-accent",
    glow: "rgba(91,140,255,0.45)",
    // Ring (1), forward (clockwise), initial angle 120°
    ringIndex: 1,
    startDeg: 120,
    duration: "44s",
    reverse: false,
  },
  {
    label: "Backend",
    icon: Database,
    stroke: "#2fe6ce",
    tone: "border-primary/70 bg-primary-soft text-primary",
    glow: "rgba(47,230,206,0.45)",
    // Orbit: inner ring (2), reverse, initial angle 210°
    ringIndex: 2,
    startDeg: 210,
    duration: "36s",
    reverse: true,
  },
  {
    label: "Frontend",
    icon: Monitor,
    stroke: "#f6b84b",
    tone: "border-warning/70 bg-warning-soft text-warning",
    glow: "rgba(246,184,75,0.45)",
    // Innermost ring (3), forward (clockwise), initial angle 300°
    ringIndex: 3,
    startDeg: 300,
    duration: "28s",
    reverse: false,
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Orbit node — positioned on ring via CSS animation                  */
/* ------------------------------------------------------------------ */

function OrbitNode({
  node,
}: {
  node: (typeof NODES)[number];
}) {
  const Icon = node.icon;
  const reduced = useReducedMotion();
  // 4 rings: 45%, 35%, 25%, 15% radii
  const radii = ["45%", "35%", "25%", "15%"] as const;
  const r = radii[node.ringIndex];

  // Compute negative animationDelay to offset the start angle.
  const durationSec = parseFloat(node.duration); // e.g. 52 for "52s"
  const delaySec = -((node.startDeg / 360) * durationSec);

  // The container rotates the whole inset-0 div
  const containerAnim: React.CSSProperties = reduced
    ? { transform: `rotate(${node.startDeg}deg)` }
    : {
        animationName: node.reverse ? "orbit-spin-reverse" : "orbit-spin",
        animationDuration: node.duration,
        animationTimingFunction: "linear",
        animationIterationCount: "infinite",
        animationDelay: `${delaySec}s`,
      };

  // The chip counter-rotates so its icon stays upright
  const chipAnim: React.CSSProperties | undefined = reduced
    ? undefined
    : {
        animationName: node.reverse ? "counter-spin-reverse" : "counter-spin",
        animationDuration: node.duration,
        animationTimingFunction: "linear",
        animationIterationCount: "infinite",
        animationDelay: `${delaySec}s`,
      };

  return (
    <div
      className="absolute inset-0"
      style={containerAnim}
    >
      <div
        className="absolute left-1/2"
        style={{
          top: `calc(50% - ${r})`,
          transform: `translateX(-50%) translateY(-50%)`,
        }}
      >
        <div style={chipAnim}>
          <div className={reduced ? undefined : "animate-node-pop"}>
            {/* Added a subtle breathing scale/y-float helper so they feel alive */}
            <motion.div
              animate={reduced ? undefined : {
                y: [0, -3, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: delaySec,
              }}
            >
              <span
                className={cn(
                  "flex h-8.5 w-8.5 items-center justify-center rounded-full border-[1.5px] backdrop-blur-md transition-all duration-300 hover:scale-115",
                  node.tone,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG orbit ring — drawn once, fully visible, with glow              */
/* ------------------------------------------------------------------ */

/* Deterministic sprinkle dots scattered along a ring — sparse, every 72° */
const SPRINKLE_ANGLES = [18, 90, 162, 234, 306] as const;

/* Tiny dots scattered in the empty background of the orbit canvas */
const BG_SPRINKLES = [
  { x: 8, y: 6, size: "4px", color: "#63b3ff", opacity: 0.5 },
  { x: 92, y: 7, size: "3px", color: "#2fe6ce", opacity: 0.4 },
  { x: 6, y: 90, size: "3px", color: "#f6b84b", opacity: 0.45 },
  { x: 93, y: 91, size: "4px", color: "#5b8cff", opacity: 0.5 },
  { x: 78, y: 78, size: "3px", color: "#63b3ff", opacity: 0.35 },
  { x: 22, y: 22, size: "3px", color: "#2fe6ce", opacity: 0.35 },
  { x: 79, y: 50, size: "3px", color: "#5b8cff", opacity: 0.4 },
  { x: 21, y: 50, size: "3px", color: "#f6b84b", opacity: 0.4 },
  { x: 30, y: 50, size: "4px", color: "#63b3ff", opacity: 0.45 },
  { x: 50, y: 70, size: "3px", color: "#2fe6ce", opacity: 0.4 },
  { x: 50, y: 42, size: "3px", color: "#5b8cff", opacity: 0.35 },
  { x: 14, y: 13, size: "3px", color: "#5b8cff", opacity: 0.35 },
  { x: 87, y: 13, size: "3px", color: "#f6b84b", opacity: 0.3 },
  { x: 13, y: 87, size: "3px", color: "#2fe6ce", opacity: 0.3 },
  { x: 86, y: 87, size: "3px", color: "#63b3ff", opacity: 0.35 },
  { x: 78, y: 22, size: "3px", color: "#63b3ff", opacity: 0.3 },
  { x: 22, y: 78, size: "3px", color: "#2fe6ce", opacity: 0.3 },
  { x: 50, y: 30, size: "3px", color: "#5b8cff", opacity: 0.35 },
  { x: 43, y: 69, size: "3px", color: "#f6b84b", opacity: 0.3 },
  { x: 57, y: 69, size: "3px", color: "#63b3ff", opacity: 0.3 },
  { x: 56, y: 45, size: "3px", color: "#2fe6ce", opacity: 0.3 },
  { x: 44, y: 56, size: "3px", color: "#5b8cff", opacity: 0.3 },
  { x: 6, y: 20, size: "3px", color: "#63b3ff", opacity: 0.3 },
  { x: 20, y: 6, size: "2px", color: "#5b8cff", opacity: 0.3 },
  { x: 80, y: 6, size: "3px", color: "#2fe6ce", opacity: 0.3 },
  { x: 94, y: 20, size: "2px", color: "#f6b84b", opacity: 0.3 },
  { x: 94, y: 80, size: "3px", color: "#63b3ff", opacity: 0.3 },
  { x: 80, y: 94, size: "2px", color: "#5b8cff", opacity: 0.3 },
  { x: 20, y: 94, size: "3px", color: "#2fe6ce", opacity: 0.3 },
  { x: 6, y: 80, size: "2px", color: "#f6b84b", opacity: 0.3 },
  { x: 50, y: 1, size: "2px", color: "#63b3ff", opacity: 0.35 },
  { x: 50, y: 99, size: "2px", color: "#2fe6ce", opacity: 0.35 },
  { x: 1, y: 50, size: "2px", color: "#5b8cff", opacity: 0.35 },
  { x: 99, y: 50, size: "2px", color: "#f6b84b", opacity: 0.35 },
  { x: 33, y: 3, size: "2px", color: "#63b3ff", opacity: 0.3 },
  { x: 67, y: 3, size: "2px", color: "#2fe6ce", opacity: 0.3 },
  { x: 97, y: 33, size: "2px", color: "#5b8cff", opacity: 0.3 },
  { x: 97, y: 67, size: "2px", color: "#f6b84b", opacity: 0.3 },
  { x: 67, y: 97, size: "2px", color: "#63b3ff", opacity: 0.3 },
  { x: 33, y: 97, size: "2px", color: "#2fe6ce", opacity: 0.3 },
  { x: 3, y: 67, size: "2px", color: "#5b8cff", opacity: 0.3 },
  { x: 3, y: 33, size: "2px", color: "#f6b84b", opacity: 0.3 },
  { x: 12, y: 12, size: "3px", color: "#63b3ff", opacity: 0.35 },
  { x: 88, y: 88, size: "3px", color: "#2fe6ce", opacity: 0.35 },
] as const;

/* Particles that rise from the bottom of the orbit upward */
const RISING_SPRINKLES = [
  { left: 12, bottom: 6, duration: "7s", delay: "0s", size: "3px", color: "#63b3ff" },
  { left: 24, bottom: 12, duration: "8s", delay: "1.2s", size: "2px", color: "#2fe6ce" },
  { left: 35, bottom: 8, duration: "6.5s", delay: "0.6s", size: "4px", color: "#5b8cff" },
  { left: 48, bottom: 14, duration: "9s", delay: "2s", size: "3px", color: "#f6b84b" },
  { left: 58, bottom: 7, duration: "7.5s", delay: "0.3s", size: "2px", color: "#63b3ff" },
  { left: 66, bottom: 11, duration: "8.5s", delay: "1.8s", size: "3px", color: "#2fe6ce" },
  { left: 76, bottom: 6, duration: "7s", delay: "0.9s", size: "2px", color: "#5b8cff" },
  { left: 86, bottom: 13, duration: "6.8s", delay: "2.5s", size: "3px", color: "#f6b84b" },
  { left: 42, bottom: 16, duration: "9.5s", delay: "3.1s", size: "2px", color: "#63b3ff" },
  { left: 70, bottom: 15, duration: "8.2s", delay: "1.5s", size: "3px", color: "#f6b84b" },
] as const;

/* ------------------------------------------------------------------ */
/*  Orbit ring — one thin static line per agent, dotted with sprinkles */
/* ------------------------------------------------------------------ */

function OrbitRing({
  r,
  stroke,
  duration,
  reverse,
}: {
  r: string;
  stroke: string;
  duration: string;
  reverse?: boolean;
}) {
  const reduced = useReducedMotion();
  const rNum = Number(r);
  const sprinkles = SPRINKLE_ANGLES.map((deg, i) => {
    const rad = (deg * Math.PI) / 180;
    // Alternate dots slightly inside/outside the line so they read as sprinkles
    const drift = ((i % 3) - 1) * 0.9;
    return {
      key: deg,
      x: 50 + (rNum + drift) * Math.cos(rad),
      y: 50 + (rNum + drift) * Math.sin(rad),
      dot: 0.4 + (i % 3) * 0.15,
      opacity: 0.45 + (i % 4) * 0.12,
    };
  });
  // Each sprinkle keeps its position relative to the ring line while the whole
  // pattern slowly orbits the center. Static again under reduced motion.
  const spin: React.CSSProperties | undefined = reduced
    ? undefined
    : {
        animationName: reverse ? "orbit-spin-reverse" : "orbit-spin",
        animationDuration: duration,
        animationTimingFunction: "linear",
        animationIterationCount: "infinite",
        transformOrigin: "50% 50%",
      };
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="0.45"
        strokeDasharray="0.25 1.5"
        strokeLinecap="round"
        strokeOpacity="0.45"
      />
      {sprinkles.map((s) => (
        <circle key={s.key} cx={s.x} cy={s.y} r={s.dot} fill={stroke} opacity={s.opacity} style={spin} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Orbit satellite — a single plain dot orbiting the outer ring       */
/* ------------------------------------------------------------------ */

function OrbitDot({
  r,
  color,
  duration,
  reverse,
}: {
  r: string;
  color: string;
  duration: string;
  reverse?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {!reduced && (
        <circle
          cx="50"
          cy={50 - Number(r)}
          r="1"
          fill={color}
          style={{
            animationName: reverse ? "orbit-spin-reverse" : "orbit-spin",
            animationDuration: duration,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            transformOrigin: "50% 50%",
          }}
        />
      )}
    </svg>
  );
}



function AgentOrbit() {
  const reduced = useReducedMotion();
  return (
    <div className="relative w-full">
      <div
        className="relative mx-auto aspect-square w-full max-w-[400px]"
        aria-hidden
      >
        {/* ── Background sprinkle dots — fill the empty space ── */}
        {BG_SPRINKLES.map((s) => (
          <span
            key={`${s.x}-${s.y}`}
            className="absolute rounded-full"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              backgroundColor: s.color,
              opacity: s.opacity,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}

        {/* ── 4 static orbital rings with orbiting sprinkles, alternating direction ── */}
        <OrbitRing r="45" stroke="#63b3ff" duration="80s" reverse />
        <OrbitRing r="35" stroke="#5b8cff" duration="70s" />
        <OrbitRing r="25" stroke="#2fe6ce" duration="60s" reverse />
        <OrbitRing r="15" stroke="#f6b84b" duration="50s" />

        {/* Single satellite on the outer ring — matches its direction */}
        <OrbitDot r="45" color="#63b3ff" duration="80s" reverse />

        {/* ── Rising particles — drift up from the bottom ── */}
        {!reduced &&
          RISING_SPRINKLES.map((s) => (
            <span
              key={`rise-${s.left}-${s.bottom}`}
              className="animate-rise absolute rounded-full"
              style={{
                left: `${s.left}%`,
                bottom: `${s.bottom}%`,
                width: s.size,
                height: s.size,
                backgroundColor: s.color,
                animationDuration: s.duration,
                animationDelay: s.delay,
              }}
            />
          ))}

        {/* ── Center core ── */}
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <span
            className={cn(
              "absolute -inset-4 rounded-full bg-primary/10",
              !reduced && "animate-ping-slow",
            )}
          />
          <div className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-surface shadow-glow ring-2 ring-primary/30">
            <span className="absolute inset-2 rounded-full bg-primary/10" />
            <span
              className={cn(
                "absolute inset-0 rounded-full bg-primary/20",
                !reduced && "animate-ping-slow [animation-delay:1.2s]",
              )}
            />
            <Bot className="relative z-10 h-7 w-7 text-primary drop-shadow-[0_0_8px_rgba(47,230,206,0.8)]" />
          </div>
        </div>

        {/* ── Orbit nodes rendered on their respective rings ── */}
        <div className="absolute inset-0">
          {NODES.map((node) => (
            <OrbitNode key={node.label} node={node} />
          ))}
        </div>



        {/* ── Floating ambient particles ── */}
        <span
          className={cn(
            "absolute left-[6%] top-[9%] h-1.5 w-1.5 rounded-full bg-primary/70",
            !reduced && "animate-float",
          )}
        />
        <span
          className={cn(
            "absolute bottom-[9%] left-[14%] h-1 w-1 rounded-full bg-info/60",
            !reduced && "animate-float [animation-delay:1.4s]",
          )}
        />
        <span
          className={cn(
            "absolute right-[8%] top-[13%] h-1.5 w-1.5 rounded-full bg-accent/70",
            !reduced && "animate-float [animation-delay:0.8s]",
          )}
        />
        <span
          className={cn(
            "absolute bottom-[11%] right-[8%] h-1 w-1 rounded-full bg-warning/60",
            !reduced && "animate-float [animation-delay:2.1s]",
          )}
        />
        <span
          className={cn(
            "absolute left-[18%] top-[46%] h-[5px] w-[5px] rounded-full bg-primary/40",
            !reduced && "animate-float [animation-delay:3.2s]",
          )}
        />
        <span
          className={cn(
            "absolute right-[20%] bottom-[40%] h-1 w-1 rounded-full bg-accent/35",
            !reduced && "animate-float [animation-delay:1.9s]",
          )}
        />
      </div>

      {/* ── Static legend below ── */}
      <div className="mx-auto mt-5 grid w-full max-w-[400px] grid-cols-2 gap-2">
        {NODES.map((node) => {
          const Icon = node.icon;
          return (
            <div
              key={node.label}
              className="flex items-center gap-2.5 rounded-lg border border-edge bg-surface px-3 py-2 shadow-panel"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${node.tone}`}
              >
                <Icon className="h-3 w-3" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-text">{node.label}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
                  specialist
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function Hero() {
  const reduced = useReducedMotion();
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
    <div style={{ perspective: 1400 }}>
    <motion.section
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      style={{
        scale: heroScale,
        rotateX: heroRotateX,
        transformStyle: "preserve-3d",
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-2xl border border-edge bg-surface shadow-panel"
    >
      {/* Backdrop */}
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="aurora-blob left-[-10%] top-[-30%] h-96 w-96 animate-drift-a bg-primary/20" />
      <div className="aurora-blob bottom-[-40%] right-[-5%] h-[26rem] w-[26rem] animate-drift-b bg-accent/15" />

      <div className="relative flex flex-col gap-10 p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        {/* Copy */}
        <div className="min-w-0 max-w-xl" style={{ transform: "translateZ(40px)" }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Studio is live
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-text sm:text-5xl">
            Your <span className="text-gradient">AI team</span> builds,
            <br />
            you stay in control.
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-7 text-muted">
            Plan, build, review and ship software with five AI specialists
            working in your folders — one command at a time, under your
            supervision.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/workflows">
              <Button size="lg">
                <Play className="h-4 w-4" /> Start a run
              </Button>
            </Link>
            <Link href="/projects">
              <Button variant="secondary" size="lg">
                Browse projects
              </Button>
            </Link>
          </div>

          {/* Live chips */}
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="glass inline-flex items-center gap-2 rounded-full border border-edge px-3.5 py-1.5 text-xs text-text-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {onlineAgents} online
            </span>
            <span className="glass inline-flex items-center gap-2 rounded-full border border-edge px-3.5 py-1.5 text-xs text-text-dim">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {agents.data?.length ?? "…"} specialists on the team
            </span>
          </div>
        </div>

        {/* 3D orbit */}
        <motion.div
          style={{ rotateX: srx, rotateY: sry, transformStyle: "preserve-3d" }}
          className="w-full max-w-[420px] shrink-0 lg:w-[40%]"
        >
          <AgentOrbit />
        </motion.div>
      </div>
    </motion.section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat tiles                                                         */
/* ------------------------------------------------------------------ */

function Stat({
  icon,
  label,
  value,
  format,
  detail,
  href,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  format?: (n: number) => string;
  detail: string;
  href?: string;
  accent: string;
}) {
  const Icon = icon;
  const inner = (
    <TiltCard max={6} glare className="h-full">
      <Card className="h-full transition-colors duration-200">
        <CardBody className="flex h-full flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-faint">
              {label}
            </span>
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${accent}`}>
              <Icon className="h-4 w-4" />
            </span>
          </div>
          <div>
            <p className="font-display text-[2rem] font-bold leading-none tracking-tight text-text">
              <CountUp value={value} format={format} />
            </p>
            <p className="mt-1.5 text-xs text-muted">{detail}</p>
          </div>
        </CardBody>
      </Card>
    </TiltCard>
  );

  if (!href) return inner;
  return <Link href={href} className="block h-full">{inner}</Link>;
}

/* ------------------------------------------------------------------ */
/*  How it works                                                       */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    icon: ClipboardList,
    title: "Plan",
    body: "Tell the Planner what to build. It researches, writes a plan and breaks it into tasks.",
    tone: "border-info/40 bg-info-soft text-info",
  },
  {
    icon: Gauge,
    title: "Build",
    body: "Backend and Frontend engineers work through the plan, then the Reviewer audits every line.",
    tone: "border-primary/40 bg-primary-soft text-primary",
  },
  {
    icon: Rocket,
    title: "Ship",
    body: "DevOps validates the stack and prepares a deployment for you to approve with one click.",
    tone: "border-warning/40 bg-warning-soft text-warning",
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function OverviewPage() {
  const health = useHealth(10_000);
  const projects = useProjects();
  const agents = useAgents();
  const runtime = useAgentsRuntime();
  const runs = useWorkflowRuns();

  if (health.isLoading) return <PageLoader label="Contacting the studio…" />;
  const healthError = health.error as Error | null;

  const runningRuns =
    runs.data?.filter((r) => r.status === "RUNNING").length ?? 0;

  return (
    <div className="space-y-10">
      {healthError || !health.data ? (
        <Card>
          <CardBody className="flex items-center gap-4 py-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold tracking-tight text-text">
                The studio is offline
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                {healthError?.message ??
                  "The AI Agency API did not respond. Start it with `uvicorn agency.api.main:app` on port 8000."}
              </p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          <Hero />

          <ScrollTilt3D max={7} axis="x" perspective={1200}>
            <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4" step={0.07}>
            <StaggerItem>
              <Stat
                icon={FolderKanban}
                label="Projects"
                value={projects.data?.length ?? 0}
                detail={`${projects.data?.filter((p) => p.status === "ACTIVE").length ?? 0} active right now`}
                href="/projects"
                accent="border-info/40 bg-info-soft text-info"
              />
            </StaggerItem>
            <StaggerItem>
              <Stat
                icon={Bot}
                label="Team"
                value={agents.data?.length ?? 0}
                detail="5 specialist roles"
                href="/agents"
                accent="border-primary/40 bg-primary-soft text-primary"
              />
            </StaggerItem>
            <StaggerItem>
              <Stat
                icon={Workflow}
                label="Runs"
                value={runs.data?.length ?? 0}
                detail={`${runningRuns} in flight`}
                href="/workflows"
                accent="border-accent/40 bg-accent-soft text-accent"
              />
            </StaggerItem>
            <StaggerItem>
              <Stat
                icon={Activity}
                label="Uptime"
                value={health.data.uptime_seconds}
                format={formatUptime}
                detail={`${health.data.environment} · v${health.data.version}`}
                accent="border-warning/40 bg-warning-soft text-warning"
              />
            </StaggerItem>
          </Stagger>
          </ScrollTilt3D>
        </>
      )}

      {health.data && (
        <ScrollTilt3D max={5} axis="x" perspective={1300}>
          <Reveal>
            <Card>
              <CardHeader>
                <CardTitle>Studio health</CardTitle>
                <StatusBadge status={health.data.status} />
              </CardHeader>
            <CardBody className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Database", value: health.data.database, ok: health.data.database === "ok", href: "/settings" },
                { label: "Redis", value: health.data.services.redis ?? "n/a", ok: false },
                { label: "Environment", value: health.data.environment, ok: true },
                { label: "Version", value: `v${health.data.version}`, ok: true },
              ].map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-xl border border-edge bg-surface-2/70 px-4 py-3 transition-colors duration-200 hover:border-primary/40 hover:bg-surface-2"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        item.ok ? "bg-success" : "bg-danger"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint group-hover:text-primary">
                        {item.label}
                      </p>
                      <p className="truncate text-sm font-medium text-text">
                        {item.value}
                      </p>
                    </div>
                    <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-primary" />
                  </Link>
                ) : (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 rounded-xl border border-edge bg-surface-2/70 px-4 py-3"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        item.ok ? "bg-success" : "bg-danger"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                        {item.label}
                      </p>
                      <p className="truncate text-sm font-medium text-text">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ),
              )}
            </CardBody>
          </Card>
        </Reveal>
        </ScrollTilt3D>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ScrollOpen3D side="left" from={16}>
          <Card>
            <CardHeader>
              <CardTitle>Your team</CardTitle>
              <Link
                href="/agents"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardBody className="space-y-1.5">
              {runtime.isLoading && <PageLoader label="Reading the team…" />}
              {runtime.data?.map((agent) => (
                <div
                  key={agent.kind}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/30 bg-primary-soft text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text">{agent.name}</p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
                        {agent.kind}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={agent.status} />
                </div>
              ))}
              {!runtime.isLoading && runtime.data?.length === 0 && (
                <EmptyState title="No agents registered" />
              )}
            </CardBody>
          </Card>
        </ScrollOpen3D>

        <ScrollOpen3D side="right" from={16}>
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <Link
                href="/workflows"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardBody className="space-y-1.5">
              {runs.isLoading && <PageLoader label="Reading the ledger…" />}
              {runs.data?.slice(0, 6).map((run) => (
                <Link
                  key={run.id}
                  href="/workflows"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <div className="flex items-center gap-3">
                    <Badge tone="primary">{run.kind}</Badge>
                    <div>
                      <p className="font-mono text-xs font-medium text-text">
                        #{shortId(run.id)}
                      </p>
                      <p className="text-[10px] text-faint">{timeAgo(run.started_at)}</p>
                    </div>
                  </div>
                  <StatusBadge status={run.status} />
                </Link>
              ))}
              {!runs.isLoading && runs.data?.length === 0 && (
                <EmptyState
                  title="No runs yet"
                  description="Start your first run and it will show up here."
                />
              )}
            </CardBody>
          </Card>
        </ScrollOpen3D>
      </div>

      {/* How it works */}
      <section className="pt-4">
        <Reveal>
          <div className="mb-8 max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-accent">
              How it works
            </span>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
              From idea to shipped — three steps.
            </h2>
          </div>
        </Reveal>
        <Stagger className="grid gap-4 md:grid-cols-3" step={0.12}>
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <StaggerItem key={step.title}>
                <ScrollOpen3D side={i % 2 === 0 ? "left" : "right"} from={18}>
                  <TiltCard max={5} className="h-full">
                    <Card className="group h-full transition-colors duration-200 hover:border-primary/40">
                      <CardBody className="flex h-full flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span
                            className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${step.tone}`}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="font-display text-4xl font-extrabold text-edge group-hover:text-primary/30">
                            0{i + 1}
                          </span>
                        </div>
                        <p className="font-display text-lg font-semibold tracking-tight text-text">
                          {step.title}
                        </p>
                        <p className="text-sm leading-6 text-muted">{step.body}</p>
                      </CardBody>
                    </Card>
                  </TiltCard>
                </ScrollOpen3D>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>
    </div>
  );
}
