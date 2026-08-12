"use client";

import { motion } from "motion/react";
import {
  Cloud,
  ExternalLink,
  Globe2,
  GitBranch,
  RefreshCw,
  Trash2,
  Triangle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  useDeploymentStatus,
  useRemoveDeployment,
  useRedeployProject,
} from "@/lib/hooks";
import { formatDate, shortId, titleCase } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Deployment } from "@/lib/types";

function ProviderLogo({ provider }: { provider: string }) {
  if (provider === "vercel")
    return <Triangle className="h-4 w-4" fill="currentColor" />;
  if (provider === "aws") return <Cloud className="h-4 w-4" />;
  return <Globe2 className="h-4 w-4" />;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="shrink-0 text-[11px] text-faint">{label}</span>
      <span className="min-w-0 text-right text-xs text-text-dim">{children}</span>
    </div>
  );
}

function dnsRecordsOf(deployment: Deployment): Array<Record<string, unknown>> {
  const raw = deployment.dns_records;
  if (Array.isArray(raw)) {
    return raw.filter(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === "object" && !Array.isArray(r),
    );
  }
  if (raw && typeof raw === "object") {
    return Object.values(raw).filter(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === "object" && !Array.isArray(r),
    );
  }
  return [];
}

export function DeploymentDetailsModal({
  projectId,
  open,
  onClose,
  onOpenDomain,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onOpenDomain: () => void;
}) {
  const { push } = useToast();
  const status = useDeploymentStatus(projectId);
  const redeploy = useRedeployProject(projectId);
  const remove = useRemoveDeployment(projectId);

  const deployment = status.data;

  const handleRedeploy = () => {
    if (!deployment) return;
    redeploy.mutate(
      undefined,
      {
        onSuccess: () => {
          push("Redeploy started.", "success");
          onClose();
        },
        onError: (e) => push((e as Error).message, "error"),
      },
    );
  };

  const handleRemove = () => {
    if (!deployment) return;
    remove.mutate(
      undefined,
      {
        onSuccess: () => {
          push("Deployment removed from the provider.", "success");
          onClose();
        },
        onError: (e) => push((e as Error).message, "error"),
      },
    );
  };

  if (status.isLoading) {
    return <Dialog open={open} onClose={onClose} title="Deployment details">
      <PageLoader label="Loading deployment…" />
    </Dialog>;
  }

  if (!deployment) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Deployment details"
        footer={
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        }
      >
        <p className="py-8 text-center text-xs text-muted">
          No deployment has been created for this project yet.
        </p>
      </Dialog>
    );
  }

  const live = deployment.status === "SUCCESS" && !deployment.removed;
  const failed = deployment.status === "FAILED";
  const records = dnsRecordsOf(deployment);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Deployment details"
      description={
        deployment.environment
          ? `${titleCase(deployment.environment)} environment`
          : undefined
      }
      wide
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={redeploy.isPending || remove.isPending}
          >
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={onOpenDomain}
            disabled={redeploy.isPending || remove.isPending}
          >
            <Globe2 className="h-4 w-4" /> Custom domain
          </Button>
          <Button
            variant="secondary"
            onClick={handleRedeploy}
            loading={redeploy.isPending}
            disabled={remove.isPending}
          >
            <RefreshCw className="h-4 w-4" /> Redeploy
          </Button>
          <Button variant="danger" onClick={handleRemove} loading={remove.isPending}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={live ? "success" : failed ? "danger" : "info"} dot>
            {deployment.removed
              ? "Removed"
              : deployment.status === "SUCCESS"
                ? "Live"
                : titleCase(deployment.status)}
          </Badge>
          {deployment.provider && (
            <Badge tone="neutral">
              <span className="flex items-center gap-1">
                <ProviderLogo provider={deployment.provider} />
                {titleCase(deployment.provider)}
              </span>
            </Badge>
          )}
          <span className="font-mono text-[10px] text-faint">
            {shortId(deployment.id)}
          </span>
        </div>

        {deployment.error && (
          <div className="rounded-lg border border-danger/40 bg-danger-soft/40 px-3 py-2.5">
            <p className="text-xs leading-5 text-danger">{deployment.error}</p>
          </div>
        )}

        {deployment.deployment_url && (
          <a
            href={deployment.deployment_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary-soft/50 px-3 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary-soft"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="min-w-0 break-all font-mono text-[11px]">
              {deployment.deployment_url}
            </span>
          </a>
        )}

        <div className="grid gap-x-6 sm:grid-cols-2">
          <div className="divide-y divide-edge-soft border-y border-edge-soft">
            <InfoRow label="Status">
              {titleCase(deployment.status)}
            </InfoRow>
            <InfoRow label="Environment">
              {titleCase(deployment.environment)}
            </InfoRow>
            <InfoRow label="Version">
              <span className="font-mono">v{deployment.version}</span>
            </InfoRow>
            <InfoRow label="Commit">
              {deployment.deployed_commit ? (
                <span className="font-mono">{deployment.deployed_commit}</span>
              ) : (
                "—"
              )}
            </InfoRow>
            <InfoRow label="Provider id">
              {deployment.deployment_id ? (
                <span className="font-mono">{deployment.deployment_id}</span>
              ) : (
                "—"
              )}
            </InfoRow>
          </div>
          <div className="divide-y divide-edge-soft border-y border-edge-soft">
            <InfoRow label="Created">{formatDate(deployment.created_at)}</InfoRow>
            <InfoRow label="Deployed">{formatDate(deployment.deployed_at)}</InfoRow>
            <InfoRow label="Approved">
              {deployment.approved
                ? `${deployment.approved_by || "human"} · ${formatDate(deployment.approved_at)}`
                : "—"}
            </InfoRow>
            <InfoRow label="Custom domain">
              {deployment.custom_domain ? (
                <span className="font-mono text-primary">
                  {deployment.custom_domain}
                </span>
              ) : (
                "—"
              )}
            </InfoRow>
            <InfoRow label="DNS">
              {deployment.domain_status === "active"
                ? "Active"
                : deployment.domain_status === "pending_dns"
                  ? "Awaiting DNS"
                  : "—"}
            </InfoRow>
          </div>
        </div>

        {deployment.custom_domain && records.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium text-text-dim">
              DNS records for {deployment.custom_domain}
            </p>
            <div className="overflow-hidden rounded-lg border border-edge">
              {records.map((record, i) => (
                <div
                  key={i}
                  className={cn(
                    "grid grid-cols-3 gap-2 px-3 py-2 text-[11px]",
                    i % 2 === 0 ? "bg-surface-2" : "bg-surface",
                  )}
                >
                  <span className="font-mono text-text-dim">
                    {String(record.type)}
                  </span>
                  <span className="font-mono text-text-dim">{String(record.name)}</span>
                  <span className="font-mono break-all text-muted">
                    {String(record.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-text-dim">
            <GitBranch className="h-3.5 w-3.5" /> Deployment log
          </p>
          <div className="max-h-52 overflow-auto rounded-lg border border-edge bg-surface-2 p-3 font-mono text-[11px] leading-relaxed">
            {(deployment.logs ?? []).length === 0 && (
              <p className="text-faint">No log output captured.</p>
            )}
            {(deployment.logs ?? []).map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "flex gap-2 whitespace-pre-wrap break-all",
                  line.level === "error"
                    ? "text-danger"
                    : line.level === "warn"
                      ? "text-warning"
                      : line.level === "command"
                        ? "text-primary"
                        : "text-muted",
                )}
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
