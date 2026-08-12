"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

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
