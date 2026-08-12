"use client";

import { useState } from "react";
import { CheckCircle2, Globe2, RefreshCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAddDomain, useDeploymentStatus, useVerifyDomain } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import type { Deployment } from "@/lib/types";

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

export function CustomDomainModal({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { push } = useToast();
  const status = useDeploymentStatus(projectId);
  const add = useAddDomain(projectId);
  const verify = useVerifyDomain(projectId);

  const [domain, setDomain] = useState("");
  const deployment = status.data;
  const records = deployment ? dnsRecordsOf(deployment) : [];
  const domainActive = deployment?.domain_status === "active";

  const submit = () => {
    const value = domain.trim().toLowerCase().replace(/\/+$/, "");
    if (!value || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(value)) {
      push("Enter a valid domain, e.g. app.example.com", "error");
      return;
    }
    add.mutate(
      { domain: value },
      {
        onSuccess: () => push("Domain attached. Configure DNS to finish.", "success"),
        onError: (e) => push((e as Error).message, "error"),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Custom domain"
      description="Point a domain you own at this deployment."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={add.isPending || verify.isPending}>
            Close
          </Button>
          {deployment?.custom_domain && !domainActive && (
            <Button
              variant="secondary"
              onClick={() =>
                verify.mutate(
                  undefined,
                  {
                    onSuccess: () =>
                      push("DNS re-checked. Updates usually take a few minutes.", "info"),
                    onError: (e) => push((e as Error).message, "error"),
                  },
                )
              }
              loading={verify.isPending}
            >
              <RefreshCw className="h-4 w-4" /> Verify DNS
            </Button>
          )}
          <Button
            onClick={submit}
            loading={add.isPending}
            disabled={!domain.trim() || !!deployment?.custom_domain}
          >
            <Globe2 className="h-4 w-4" /> Add domain
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {deployment?.custom_domain ? (
          <div
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-3",
              domainActive
                ? "border-success/40 bg-success-soft/40"
                : "border-warning/40 bg-warning-soft/40",
            )}
          >
            {domainActive ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            )}
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium text-text">
                {deployment.custom_domain}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-text-dim">
                {domainActive
                  ? "Domain is live and serving over HTTPS."
                  : "Domain attached — finish by adding the DNS records below, then verify."}
              </p>
              <Badge
                tone={domainActive ? "success" : "warning"}
                dot
                className="mt-2"
              >
                {domainActive ? "active" : titleCaseOf(deployment.domain_status)}
              </Badge>
            </div>
          </div>
        ) : (
          <Field
            label="Domain"
            hint="The domain must already point at your DNS provider."
          >
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="app.example.com"
              autoFocus
            />
          </Field>
        )}

        {records.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium text-text-dim">
              Configure these DNS records
            </p>
            <div className="overflow-hidden rounded-lg border border-edge">
              {records.map((record, i) => (
                <div
                  key={i}
                  className={cn(
                    "grid grid-cols-[60px_1fr_1.2fr] items-center gap-2 px-3 py-2 text-[11px]",
                    i % 2 === 0 ? "bg-surface-2" : "bg-surface",
                  )}
                >
                  <span className="font-mono text-text-dim">{String(record.type)}</span>
                  <span className="font-mono break-all text-text-dim">
                    {String(record.name)}
                  </span>
                  <span className="font-mono break-all text-muted">
                    {String(record.value)}
                  </span>
                </div>
              ))}
            </div>
            {deployment?.custom_domain && !domainActive && (
              <p className="mt-2 text-[11px] leading-5 text-faint">
                After your registrar propagates the record, press Verify DNS. The
                deployment URL stays reachable in the meantime.
              </p>
            )}
          </div>
        )}

        {!deployment?.custom_domain && (
          <p className="text-[11px] leading-5 text-faint">
            Only one custom domain is managed per deployment. Attaching a new one
            replaces the previous one.
          </p>
        )}
      </div>
    </Dialog>
  );
}

function titleCaseOf(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
