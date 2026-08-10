"use client";

import { useState } from "react";
import Link from "next/link";
import {
  File,
  FolderPlus,
  FolderTree as FolderTreeIcon,
  HardDrive,
  ScanSearch,
  Folder as FolderIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, PageLoader } from "@/components/ui/skeleton";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { ApiClientError } from "@/lib/api";
import {
  useAdoptWorkspaceFolder,
  useCreateWorkspaceFolder,
  useFolderTree,
  useWorkspaceFolders,
} from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";

const FOLDER_NAME_RE = /^[A-Za-z0-9._-]{1,120}$/;

export default function WorkingAreaPage() {
  const { push } = useToast();
  const folders = useWorkspaceFolders();
  const create = useCreateWorkspaceFolder();
  const adopt = useAdoptWorkspaceFolder();

  const [createOpen, setCreateOpen] = useState(false);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [inspectSlug, setInspectSlug] = useState<string | null>(null);
  const tree = useFolderTree(inspectSlug);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adoptName, setAdoptName] = useState("");

  const createFolder = (event: React.FormEvent) => {
    event.preventDefault();
    if (!FOLDER_NAME_RE.test(name)) {
      push("Folder name may contain only letters, digits, '.', '_' and '-' (no path separators).", "error");
      return;
    }
    create.mutate(
      { name, description },
      {
        onSuccess: (folder) => {
          push(`Folder '${folder.slug}' created (structured workspace).`, "success");
          setName("");
          setDescription("");
          setCreateOpen(false);
        },
        onError: (error) =>
          push(
            error instanceof ApiClientError ? error.detail : "Failed to create folder.",
            "error",
          ),
      },
    );
  };

  const adoptFolder = (event: React.FormEvent) => {
    event.preventDefault();
    if (!FOLDER_NAME_RE.test(adoptName)) {
      push("Folder name may contain only letters, digits, '.', '_' and '-' (no path separators).", "error");
      return;
    }
    adopt.mutate(
      { folder_name: adoptName },
      {
        onSuccess: (folder) => {
          push(`Adopted '${folder.slug}' (free workspace).`, "success");
          setAdoptName("");
          setAdoptOpen(false);
        },
        onError: (error) =>
          push(
            error instanceof ApiClientError ? error.detail : "Failed to adopt folder.",
            "error",
          ),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="On disk"
        title="Workspace"
        description="Folders on disk inside your working area. The agents work directly on these — you control what is there."
        actions={
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => setAdoptOpen(true)}>
              <ScanSearch className="h-4 w-4" /> Adopt folder
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <FolderPlus className="h-4 w-4" /> New folder
            </Button>
          </div>
        }
      />

      {folders.isLoading ? (
        <PageLoader label="Scanning the working area…" />
      ) : folders.data?.length === 0 ? (
        <EmptyState
          icon={<HardDrive className="h-8 w-8" />}
          title="Working area is empty"
          description="Create a folder for a new project, or drop an existing repo into the working area and adopt it."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <FolderPlus className="h-4 w-4" /> Create a folder
            </Button>
          }
        />
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" step={0.06}>
          {folders.data?.map((folder) => (
            <StaggerItem key={folder.slug}>
            <Card lift className="h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-3 text-text-dim">
                    <FolderIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">
                      {folder.name}
                    </p>
                    <p className="truncate font-mono text-[10px] text-faint">
                      {folder.slug}
                    </p>
                  </div>
                </div>
                <Badge
                  tone={folder.registered ? "primary" : "neutral"}
                  dot={folder.registered}
                >
                  {folder.registered ? "registered" : "unregistered"}
                </Badge>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex items-center gap-4 text-[11px] text-muted">
                  <span className="flex items-center gap-1">
                    <File className="h-3 w-3" /> {formatCount(folder.file_count)} files
                  </span>
                  {folder.project_id && (
                    <Link
                      href={`/projects/${folder.project_id}`}
                      className="font-medium text-primary-hover hover:text-primary"
                    >
                      Open project →
                    </Link>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => setInspectSlug(folder.slug)}
                  >
                    <FolderTreeIcon className="h-3.5 w-3.5" /> Inspect
                  </Button>
                  {!folder.registered && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setAdoptName(folder.slug);
                        setAdoptOpen(true);
                      }}
                    >
                      <ScanSearch className="h-3.5 w-3.5" /> Adopt
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <Dialog
        open={inspectSlug !== null}
        onClose={() => setInspectSlug(null)}
        title={inspectSlug ?? ""}
        description="Top-level contents of the folder in the working area."
        wide
      >
        {tree.isLoading ? (
          <PageLoader label="Reading folder…" />
        ) : tree.data ? (
          <div className="space-y-2">
            <p className="font-mono text-[11px] text-faint">{tree.data.root_dir}</p>
            {tree.data.entries.length === 0 ? (
              <EmptyState title="Empty folder" />
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {tree.data.entries.map((entry) => (
                  <li
                    key={entry.name}
                    className="flex items-center gap-2 rounded-md border border-edge-soft bg-surface-2 px-3 py-2"
                  >
                    {entry.type === "dir" ? (
                      <FolderIcon className="h-3.5 w-3.5 shrink-0 text-primary-hover" />
                    ) : (
                      <File className="h-3.5 w-3.5 shrink-0 text-muted" />
                    )}
                    <span
                      className={cn(
                        "truncate font-mono text-xs",
                        entry.type === "dir" ? "text-text" : "text-text-dim",
                      )}
                    >
                      {entry.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-faint">
                      {entry.type === "dir" ? `${entry.children} files` : entry.size ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <EmptyState title="Folder not found" />
        )}
      </Dialog>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a folder"
        description="A new project with structured subfolders (backend/, frontend/, deployment/, docs/)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-folder"
              loading={create.isPending}
              disabled={!name.trim()}
            >
              Create
            </Button>
          </>
        }
      >
        <form id="create-folder" className="space-y-4" onSubmit={createFolder}>
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. saas-portal"
              autoFocus
            />
          </Field>
          <Field label="Description (optional)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={adoptOpen}
        onClose={() => setAdoptOpen(false)}
        title="Adopt a folder"
        description="Register an existing repo folder from your working area. Agents then get free read/write access to it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdoptOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="adopt-folder"
              loading={adopt.isPending}
              disabled={!adoptName.trim()}
            >
              Adopt
            </Button>
          </>
        }
      >
        <form id="adopt-folder" className="space-y-4" onSubmit={adoptFolder}>
          <Field
            label="Folder name in the working area"
            hint="Drop the folder into the working area first, then type its name here."
          >
            <Input
              value={adoptName}
              onChange={(e) => setAdoptName(e.target.value)}
              placeholder="e.g. my-existing-repo"
              autoFocus
            />
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
