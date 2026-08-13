"use client";

import { Fragment, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowRight, Check, CheckCircle2, FileUp, Play, Sparkles, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Field, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ActivityPanel } from "@/components/workflows/activity-panel";
import { AGENTS, DEPLOY_PLATFORMS, ApiClientError, isProviderNotConfigured } from "@/lib/api";
import { useAgentRun, useLlmSettings, useProjects, useUploadPlan } from "@/lib/hooks";
import { PROVIDER_HINT } from "@/lib/chat";
import type { WorkflowRun } from "@/lib/types";
import { cn } from "@/lib/cn";

const EXECUTION_AGENTS = AGENTS.filter((a) => a.id !== "planner");

export function CommandConsole({
  defaultProjectId,
  onRunStarted,
}: {
  defaultProjectId?: string;
  onRunStarted?: (run: WorkflowRun) => void;
}) {
  const { push } = useToast();
  const projects = useProjects();
  const run = useAgentRun();
  const llmSettings = useLlmSettings();

  // The backend is the source of truth; this only disables the button when the
  // settings endpoint confirms no provider is configured.
  const providerReady = llmSettings.isSuccess
    ? llmSettings.data?.configured === true
    : true;

  const [planMode, setPlanMode] = useState<"agent" | "upload">("agent");
  const [selected, setSelected] = useState<string[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [platform, setPlatform] = useState("");
  const [command, setCommand] = useState("");
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [planUploaded, setPlanUploaded] = useState(false);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);

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
    setLiveRunId(null);
    run.mutate(
      {
        project_id: projectId || undefined,
        agents: effectiveAgents,
        command: command.trim() || "Work on the project in the working area.",
        platform: platform || undefined,
        plan_source: planMode,
      },
      {
        onSuccess: (res) => {
          setLiveRunId(res?.id ?? null);
          onRunStarted?.(res);
          push(
            `Run started — ${effectiveAgents.join(", ")}.`,
            "success",
          );
        },
        onError: (error) => {
          const message = isProviderNotConfigured(error)
            ? PROVIDER_HINT
            : error instanceof ApiClientError
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

  const pipelineLabel = effectiveAgents.map((id) => {
    const agent = AGENTS.find((a) => a.id === id);
    return agent?.label ?? id;
  });

  return (
    <Card className="overflow-hidden">
      <span
        aria-hidden
        className="block h-px w-full bg-gradient-to-r from-primary/60 to-transparent"
      />
      <div className="relative overflow-hidden border-b border-edge-soft">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="relative flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5" data-tour="dispatch-desk">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/40 bg-primary-soft">
              <Terminal className="h-4 w-4 text-primary" />
            </span>
            <div>
              <p className="font-display text-[15px] font-semibold tracking-tight text-text">
                Dispatch desk
              </p>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
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
                    ? "border-primary/60 bg-primary-soft/40"
                    : "border-edge bg-surface-2/70 hover:border-primary/30",
                )}
              >
                {planMode === "agent" && (
                  <motion.span
                    layoutId="plan-mode"
                    className="absolute inset-0 rounded-md bg-primary-soft"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                {planMode === "agent" && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-ink">
                    <Check className="h-3 w-3" />
                  </span>
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
                <p className="relative z-10 mt-1.5 text-[11px] leading-5 text-text-dim">
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
                    ? "border-primary/60 bg-primary-soft/40"
                    : "border-edge bg-surface-2/70 hover:border-primary/30",
                )}
              >
                {planMode === "upload" && (
                  <motion.span
                    layoutId="plan-mode"
                    className="absolute inset-0 rounded-md bg-primary-soft"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                {planMode === "upload" && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-ink">
                    <Check className="h-3 w-3" />
                  </span>
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
                <p className="relative z-10 mt-1.5 text-[11px] leading-5 text-text-dim">
                  Upload a markdown plan — the engineers build directly from it
                  and the Planner is skipped.
                </p>
              </motion.button>
            </div>
          </Field>

          {planMode === "upload" && (
            <div className="overflow-hidden rounded-md border border-edge bg-surface-2/70">
              {/* Header bar */}
              <div className="flex items-center gap-2 border-b border-edge-soft px-3 py-2 sm:px-4">
                <FileUp className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
                  Plan file (.md / .txt)
                </span>
              </div>

              {/* Body */}
              <div className="flex flex-col gap-3 p-3 sm:p-4">
                <FileDropzone
                  accept=".md,.markdown,.txt"
                  value={planFile}
                  disabled={!projectId}
                  onChange={(file) => {
                    setPlanFile(file);
                    setPlanUploaded(false);
                  }}
                />

                {/* Full-width upload button — 44 px touch target on mobile */}
                <Button
                  variant="primary"
                  className="h-11 w-full text-sm sm:h-9"
                  onClick={submitPlan}
                  loading={upload.isPending}
                  disabled={!planFile || !projectId}
                >
                  <FileUp className="h-4 w-4" /> Upload plan
                </Button>

                {/* Status message with icon */}
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-md px-3 py-2 text-[11px] leading-tight",
                    planUploaded
                      ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                      : "border border-edge bg-surface-2 text-text-dim",
                  )}
                >
                  {planUploaded ? (
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-muted" />
                  )}
                  <span className="font-medium">
                    {!projectId
                      ? "Select a project first to upload your plan."
                      : planUploaded
                        ? "Plan uploaded. The engineers will follow it."
                        : "Pick a .md or .txt file, then tap Upload plan."}
                  </span>
                </div>
              </div>
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
            <div className="flex flex-wrap gap-2" data-tour="crew-sequence">
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
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
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
                        : "border-edge bg-surface-2/70 text-text-dim hover:border-primary/30 hover:text-text",
                    )}
                  >
                    {active ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-primary font-mono text-[10px] font-semibold text-primary-ink">
                        {index + 1}
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-edge bg-surface font-mono text-[10px] text-muted">
                        {index + 1}
                      </span>
                    )}
                    {agent.label}
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                      {agent.id}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {runCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-edge bg-surface-2/70 px-3 py-2">
                <span className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted">
                  Pipeline
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {pipelineLabel.map((label, i) => (
                    <Fragment key={`${label}-${i}`}>
                      {i > 0 && (
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted" />
                      )}
                      <span className="rounded-[3px] border border-edge bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-dim">
                        {label}
                      </span>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
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

          {!providerReady && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-[11px] leading-5 text-warning">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              <p>
                {PROVIDER_HINT}{" "}
                <a
                  href="/settings"
                  className="font-semibold underline underline-offset-2"
                >
                  Open Settings
                </a>{" "}
                to connect one before dispatching agents.
              </p>
            </div>
          )}

          <div className="flex justify-center">
            <Button
              data-tour="dispatch-button"
              type="submit"
              form="command-console"
              size="lg"
              disabled={!canRun || runCount === 0 || !providerReady}
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

        <AnimatePresence initial={false}>
          {liveRunId && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <ActivityPanel
                runId={liveRunId}
                title="Live crew feed"
                compact
              />
            </motion.div>
          )}
        </AnimatePresence>
      </CardBody>
    </Card>
  );
}
