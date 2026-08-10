"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateTaskDialog } from "@/components/projects/create-task-dialog";
import { TaskDetailDialog } from "@/components/projects/task-detail-dialog";
import { EmptyState, PageLoader } from "@/components/ui/skeleton";
import { useProjectBoard } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/cn";

const COLUMNS = ["BACKLOG", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"] as const;

const columnTone: Record<string, string> = {
  BACKLOG: "text-muted",
  IN_PROGRESS: "text-info",
  IN_REVIEW: "text-warning",
  DONE: "text-success",
  BLOCKED: "text-danger",
};

function priorityTone(priority: string) {
  switch (priority.toUpperCase()) {
    case "CRITICAL":
      return "danger";
    case "HIGH":
      return "warning";
    case "LOW":
      return "neutral";
    default:
      return "primary";
  }
}

export function TaskBoard({ projectId }: { projectId: string }) {
  const board = useProjectBoard(projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {board.data?.length ?? 0} tasks · drag-free, status updated inline
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add task
        </Button>
      </div>

      {board.isLoading ? (
        <PageLoader label="Loading board…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((column) => {
            const tasks =
              board.data?.filter(
                (t) => (t.status ?? "BACKLOG").toUpperCase() === column,
              ) ?? [];
            return (
              <div key={column} className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <p className={cn("text-[11px] font-semibold uppercase tracking-wider", columnTone[column])}>
                    {column.replace("_", " ")}
                  </p>
                  <span className="rounded-full bg-surface-3 px-1.5 text-[10px] font-medium text-text-dim">
                    {tasks.length}
                  </span>
                </div>
                <div className="flex min-h-24 flex-col gap-2 rounded-lg border border-dashed border-edge-soft p-2">
                  {tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelected(task)}
                      className="rounded-md border border-edge bg-surface-2 px-3 py-2.5 text-left transition-colors duration-150 hover:border-edge hover:bg-surface-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium leading-5 text-text">
                          {task.title}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge tone={priorityTone(task.priority)}>
                          {task.priority}
                        </Badge>
                        <span className="flex items-center gap-2 font-mono text-[10px] text-faint">
                          {task.owner && <span>{task.owner}</span>}
                          <span>{task.estimated_points}pt</span>
                        </span>
                      </div>
                    </button>
                  ))}
                  {tasks.length === 0 && (
                    <p className="py-6 text-center text-[11px] text-faint">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {board.data?.length === 0 && !board.isLoading && (
        <EmptyState title="No tasks on this board yet" />
      )}

      <CreateTaskDialog
        projectId={projectId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <TaskDetailDialog
        projectId={projectId}
        task={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
