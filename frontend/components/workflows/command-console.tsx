"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileUp, Play, Sparkles, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { AGENTS, DEPLOY_PLATFORMS, ApiClientError } from "@/lib/api";
import { useAgentRun, useProjects, useUploadPlan } from "@/lib/hooks";
import { cn } from "@/lib/cn";

const EXECUTION_AGENTS = AGENTS.filter((a) => a.id !== "planner");

export function CommandConsole({
  defaultProjectId,
}: {
  defaultProjectId?: string;
}) {
  const { push } = useToast();
  const projects = useProjects();
  const run = useAgentRun();

  const [planMode, setPlanMode] = useState<"agent" | "upload">("agent");
  const [selected, setSelected] = useState<string[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [platform, setPlatform] = useState("");
  const [command, setCommand] = useState("");
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [planUploaded, setPlanUploaded] = useState(false);

  const upload = useUploadPlan(planMode === "upload" ? projectId : null);

  const effectiveAgents =
    planMode === "agent" ? ["planner", ...selected] : selected;
  const runCount = effectiveAgents.length;

  const toggleAgent = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const changeProject = (id: string) => {
    setProjectId(id);
    setPlanFile(null);
    setPlanUploaded(false);
  };

  const submitPlan = (event: React.FormEvent) => {
    event.preventDefault();
    if (!planFile || !projectId) return;
    upload.mutate(planFile, {
      onSuccess: (res) => {
        setPlanUploaded(true);
        push(`Plan saved to ${res.path}. Agents will follow it.`, "success");
      },
      onError: (error) => {
        const message =
          error instanceof ApiClientError ? error.detail : "Upload failed.";
        push(message, "error");
      },
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (runCount === 0) return;
    run.mutate(
      {
        project_id: projectId || undefined,
        agents: effectiveAgents,
        command: command.trim() || "Work on the project in the working area.",
        platform: platform || undefined,
        plan_source: planMode,
      },
      {
        onSuccess: () => {
          push(
            `Run started — ${effectiveAgents.join(", ")}.`,
            "success",
          );
        },
        onError: (error) => {
          const message =
            error instanceof ApiClientError
              ? error.detail
              : "Failed to start the run.";
          push(message, "error");
        },
      },
    );
  };

  const canRun =
    planMode === "agent"
      ? true
      : !!projectId && planUploaded && selected.length >= 1;

  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-hidden border-b border-edge-soft">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="relative flex items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/40 bg-primary-soft">
              <Terminal className="h-4 w-4 text-primary" />
            </span>
            <div>
              <p className="font-display text-[15px] font-semibold tracking-tight text-text">
                Dispatch desk
              </p>
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-faint">
                Work order · run {runCount} agent{runCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <Badge tone="accent" dot>
            ready
          </Badge>
        </div>
      </div>

      <CardBody className="space-y-5">
        <form id="command-console" className="space-y-5" onSubmit={submit}>
          <Field label="Plan source">
            <div className="grid gap-2 md:grid-cols-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => setPlanMode("agent")}
                className={cn(
                  "relative rounded-md border px-4 py-3 text-left transition-colors duration-150",
                  planMode === "agent"
                    ? "border-primary/60"
                    : "border-edge bg-surface-2/70 hover:border-edge",
                )}
              >
                {planMode === "agent" && (
                  <motion.span
                    layoutId="plan-mode"
                    className="absolute inset-0 rounded-md bg-primary-soft"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <div className="relative z-10 flex items-center gap-2">
                  <Sparkles
                    className={cn(
                      "h-4 w-4",
                      planMode === "agent" ? "text-primary" : "text-muted",
                    )}
                  />
                  <p className="font-display text-xs font-semibold tracking-tight text-text">
                    Planner writes the plan
                  </p>
                </div>
                <p className="relative z-10 mt-1.5 text-[11px] leading-5 text-muted">
                  The Planner researches your idea on the web and writes
                  docs/implementation_plan.md first.
                </p>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => setPlanMode("upload")}
                className={cn(
                  "relative rounded-md border px-4 py-3 text-left transition-colors duration-150",
                  planMode === "upload"
                    ? "border-primary/60"
                    : "border-edge bg-surface-2/70 hover:border-edge",
                )}
              >
                {planMode === "upload" && (
                  <motion.span
                    layoutId="plan-mode"
                    className="absolute inset-0 rounded-md bg-primary-soft"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <div className="relative z-10 flex items-center gap-2">
                  <FileUp
                    className={cn(
                      "h-4 w-4",
                      planMode === "upload" ? "text-primary" : "text-muted",
                    )}
                  />
                  <p className="font-display text-xs font-semibold tracking-tight text-text">
                    I&apos;ll bring a plan
                  </p>
                </div>
                <p className="relative z-10 mt-1.5 text-[11px] leading-5 text-muted">
                  Upload a markdown plan — the engineers build directly from it
                  and the Planner is skipped.
                </p>
              </motion.button>
            </div>
          </Field>

          {planMode === "upload" && (
            <div className="rounded-md border border-edge bg-surface-2/70 px-4 py-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <Field label="Plan file (.md / .txt)">
                    <Input
                      type="file"
                      accept=".md,.markdown,.txt"
                      onChange={(e) => {
                        setPlanFile(e.target.files?.[0] ?? null);
                        setPlanUploaded(false);
                      }}
                      disabled={!projectId}
                    />
                  </Field>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={submitPlan}
                  loading={upload.isPending}
                  disabled={!planFile || !projectId}
                >
                  <FileUp className="h-3.5 w-3.5" /> Upload plan
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {!projectId
                  ? "Select a project first — the plan is saved to its docs/implementation_plan.md."
                  : planUploaded
                    ? "Plan uploaded. The engineers will follow it."
                    : "Pick a .md or .txt file to upload."}
              </p>
            </div>
          )}

          <Field
            label="Crew sequence"
            hint={
              planMode === "agent"
                ? "The Planner runs first to write the plan, then your selected agents run in order."
                : "Your selected agents run in order, following the uploaded plan."
            }
          >
            <div className="flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {planMode === "agent" && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.9, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: -4 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="flex items-center gap-2 rounded-md border border-primary/50 bg-primary-soft px-3 py-2 font-display text-xs font-medium tracking-tight text-primary"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-primary font-mono text-[10px] font-semibold text-primary-ink">
                      1
                    </span>
                    Planner
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
                      planner
                    </span>
                  </motion.span>
                )}
              </AnimatePresence>
              {EXECUTION_AGENTS.map((agent) => {
                const index = effectiveAgents.indexOf(agent.id);
                const active = index !== -1;
                return (
                  <motion.button
                    key={agent.id}
                    layout
                    type="button"
                    title={agent.description}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleAgent(agent.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-left font-display text-xs font-medium tracking-tight transition-colors duration-150",
                      active
                        ? "border-primary/50 bg-primary-soft text-primary"
                        : "border-edge bg-surface-2/70 text-text-dim hover:border-edge hover:text-text",
                    )}
                  >
                    {active ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-primary font-mono text-[10px] font-semibold text-primary-ink">
                        {index + 1}
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-edge bg-surface font-mono text-[10px] text-faint">
                        {index + 1}
                      </span>
                    )}
                    {agent.label}
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
                      {agent.id}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </Field>

          <Field label="The brief">
            <Textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              placeholder="e.g. Build a REST API with auth and a landing page"
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Project (folder in the working area)">
              <Select
                value={projectId}
                onChange={(e) => changeProject(e.target.value)}
              >
                <option value="">No project selected</option>
                {projects.data?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.workspace_mode})
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Deploy platform (used when DevOps runs)"
              hint="Optional — generates deployment files under deployment/."
            >
              <Select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="">No platform</option>
                {DEPLOY_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex justify-center">
            <Button
              type="submit"
              form="command-console"
              size="lg"
              disabled={!canRun || runCount === 0}
              loading={run.isPending}
              className="font-display uppercase tracking-[0.14em]"
            >
              <Play className="h-4 w-4" /> Dispatch{" "}
              {runCount > 0 ? `${runCount} agent${runCount > 1 ? "s" : ""}` : "crew"}
            </Button>
          </div>

          {planMode === "upload" && !canRun && (
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
              {selected.length === 0
                ? "Pick at least one engineer to run."
                : !planUploaded
                  ? "Upload the plan before running."
                  : "Select a project to run against."}
            </p>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
