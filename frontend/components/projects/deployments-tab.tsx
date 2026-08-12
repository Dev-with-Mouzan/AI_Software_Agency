"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Rocket,
  ShieldCheck,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageLoader } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  useApproveDeployment,
  useDeploymentValidate,
  useDeployments,
  useExecuteDeployment,
  useRunDeployment,
} from "@/lib/hooks";
import { formatDate, shortId } from "@/lib/format";
import { DeploymentPanel } from "@/components/projects/deploy/deployment-panel";

function CheckRow({
  name,
  passed,
  detail,
}: {
  name: string;
  passed: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-edge-soft bg-surface-2 px-3 py-2.5">
      {passed ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-dim">{name}</p>
        {detail && (
          <p className="mt-0.5 truncate text-[11px] text-faint">{detail}</p>
        )}
      </div>
    </div>
  );
}

export function DeploymentsTab({ projectId }: { projectId: string }) {
  const { push } = useToast();
  const validate = useDeploymentValidate(projectId);
  const deployments = useDeployments(projectId);
  const runDeployment = useRunDeployment(projectId);
  const approve = useApproveDeployment(projectId);
  const execute = useExecuteDeployment(projectId);

  const [version, setVersion] = useState("0.1.0");

  const readiness = validate.data;
  const running = runDeployment.isPending || deployments.isFetching;

  return (
    <div className="space-y-6">
      <DeploymentPanel projectId={projectId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Readiness checks</CardTitle>
            {readiness && (
              <Badge tone={readiness.ready ? "success" : "warning"} dot>
                {readiness.ready ? "Ready to deploy" : "Not ready"}
              </Badge>
            )}
          </CardHeader>
          <CardBody className="space-y-2">
            {validate.isLoading && <PageLoader label="Running checks…" />}
            {readiness?.checks.map((check) => (
              <CheckRow
                key={check.name}
                name={check.name}
                passed={check.passed}
                detail={check.detail}
              />
            ))}
            {!validate.isLoading && readiness?.checks.length === 0 && (
              <EmptyState title="No checks configured" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deploy</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-text-dim">Environment</span>
                <span className="flex items-center gap-2 rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm text-text">
                  <ShieldCheck className="h-3.5 w-3.5 text-warning" />
                  staging
                </span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-text-dim">Version</span>
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full rounded-md border border-edge bg-surface-2 px-3 py-2 font-mono text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </label>
            </div>
            <Button
              className="w-full"
              loading={runDeployment.isPending}
              disabled={running || !readiness?.ready}
              onClick={() =>
                runDeployment.mutate(
                  { environment: "staging", version: version || "0.1.0" },
                  {
                    onSuccess: () => push("Deployment run started.", "success"),
                    onError: (e) => push((e as Error).message, "error"),
                  },
                )
              }
            >
              <Rocket className="h-4 w-4" /> Start deployment
            </Button>
            {readiness && !readiness.ready && (
              <p className="text-[11px] text-warning">
                Fix the failing checks before deploying.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deployment history</CardTitle>
          <span className="text-xs text-muted">
            {deployments.data?.length ?? 0} runs
          </span>
        </CardHeader>
        <CardBody className="space-y-2">
          {deployments.isLoading && <PageLoader label="Loading deployments…" />}
          {deployments.data?.map((deployment) => (
            <div
              key={deployment.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-edge-soft bg-surface-2 px-3 py-3"
            >
              <StatusBadge status={deployment.status} />
              <span className="font-mono text-xs text-text-dim">
                {deployment.environment} · v{deployment.version}
              </span>
              <span className="font-mono text-[10px] text-faint">
                {shortId(deployment.id)}
              </span>
              <span className="ml-auto text-[11px] text-faint">
                {formatDate(deployment.created_at)}
              </span>
              {deployment.status === "PENDING_APPROVAL" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="success"
                    loading={approve.isPending}
                    onClick={() =>
                      approve.mutate(
                        { deployment_id: deployment.id, approve: true },
                        {
                          onSuccess: () => push("Deployment approved.", "success"),
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
                        { deployment_id: deployment.id, approve: false },
                        {
                          onSuccess: () => push("Deployment rejected.", "info"),
                        },
                      )
                    }
                  >
                    Reject
                  </Button>
                </div>
              )}
              {deployment.status === "APPROVED" && (
                <Button
                  size="sm"
                  loading={execute.isPending}
                  onClick={() =>
                    execute.mutate(deployment.id, {
                      onSuccess: () => push("Deployment executed.", "success"),
                      onError: (e) => push((e as Error).message, "error"),
                    })
                  }
                >
                  <Loader2 className="hidden" />
                  Execute
                </Button>
              )}
            </div>
          ))}
          {!deployments.isLoading && deployments.data?.length === 0 && (
            <EmptyState title="No deployments yet" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
