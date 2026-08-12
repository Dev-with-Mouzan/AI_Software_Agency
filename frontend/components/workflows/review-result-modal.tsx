"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { AlertTriangle, CheckCircle2, FileText, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useAgentRun } from "@/lib/hooks";
import type { ReviewIssue, ReviewResult, WorkflowRun } from "@/lib/types";
import { cn } from "@/lib/cn";

const SEVERITY_META: Record<ReviewIssue["severity"], { label: string; tone: string }> = {
  critical: { label: "Critical", tone: "danger" },
  high: { label: "High", tone: "danger" },
  medium: { label: "Medium", tone: "warning" },
  low: { label: "Low", tone: "neutral" },
  suggestion: { label: "Suggestion", tone: "primary" },
};

const SEVERITY_ORDER: ReviewIssue["severity"][] = [
  "critical",
  "high",
  "medium",
  "low",
  "suggestion",
];

export function ReviewResultModal({
  run,
  onClose,
  onDispatched,
}: {
  run: WorkflowRun | null;
  onClose: () => void;
  onDispatched: () => void;
}) {
  const { push } = useToast();
  const dispatch = useAgentRun();

  const review = useMemo<ReviewResult | null>(() => {
    if (!run) return null;
    const candidate = run.result?.review as ReviewResult | undefined;
    return candidate ?? null;
  }, [run]);

  const issuesBySeverity = useMemo(() => {
    const groups = new Map<ReviewIssue["severity"], ReviewIssue[]>();
    for (const severity of SEVERITY_ORDER) groups.set(severity, []);
    for (const issue of review?.issues ?? []) {
      const list = groups.get(issue.severity);
      if (list) list.push(issue);
    }
    return groups;
  }, [review]);

  const failed = review?.status === "failed";
  const fixers = review?.required_fixes?.filter((f) => f !== "code_reviewer") ?? [];

  const dispatchFix = () => {
    if (!run?.project_id || fixers.length === 0) return;
    dispatch.mutate(
      {
        project_id: run.project_id,
        agents: fixers,
        command: "Fix the code review findings assigned to you, then verify the changes.",
      },
      {
        onSuccess: () => {
          push(`Dispatched ${fixers.join(", ")} to fix the findings.`, "success");
          onDispatched();
        },
        onError: (e) => push((e as Error).message, "error"),
      },
    );
  };

  return (
    <Dialog
      open={!!run && !!review}
      onClose={onClose}
      title="Code review"
      description="Findings from the code reviewer on the last completed step"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {failed && fixers.length > 0 && (
            <Button
              variant={fixers.length ? "primary" : "ghost"}
              loading={dispatch.isPending}
              disabled={!run?.project_id}
              onClick={dispatchFix}
            >
              Fix with {fixers.join(", ")}
            </Button>
          )}
        </>
      }
    >
      {review && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={failed ? "danger" : "success"} dot>
              {failed ? "Failed" : "Passed"}
            </Badge>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              Score
            </span>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, review.score)}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className={cn(
                  "h-full rounded-full",
                  failed ? "bg-danger" : "bg-success",
                )}
              />
            </div>
            <span className="font-display text-lg font-bold text-text">
              {review.score}
              <span className="text-xs font-medium text-muted">/100</span>
            </span>
          </div>

          {review.summary && (
            <p className="text-xs leading-5 text-text-dim">{review.summary}</p>
          )}

          {review.files_reviewed.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted" />
              {review.files_reviewed.map((file) => (
                <span
                  key={file}
                  className="rounded-[3px] border border-edge bg-surface-2 px-1.5 py-px font-mono text-[10px] text-muted"
                >
                  {file}
                </span>
              ))}
            </div>
          )}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              {failed ? (
                <AlertTriangle className="h-3.5 w-3.5 text-danger" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
              )}
              Findings · {review.issues.length}
            </p>
            {review.issues.length === 0 ? (
              <div className="rounded-lg border border-success/25 bg-success-soft px-4 py-3">
                <p className="flex items-center gap-2 text-xs font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" /> No issues raised.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {SEVERITY_ORDER.filter((s) => issuesBySeverity.get(s)?.length).map(
                  (severity) => (
                    <div key={severity} className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {SEVERITY_META[severity].label} ·{" "}
                        {issuesBySeverity.get(severity)!.length}
                      </p>
                      {issuesBySeverity.get(severity)!.map((issue, index) => (
                        <div
                          key={`${issue.file}:${issue.line}:${index}`}
                          className={cn(
                            "rounded-lg border px-3 py-2.5",
                            severity === "critical" || severity === "high"
                              ? "border-danger/30 bg-danger-soft/40"
                              : "border-edge bg-surface-2",
                          )}
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <p className="text-xs font-semibold text-text">
                              {issue.title}
                            </p>
                            {issue.file && (
                              <span className="font-mono text-[10px] text-muted">
                                {issue.file}
                                {issue.line ? `:${issue.line}` : ""}
                              </span>
                            )}
                          </div>
                          {issue.why && (
                            <p className="mt-1 text-[11px] leading-5 text-text-dim">
                              <span className="font-medium text-text-dim">Why:</span>{" "}
                              {issue.why}
                            </p>
                          )}
                          {issue.fix && (
                            <p className="mt-0.5 text-[11px] leading-5 text-muted">
                              <span className="font-medium text-text-dim">Fix:</span>{" "}
                              {issue.fix}
                            </p>
                          )}
                          {issue.agent && (
                            <span className="mt-1.5 inline-block rounded-[3px] border border-edge bg-surface px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                              {issue.agent}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
