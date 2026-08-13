"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Bot, Brain, Check, Sparkles, Wrench } from "lucide-react";

import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AgentMemoryDialog } from "@/components/agents/agent-memory-dialog";
import { PageLoader } from "@/components/ui/skeleton";
import { Stagger, StaggerItem, PopIn } from "@/components/motion/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { useAgents, useAgentsRuntime } from "@/lib/hooks";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";


const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  null: "Default",
};

const PROVIDER_TONES: Record<string, { dot: string; text: string; edge: string }> = {
  openai: { dot: "bg-emerald-400", text: "text-emerald-400", edge: "from-emerald-400/70" },
  anthropic: { dot: "bg-orange-400", text: "text-orange-400", edge: "from-orange-400/70" },
  gemini: { dot: "bg-sky-400", text: "text-sky-400", edge: "from-sky-400/70" },
  deepseek: { dot: "bg-violet-400", text: "text-violet-400", edge: "from-violet-400/70" },
  qwen: { dot: "bg-teal-400", text: "text-teal-400", edge: "from-teal-400/70" },
  null: { dot: "bg-edge", text: "text-muted", edge: "from-edge/70" },
};

export default function AgentsPage() {
  const agents = useAgents();
  const runtime = useAgentsRuntime();
  const [memoryFor, setMemoryFor] = useState<{
    kind: string;
    name: string;
  } | null>(null);
  const [selectedKind, setSelectedKind] = useState<string | null>(null);

  const toggleSelected = (kind: string) => {
    setSelectedKind((prev) => (prev === kind ? null : kind));
  };

  if (agents.isLoading || !agents.data) {
    return <PageLoader label="Loading the team…" />;
  }

  const runtimeByKind = new Map(
    runtime.data?.map((r) => [r.kind, r]) ?? [],
  );

  return (
    <div className="space-y-6">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .site-grid, .site-atmosphere {
              display: none !important;
            }
            body {
              background-color: var(--color-bg) !important;
            }
          `,
        }}
      />
      <PageHeader
        center
        eyebrow="The crew"
        title="Specialist roster"
        description="Five specialized AI employees working on your configured LLM. The Planner researches on the web; engineers build; DevOps generates deployments; the Code Reviewer audits the project in depth for flaws and loopholes."
      />

      <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" step={0.07}>
        {agents.data.map((agent) => {
          const rt = runtimeByKind.get(agent.kind);
          const configured = agent.llm_provider && agent.llm_provider !== "null";
          const provider = agent.llm_provider || "null";
          const providerLabel =
            PROVIDER_LABELS[provider] ?? agent.llm_provider ?? "Default";
          const tone = PROVIDER_TONES[provider] ?? PROVIDER_TONES.null;
          const status = rt?.status ?? agent.status;
          const selected = selectedKind === agent.kind;
          return (
            <StaggerItem key={agent.id} className="h-full min-w-0">
              <motion.div
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.995 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="h-full"
              >
                <Card
                  data-tour="agent-card"
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => toggleSelected(agent.kind)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSelected(agent.kind);
                    }
                  }}
                  className={cn(
                    "flex h-full cursor-pointer flex-col overflow-hidden transition-colors duration-200",
                    selected &&
                      "border-primary/60 bg-surface ring-1 ring-primary/40",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-px w-full bg-gradient-to-r to-transparent",
                      selected
                        ? "from-primary"
                        : configured
                          ? tone.edge
                          : "from-edge",
                    )}
                  />
                  <CardHeader>
                    <div className="flex w-full items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                          configured
                            ? "border-primary/30 bg-primary-soft text-primary"
                            : "border-edge bg-surface-2 text-muted"
                        }`}
                      >
                        <Bot className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold tracking-tight text-text">
                          {agent.name}
                        </p>
                        <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                          {agent.kind}
                        </p>
                      </div>
                      {selected && (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <span data-tour="agent-status" className="inline-flex">
                        <StatusBadge status={status} />
                      </span>
                    </div>
                  </CardHeader>
                  <CardBody className="flex flex-1 flex-col gap-3">
                    <p className="line-clamp-2 min-h-10 text-[13px] leading-5 text-text-dim">
                      {agent.role_description}
                    </p>

                    <div className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-2 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            rt?.llm_error ? "bg-red-400" : tone.dot
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                            Running on
                          </p>
                          <p className="truncate text-[11px] font-medium text-text">
                            {agent.llm_model
                              ? `${providerLabel} · ${agent.llm_model}`
                              : providerLabel}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Sparkles
                          className={`h-3.5 w-3.5 ${
                            rt?.llm_error ? "text-red-400" : configured ? tone.text : "text-muted"
                          }`}
                        />
                        {rt?.last_activity && (
                          <span className="font-mono text-[9px] tracking-[0.06em] text-muted">
                            {timeAgo(rt.last_activity)}
                          </span>
                        )}
                      </div>
                    </div>

                    {rt?.llm_error && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                        <p className="text-[11px] leading-4 text-red-300">
                          {rt.llm_error} Add an API key in{" "}
                          <span className="font-medium">Settings</span> or the .env file to
                          enable this agent.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {agent.capabilities.slice(0, 4).map((cap, i) => (
                        <PopIn key={cap} delay={i * 0.04}>
                          <span className="rounded-[3px] border border-edge bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-text-dim">
                            {cap}
                          </span>
                        </PopIn>
                      ))}
                      {agent.capabilities.length > 4 && (
                        <PopIn delay={0.16}>
                          <span className="rounded-[3px] border border-edge bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                            +{agent.capabilities.length - 4}
                          </span>
                        </PopIn>
                      )}
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-edge-soft pt-3">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                        <Wrench className="h-3 w-3" />
                        {agent.allowed_tools.length} tools
                      </span>
                      <Button
                        data-tour="agent-memory"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMemoryFor({ kind: agent.kind, name: agent.name });
                        }}
                      >
                        <Brain className="h-3.5 w-3.5" /> Memory
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            </StaggerItem>
          );
        })}
      </Stagger>

      <AgentMemoryDialog
        agentKind={memoryFor?.kind ?? ""}
        agentName={memoryFor?.name ?? ""}
        onClose={() => setMemoryFor(null)}
      />
    </div>
  );
}
