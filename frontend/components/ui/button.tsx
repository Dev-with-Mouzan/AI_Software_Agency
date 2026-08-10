"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "accent";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-ink hover:bg-primary-hover shadow-sm hover:shadow-glow focus-visible:ring-ring/50",
  secondary:
    "bg-surface-2 text-text border border-edge hover:bg-surface-3 hover:border-edge focus-visible:ring-edge",
  ghost:
    "bg-transparent text-text-dim hover:text-text hover:bg-surface-2 focus-visible:ring-edge",
  danger:
    "bg-danger text-danger-ink hover:opacity-90 focus-visible:ring-danger/50",
  success:
    "bg-success text-success-ink hover:opacity-90 focus-visible:ring-success/50",
  accent:
    "bg-accent text-accent-ink hover:opacity-90 shadow-sm focus-visible:ring-accent/50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-sm gap-2",
  icon: "h-9 w-9",
};

interface ButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd"
  > {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      disabled={disabled || loading}
      whileHover={{ y: -1 }}
      whileTap={{ scale: size === "icon" ? 0.92 : 0.97 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </motion.button>
  );
}
