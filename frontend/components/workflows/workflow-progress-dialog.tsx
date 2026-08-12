"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Circle, Loader2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useWorkflowActivity, useWorkflowRun } from "@/lib/hooks";
import type {
  WorkflowActivity,
  WorkflowActivityStatus,
  WorkflowRun,
} from "@/lib/types";
import { cn } from "@/lib/cn";
import { shortId } from "@/lib/format";

const TERMINAL_STATUSES = ["FAILED", "ERROR", "REVIEW_FAILED"];

const EMPTY_ACTIVITIES: WorkflowActivity[] = [];

function stepToStatus(
  status: string | null | undefined,
): WorkflowActivityStatus | "pending" {
  switch ((status ?? "").toUpperCase()) {
    case "SUCCEEDED":
    case "COMPLETED":
    case "SUCCESS":
      return "completed";
    case "FAILED":
    case "ERROR":
      return "failed";
    case "RUNNING":
    case "IN_PROGRESS":
      return "running";
    default:
      return "pending";
  }
}

function statusLabel(status: WorkflowActivityStatus | "pending") {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Waiting";
  }
}

interface ProgressRow {
  key: string;
  stepId: string;
  name: string;
  kind: string;
  status: WorkflowActivityStatus | "pending";
  message: string;
  stepMessage: string;
  fileCount: number;
}

function buildRows(
  run: WorkflowRun,
  activities: WorkflowActivity[],
): ProgressRow[] {
  const rows: ProgressRow[] = (run.steps ?? []).map((step) => ({
    key: step.id,
    stepId: step.step_id,
    name: step.name,
    kind: step.agent_kind ?? "",
    status: stepToStatus(step.status),
    message: "",
    stepMessage: "",
    fileCount: 0,
  }));
  const index = new Map<string, ProgressRow>();
  for (const row of rows) index.set(row.stepId, row);

  // Some events (e.g. file counts) carry no step_id, so attribute them to the
  // most recent row that matches the agent kind.
  const byKind = (item: WorkflowActivity) =>
    item.agent_kind
      ? [...rows].reverse().find((row) => row.kind === item.agent_kind)
      : undefined;

  for (const item of activities) {
    if (item.kind === "run" || item.kind === "workflow.checkpoint") continue;
    let row = item.step_id ? index.get(item.step_id) : undefined;
    if (!row) row = byKind(item);
    if (!row) continue;

    if (item.kind === "step" || item.kind === "agent.started") {
      row.status = item.status;
      if (item.status === "completed" || item.status === "failed") {
        row.stepMessage = item.message;
      }
    } else if (
      item.kind.startsWith("review") ||
      item.kind === "workflow.review_failed"
    ) {
      row.status = item.status;
      if (item.message) row.message = item.message;
    } else if (item.kind === "reasoning" || item.kind === "phase") {
      if (item.message) row.message = item.message;
    } else if (item.kind === "tool") {
      const files = item.message.match(/(created|modified) (\d+) file/);
      if (files) {
        row.fileCount = Math.max(row.fileCount, parseInt(files[2], 10));
      } else if (item.message) {
        row.message = item.message;
      }
    }
  }
  return rows;
}

function AgentRow({ row }: { row: ProgressRow }) {
  const running = row.status === "running";
  const completed = row.status === "completed";
  const failed = row.status === "failed";

  const caption = (() => {
    if (running) return row.message || null;
    if (completed) {
      if (row.fileCount > 0)
        return `${row.fileCount} file${row.fileCount === 1 ? "" : "s"} created`;
      return row.stepMessage || row.message || null;
    }
    if (failed) return row.stepMessage || row.message || "Step failed";
    return null;
  })();

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-edge bg-surface-2/50 px-3 py-2">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] font-mono text-[10px] font-semibold",
          failed
            ? "bg-danger-soft text-danger"
            : completed
              ? "bg-success-soft text-success"
              : running
                ? "bg-primary-soft text-primary"
                : "bg-surface-3 text-muted",
        )}
      >
        {(row.name || "?").charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              "truncate font-display text-xs font-semibold tracking-tight",
              failed ? "text-danger" : "text-text",
            )}
          >
            {row.name}
          </p>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em]",
              running
                ? "text-primary"
                : completed
                  ? "text-success"
                  : failed
                    ? "text-danger"
                    : "text-faint",
            )}
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : completed ? (
              <Check className="h-3 w-3" />
            ) : failed ? (
              <X className="h-3 w-3" />
            ) : (
              <Circle className="h-2.5 w-2.5" />
            )}
            {statusLabel(row.status)}
          </span>
        </div>
        {row.kind && (
          <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            {row.kind}
          </p>
        )}
        {caption && (
          <motion.p
            key={caption}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "mt-1 truncate text-[11px] leading-5",
              running
                ? "font-medium text-text"
                : failed
                  ? "text-danger"
                  : "text-text-dim",
            )}
          >
            {caption}
          </motion.p>
        )}
      </div>
    </div>
  );
}

export function WorkflowProgressDialog({
  run,
  onClose,
  onOpenDetails,
}: {
  run: WorkflowRun | null;
  onClose: () => void;
  onOpenDetails: (run: WorkflowRun) => void;
}) {
  const reduced = useReducedMotion();
  const runId = run?.id ?? null;

  const { data: runDetail } = useWorkflowRun(runId, !!runId);
  const { data: activity } = useWorkflowActivity(runId, !!runId);

  const liveRun = runDetail ?? run;
  const activities = activity?.activities ?? EMPTY_ACTIVITIES;
  const done = activity?.done ?? false;

  const rows = useMemo(
    () => (liveRun ? buildRows(liveRun, activities) : []),
    [liveRun, activities],
  );

  // Auto-close shortly after the run reaches a terminal state.
  const doneRef = useRef(false);
  useEffect(() => {
    if (!done || doneRef.current) return;
    doneRef.current = true;
    const timer = setTimeout(onClose, 1400);
    return () => clearTimeout(timer);
  }, [done, onClose]);
  useEffect(() => {
    doneRef.current = false;
  }, [runId]);

  const runStatus = (activity?.status ?? liveRun?.status ?? "").toUpperCase();
  const failed = TERMINAL_STATUSES.includes(runStatus);

  const footerLabel = !done
    ? "Workflow running…"
    : failed
      ? runStatus === "REVIEW_FAILED"
        ? "Workflow stopped — review failed"
        : "Workflow failed"
      : "Workflow completed";

  const badgeTone = failed ? "danger" : done ? "success" : "primary";

  return (
    <Dialog
      open={!!run}
      onClose={onClose}
      title="AI Workflow"
      description={liveRun ? `#${shortId(liveRun.id)} · ${liveRun.kind}` : undefined}
      footer={
        <>
          <div
            className={cn(
              "mr-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]",
              !done && "text-primary",
              done && failed && "text-danger",
              done && !failed && "text-success",
            )}
          >
            {!done ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : failed ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {footerLabel}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => liveRun && onOpenDetails(liveRun)}
          >
            View Details
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge tone={badgeTone} dot>
            {done ? "finished" : "live"}
          </Badge>
          <span className="font-mono text-[9px] tracking-[0.08em] text-faint">
            {rows.length} agent{rows.length === 1 ? "" : "s"} ·{" "}
            {activities.length} event{activities.length === 1 ? "" : "s"}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="px-1 py-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            No agents scheduled yet — the crew is gearing up.
          </p>
        ) : (
          <div
            className={cn(
              "space-y-1.5",
              reduced && "[&_*]:!animate-none",
            )}
          >
            <AnimatePresence initial={false}>
              {rows.map((row) => (
                <motion.div
                  key={row.key}
                  layout={!reduced}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.2, ease: "easeOut" }}
                >
                  <AgentRow row={row} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </Dialog>
  );
}
