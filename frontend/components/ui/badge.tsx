import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import { titleCase } from "@/lib/format";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-text-dim border-edge",
  primary: "bg-primary-soft text-primary border-primary/40",
  accent: "bg-accent-soft text-accent border-accent/40",
  success: "bg-success-soft text-success border-success/40",
  warning: "bg-warning-soft text-warning border-warning/40",
  danger: "bg-danger-soft text-danger border-danger/40",
  info: "bg-info-soft text-info border-info/40",
};
interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", {
            "bg-success": tone === "success",
            "bg-warning": tone === "warning",
            "bg-danger": tone === "danger",
            "bg-info": tone === "info",
            "bg-primary-hover": tone === "primary",
            "bg-accent": tone === "accent",
            "bg-muted": tone === "neutral",
          })}
        />
      )}
      {children}
    </span>
  );
}

export function statusTone(status: string): BadgeTone {
  const s = status.toUpperCase();
  if (["OK", "ACTIVE", "ONLINE", "DONE", "COMPLETED", "SUCCESS", "PASSED", "READY"].includes(s))
    return "success";
  if (["RUNNING", "IN_PROGRESS", "PENDING", "WAITING", "IDLE"].includes(s))
    return "info";
  if (["DEGRADED", "BLOCKED", "IN_REVIEW"].includes(s)) return "warning";
  if (["FAILED", "ERROR", "FAILING", "OFFLINE", "STOPPED", "REJECTED"].includes(s))
    return "danger";
  return "neutral";
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge tone={statusTone(status)} dot className={className}>
      {titleCase(status)}
    </Badge>
  );
}
