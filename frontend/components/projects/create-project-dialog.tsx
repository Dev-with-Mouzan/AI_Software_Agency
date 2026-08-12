"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCreateProject } from "@/lib/hooks";
import { ApiClientError } from "@/lib/api";

export function CreateProjectDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { push } = useToast();
  const create = useCreateProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setSlug("");
    create.reset();
    // The mutation object is rebuilt each render; depending on `create` would
    // re-run this effect on every keystroke. `create.reset` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, create.reset]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        slug: slug.trim() || undefined,
      },
      {
        onSuccess: () => {
          push("Project created.", "success");
          setName("");
          setDescription("");
          setSlug("");
          onClose();
        },
        onError: (error) => {
          const message =
            error instanceof ApiClientError ? error.detail : "Failed to create project.";
          push(message, "error");
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      description="A project is the workspace DevPilot builds software in."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-project"
            loading={create.isPending}
            disabled={!name.trim()}
          >
            Create project
          </Button>
        </>
      }
    >
      <form id="create-project" className="space-y-4" onSubmit={submit}>
        <Field label="Name" htmlFor="project-name">
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Customer portal"
            autoFocus
            required
          />
        </Field>
        <Field label="Slug (optional)" htmlFor="project-slug">
          <Input
            id="project-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="customer-portal"
          />
        </Field>
        <Field label="Description" htmlFor="project-description">
          <Textarea
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should DevPilot build?"
            rows={4}
          />
        </Field>
      </form>
    </Dialog>
  );
}
