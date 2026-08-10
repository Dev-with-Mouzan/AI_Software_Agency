"use client";

import { CheckCircle2, Circle, GitBranch } from "lucide-react";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import type { ProjectDetail, WorkflowRun } from "@/lib/types";
import { formatDate } from "@/lib/format";

export function ProjectOverview({
  project,
  runs,
}: {
  project: ProjectDetail;
  runs?: WorkflowRun[];
}) {
  const milestones = project.milestones ?? [];
  const doneTasks = project.task_stats?.DONE ?? 0;
  const totalTasks = Object.values(project.task_stats ?? {}).reduce(
    (sum, n) => sum + (typeof n === "number" ? n : 0),
    0,
  );
  const percent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Total tasks", value: totalTasks },
          { label: "Done", value: doneTasks },
          { label: "In progress", value: project.task_stats?.IN_PROGRESS ?? 0 },
          { label: "Blocked", value: project.task_stats?.BLOCKED ?? 0 },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardBody>
              <p className="text-xs text-muted">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-text">
                {stat.value}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <span className="font-mono text-xs text-text-dim">{percent}%</span>
        </CardHeader>
        <CardBody>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-faint">
            {doneTasks} of {totalTasks} tasks complete
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
            <span className="text-xs text-muted">{milestones.length} total</span>
          </CardHeader>
          <CardBody className="space-y-1">
            {milestones.map((milestone) => {
              const done = milestone.status.toUpperCase() === "DONE";
              return (
                <div
                  key={milestone.id}
                  className="flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2"
                >
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-dim">
                      {milestone.name}
                    </p>
                    {milestone.description && (
                      <p className="mt-0.5 text-[11px] text-faint">
                        {milestone.description}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={milestone.status} />
                </div>
              );
            })}
            {milestones.length === 0 && (
              <p className="py-6 text-center text-xs text-faint">
                No milestones yet — run the Planner from the Command tab to
                generate a plan.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest runs</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1">
            {runs?.slice(0, 5).map((run) => (
              <div
                key={run.id}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2"
              >
                <GitBranch className="h-4 w-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-dim">{run.kind}</p>
                  <p className="text-[10px] text-faint">
                    {formatDate(run.started_at)}
                  </p>
                </div>
                <StatusBadge status={run.status} />
              </div>
            ))}
            {(!runs || runs.length === 0) && (
              <p className="py-6 text-center text-xs text-faint">
                No runs yet.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
