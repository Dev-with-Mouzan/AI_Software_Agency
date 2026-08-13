"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, FolderKanban, Server, Trash2 } from "lucide-react";

import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { PageLoader, EmptyState } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollScene } from "@/components/motion/scroll-scene";
import { Reveal, ScaleIn, StaggerGrid, StaggerGridItem } from "@/components/motion/primitives";
import { useDeleteProject, useProjects } from "@/lib/hooks";
import { timeAgo } from "@/lib/format";
import type { Project } from "@/lib/types";

export function ProjectShowcaseScene() {
  const projects = useProjects();
  const featured = (projects.data ?? []).slice(0, 3);
  const toast = useToast();
  const del = useDeleteProject();
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

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
    <ScrollScene className="pt-[72px] lg:pt-12" innerClassName="px-4">
      <SectionHeading
        align="center"
        eyebrow="In production"
        title={
          <>
            Projects under <span className="text-gradient">command</span>.
          </>
        }
        description="Every folder DevPilot adopts becomes a project — with a live status, an owner track, and a full deployment history."
      />

      <div className="mt-8 sm:mt-12">
        {projects.isLoading && <PageLoader label="Loading projects…" />}
        {!projects.isLoading && featured.length === 0 && (
          <EmptyState
            title="No projects yet"
            description="Adopt a workspace folder to bring your first project under command."
          />
        )}
        <StaggerGrid className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" step={0.06}>
          {featured.map((project) => (
            <StaggerGridItem key={project.id} className="min-w-0 h-full">
              <Link href={`/projects/${project.id}`} className="block h-full">
                <motion.div
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  className="h-full"
                >
                  <Card lift className="group flex h-full flex-col overflow-hidden transition-colors duration-150 hover:border-primary/40">
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
                        <ScaleIn delay={0.05} className="shrink-0">
                          <StatusBadge status={project.status} />
                        </ScaleIn>
                      </div>
                      <p className="line-clamp-2 min-h-10 text-[13px] leading-5 text-text-dim">
                        {project.description || "No description."}
                      </p>
                      <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-edge-soft pt-3 text-[11px] font-medium text-muted">
                        <Server className="h-3 w-3 shrink-0" />
                        <span className="truncate font-mono">{project.root_dir}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-2">
                          <span>{timeAgo(project.updated_at)}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeleteTarget(project);
                            }}
                            aria-label={`Delete ${project.name}`}
                            className="rounded-md p-1 text-faint transition-colors duration-150 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    </CardBody>
                  </Card>
                </motion.div>
              </Link>
            </StaggerGridItem>
          ))}
        </StaggerGrid>
      </div>

      <div className="mt-10 flex justify-center">
        <Reveal delay={0.1}>
          <Link href="/projects">
            <Button variant="secondary" size="lg" className="font-display">
              All projects
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </Reveal>
      </div>

      {/* Animated marquee bridging into the next section */}
      <SectionMarquee />

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
    </ScrollScene>
  );
}

const MARQUEE_ITEMS = [
  "Plan",
  "Build",
  "Review",
  "Ship",
  "You stay in control",
  "One command at a time",
  "Five AI specialists",
  "Supervised engineering",
];

function SectionMarquee() {
  const row = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <div className="relative mt-12 overflow-hidden border-y border-edge bg-surface/40 py-3.5 backdrop-blur-sm -mx-4 sm:-mx-6">
      {/* Edge fade masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-bg to-transparent" />

      <div className="marquee-track flex w-max items-center whitespace-nowrap">
        {row.map((item, i) => (
          <span
            key={i}
            className="flex items-center pr-10 font-mono text-xs uppercase tracking-[0.24em] text-text-dim"
          >
            {item}
            <span className="ml-10 h-1 w-1 shrink-0 rounded-full bg-primary/70" aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}
