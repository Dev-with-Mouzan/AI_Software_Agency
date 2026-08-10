"use client";

import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

import { Badge, StatusBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { cn } from "@/lib/cn";
import { shortId, formatDate } from "@/lib/format";
import type { WorkflowRun } from "@/lib/types";
import {
  isStepDone,
  isStepFailed,
  isStepRunning,
  runDuration,
  runProgress,
  runStatusMeta,
  stepLabel,
} from "@/components/workflows/run-utils";

function runDescription(run: WorkflowRun): string {
  const step =
    run.steps?.find((s) => isStepRunning(s.status)) ??
    run.steps?.[0];
  if (step?.detail) return step.detail;
  if (typeof run.context?.command === "string" && run.context.command) {
    return run.context.command;
  }
  return "";
}

function StepPills({ run }: { run: WorkflowRun }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(run.steps ?? []).map((step) => (
        <span
          key={step.id}
          className={cn(
            "rounded-full border px-2 py-px font-mono text-[10px]",
            isStepFailed(step.status) && "border-danger/30 bg-danger-soft text-danger",
            isStepRunning(step.status) && "border-info/30 bg-info-soft text-info",
            isStepDone(step.status) && "border-edge bg-surface-2 text-text-dim",
            !isStepDone(step.status) &&
              !isStepRunning(step.status) &&
              !isStepFailed(step.status) &&
              "border-edge-soft bg-surface-2/60 text-faint",
          )}
        >
          {stepLabel(step)}
        </span>
      ))}
    </div>
  );
}

function RunRow({
  run,
  onSelect,
}: {
  run: WorkflowRun;
  onSelect: (run: WorkflowRun) => void;
}) {
  const meta = runStatusMeta(run.status);
  const Icon = meta.Icon;
  const { completed, total, percent } = runProgress(run);
  const running = run.status?.toUpperCase() === "RUNNING";
  const description = runDescription(run);

  const chip = cn(
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
    running && "border-info/40 bg-info-soft text-info",
    !running && meta.tone === "success" && "border-success/40 bg-success-soft text-success",
    !running && meta.tone === "danger" && "border-danger/40 bg-danger-soft text-danger",
    !running &&
      meta.tone !== "success" &&
      meta.tone !== "danger" &&
      "border-edge bg-surface-2 text-text-dim",
  );

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(run)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="group block w-full rounded-xl border border-edge bg-surface p-4 text-left shadow-panel transition-colors duration-200 hover:border-primary/40 hover:shadow-glow"
    >
      {/* Desktop ledger row */}
      <div className="hidden items-center gap-4 md:grid md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_170px_110px]">
        <div className="flex items-center gap-2.5">
          <span className={chip}>
            <Icon className={cn("h-4 w-4", running && "animate-spin")} />
          </span>
          <StatusBadge status={run.status} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone="primary">{run.kind}</Badge>
            <span className="font-mono text-[10px] tracking-[0.06em] text-faint">
              #{shortId(run.id)}
            </span>
          </div>
          {description && (
            <p className="mt-1 truncate text-[11px] text-muted">{description}</p>
          )}
        </div>

        <div className="min-w-0">
          <StepPills run={run} />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-faint">
              {completed}/{total} steps
            </span>
            <span className="font-mono font-medium text-text-dim">{percent}%</span>
          </div>
          <Progress value={percent} tone={running ? "info" : meta.tone} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <div className="text-right">
            <p className="text-[11px] text-text-dim">{formatDate(run.started_at)}</p>
            <p className="font-mono text-[10px] text-faint">{runDuration(run)}</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-faint transition-colors group-hover:text-primary" />
        </div>
      </div>

      {/* Mobile card row */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={chip}>
              <Icon className={cn("h-4 w-4", running && "animate-spin")} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge tone="primary">{run.kind}</Badge>
                <span className="font-mono text-[10px] tracking-[0.06em] text-faint">
                  #{shortId(run.id)}
                </span>
              </div>
              {description && (
                <p className="mt-0.5 truncate text-[11px] text-muted">{description}</p>
              )}
            </div>
          </div>
          <StatusBadge status={run.status} />
        </div>

        <StepPills run={run} />

        <div className="flex items-center gap-3">
          <Progress value={percent} tone={running ? "info" : meta.tone} className="flex-1" />
          <span className="font-mono text-[10px] tracking-[0.06em] text-faint">
            {completed}/{total} · {percent}%
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-edge-soft pt-2">
          <span className="text-[11px] text-faint">
            {formatDate(run.started_at)} · {runDuration(run)}
          </span>
          <ArrowUpRight className="h-4 w-4 text-faint transition-colors group-hover:text-primary" />
        </div>
      </div>
    </motion.button>
  );
}

export function RunHistory({
  runs,
  onSelect,
}: {
  runs: WorkflowRun[];
  onSelect: (run: WorkflowRun) => void;
}) {
  return (
    <div>
      <div className="mb-2 hidden items-center gap-4 px-4 font-mono text-[9px] uppercase tracking-[0.16em] text-faint md:grid md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_170px_110px]">
        <span>Status</span>
        <span>Run</span>
        <span>Steps</span>
        <span>Progress</span>
        <span className="text-right">Duration</span>
      </div>
      <Stagger className="space-y-2.5" step={0.05}>
        {runs.map((run) => (
          <StaggerItem key={run.id}>
            <RunRow run={run} onSelect={onSelect} />
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
