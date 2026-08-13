"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { FolderKanban, Globe2, MoreVertical, Plus, Rocket, Server, Trash2 } from "lucide-react";

import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { DeployModal } from "@/components/projects/deploy/deploy-modal";
import { DeployProgressModal } from "@/components/projects/deploy/deploy-progress-modal";
import { Dropdown } from "@/components/projects/deploy/dropdown";
import { EmptyState, PageLoader } from "@/components/ui/skeleton";
import { Stagger, StaggerItem, Reveal, ScaleIn } from "@/components/motion/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { useDeleteProject, useProjects } from "@/lib/hooks";
import { timeAgo } from "@/lib/format";
import type { Project } from "@/lib/types";


export default function ProjectsPage() {
  const projects = useProjects();
  const toast = useToast();
  const del = useDeleteProject();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deployTarget, setDeployTarget] = useState<Project | null>(null);
  const [progressTarget, setProgressTarget] = useState<Project | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      toast.push(`Deleted "${deleteTarget.name}".`, "success");
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Failed to delete project.",
        "error",
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        center
        eyebrow="Portfolio"
        title="Projects"
        description={
          projects.data?.length
            ? `${projects.data.length} workspaces managed by DevPilot.`
            : "Everything DevPilot works on, in one place."
        }
      />

      {projects.isLoading ? (
        <PageLoader label="Loading projects…" />
      ) : projects.data?.length === 0 ? (
        <Reveal direction="scale">
        <EmptyState
          icon={<motion.div animate={{ rotate: [0, -8, 8, -4, 4, 0] }} transition={{ duration: 0.6, delay: 0.3 }}><FolderKanban className="h-8 w-8" /></motion.div>}
          title="No projects yet"
          description="Create a project and let DevPilot break it down, build it, and deploy it."
          action={
            <Button data-tour="new-project" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create your first project
            </Button>
          }
        />
        </Reveal>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" step={0.06}>
          {projects.data?.map((project) => (
            <StaggerItem key={project.id} className="h-full min-w-0">
              <Link href={`/projects/${project.id}`} className="block h-full">
                <motion.div
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  className="h-full"
                >
                <Card lift data-tour="project-card" className="group flex h-full flex-col overflow-hidden transition-colors duration-150 hover:border-primary/40">
                  <span
                    aria-hidden
                    className="h-px w-full bg-gradient-to-r from-primary/60 to-transparent transition-opacity duration-150 group-hover:opacity-100"
                  />
                  <CardBody className="flex flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <motion.div
                          whileHover={{ rotate: 5 }}
                          transition={{ type: "spring", stiffness: 500, damping: 15 }}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary-soft text-primary"
                        >
                          <FolderKanban className="h-5 w-5" />
                        </motion.div>
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-semibold tracking-tight text-text group-hover:text-primary">
                            {project.name}
                          </p>
                          <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                            {project.slug}
                          </p>
                        </div>
                      </div>
                      <ScaleIn delay={0.05} className="shrink-0"><StatusBadge status={project.status} /></ScaleIn>
                    </div>
                    <p className="line-clamp-2 min-h-10 text-[13px] leading-5 text-text-dim">
                      {project.description || "No description."}
                    </p>
                    <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-edge-soft pt-3 text-[11px] font-medium text-muted">
                      <Server className="h-3 w-3 shrink-0" />
                      <span className="truncate font-mono">{project.root_dir}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <span>{timeAgo(project.updated_at)}</span>
                        <Dropdown
                          trigger={
                            <span
                              data-tour="project-actions"
                              role="button"
                              tabIndex={0}
                              aria-label={`Actions for ${project.name}`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }
                              }}
                              className="rounded-md p-1 text-faint transition-colors duration-150 hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </span>
                          }
                          items={[
                            {
                              label: "Deploy",
                              icon: <Rocket className="h-3.5 w-3.5" />,
                              onSelect: () => setDeployTarget(project),
                            },
                            {
                              label: "Open live site",
                              icon: <Globe2 className="h-3.5 w-3.5" />,
                              onSelect: () => window.open(`/projects/${project.id}?tab=deployments`, "_self"),
                            },                            {
                              label: "Delete project",
                              icon: <Trash2 className="h-3.5 w-3.5" />,
                              onSelect: () => setDeleteTarget(project),
                              danger: true,
                            },
                          ]}
                        />
                      </span>
                    </div>
                  </CardBody>
                </Card>
                </motion.div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {projects.data?.length ? (
        <div className="flex items-center justify-end gap-2 border-t border-edge-soft pt-4">
          <Button data-tour="new-project" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </Button>
        </div>
      ) : null}

      <CreateProjectDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {deployTarget && (
        <DeployModal
          projectId={deployTarget.id}
          open={!!deployTarget}
          onClose={() => setDeployTarget(null)}
          onLaunched={() => {
            setProgressTarget(deployTarget);
            setDeployTarget(null);
          }}
        />
      )}

      {progressTarget && (
        <DeployProgressModal
          projectId={progressTarget.id}
          open={!!progressTarget}
          onClose={() => setProgressTarget(null)}
          onOpenDetails={() => {
            setProgressTarget(null);
            window.open(`/projects/${progressTarget.id}?tab=deployments`, "_self");
          }}
        />
      )}

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete project?"
        description="This removes the project and everything tied to it — tasks, runs, milestones and knowledge. Files on disk are left untouched."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={del.isPending}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={del.isPending}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-text-dim">
          You are about to delete{" "}
          <span className="font-medium text-text">{deleteTarget?.name}</span>{" "}
          (<span className="font-mono text-muted">{deleteTarget?.slug}</span>).
          This cannot be undone.
        </p>
      </Dialog>
    </div>
  );
}
