"use client";

import { Fragment } from "react";
import {
  ArrowRight,
  ChevronsDown,
  ClipboardList,
  Gauge,
  Rocket,
  type LucideIcon,
} from "lucide-react";

import { SectionHeading } from "@/components/ui/section-heading";
import { ScrollScene } from "@/components/motion/scroll-scene";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { cn } from "@/lib/cn";

const STEPS: {
  icon: LucideIcon;
  title: string;
  body: string;
  tone: string;
  glow: string;
  agents: string[];
}[] = [
  {
    icon: ClipboardList,
    title: "Plan",
    body: "Tell the Planner what to build. It researches, writes a plan and breaks it into tasks.",
    tone: "border-info/40 bg-info-soft text-info",
    glow: "from-info/20",
    agents: ["Planner", "research + plan"],
  },
  {
    icon: Gauge,
    title: "Build",
    body: "Backend and Frontend engineers work through the plan, then the Reviewer audits every line.",
    tone: "border-primary/40 bg-primary-soft text-primary",
    glow: "from-primary/20",
    agents: ["Backend", "Frontend", "Reviewer"],
  },
  {
    icon: Rocket,
    title: "Ship",
    body: "DevOps validates the stack and prepares a deployment for you to approve with one click.",
    tone: "border-warning/40 bg-warning-soft text-warning",
    glow: "from-warning/20",
    agents: ["DevOps", "approval gate"],
  },
];

function StepCard({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const Icon = step.icon;
  return (
    <div className="relative h-full">
      {/* Radial tint behind each card */}
      <div
        aria-hidden
        className={cn(
          // Tighten the halo on phones so it never pokes past the viewport
          // edge (page gutter is only 16px on mobile).
          "pointer-events-none absolute -inset-3 rounded-full bg-gradient-to-b to-transparent opacity-40 blur-2xl sm:-inset-6",
          step.glow,
        )}
      />
      <div className="panel-glow relative h-full overflow-hidden rounded-2xl border border-edge bg-surface/70 shadow-panel backdrop-blur-sm">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-25" />
        <div className="relative flex h-full flex-col gap-3 p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-110",
                step.tone,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-muted">
              step {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <h3 className="font-display text-xl font-bold tracking-tight text-text">
            {step.title}
          </h3>
          <p className="text-sm font-medium leading-6 text-text-dim">{step.body}</p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-edge-soft pt-3">
            {step.agents.map((agent) => (
              <span
                key={agent}
                className="inline-flex items-center gap-1.5 rounded-md border border-edge-soft bg-surface-2 px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-text-dim"
              >
                <span className={cn("h-1 w-1 rounded-full", step.tone.split(" ")[1])} />
                {agent}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div
      className="flex shrink-0 items-center justify-center py-2 md:w-12 md:py-0"
      aria-hidden
    >
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-edge bg-surface-2 text-primary shadow-panel">
        <span className="absolute inset-0 animate-ping-slow rounded-full border border-primary/40" />
        <ArrowRight className="hidden h-4 w-4 md:block" />
        <ChevronsDown className="h-4 w-4 md:hidden" />
      </span>
    </div>
  );
}

export function PipelineScene() {
  return (
    <ScrollScene className="pt-[72px] lg:pt-12">
      <SectionHeading
        eyebrow="How it works"
        title={
          <>
            From idea to shipped — <span className="text-gradient">three steps</span>.
          </>
        }
        description="Your specialists move a project through a supervised pipeline. Every phase hands off cleanly, and you approve before anything ships."
      />

      <div className="mt-10 flex flex-col items-stretch md:mt-14 md:flex-row md:items-stretch">
        <Stagger className="contents" step={0.14}>
          {STEPS.map((step, i) => (
            <Fragment key={step.title}>
              <StaggerItem className="flex-1">
                <StepCard step={step} index={i} />
              </StaggerItem>
              {i < STEPS.length - 1 && <Connector />}
            </Fragment>
          ))}
        </Stagger>
      </div>

      <Reveal className="mt-12 text-center" delay={0.15}>
        <p className="text-sm text-muted">
          Curious about the assembly line?{" "}
          <a
            href="/workflows"
            className="font-medium text-primary transition-colors hover:text-primary-hover"
          >
            Watch runs live →
          </a>
        </p>
      </Reveal>
    </ScrollScene>
  );
}
