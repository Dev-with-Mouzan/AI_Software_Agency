"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BookOpen,
  Brain,
  Check,
  Circle,
  FilePen,
  FileText,
  FolderOpen,
  FolderPlus,
  Globe,
  Loader2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useWorkflowActivity } from "@/lib/hooks";
import type {
  WorkflowActivity,
  WorkflowActivityStatus,
} from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatDate, shortId } from "@/lib/format";

const TOOL_ICONS: Record<string, LucideIcon> = {
  read_file: FileText,
  write_file: FilePen,
  list_dir: FolderOpen,
  make_dir: FolderPlus,
  delete_file: Trash2,
  run_command: Terminal,
  knowledge_search: BookOpen,
  memory_read: Brain,
  memory_write: Brain,
  web_search: Globe,
  web_fetch: Globe,
};

const EMPTY_ACTIVITIES: WorkflowActivity[] = [];

interface Section {
  key: string;
  stepId: string;
  agentName: string;
  agentKind: string;
  status: WorkflowActivityStatus | "pending";
  items: WorkflowActivity[];
}

function statusIcon(status: WorkflowActivityStatus) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-info" />;
    case "completed":
      return <Check className="h-3.5 w-3.5 text-success" />;
    case "failed":
      return <X className="h-3.5 w-3.5 text-danger" />;
    default:
      return <Circle className="h-3 w-3 text-muted" />;
  }
}

function AgentSection({ section }: { section: Section }) {
  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-surface-2/50">
      <div className="flex items-center gap-2.5 border-b border-edge-soft bg-surface-2/70 px-3 py-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] font-mono text-[10px] font-semibold",
            section.status === "failed"
              ? "bg-danger-soft text-danger"
              : section.status === "completed"
                ? "bg-success-soft text-success"
                : "bg-primary-soft text-primary",
          )}
        >
          {(section.agentName || "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xs font-semibold tracking-tight text-text">
            {section.agentName || "Step"}
          </p>
          {section.agentKind && (
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
              {section.agentKind}
            </p>
          )}
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-dim">
          {statusIcon(section.status)}
          <span className="hidden sm:inline">{section.status}</span>
        </span>
      </div>

      <div className="space-y-px py-1">
        {section.items.map((item) => {
          const done = item.status !== "running";
          if (item.kind === "reasoning") {
            return (
              <Row key={item.seq}>
                <span className="relative mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {!done ? (
                    <span className="absolute h-3.5 w-3.5 animate-ping rounded-full bg-primary/50" />
                  ) : null}
                  <Sparkles
                    className={cn(
                      "h-3 w-3",
                      done ? "text-text-dim" : "text-primary",
                    )}
                  />
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-5",
                    done ? "text-text-dim" : "font-medium text-text",
                  )}
                >
                  {item.message}
                </span>
                <Time ts={item.ts} />
              </Row>
            );
          }
          if (item.kind === "tool") {
            const ToolIcon = TOOL_ICONS[item.tool] ?? Wrench;
            const failed = item.status === "failed";
            return (
              <Row key={item.seq} className={failed ? "bg-danger-soft/30" : undefined}>
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                    failed
                      ? "border-danger/30 bg-danger-soft text-danger"
                      : done
                        ? "border-edge bg-surface text-text-dim"
                        : "border-primary/40 bg-primary-soft text-primary",
                  )}
                >
                  <ToolIcon className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {item.tool && (
                      <span className="rounded-[3px] border border-edge bg-surface px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                        {item.tool}
                      </span>
                    )}
                    <p
                      className={cn(
                        "text-[11px] leading-5",
                        failed ? "text-danger" : done ? "text-text-dim" : "text-text",
                      )}
                    >
                      {item.message}
                    </p>
                  </div>
                  {item.detail && (
                    <p
                      className="truncate font-mono text-[10px] text-muted"
                      title={item.detail}
                    >
                      {item.detail}
                    </p>
                  )}
                </div>
                {!done && (
                  <Loader2 className="mt-1 h-3 w-3 shrink-0 animate-spin text-info" />
                )}
              </Row>
            );
          }
          if (item.kind.startsWith("review.") || item.kind === "workflow.review_failed") {
            const failed =
              item.kind === "review.failed" ||
              item.kind === "workflow.review_failed" ||
              item.status === "failed";
            return (
              <Row
                key={item.seq}
                className={failed ? "bg-danger-soft/30" : "bg-surface-2/40"}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                    failed
                      ? "border-danger/30 bg-danger-soft text-danger"
                      : "border-success/25 bg-success-soft text-success",
                  )}
                >
                  <ShieldCheck className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[11px] leading-5",
                      failed ? "font-medium text-danger" : done ? "text-text-dim" : "text-text",
                    )}
                  >
                    {item.message}
                  </p>
                  {item.detail && (
                    <p className="truncate font-mono text-[10px] text-muted" title={item.detail}>
                      {item.detail}
                    </p>
                  )}
                </div>
                <Time ts={item.ts} />
              </Row>
            );
          }
          return (
            <Row key={item.seq}>
              <span className="mt-1.5">{statusIcon(item.status)}</span>
              <p
                className={cn(
                  "text-[11px] leading-5",
                  done ? "text-text-dim" : "font-medium text-text",
                )}
              >
                {item.message}
              </p>
              <Time ts={item.ts} />
            </Row>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "flex items-start gap-2 px-3 py-1.5",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

function Time({ ts }: { ts: string }) {
  return (
    <span className="ml-auto shrink-0 pt-1 font-mono text-[9px] text-faint">
      {formatDate(ts)}
    </span>
  );
}

function RunBanner({ item }: { item: WorkflowActivity }) {
  const failed = item.status === "failed";
  const done = item.status === "completed";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex items-center gap-2 px-1 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]",
        failed ? "text-danger" : done ? "text-text-dim" : "text-info",
      )}
    >
      <span className="h-px flex-1 bg-edge-soft" />
      <span className="flex items-center gap-1.5">
        {statusIcon(item.status)} {item.message}
      </span>
      <span className="h-px flex-1 bg-edge-soft" />
    </motion.div>
  );
}

export function ActivityPanel({
  runId,
  autoPoll = true,
  className,
  title = "Crew activity",
  compact = false,
}: {
  runId: string | null;
  autoPoll?: boolean;
  className?: string;
  title?: string;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  const { data, isLoading } = useWorkflowActivity(runId, autoPoll);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activities = data?.activities ?? EMPTY_ACTIVITIES;
  const done = data?.done ?? false;

  const { runEvents, sections } = useMemo(() => {
    const runEvents: WorkflowActivity[] = [];
    const sections: Section[] = [];
    const index = new Map<string, Section>();
    // Events that carry no step_id (e.g. agent.file_created) are attributed
    // to the most recent section matching their agent kind so they never
    // spawn a phantom "pending" section.
    const byKind = (item: WorkflowActivity) =>
      item.agent_kind
        ? [...sections].reverse().find((s) => s.agentKind === item.agent_kind)
        : undefined;
    for (const item of activities) {
      if (item.kind === "run") {
        runEvents.push(item);
        continue;
      }
      if (item.kind === "step") {
        let section = index.get(item.step_id);
        if (!section) section = byKind(item);
        if (!section) {
          section = {
            key: item.step_id,
            stepId: item.step_id,
            agentName: item.agent_name,
            agentKind: item.agent_kind,
            status: item.status,
            items: [],
          };
          sections.push(section);
          index.set(item.step_id, section);
        } else {
          section.agentName = item.agent_name || section.agentName;
          section.agentKind = item.agent_kind || section.agentKind;
          section.status = item.status;
        }
        continue;
      }
      let section = index.get(item.step_id);
      if (!section) section = byKind(item);
      if (!section) {
        section = {
          key: item.step_id,
          stepId: item.step_id,
          agentName: item.agent_name,
          agentKind: item.agent_kind,
          status: "pending",
          items: [],
        };
        sections.push(section);
        index.set(item.step_id, section);
      }
      section.items.push(item);
    }
    return { runEvents, sections };
  }, [activities]);

  const count = activities.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, done]);

  const statusTone =
    data?.status?.toUpperCase() === "FAILED"
      ? "danger"
      : done
        ? "success"
        : "info";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-edge bg-surface shadow-panel",
        className,
      )}
    >
      {!compact && (
        <div className="flex items-center justify-between gap-3 border-b border-edge-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                !done && "animate-pulse bg-info",
                done && statusTone === "success" && "bg-success",
                done && statusTone === "danger" && "bg-danger",
              )}
            />
            <p className="font-display text-xs font-semibold tracking-tight text-text">
              {title}
            </p>
            {runId && (
              <span className="font-mono text-[9px] tracking-[0.08em] text-faint">
                #{shortId(runId)}
              </span>
            )}
          </div>
          <Badge tone={statusTone} dot>
            {done ? "finished" : "live"}
          </Badge>
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn(
          "overflow-y-auto scroll-smooth px-3 py-2",
          compact ? "max-h-96" : "max-h-[420px]",
        )}
      >
        {isLoading ? (
          <div className="space-y-2 px-1 py-2">
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-3" />
          </div>
        ) : activities.length === 0 ? (
          <p className="px-1 py-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            No activity recorded yet — the crew is gearing up.
          </p>
        ) : (
          <div className={cn("space-y-2", reduced && "[&_*]:!animate-none")}>
            {runEvents.map((item) => (
              <RunBanner key={item.seq} item={item} />
            ))}
            <AnimatePresence initial={false}>
              {sections.map((section) => (
                <motion.div
                  key={section.key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <AgentSection section={section} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {activities.length > 0 && (
        <div className="flex items-center justify-between border-t border-edge-soft bg-surface-2/50 px-4 py-2">
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            {!done && <Loader2 className="h-3 w-3 animate-spin text-info" />}
            {done ? "transcript complete" : "watching the crew work…"}
          </span>
          <span className="font-mono text-[9px] tracking-[0.08em] text-faint">
            {activities.length} event{activities.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}
