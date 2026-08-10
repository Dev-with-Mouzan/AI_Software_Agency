"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PRIORITIES } from "@/lib/api";
import { useAgents, useCreateTask } from "@/lib/hooks";
import { ApiClientError } from "@/lib/api";

export function CreateTaskDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { push } = useToast();
  const create = useCreateTask(projectId);
  const agents = useAgents();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [owner, setOwner] = useState("");
  const [points, setPoints] = useState("1");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setOwner("");
    setPoints("1");
    create.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, create.reset]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        priority,
        owner: owner || undefined,
        estimated_points: Math.max(1, parseInt(points, 10) || 1),
      },
      {
        onSuccess: () => {
          push("Task created.", "success");
          setTitle("");
          setDescription("");
          onClose();
        },
        onError: (error) => {
          const message =
            error instanceof ApiClientError ? error.detail : "Failed to create task.";
          push(message, "error");
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New task"
      description="Assign work to an agent or keep it unassigned."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-task" loading={create.isPending} disabled={!title.trim()}>
            Create task
          </Button>
        </>
      }
    >
      <form id="create-task" className="space-y-4" onSubmit={submit}>
        <Field label="Title" htmlFor="task-title">
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Implement auth endpoints"
            autoFocus
            required
          />
        </Field>
        <Field label="Description" htmlFor="task-description">
          <Textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner agent">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Unassigned</option>
              {agents.data?.map((a) => (
                <option key={a.kind} value={a.kind}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Story points">
            <Input
              type="number"
              min={1}
              max={100}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
