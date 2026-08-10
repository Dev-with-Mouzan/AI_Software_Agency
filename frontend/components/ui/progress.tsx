"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Progress({
  value,
  tone = "primary",
  className,
}: {
  value: number;
  tone?: "primary" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const colors: Record<string, string> = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
  };
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface-3",
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={cn("h-full origin-left rounded-full", colors[tone])}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamped / 100 }}
        transition={{ duration: 0.5, ease: EASE }}
      />
    </div>
  );
}
