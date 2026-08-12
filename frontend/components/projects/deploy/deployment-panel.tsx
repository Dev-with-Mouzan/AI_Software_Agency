"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  CheckCircle2,
  ExternalLink,
  Globe2,
  Loader2,
  Plus,
  Rocket,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/skeleton";
import { useDeploymentStatus } from "@/lib/hooks";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/cn";

import { DeployModal } from "./deploy-modal";
import { DeployProgressModal } from "./deploy-progress-modal";
import { DeploymentDetailsModal } from "./deployment-details-modal";
import { CustomDomainModal } from "./custom-domain-modal";

const EASE = [0.22, 1, 0.36, 1] as const;

export function DeploymentPanel({ projectId }: { projectId: string }) {
  const status = useDeploymentStatus(projectId, true);

  const [deployOpen, setDeployOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [domainOpen, setDomainOpen] = useState(false);

  const deployment = status.data;
  const hasDeployment = !!deployment && !deployment.removed;
  const running = hasDeployment && deployment.status === "RUNNING";
  const live = hasDeployment && deployment.status === "SUCCESS";

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Hosted deployment</CardTitle>
            {running && (
              <span className="flex items-center gap-1.5 text-[11px] text-info">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> deploying…
              </span>
            )}
          </div>
          {hasDeployment && (
            <Badge tone={live ? "success" : running ? "info" : "warning"} dot>
              {live ? "Live" : running ? "Deploying" : titleCase(deployment.status)}
            </Badge>
          )}
        </CardHeader>
        <CardBody>
          {!status.isLoading && !hasDeployment && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <EmptyState
                icon={<Rocket className="h-7 w-7" />}
                title="Not deployed yet"
                description="Push this project to Vercel or AWS and get a live URL."
                action={
                  <Button onClick={() => setDeployOpen(true)}>
                    <Plus className="h-4 w-4" /> Deploy to hosting
                  </Button>
                }
              />
            </motion.div>
          )}

          {hasDeployment && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {deployment.deployment_url ? (
                  <a
                    href={deployment.deployment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary-soft/50 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary-soft"
                  >
                    <Globe2 className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate font-mono text-[11px]">
                      {deployment.deployment_url}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <span className="font-mono text-[11px] text-faint">
                    No URL yet — provider is still building.
                  </span>
                )}
                {deployment.provider && (
                  <Badge tone="neutral">{titleCase(deployment.provider)}</Badge>
                )}
                {deployment.custom_domain && (
                  <a
                    href={`https://${deployment.custom_domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "font-mono text-[11px] underline-offset-2 hover:underline",
                      deployment.domain_status === "active"
                        ? "text-success"
                        : "text-warning",
                    )}
                  >
                    {deployment.custom_domain}
                  </a>
                )}
                {live && <CheckCircle2 className="h-4 w-4 text-success" />}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setDeployOpen(true)} size="sm">
                  <Plus className="h-3.5 w-3.5" /> New deploy
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDetailsOpen(true)}
                >
                  Details
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDomainOpen(true)}
                >
                  <Globe2 className="h-3.5 w-3.5" /> Custom domain
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <DeployModal
        projectId={projectId}
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        onLaunched={() => setProgressOpen(true)}
      />
      <DeployProgressModal
        projectId={projectId}
        open={progressOpen}
        onClose={() => setProgressOpen(false)}
        onOpenDetails={() => {
          setProgressOpen(false);
          setDetailsOpen(true);
        }}
      />
      <DeploymentDetailsModal
        projectId={projectId}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onOpenDomain={() => {
          setDetailsOpen(false);
          setDomainOpen(true);
        }}
      />
      <CustomDomainModal
        projectId={projectId}
        open={domainOpen}
        onClose={() => setDomainOpen(false)}
      />
    </>
  );
}
