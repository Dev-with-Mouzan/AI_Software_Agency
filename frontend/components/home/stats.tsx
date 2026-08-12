"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Bot,
  FolderKanban,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { StaggerGrid, StaggerGridItem } from "@/components/motion/primitives";
import { CountUp } from "@/components/motion/count-up";
import { ScrollTilt3D } from "@/components/motion/scroll3d";
import { useAgents, useHealth, useProjects, useWorkflowRuns } from "@/lib/hooks";
import { formatUptime } from "@/lib/format";
import { cn } from "@/lib/cn";

function StatCard({
  icon,
  label,
  value,
  format,
  detail,
  footnote,
  href,
  tone,
  hairline,
  live,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  format?: (n: number) => string;
  detail: string;
  footnote: string;
  href?: string;
  tone: string;
  hairline: string;
  live?: boolean;
}) {
  const Icon = icon;
  const inner = (
    <div className="group relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-edge bg-surface/70 p-4 text-center shadow-panel backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow sm:p-7">
      {/* Top accent hairline */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent opacity-40 transition-opacity duration-300 group-hover:opacity-100",
          hairline,
        )}
      />
      {/* Soft radial tint on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-36 w-44 -translate-x-1/2 rounded-full bg-gradient-to-b to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />

      {/* Open affordance */}
      {href && (
        <span className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-edge bg-surface-2 text-faint opacity-0 transition-all duration-300 group-hover:opacity-100">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      )}

      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-110",
          tone,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-text-dim transition-colors duration-300 group-hover:text-primary">
        {label}
      </span>

      <p className="flex items-center gap-2 font-display text-[1.8rem] font-extrabold leading-none tracking-tight text-text transition-colors duration-300 group-hover:text-primary sm:text-[2.6rem]">
        <CountUp value={value} format={format} />
        {live && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
        )}
      </p>

      <p className="text-sm font-medium leading-5 text-text-dim">{detail}</p>

      <div className="mt-auto flex w-full flex-col items-center gap-2.5">
        <span
          aria-hidden
          className="h-px w-10 bg-gradient-to-r from-transparent via-edge to-transparent transition-all duration-300 group-hover:w-16 group-hover:via-primary/50"
        />
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          {footnote}
        </p>
      </div>
    </div>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  );
}

export function StatsScene() {
  const projects = useProjects();
  const agents = useAgents();
  const runs = useWorkflowRuns();
  const health = useHealth(10_000);

  const runningRuns =
    runs.data?.filter((r) => r.status === "RUNNING").length ?? 0;

  return (
    <div className="mx-auto max-w-[1300px] px-5 pt-[72px] sm:px-6 lg:pt-12">
      <ScrollTilt3D max={3} perspective={1400} fade={false}>
        <StaggerGrid
          className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          step={0.09}
        >
          <StaggerGridItem className="h-full">
            <StatCard
              icon={FolderKanban}
              label="Projects"
              value={projects.data?.length ?? 0}
              detail={`${projects.data?.filter((p) => p.status === "ACTIVE").length ?? 0} active right now`}
              footnote="workspaces under command"
              href="/projects"
              tone="border-info/40 bg-info-soft text-info"
              hairline="from-info/60"
            />
          </StaggerGridItem>
          <StaggerGridItem className="h-full">
            <StatCard
              icon={Bot}
              label="Team"
              value={agents.data?.length ?? 0}
              detail="5 specialist roles"
              footnote="planner · engineers · reviewer · devops"
              href="/agents"
              tone="border-primary/40 bg-primary-soft text-primary"
              hairline="from-primary/60"
            />
          </StaggerGridItem>
          <StaggerGridItem className="h-full">
            <StatCard
              icon={Workflow}
              label="Runs"
              value={runs.data?.length ?? 0}
              detail={`${runningRuns} in flight`}
              footnote="supervised workflow runs"
              href="/workflows"
              tone="border-accent/40 bg-accent-soft text-accent"
              hairline="from-accent/60"
            />
          </StaggerGridItem>
          <StaggerGridItem className="h-full">
            <StatCard
              icon={Activity}
              label="Uptime"
              value={health.data?.uptime_seconds ?? 0}
              format={formatUptime}
              detail={`${health.data?.environment ?? "—"} · v${health.data?.version ?? "—"}`}
              footnote="the studio never sleeps"
              tone="border-warning/40 bg-warning-soft text-warning"
              hairline="from-warning/60"
              live
            />
          </StaggerGridItem>
        </StaggerGrid>
      </ScrollTilt3D>
    </div>
  );
}
