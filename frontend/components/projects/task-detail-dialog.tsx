"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { TASK_STATUSES } from "@/lib/api";
import { useAddComment, useUpdateTask } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { formatDate, shortId } from "@/lib/format";

export function TaskDetailDialog({
  projectId,
  task,
  onClose,
}: {
  projectId: string;
  task: Task | null;
  onClose: () => void;
}) {
  const { push } = useToast();
  const update = useUpdateTask(projectId);
  const addComment = useAddComment(task?.id ?? "");
  const [status, setStatus] = useState(task?.status ?? "BACKLOG");
  const [comment, setComment] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("human");

  const changeStatus = (next: string) => {
    if (!task || next === task.status) return;
    setStatus(next);
    update.mutate(
      { id: task.id, status: next },
      {
        onError: (error) => {
          setStatus(task.status);
          push((error as Error).message, "error");
        },
      },
    );
  };

  const submitComment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !comment.trim()) return;
    addComment.mutate(
      { author: commentAuthor, body: comment.trim() },
      {
        onSuccess: () => {
          setComment("");
          push("Comment added.", "success");
        },
        onError: (error) => push((error as Error).message, "error"),
      },
    );
  };

  return (
    <Dialog open={!!task} onClose={onClose} title={task?.title ?? ""} wide>
      {task && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{task.priority}</Badge>
            <Badge>{task.status}</Badge>
            {task.owner && <Badge tone="accent">{task.owner}</Badge>}
            <span className="font-mono text-[10px] text-faint">
              {shortId(task.id)}
            </span>
            <span className="ml-auto text-[11px] text-faint">
              {task.estimated_points}pt · updated {formatDate(task.updated_at)}
            </span>
          </div>

          {task.description ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-text-dim">
              {task.description}
            </p>
          ) : (
            <p className="text-sm text-faint">No description.</p>
          )}

          {task.files_affected.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
                Files affected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {task.files_affected.map((file) => (
                  <code
                    key={file}
                    className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-text-dim"
                  >
                    {file}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Status">
              <Select value={status} onChange={(e) => changeStatus(e.target.value)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Review status">
              <Badge className="mt-1.5">{task.review_status || "NOT_REVIEWED"}</Badge>
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Comments · {task.comments.length}
            </p>
            <div className="space-y-2">
              {task.comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-md border border-edge-soft bg-surface-2 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-text-dim">
                      {c.author}
                    </span>
                    <span className="text-[10px] text-faint">
                      {formatDate(c.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted">{c.body}</p>
                </div>
              ))}
            </div>
            <form onSubmit={submitComment} className="mt-3 flex flex-col gap-2">
              <Input
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                placeholder="Author"
                className="w-40"
              />
              <div className="flex gap-2">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment…"
                  rows={2}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  loading={addComment.isPending}
                  aria-label="Send comment"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Dialog>
  );
}
