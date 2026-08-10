"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { FolderKanban, Plus, Server } from "lucide-react";

import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { EmptyState, PageLoader } from "@/components/ui/skeleton";
import { Stagger, StaggerItem, Reveal, ScaleIn } from "@/components/motion/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { useProjects } from "@/lib/hooks";
import { timeAgo } from "@/lib/format";


export default function ProjectsPage() {
  const projects = useProjects();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Portfolio"
        title="Projects"
        description={
          projects.data?.length
            ? `${projects.data.length} workspaces managed by the agency.`
            : "Everything the agency works on, in one place."
        }
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </Button>
        }
      />

      {projects.isLoading ? (
        <PageLoader label="Loading projects…" />
      ) : projects.data?.length === 0 ? (
        <Reveal direction="scale">
        <EmptyState
          icon={<motion.div animate={{ rotate: [0, -8, 8, -4, 4, 0] }} transition={{ duration: 0.6, delay: 0.3 }}><FolderKanban className="h-8 w-8" /></motion.div>}
          title="No projects yet"
          description="Create a project and let the agency break it down, build it, and deploy it."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create your first project
            </Button>
          }
        />
        </Reveal>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" step={0.06}>
          {projects.data?.map((project) => (
            <StaggerItem key={project.id}>
              <Link href={`/projects/${project.id}`} className="block h-full">
                <motion.div
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                >
                <Card lift className="group h-full transition-colors duration-150 hover:border-primary/40">
                  <CardBody className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <motion.div
                          whileHover={{ rotate: 5 }}
                          transition={{ type: "spring", stiffness: 500, damping: 15 }}
                          className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-primary/30 bg-primary-soft text-primary"
                        >
                          <FolderKanban className="h-4 w-4" />
                        </motion.div>
                        <div>
                          <p className="font-display text-sm font-semibold tracking-tight text-text group-hover:text-primary">
                            {project.name}
                          </p>
                          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                            {project.slug}
                          </p>
                        </div>
                      </div>
                      <ScaleIn delay={0.05}><StatusBadge status={project.status} /></ScaleIn>
                    </div>
                    <p className="line-clamp-2 flex-1 text-xs leading-5 text-muted">
                      {project.description || "No description."}
                    </p>
                    <div className="flex items-center gap-2 border-t border-edge-soft pt-3 text-[11px] text-faint">
                      <Server className="h-3 w-3" />
                      <span className="font-mono">{project.root_dir}</span>
                      <span className="ml-auto">{timeAgo(project.updated_at)}</span>
                    </div>
                  </CardBody>
                </Card>
                </motion.div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <CreateProjectDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
