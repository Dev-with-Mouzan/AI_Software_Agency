import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Hourglass,
  Loader2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { formatDuration } from "@/lib/format";
import type { WorkflowRun, WorkflowStep } from "@/lib/types";

type RunTone = "primary" | "success" | "warning" | "danger" | "info";

export interface RunStatusMeta {
  tone: RunTone;
  Icon: LucideIcon;
}

const RUN_STATUS: Record<string, RunStatusMeta> = {
  SUCCESS: { tone: "success", Icon: CheckCircle2 },
  COMPLETED: { tone: "success", Icon: CheckCircle2 },
  SUCCEEDED: { tone: "success", Icon: CheckCircle2 },
  FAILED: { tone: "danger", Icon: XCircle },
  ERROR: { tone: "danger", Icon: XCircle },
  REJECTED: { tone: "danger", Icon: XCircle },
  REVIEW_FAILED: { tone: "danger", Icon: AlertTriangle },
  RUNNING: { tone: "info", Icon: Loader2 },
  IN_PROGRESS: { tone: "info", Icon: Loader2 },
  WAITING: { tone: "warning", Icon: Hourglass },
  PENDING: { tone: "primary", Icon: Clock },
  QUEUED: { tone: "primary", Icon: Clock },
};

export function runStatusMeta(status: string | null | undefined): RunStatusMeta {
  return RUN_STATUS[(status ?? "").toUpperCase()] ?? { tone: "primary", Icon: Circle };
}

const STEP_DONE = ["COMPLETED", "SUCCESS", "SUCCEEDED"] as const;

export function isStepDone(status: string | null | undefined): boolean {
  return STEP_DONE.includes((status ?? "").toUpperCase() as (typeof STEP_DONE)[number]);
}

export function isStepFailed(status: string | null | undefined): boolean {
  return ["FAILED", "ERROR"].includes((status ?? "").toUpperCase());
}

export function isStepRunning(status: string | null | undefined): boolean {
  return ["RUNNING", "IN_PROGRESS"].includes((status ?? "").toUpperCase());
}

export function runProgress(run: WorkflowRun): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = run.steps?.length ?? 0;
  const completed = (run.steps ?? []).filter((s) => isStepDone(s.status)).length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

export function runDuration(
  run: Pick<WorkflowRun, "started_at" | "finished_at">,
): string {
  return formatDuration(run.started_at, run.finished_at);
}

export function stepLabel(step: WorkflowStep): string {
  return step.agent_kind ?? step.name ?? "step";
}
