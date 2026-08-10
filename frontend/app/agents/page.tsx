"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Bot, Brain, Sparkles, Wrench } from "lucide-react";

import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AgentMemoryDialog } from "@/components/agents/agent-memory-dialog";
import { PageLoader } from "@/components/ui/skeleton";
import { Stagger, StaggerItem, PopIn, ScaleIn, MagneticHover } from "@/components/motion/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { useAgents, useAgentsRuntime } from "@/lib/hooks";
import { timeAgo } from "@/lib/format";


const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  null: "Default",
};

const PROVIDER_TONES: Record<string, { dot: string; label: string }> = {
  openai: { dot: "bg-emerald-400", label: "text-emerald-500" },
  anthropic: { dot: "bg-orange-400", label: "text-orange-500" },
  gemini: { dot: "bg-sky-400", label: "text-sky-500" },
  deepseek: { dot: "bg-violet-400", label: "text-violet-500" },
  qwen: { dot: "bg-teal-400", label: "text-teal-500" },
};

export default function AgentsPage() {
  const agents = useAgents();
  const runtime = useAgentsRuntime();
  const [memoryFor, setMemoryFor] = useState<{
    kind: string;
    name: string;
  } | null>(null);

  if (agents.isLoading || !agents.data) {
    return <PageLoader label="Loading the team…" />;
  }

  const runtimeByKind = new Map(
    runtime.data?.map((r) => [r.kind, r]) ?? [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        center
        eyebrow="The crew"
        title="Your team"
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
          return (
            <StaggerItem key={agent.id}>
            <motion.div
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.995 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
            <Card className="flex h-full flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <MagneticHover strength={0.3}>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-[4px] border ${
                      configured
                        ? "border-primary/30 bg-primary-soft text-primary"
                        : "border-edge bg-surface-2 text-muted"
                    }`}
                  >
                    <Bot className="h-4 w-4" />
                  </div>
                  </MagneticHover>
                  <div>
                    <p className="font-display text-sm font-semibold tracking-tight text-text">{agent.name}</p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                      {agent.kind}
                    </p>
                  </div>
                </div>
                <ScaleIn delay={0.05}><StatusBadge status={status} /></ScaleIn>
              </CardHeader>
              <CardBody className="flex flex-1 flex-col gap-3">
                <p className="text-xs text-muted">{agent.role_description}</p>

                <div className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-2 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
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
                      className={`h-3.5 w-3.5 ${configured ? tone.label : "text-muted"}`}
                    />
                    {rt?.last_activity && (
                      <span className="font-mono text-[9px] tracking-[0.06em] text-faint">
                        {timeAgo(rt.last_activity)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {agent.capabilities.slice(0, 4).map((cap, i) => (
                    <PopIn key={cap} delay={i * 0.04}>
                    <span
                      className="rounded-[3px] border border-edge bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-text-dim"
                    >
                      {cap}
                    </span>
                    </PopIn>
                  ))}
                  {agent.capabilities.length > 4 && (
                    <PopIn delay={0.16}>
                    <span className="rounded-[3px] border border-edge bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                      +{agent.capabilities.length - 4}
                    </span>
                    </PopIn>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-edge-soft pt-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-faint">
                    <Wrench className="h-3 w-3" />
                    {agent.allowed_tools.length} tools
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setMemoryFor({ kind: agent.kind, name: agent.name })
                    }
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
