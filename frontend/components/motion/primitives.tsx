"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type Variants,
} from "motion/react";

export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

/* ── Core variant tokens ── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(4px)" },
  show: {
    opacity: 1, y: 0, filter: "blur(0px)",
    transition: { duration: 0.35, ease: EASE },
  },
};

const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.93, filter: "blur(4px)" },
  show: {
    opacity: 1, scale: 1, filter: "blur(0px)",
    transition: { duration: 0.32, ease: EASE },
  },
};

/* ── Page transition ── */

export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
      transition={{ duration: 0.28, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Stagger (mount-triggered, for above-fold content) ── */

export function Stagger({
  children, className, delay = 0, step = 0.05,
}: {
  children: ReactNode; className?: string; delay?: number; step?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: step, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={fadeUp}>{children}</motion.div>;
}

/* ── StaggerGrid (scroll-triggered stagger for mid-page grids) ── */

export function StaggerGrid({
  children, className, step = 0.06, delay = 0,
}: {
  children: ReactNode; className?: string; step?: number; delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: step, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGridItem({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={fadeScale}>{children}</motion.div>;
}

/* ── Reveal — scroll-triggered single element ── */

export function Reveal({
  children, className, direction = "up", delay = 0,
}: {
  children: ReactNode; className?: string; direction?: "up" | "down" | "left" | "right" | "scale"; delay?: number;
}) {
  const offset = 28;
  const hidden = {
    up:    { opacity: 0, y: offset,   filter: "blur(5px)" },
    down:  { opacity: 0, y: -offset,  filter: "blur(5px)" },
    left:  { opacity: 0, x: offset,   filter: "blur(5px)" },
    right: { opacity: 0, x: -offset,  filter: "blur(5px)" },
    scale: { opacity: 0, scale: 0.91, filter: "blur(5px)" },
  }[direction];

  return (
    <motion.div
      className={className}
      initial={hidden}
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── FadeIn — simple opacity only ── */

export function FadeIn({
  children, className, delay = 0, duration = 0.4,
}: {
  children: ReactNode; className?: string; delay?: number; duration?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── SlideIn — directional spring slide ── */

export function SlideIn({
  children, className, from = "bottom", distance = 18, delay = 0,
}: {
  children: ReactNode; className?: string;
  from?: "top" | "bottom" | "left" | "right"; distance?: number; delay?: number;
}) {
  const initial = {
    top:    { y: -distance, opacity: 0 },
    bottom: { y: distance,  opacity: 0 },
    left:   { x: -distance, opacity: 0 },
    right:  { x: distance,  opacity: 0 },
  }[from];
  return (
    <motion.div
      className={className}
      initial={initial}
      animate={{ y: 0, x: 0, opacity: 1 }}
      transition={{ ...EASE_SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── ScaleIn — scale + blur pop entrance ── */

export function ScaleIn({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.88, filter: "blur(8px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.38, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── PopIn — spring pop for chips, badges, icons ── */

export function PopIn({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 22, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── MagneticHover — subtle magnetic pull ── */

export function MagneticHover({
  children, className, strength = 0.25,
}: {
  children: ReactNode; className?: string; strength?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    ref.current.style.transform = `translate(${(e.clientX - cx) * strength}px, ${(e.clientY - cy) * strength}px)`;
  };
  const handleLeave = () => {
    if (!ref.current) return;
    ref.current.style.transition = "transform 0.4s cubic-bezier(0.22,1,0.36,1)";
    ref.current.style.transform = "";
  };

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ transition: "transform 0.1s linear", willChange: "transform" }}
    >
      {children}
    </div>
  );
}

/* ── Parallax — lightweight scroll parallax ── */

export function Parallax({ children, className, speed = 0.12 }: { children: ReactNode; className?: string; speed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [speed * 160, -speed * 160]);
  return <motion.div ref={ref} style={{ y }} className={className}>{children}</motion.div>;
}

/* ── GlowPulse — animated ping dot for status ── */

export function GlowPulse({
  active = true, color = "primary", size = "sm", className,
}: {
  active?: boolean; color?: "primary" | "success" | "danger" | "info" | "warning"; size?: "sm" | "md"; className?: string;
}) {
  const colorMap = { primary: "bg-primary", success: "bg-success", danger: "bg-danger", info: "bg-info", warning: "bg-warning" };
  const sizeMap  = { sm: "h-1.5 w-1.5", md: "h-2.5 w-2.5" };
  return (
    <span className={`relative inline-flex ${sizeMap[size]} ${className ?? ""}`}>
      {active && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colorMap[color]} opacity-70`} />}
      <span className={`relative inline-flex rounded-full ${sizeMap[size]} ${colorMap[color]} ${active ? "" : "opacity-40"}`} />
    </span>
  );
}

/* ── HoverCard — lift + scale on hover ── */

export function HoverCard({ children, className, liftY = 3 }: { children: ReactNode; className?: string; liftY?: number }) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -liftY, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={EASE_SPRING}
    >
      {children}
    </motion.div>
  );
}

/* ── AnimatedCounter — number flip on value change ── */

export function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  return (
    <motion.span
      key={value}
      className={className}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      {value}
    </motion.span>
  );
}

export { fadeUp };

