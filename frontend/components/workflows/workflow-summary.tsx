"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bot,
  ChevronDown,
  FilePlus2,
  FilePen,
  FolderTree,
  GitBranch,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { WorkflowRun, WorkflowSummary } from "@/lib/types";
import { cn } from "@/lib/cn";

function WorkflowSummaryPanel({ run }: { run: WorkflowRun }) {
  const summary = useMemo<WorkflowSummary | null>(
    () => (run.result?.summary as WorkflowSummary | undefined) ?? null,
    [run],
  );

  if (!summary) return null;

  const review = summary.review;
  const changedFiles = [...summary.files_created, ...summary.files_modified];

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface-2/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge-soft px-4 py-3">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="font-display text-sm font-semibold tracking-tight text-text">
          Run summary
        </p>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
          {summary.project_type}
        </span>
      </div>

      <div className="space-y-4 px-4 py-4">
        <p className="text-xs leading-5 text-text-dim">{summary.project_request}</p>

        {summary.agents.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-muted" />
            {summary.agents.map((agent) => (
              <Badge
                key={agent.kind}
                tone={agent.status === "completed" ? "success" : "neutral"}
              >
                {agent.name}
              </Badge>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <MiniStat
            icon={FilePlus2}
            label="Created"
            value={summary.files.created}
          />
          <MiniStat
            icon={FilePen}
            label="Modified"
            value={summary.files.modified}
          />
        </div>

        {changedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {changedFiles.slice(0, 24).map((file) => (
              <span
                key={file}
                className="rounded-[3px] border border-edge bg-surface px-1.5 py-px font-mono text-[10px] text-muted"
              >
                {file}
              </span>
            ))}
            {changedFiles.length > 24 && (
              <span className="px-1 font-mono text-[10px] text-faint">
                +{changedFiles.length - 24} more
              </span>
            )}
          </div>
        )}

        {summary.structure.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <FolderTree className="h-3.5 w-3.5 text-muted" />
            {summary.structure.map((dir) => (
              <span
                key={dir}
                className="rounded-[3px] border border-edge bg-surface px-1.5 py-px font-mono text-[10px] text-muted"
              >
                {dir}/
              </span>
            ))}
          </div>
        )}

        {review && (
          <div className="flex items-center gap-2 rounded-lg border border-edge-soft bg-surface px-3 py-2.5">
            <span className="text-[11px] font-medium text-text-dim">
              Review:
            </span>
            <Badge tone={review.status === "passed" ? "success" : "danger"} dot>
              {review.status === "passed" ? "Passed" : "Failed"}
            </Badge>
            <span className="font-mono text-[11px] text-text">
              {review.score}/100
            </span>
            <span className="ml-auto text-[11px] text-muted">
              {review.issues.length} finding
              {review.issues.length === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {summary.checkpoints.length > 0 && (
          <div className="space-y-1">
            {summary.checkpoints.map((ckpt, index) => (
              <div key={ckpt.label} className="flex items-center gap-2">
                <GitBranch className="h-3 w-3 text-muted" />
                <span className="text-[11px] text-text-dim">{ckpt.label}</span>
                <AnimatePresence initial={false}>
                  {ckpt.created ? (
                    <motion.span
                      key={ckpt.commit ?? index}
                      initial={{ opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-[3px] border border-success/25 bg-success-soft px-1.5 py-px font-mono text-[9px] text-success"
                    >
                      {ckpt.commit?.slice(0, 7)}
                    </motion.span>
                  ) : (
                    <span className="rounded-[3px] border border-edge bg-surface px-1.5 py-px font-mono text-[9px] text-muted">
                      {ckpt.reason ?? "skipped"}
                    </span>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FilePlus2;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-edge-soft bg-surface px-3 py-2">
      <Icon className="h-4 w-4 text-muted" />
      <span className="font-display text-sm font-bold text-text">{value}</span>
      <span className="text-[10px] uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
    </div>
  );
}

export function WorkflowSummaryCollapsible({ run }: { run: WorkflowRun }) {
  const summary = useMemo<WorkflowSummary | null>(
    () => (run.result?.summary as WorkflowSummary | undefined) ?? null,
    [run],
  );
  const [open, setOpen] = useToggle(true);

  if (!summary) return null;

  return (
    <div className={cn("rounded-xl border border-edge bg-surface-2/40")}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="font-display text-sm font-semibold tracking-tight text-text">
          Run summary
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 text-muted transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <WorkflowSummaryPanel run={run} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function useToggle(initial: boolean) {
  const [value, setValue] = useState(initial);
  return [value, setValue] as const;
}
