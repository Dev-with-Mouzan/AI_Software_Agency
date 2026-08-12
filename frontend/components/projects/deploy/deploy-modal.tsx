"use client";

import { useState } from "react";
import { AlertTriangle, Cloud, Globe2, Rocket, Triangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  useDeployOptions,
  useDeployProject,
  useDeploymentStatus,
} from "@/lib/hooks";
import { cn } from "@/lib/cn";

function ProviderIcon({ name }: { name: string }) {
  if (name === "vercel") return <Triangle className="h-4 w-4" fill="currentColor" />;
  if (name === "aws") return <Cloud className="h-4 w-4" />;
  return <Globe2 className="h-4 w-4" />;
}

export function DeployModal({
  projectId,
  open,
  onClose,
  onLaunched,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onLaunched: () => void;
}) {
  const { push } = useToast();
  const options = useDeployOptions(projectId);
  const deploy = useDeployProject(projectId);
  const status = useDeploymentStatus(projectId);

  const [selected, setSelected] = useState<string>("");
  const [environment, setEnvironment] = useState("production");

  const providers = options.data?.providers ?? [];
  const pick = providers.find((p) => p.name === selected);

  const launch = () => {
    if (!selected) return;
    deploy.mutate(
      { provider: selected, environment },
      {
        onSuccess: () => {
          push(`Deployment to ${pick?.label ?? selected} started.`, "success");
          onClose();
          onLaunched();
        },
        onError: (e) => push((e as Error).message, "error"),
      },
    );
  };

  const hasLive = !!status.data && !status.data.removed;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Deploy to hosting"
      description="Ship this project to a hosting provider."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deploy.isPending}>
            Cancel
          </Button>
          <Button
            onClick={launch}
            loading={deploy.isPending}
            disabled={!selected || !pick?.configured || !pick?.compatible}
          >
            <Rocket className="h-4 w-4" /> Deploy to{" "}
            {pick?.label ?? "provider"}
          </Button>
        </>
      }
    >
      {options.isLoading && <PageLoader label="Checking providers…" />}

      {options.data && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info" dot>
              {options.data.project_type || "unknown project"}
            </Badge>
            {Object.entries(options.data.technology_stack).map(([key, value]) => (
              <Badge key={key} tone="neutral">
                {key}: {String(value)}
              </Badge>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-text-dim">Provider</p>
            {providers.map((provider) => {
              const active = selected === provider.name;
              return (
                <button
                  key={provider.name}
                  type="button"
                  disabled={!provider.configured}
                  onClick={() => setSelected(provider.name)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all duration-150",
                    active
                      ? "border-primary/50 bg-primary-soft ring-2 ring-primary/20"
                      : "border-edge bg-surface-2 hover:border-edge hover:bg-surface",
                    !provider.configured && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-edge bg-surface text-muted",
                    )}
                  >
                    <ProviderIcon name={provider.name} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">
                      {provider.label}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {provider.reason}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {provider.configured ? (
                      <Badge tone={provider.compatible ? "success" : "warning"}>
                        {provider.compatible ? "compatible" : "unsupported"}
                      </Badge>
                    ) : (
                      <Badge tone="danger">
                        missing: {provider.missing.join(", ") || "config"}
                      </Badge>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <Field label="Environment">
            <Select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              disabled={!selected}
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="preview">Preview</option>
            </Select>
          </Field>

          {hasLive && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-soft/40 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs leading-5 text-text-dim">
                This project already has a live deployment
                {status.data?.deployment_url ? (
                  <>
                    {" "}at{" "}
                    <a
                      href={status.data.deployment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] text-warning underline-offset-2 hover:underline"
                    >
                      {status.data.deployment_url}
                    </a>
                  </>
                ) : null}
                . A new deploy will replace it.
              </p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
