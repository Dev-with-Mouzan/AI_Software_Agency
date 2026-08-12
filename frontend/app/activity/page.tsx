"use client";

import { useMemo, useState } from "react";
import {
  Activity as ActivityIcon,
  CheckCircle2,
  Eye,
  FilePlus2,
  Pencil,
  ShieldAlert,
  Trash2,
  User,
  UserCheck,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageLoader } from "@/components/ui/skeleton";
import { Stagger, StaggerItem, Reveal } from "@/components/motion/primitives";
import { CountUp } from "@/components/motion/count-up";
import { PageHeader } from "@/components/ui/page-header";
import { useAuditLog } from "@/lib/hooks";
import type { AuditLog } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/format";
import { cn } from "@/lib/cn";

const ACTION_META: Record<
  string,
  { icon: LucideIcon; label: string; tile: string }
> = {
  create: { icon: FilePlus2, label: "Created", tile: "border-primary/40 bg-primary-soft text-primary" },
  update: { icon: Pencil, label: "Updated", tile: "border-info/40 bg-info-soft text-info" },
  read: { icon: Eye, label: "Read", tile: "border-edge bg-surface-2 text-text-dim" },
  delete: { icon: Trash2, label: "Deleted", tile: "border-danger/40 bg-danger-soft text-danger" },
  run_tool: { icon: Wrench, label: "Ran tool", tile: "border-accent/40 bg-accent-soft text-accent" },
  approve: { icon: CheckCircle2, label: "Approved", tile: "border-success/40 bg-success-soft text-success" },
  reject: { icon: XCircle, label: "Rejected", tile: "border-danger/40 bg-danger-soft text-danger" },
  assign: { icon: UserCheck, label: "Assigned", tile: "border-info/40 bg-info-soft text-info" },
  transition: { icon: ActivityIcon, label: "Transitioned", tile: "border-warning/40 bg-warning-soft text-warning" },
  permission_denied: { icon: ShieldAlert, label: "Permission denied", tile: "border-danger/40 bg-danger-soft text-danger" },
};

const FALLBACK_META = {
  icon: ActivityIcon,
  label: "Action",
  tile: "border-edge bg-surface-2 text-text-dim",
};

const FILTERS: { key: string; label: string; actions: string[] | null }[] = [
  { key: "all", label: "All", actions: null },
  { key: "create", label: "Create", actions: ["create"] },
  { key: "update", label: "Update", actions: ["update", "transition", "assign"] },
  { key: "approve", label: "Approvals", actions: ["approve", "reject"] },
  { key: "tools", label: "Tool calls", actions: ["run_tool"] },
  { key: "denied", label: "Denied", actions: ["permission_denied"] },
];

const DETAIL_KEYS = [
  "tool",
  "path",
  "file",
  "decision",
  "comment",
  "step_name",
  "agent_kind",
  "kind",
  "task",
  "project",
  "environment",
];

function detailSummary(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of DETAIL_KEYS) {
    const value = detail[key];
    if (value !== undefined && value !== null && value !== "") {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  if (parts.length > 0) return parts.slice(0, 3).join("  ·  ");
  const json = JSON.stringify(detail);
  return json && json !== "{}" ? json.slice(0, 140) : "";
}

function actorLabel(actor: string): string {
  return actor === "human" ? "Human operator" : titleCase(actor);
}

function StatsTile({
  icon: Icon,
  label,
  value,
  tile,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tile: string;
}) {
  return (
    <div className="flex h-full items-center gap-3 rounded-xl border border-edge bg-surface/70 px-4 py-3.5 shadow-panel">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", tile)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold leading-none text-text">
          <CountUp value={value} />
        </p>
        <p className="mt-1 truncate text-[11px] font-medium text-text-dim">{label}</p>
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const audit = useAuditLog();
  const [filter, setFilter] = useState("all");

  const list = audit.data ?? [];

  const counts = {
    total: list.length,
    creates: list.filter((e) => e.action === "create").length,
    approvals: list.filter((e) => ["approve", "reject"].includes(e.action)).length,
    tools: list.filter((e) => e.action === "run_tool").length,
    denied: list.filter((e) => e.action === "permission_denied").length,
  };

  const filtered = useMemo(() => {
    const active = FILTERS.find((f) => f.key === filter);
    if (!active?.actions) return list;
    return list.filter((e) => active.actions?.includes(e.action));
  }, [list, filter]);

  return (
    <div className="space-y-6">
      <PageHeader
        center
        eyebrow="The trail"
        title="Activity"
        description="Every action an agent or a human takes is written to an immutable audit log — create, update, tool calls, approvals, and any denied permission attempt."
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4" step={0.06}>
        {[
          { key: "total", icon: ActivityIcon, label: "Total events", tile: "border-primary/40 bg-primary-soft text-primary" },
          { key: "creates", icon: FilePlus2, label: "Created", tile: "border-info/40 bg-info-soft text-info" },
          { key: "approvals", icon: CheckCircle2, label: "Approvals", tile: "border-success/40 bg-success-soft text-success" },
          { key: "denied", icon: ShieldAlert, label: "Denied", tile: "border-danger/40 bg-danger-soft text-danger" },
        ].map((tile, i) => (
          <StaggerItem key={tile.key} className="h-full">
            <StatsTile
              icon={tile.icon}
              label={tile.label}
              value={counts[tile.key as keyof typeof counts]}
              tile={tile.tile}
            />
          </StaggerItem>
        ))}
      </Stagger>

      {audit.isLoading ? (
        <PageLoader label="Reading the audit trail…" />
      ) : list.length === 0 ? (
        <Reveal direction="scale">
          <EmptyState
            icon={<ShieldAlert className="h-8 w-8" />}
            title="No activity yet"
            description="Dispatch the crew or take an action — every step lands in this immutable trail."
          />
        </Reveal>
      ) : (
        <Reveal>
          <Card className="overflow-hidden">
            <CardBody className="p-0">
              {/* Filters */}
              <div className="flex flex-wrap gap-2 border-b border-edge-soft px-4 py-3 sm:px-5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "rounded-full border px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors duration-150",
                      filter === f.key
                        ? "border-primary/40 bg-primary-soft text-primary"
                        : "border-edge bg-surface-2 text-text-dim hover:border-primary/30 hover:text-text",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
                <Badge tone="neutral" className="ml-auto hidden sm:inline-flex">
                  {filtered.length} shown
                </Badge>
              </div>

              {filtered.length === 0 ? (
                <div className="p-10">
                  <EmptyState title="Nothing in this view" />
                </div>
              ) : (
                <Stagger className="divide-y divide-edge-soft" step={0.03}>
                  {filtered.map((entry) => {
                    const meta = ACTION_META[entry.action] ?? FALLBACK_META;
                    const Icon = meta.icon;
                    const summary = detailSummary(entry.detail);
                    const isHuman = entry.actor === "human";
                    return (
                      <StaggerItem key={entry.id}>
                        <div className="flex gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-surface-2/50 sm:px-5">
                          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", meta.tile)}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="flex items-center gap-1.5 text-sm font-medium text-text">
                                {isHuman && <User className="h-3.5 w-3.5 text-muted" aria-hidden />}
                                {actorLabel(entry.actor)}
                              </span>
                              <span className="text-xs text-muted">{meta.label}</span>
                              {entry.resource_type && (
                                <Badge tone="neutral" className="font-mono uppercase">
                                  {entry.resource_type}
                                </Badge>
                              )}
                              {!entry.allowed && (
                                <Badge tone="danger" dot>
                                  denied
                                </Badge>
                              )}
                            </div>
                            {summary && (
                              <p className="mt-1 truncate font-mono text-[11px] text-text-dim">{summary}</p>
                            )}
                          </div>
                          <span className="shrink-0 pt-0.5 font-mono text-[11px] text-muted">
                            {formatDate(entry.created_at)}
                          </span>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              )}
            </CardBody>
          </Card>
        </Reveal>
      )}
    </div>
  );
}
