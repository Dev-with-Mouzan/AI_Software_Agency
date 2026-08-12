"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import {
  CheckCircle2,
  ExternalLink,
  Globe2,
  Rocket,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { PageLoader } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useDeploymentLogs, useDeploymentStatus } from "@/lib/hooks";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

function levelClass(level: string): string {
  const l = level.toLowerCase();
  if (l === "error") return "text-danger";
  if (l === "warn") return "text-warning";
  if (l === "command") return "text-primary";
  if (l === "output") return "text-text-dim";
  return "text-muted";
}

const STAGES = ["validate", "build", "deploy", "verify"] as const;

export function DeployProgressModal({
  projectId,
  open,
  onClose,
  onOpenDetails,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onOpenDetails: () => void;
}) {
  const { push } = useToast();
  const status = useDeploymentStatus(projectId, open);
  const logs = useDeploymentLogs(projectId, open);

  const deployment = status.data ?? null;
  const running = status.isLoading || (deployment !== null && deployment.status === "RUNNING");

  const stageIndex = useMemo(() => {
    const text = (deployment?.error ?? "").toLowerCase();
    if (/verify|probe|dns|https/.test(text)) return 3;
    if (/deploy|upload|vercel|aws/.test(text)) return 2;
    if (/build|npm|install/.test(text)) return 1;
    return 0;
  }, [deployment?.error]);

  const currentStage = STAGES[Math.min(stageIndex, STAGES.length - 1)];

  const copyUrl = () => {
    if (!deployment?.deployment_url) return;
    void navigator.clipboard.writeText(deployment.deployment_url);
    push("Deployment URL copied.", "success");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Deployment in progress"
      description={
        deployment
          ? `${titleCase(deployment.provider || "host")} · ${deployment.environment}`
          : "Preparing your deployment…"
      }
      footer={
        running ? (
          <Button variant="ghost" onClick={onClose}>
            Deploy in background
          </Button>
        ) : deployment?.status === "SUCCESS" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            <Button variant="secondary" onClick={onOpenDetails}>
              View details
            </Button>
            <Button onClick={copyUrl}>
              <ExternalLink className="h-4 w-4" /> Open site
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="secondary" onClick={onOpenDetails}>
              View details
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Badge tone="info" dot>
              Deploying…
            </Badge>
          ) : deployment?.status === "SUCCESS" ? (
            <Badge tone="success" dot>
              Live
            </Badge>
          ) : (
            <Badge tone="danger" dot>
              {titleCase(deployment?.status || "failed")}
            </Badge>
          )}
          {deployment?.deployment_url && (
            <a
              href={deployment.deployment_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] text-primary underline-offset-2 hover:underline"
            >
              <Globe2 className="h-3.5 w-3.5" />
              {deployment.deployment_url}
            </a>
          )}
        </div>

        {running && (
          <div className="space-y-3">
            <Progress value={(stageIndex / STAGES.length) * 100} tone="info" />
            <div className="flex flex-wrap gap-2">
              {STAGES.map((stage) => {
                const order = STAGES.indexOf(stage);
                const done = order < stageIndex;
                const active = order === stageIndex;
                return (
                  <span
                    key={stage}
                    className={cn(
                      "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                      done && "border-success/40 bg-success-soft text-success",
                      active && "border-primary/50 bg-primary-soft text-primary",
                      !done && !active && "border-edge text-faint",
                    )}
                  >
                    {done ? "✓ " : ""}
                    {stage}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {running && <PageLoader label={`${currentStage}…`} />}

        {!running && deployment?.status === "SUCCESS" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex flex-col items-center gap-3 rounded-lg border border-success/40 bg-success-soft/40 px-4 py-8 text-center"
          >
            <CheckCircle2 className="h-9 w-9 text-success" />
            <p className="font-display text-sm font-semibold text-text">
              Your site is live
            </p>
            <p className="max-w-sm break-all font-mono text-[11px] text-text-dim">
              {deployment.deployment_url || "—"}
            </p>
          </motion.div>
        )}

        {!running && deployment?.status === "FAILED" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex flex-col items-center gap-3 rounded-lg border border-danger/40 bg-danger-soft/40 px-4 py-8 text-center"
          >
            <XCircle className="h-9 w-9 text-danger" />
            <p className="font-display text-sm font-semibold text-text">
              Deployment failed
            </p>
            <p className="max-w-sm text-xs leading-5 text-text-dim">
              {deployment?.error || "The provider reported an error."}
            </p>
          </motion.div>
        )}

        <div className="rounded-lg border border-edge bg-surface-2">
          <div className="flex items-center justify-between border-b border-edge-soft px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-dim">
              <Rocket className="h-3.5 w-3.5" /> Deployment log
            </span>
            <span className="font-mono text-[10px] text-faint">
              {(logs.data?.logs ?? []).length} lines
            </span>
          </div>
          <div className="max-h-56 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
            {(logs.data?.logs ?? []).length === 0 && (
              <p className="text-faint">Waiting for log output…</p>
            )}
            {(logs.data?.logs ?? []).map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className={cn("flex gap-2 whitespace-pre-wrap break-all", levelClass(line.level))}
              >
                <span className="shrink-0 text-faint">
                  {line.ts ? new Date(line.ts).toLocaleTimeString() : ""}
                </span>
                <span className="min-w-0">{line.message}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
