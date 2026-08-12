"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  Bot,
  ClipboardList,
  Database,
  Monitor,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/*  3D orbit visual — the signature element                           */
/* ------------------------------------------------------------------ */

interface OrbitNodeConfig {
  label: string;
  icon: LucideIcon;
  stroke: string;
  tone: string;
  glow: string;
  ringIndex: number;
  startDeg: number;
  duration: string;
  reverse: boolean;
}

const NODES: readonly OrbitNodeConfig[] = [
  {
    label: "Planner",
    icon: ClipboardList,
    stroke: "var(--color-orbit-info)",
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
    stroke: "var(--color-orbit-accent)",
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
    stroke: "var(--color-orbit-primary)",
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
    stroke: "var(--color-orbit-warning)",
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

function OrbitNode({ node }: { node: OrbitNodeConfig }) {
  const Icon = node.icon;
  const reduced = useReducedMotion();
  // 4 rings: 45%, 35%, 25%, 15% radii
  const radii = ["45%", "35%", "25%", "15%"] as const;
  const r = radii[node.ringIndex];

  // Compute negative animationDelay to offset the start angle.
  const durationSec = parseFloat(node.duration);
  const delaySec = -((node.startDeg / 360) * durationSec);

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
    <div className="absolute inset-0" style={containerAnim}>
      <div
        className="absolute left-1/2"
        style={{
          top: `calc(50% - ${r})`,
          transform: `translateX(-50%) translateY(-50%)`,
        }}
      >
        <div style={chipAnim}>
          <div className={reduced ? undefined : "animate-node-pop"}>
            <motion.div
              animate={
                reduced
                  ? undefined
                  : { y: [0, -3, 0] }
              }
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
/*  SVG orbit ring — one thin static line per agent, dotted with       */
/*  sprinkles                                                          */
/* ------------------------------------------------------------------ */

/* Deterministic sprinkle dots scattered along a ring — sparse, every 72° */
const SPRINKLE_ANGLES = [18, 90, 162, 234, 306] as const;

/* Tiny dots scattered in the empty background of the orbit canvas */
const BG_SPRINKLES = [
  { x: 8, y: 6, size: "4px", color: "var(--color-orbit-info)", opacity: 0.5 },
  { x: 92, y: 7, size: "3px", color: "var(--color-orbit-primary)", opacity: 0.4 },
  { x: 6, y: 90, size: "3px", color: "var(--color-orbit-warning)", opacity: 0.45 },
  { x: 93, y: 91, size: "4px", color: "var(--color-orbit-accent)", opacity: 0.5 },
  { x: 78, y: 78, size: "3px", color: "var(--color-orbit-info)", opacity: 0.35 },
  { x: 22, y: 22, size: "3px", color: "var(--color-orbit-primary)", opacity: 0.35 },
  { x: 79, y: 50, size: "3px", color: "var(--color-orbit-accent)", opacity: 0.4 },
  { x: 21, y: 50, size: "3px", color: "var(--color-orbit-warning)", opacity: 0.4 },
  { x: 30, y: 50, size: "4px", color: "var(--color-orbit-info)", opacity: 0.45 },
  { x: 50, y: 70, size: "3px", color: "var(--color-orbit-primary)", opacity: 0.4 },
  { x: 50, y: 42, size: "3px", color: "var(--color-orbit-accent)", opacity: 0.35 },
  { x: 14, y: 13, size: "3px", color: "var(--color-orbit-accent)", opacity: 0.35 },
  { x: 87, y: 13, size: "3px", color: "var(--color-orbit-warning)", opacity: 0.3 },
  { x: 13, y: 87, size: "3px", color: "var(--color-orbit-primary)", opacity: 0.3 },
  { x: 86, y: 87, size: "3px", color: "var(--color-orbit-info)", opacity: 0.35 },
  { x: 78, y: 22, size: "3px", color: "var(--color-orbit-info)", opacity: 0.3 },
  { x: 22, y: 78, size: "3px", color: "var(--color-orbit-primary)", opacity: 0.3 },
  { x: 50, y: 30, size: "3px", color: "var(--color-orbit-accent)", opacity: 0.35 },
  { x: 43, y: 69, size: "3px", color: "var(--color-orbit-warning)", opacity: 0.3 },
  { x: 57, y: 69, size: "3px", color: "var(--color-orbit-info)", opacity: 0.3 },
  { x: 56, y: 45, size: "3px", color: "var(--color-orbit-primary)", opacity: 0.3 },
  { x: 44, y: 56, size: "3px", color: "var(--color-orbit-accent)", opacity: 0.3 },
  { x: 6, y: 20, size: "3px", color: "var(--color-orbit-info)", opacity: 0.3 },
  { x: 20, y: 6, size: "2px", color: "var(--color-orbit-accent)", opacity: 0.3 },
  { x: 80, y: 6, size: "3px", color: "var(--color-orbit-primary)", opacity: 0.3 },
  { x: 94, y: 20, size: "2px", color: "var(--color-orbit-warning)", opacity: 0.3 },
  { x: 94, y: 80, size: "3px", color: "var(--color-orbit-info)", opacity: 0.3 },
  { x: 80, y: 94, size: "2px", color: "var(--color-orbit-accent)", opacity: 0.3 },
  { x: 20, y: 94, size: "3px", color: "var(--color-orbit-primary)", opacity: 0.3 },
  { x: 6, y: 80, size: "2px", color: "var(--color-orbit-warning)", opacity: 0.3 },
  { x: 50, y: 1, size: "2px", color: "var(--color-orbit-info)", opacity: 0.35 },
  { x: 50, y: 99, size: "2px", color: "var(--color-orbit-primary)", opacity: 0.35 },
  { x: 1, y: 50, size: "2px", color: "var(--color-orbit-accent)", opacity: 0.35 },
  { x: 99, y: 50, size: "2px", color: "var(--color-orbit-warning)", opacity: 0.35 },
  { x: 33, y: 3, size: "2px", color: "var(--color-orbit-info)", opacity: 0.3 },
  { x: 67, y: 3, size: "2px", color: "var(--color-orbit-primary)", opacity: 0.3 },
  { x: 97, y: 33, size: "2px", color: "var(--color-orbit-accent)", opacity: 0.3 },
  { x: 97, y: 67, size: "2px", color: "var(--color-orbit-warning)", opacity: 0.3 },
  { x: 67, y: 97, size: "2px", color: "var(--color-orbit-info)", opacity: 0.3 },
  { x: 33, y: 97, size: "2px", color: "var(--color-orbit-primary)", opacity: 0.3 },
  { x: 3, y: 67, size: "2px", color: "var(--color-orbit-accent)", opacity: 0.3 },
  { x: 3, y: 33, size: "2px", color: "var(--color-orbit-warning)", opacity: 0.3 },
  { x: 12, y: 12, size: "3px", color: "var(--color-orbit-info)", opacity: 0.35 },
  { x: 88, y: 88, size: "3px", color: "var(--color-orbit-primary)", opacity: 0.35 },
] as const;

/* Particles that rise from the bottom of the orbit upward */
const RISING_SPRINKLES = [
  { left: 12, bottom: 6, duration: "7s", delay: "0s", size: "3px", color: "var(--color-orbit-info)" },
  { left: 24, bottom: 12, duration: "8s", delay: "1.2s", size: "2px", color: "var(--color-orbit-primary)" },
  { left: 35, bottom: 8, duration: "6.5s", delay: "0.6s", size: "4px", color: "var(--color-orbit-accent)" },
  { left: 48, bottom: 14, duration: "9s", delay: "2s", size: "3px", color: "var(--color-orbit-warning)" },
  { left: 58, bottom: 7, duration: "7.5s", delay: "0.3s", size: "2px", color: "var(--color-orbit-info)" },
  { left: 66, bottom: 11, duration: "8.5s", delay: "1.8s", size: "3px", color: "var(--color-orbit-primary)" },
  { left: 76, bottom: 6, duration: "7s", delay: "0.9s", size: "2px", color: "var(--color-orbit-accent)" },
  { left: 86, bottom: 13, duration: "6.8s", delay: "2.5s", size: "3px", color: "var(--color-orbit-warning)" },
  { left: 42, bottom: 16, duration: "9.5s", delay: "3.1s", size: "2px", color: "var(--color-orbit-info)" },
  { left: 70, bottom: 15, duration: "8.2s", delay: "1.5s", size: "3px", color: "var(--color-orbit-warning)" },
] as const;

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
        <circle
          key={s.key}
          cx={s.x}
          cy={s.y}
          r={s.dot}
          fill={stroke}
          opacity={s.opacity}
          style={spin}
        />
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

/* ------------------------------------------------------------------ */
/*  AgentOrbit — the full composed visual                              */
/* ------------------------------------------------------------------ */

export function AgentOrbit({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative mx-auto aspect-square w-full max-w-[400px]" aria-hidden>
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
        <OrbitRing r="45" stroke="var(--color-orbit-info)" duration="80s" reverse />
        <OrbitRing r="35" stroke="var(--color-orbit-accent)" duration="70s" />
        <OrbitRing r="25" stroke="var(--color-orbit-primary)" duration="60s" reverse />
        <OrbitRing r="15" stroke="var(--color-orbit-warning)" duration="50s" />

        {/* Single satellite on the outer ring — matches its direction */}
        <OrbitDot r="45" color="var(--color-orbit-info)" duration="80s" reverse />

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
            <Bot className="relative z-10 h-7 w-7 text-primary drop-shadow-[0_0_8px_var(--color-primary-glow)]" />
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
