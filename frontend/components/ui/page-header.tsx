"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Consistent, animated page header used across all pages.
 * Each element (eyebrow, title, description, actions) reveals with staggered blur-fade.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  center,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  center?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        center
          ? "items-center text-center"
          : "md:flex-row md:items-end md:justify-between",
      )}
    >
      <div className={cn("max-w-2xl", center && "mx-auto")}>
        {eyebrow && (
          <motion.span
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.3, ease: EASE, delay: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-primary"
          >
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-primary"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            {eyebrow}
          </motion.span>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.38, ease: EASE, delay: 0.08 }}
          className="mt-3 font-display text-2xl font-bold tracking-tight text-text sm:text-4xl"
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.16 }}
            className={cn("mt-2 text-sm leading-6 text-muted", center && "mx-auto max-w-xl")}
          >
            {description}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.32, ease: EASE, delay: 0.22 }}
          className={cn("flex shrink-0 items-center gap-2", center && "mx-auto")}
        >
          {actions}
        </motion.div>
      )}
    </div>
  );
}

