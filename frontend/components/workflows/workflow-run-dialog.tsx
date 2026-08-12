"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  UserCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ActivityPanel } from "@/components/workflows/activity-panel";
import { WorkflowSummaryCollapsible } from "@/components/workflows/workflow-summary";
import { useApproveWorkflow } from "@/lib/hooks";
import type { ReviewResult, WorkflowRun } from "@/lib/types";
import { formatDate, shortId } from "@/lib/format";
import { cn } from "@/lib/cn";

function stepIcon(status: string) {
  switch ((status ?? "").toUpperCase()) {
    case "COMPLETED":
    case "SUCCESS":
    case "SUCCEEDED":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
    case "RUNNING":
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />;
    case "FAILED":
    case "ERROR":
      return <XCircle className="h-4 w-4 shrink-0 text-danger" />;
    default:
      return <Circle className="h-4 w-4 shrink-0 text-muted" />;
  }
}

export function WorkflowRunDialog({
  run,
  onClose,
  onOpenReview,
}: {
  run: WorkflowRun | null;
  onClose: () => void;
  onOpenReview?: (run: WorkflowRun) => void;
}) {
  const { push } = useToast();
  const approve = useApproveWorkflow();
  const [comment, setComment] = useState("");

  const runId = run?.id ?? null;
  useEffect(() => {
    setComment("");
    approve.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, approve.reset]);

  const pendingApproval = run?.steps.some(
    (step) =>
      step.agent_kind === null && (step.status ?? "").toUpperCase() === "WAITING",
  );

  if (!run) return null;

  const isActive =
    ["RUNNING", "IN_PROGRESS", "PENDING"].includes(
      (run.status ?? "").toUpperCase(),
    );

  const review = run.result?.review as ReviewResult | undefined;
  const reviewFailed = review?.status === "failed";

  return (
    <Dialog open={!!run} onClose={onClose} title={run.kind} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{run.kind}</Badge>
          <Badge tone={run.status === "RUNNING" ? "info" : "neutral"} dot>
            {run.status}
          </Badge>
          <span className="font-mono text-[10px] text-faint">
            {shortId(run.id)}
          </span>
          <span className="ml-auto text-[11px] text-faint">
            started {formatDate(run.started_at)}
            {run.finished_at ? ` · finished ${formatDate(run.finished_at)}` : ""}
          </span>
        </div>

        {runId && (
          <ActivityPanel
            runId={runId}
            title={isActive ? "Live feed" : "Crew transcript"}
            compact
          />
        )}

        {review && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5",
              reviewFailed
                ? "border-danger/30 bg-danger-soft/40"
                : "border-success/25 bg-success-soft/40",
            )}
          >
            <span
              className={cn(
                "text-[11px] font-semibold",
                reviewFailed ? "text-danger" : "text-success",
              )}
            >
              Code review · {review.status}
            </span>
            <span className="font-mono text-[11px] text-text-dim">
              {review.score}/100 · {review.issues.length} finding
              {review.issues.length === 1 ? "" : "s"}
            </span>
            <Button
              size="sm"
              variant={reviewFailed ? "danger" : "secondary"}
              className="ml-auto"
              onClick={() => onOpenReview?.(run)}
            >
              View report
            </Button>
          </div>
        )}

        {run.result?.summary ? <WorkflowSummaryCollapsible run={run} /> : null}

        {run.context && Object.keys(run.context).length > 0 && (
          <div className="rounded-md border border-edge-soft bg-surface-2 px-3 py-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Context
            </p>
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-text-dim">
              {JSON.stringify(run.context, null, 2)}
            </pre>
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
            Steps · {run.steps.length}
          </p>
          <ol className="space-y-1">
            {run.steps.map((step, index) => {
              const isHumanGate = step.agent_kind === null;
              const status = (step.status ?? "").toUpperCase();
              return (
                <li
                  key={step.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-3 py-2.5",
                    status === "RUNNING"
                      ? "border-info/30 bg-info-soft"
                      : "border-edge-soft bg-surface-2",
                  )}
                >
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center font-mono text-[10px] text-faint">
                    {index + 1}
                  </span>
                  {stepIcon(step.status)}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-text">{step.name}</p>
                      {isHumanGate && (
                        <Badge tone="warning" dot>
                          human gate
                        </Badge>
                      )}
                      {step.agent_kind && (
                        <span className="font-mono text-[10px] text-faint">
                          {step.agent_kind}
                        </span>
                      )}
                    </div>
                    {step.detail && (
                      <p className="mt-0.5 text-[11px] text-muted">{step.detail}</p>
                    )}
                    {step.output && Object.keys(step.output).length > 0 && (
                      <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-surface-3 px-2 py-1.5 font-mono text-[10px] leading-4 text-text-dim">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-faint">
                    {status.toLowerCase().replace("_", " ")}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {pendingApproval && (
          <div className="rounded-md border border-warning/30 bg-warning-soft px-4 py-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-warning" />
              <p className="text-xs font-semibold text-warning">
                Human approval required
              </p>
            </div>
            <p className="mt-1 text-[11px] text-text-dim">
              This workflow is waiting for your decision before continuing.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional comment…"
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="success"
                  loading={approve.isPending}
                  onClick={() =>
                    approve.mutate(
                      { run_id: run.id, decision: "approve", comment },
                      {
                        onSuccess: () => {
                          push("Approved — workflow continues.", "success");
                          setComment("");
                        },
                        onError: (e) => push((e as Error).message, "error"),
                      },
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={approve.isPending}
                  onClick={() =>
                    approve.mutate(
                      { run_id: run.id, decision: "reject", comment },
                      {
                        onSuccess: () => push("Workflow rejected.", "info"),
                        onError: (e) => push((e as Error).message, "error"),
                      },
                    )
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
