"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/cn";

interface CardProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd"
  > {
  lift?: boolean;
}

export function Card({
  lift = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <motion.div
      whileHover={lift ? { y: -3 } : undefined}
      transition={
        lift ? { type: "spring", stiffness: 420, damping: 30 } : undefined
      }
      className={cn(
        "rounded-xl border border-edge bg-surface shadow-panel transition-colors duration-200",
        lift && "hover:border-primary/40 hover:shadow-glow",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-edge-soft px-5 py-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <h3
      className={cn(
        "font-display text-[15px] font-semibold tracking-tight text-text",
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <p className={cn("text-xs text-muted", className)}>{children}</p>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-t border-edge-soft bg-surface-2/60 px-5 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
