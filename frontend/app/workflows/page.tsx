"use client";

import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  ListChecks,
  Workflow as WorkflowIcon,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CommandConsole } from "@/components/workflows/command-console";
import { WorkflowProgressDialog } from "@/components/workflows/workflow-progress-dialog";
import { WorkflowRunDialog } from "@/components/workflows/workflow-run-dialog";
import { RunHistory } from "@/components/workflows/run-history";
import { ReviewResultModal } from "@/components/workflows/review-result-modal";
import { EmptyState, PageLoader } from "@/components/ui/skeleton";
import { Stagger, StaggerItem, Reveal } from "@/components/motion/primitives";
import { TiltCard } from "@/components/motion/tilt";
import { CountUp } from "@/components/motion/count-up";
import { PageHeader } from "@/components/ui/page-header";
import { useWorkflowRuns } from "@/lib/hooks";
import type { WorkflowRun } from "@/lib/types";
import { cn } from "@/lib/cn";

const ACTIVE_STATUSES = ["RUNNING", "IN_PROGRESS"];
const DONE_STATUSES = ["COMPLETED", "SUCCESS", "SUCCEEDED"];
const FAILED_STATUSES = ["FAILED", "ERROR", "REVIEW_FAILED"];

function isActive(status: string) {
  return ACTIVE_STATUSES.includes(status.toUpperCase());
}
function isDone(status: string) {
  return DONE_STATUSES.includes(status.toUpperCase());
}
function isFailed(status: string) {
  return FAILED_STATUSES.includes(status.toUpperCase());
}

const STAT_TILES = [
  { key: "running", label: "Running now", icon: Activity, tone: "info" },
  { key: "done", label: "Completed", icon: CheckCircle2, tone: "success" },
  { key: "failed", label: "Failed", icon: XCircle, tone: "danger" },
  { key: "total", label: "Total runs", icon: ListChecks, tone: "primary" },
] as const;

export default function WorkflowsPage() {
  const runs = useWorkflowRuns();
  const [selected, setSelected] = useState<WorkflowRun | null>(null);
  const [progressRun, setProgressRun] = useState<WorkflowRun | null>(null);
  const [reviewRun, setReviewRun] = useState<WorkflowRun | null>(null);

  const list = runs.data ?? [];

  const handleSelect = (run: WorkflowRun) => {
    setSelected(run);
    const review = run.result?.review as
      | { status?: string }
      | undefined;
    if (review?.status === "failed") setReviewRun(run);
  };

  const handleFixDispatched = () => {
    setReviewRun(null);
    setSelected(null);
  };
  const counts = {
    running: list.filter((r) => isActive(r.status)).length,
    done: list.filter((r) => isDone(r.status)).length,
    failed: list.filter((r) => isFailed(r.status)).length,
    total: list.length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        center
        eyebrow="Work orders"
        title="Operations"
        description="Pick the agents in order, tell them what to do, and watch every run land here — live."
        actions={
          counts.running > 0 ? (
            <Badge tone="info" dot>
              {counts.running} running
            </Badge>
          ) : (
            <Badge tone="neutral" dot>
              idle
            </Badge>
          )
        }
      />

      {/* Stats strip */}
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4" step={0.06}>
        {STAT_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <StaggerItem key={tile.key} className="h-full">
              <TiltCard max={5} className="h-full rounded-xl">
                <div className="flex h-full items-center gap-3 rounded-xl border border-edge bg-surface/70 px-4 py-3.5 shadow-panel">
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                      tile.tone === "info" && "border-info/40 bg-info-soft text-info",
                      tile.tone === "success" && "border-success/40 bg-success-soft text-success",
                      tile.tone === "danger" && "border-danger/40 bg-danger-soft text-danger",
                      tile.tone === "primary" && "border-primary/40 bg-primary-soft text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold leading-none text-text">
                      <CountUp value={counts[tile.key]} />
                    </p>
                    <p className="mt-1 truncate text-[11px] font-medium text-text-dim">{tile.label}</p>
                  </div>
                </div>
              </TiltCard>
            </StaggerItem>
          );
        })}
      </Stagger>

      {/* Dispatch */}
      <CommandConsole onRunStarted={setProgressRun} />

      {/* Run history */}
      {runs.isLoading ? (
        <PageLoader label="Reading the ledger…" />
      ) : list.length === 0 ? (
        <Reveal>
          <EmptyState
            icon={<WorkflowIcon className="h-8 w-8" />}
            title="No work orders yet"
            description="Dispatch the crew from the console above and the ledger fills up here."
          />
        </Reveal>
      ) : (
        <Reveal>
          <Card className="overflow-hidden">
            <span
              aria-hidden
              className="block h-px w-full bg-gradient-to-r from-primary/60 to-transparent"
            />
            <CardHeader className="flex-row items-center justify-between" data-tour="ledger">
              <div>
                <CardTitle>The ledger</CardTitle>
                <p className="mt-0.5 text-xs font-medium text-text-dim">
                  Every dispatched work order, newest first
                </p>
              </div>
              <Badge tone="neutral">{list.length} runs</Badge>
            </CardHeader>
            <CardBody>
              <RunHistory runs={list} onSelect={handleSelect} />
            </CardBody>
          </Card>
        </Reveal>
      )}

      <WorkflowProgressDialog
        run={progressRun}
        onClose={() => setProgressRun(null)}
        onOpenDetails={(r) => {
          setProgressRun(null);
          setSelected(r);
        }}
      />

      <WorkflowRunDialog
        run={selected}
        onClose={() => setSelected(null)}
        onOpenReview={setReviewRun}
      />

      <ReviewResultModal
        run={reviewRun}
        onClose={() => setReviewRun(null)}
        onDispatched={handleFixDispatched}
      />
    </div>
  );
}
