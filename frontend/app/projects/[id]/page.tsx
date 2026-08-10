"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { FolderKanban, ArrowLeft } from "lucide-react";

import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/skeleton";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { TaskBoard } from "@/components/projects/task-board";
import { ProjectOverview } from "@/components/projects/project-overview";
import { DeploymentsTab } from "@/components/projects/deployments-tab";
import { CommandConsole } from "@/components/workflows/command-console";
import { useProjectDetail, useWorkflowRuns } from "@/lib/hooks";
import { formatDate, shortId } from "@/lib/format";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const detail = useProjectDetail(projectId);
  const runs = useWorkflowRuns(projectId);
  const [tab, setTab] = useState("overview");

  if (detail.isLoading || !detail.data) {
    return <PageLoader label="Loading project…" />;
  }

  const project = detail.data;

  return (
    <div className="space-y-6">
      <Link
        href="/projects"
        className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text-dim"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Projects
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: EASE }}
      >
      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary-soft text-primary">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-lg font-semibold tracking-tight text-text">
                {project.name}
              </h2>
              <StatusBadge status={project.status} />
              <span className="font-mono text-[10px] text-faint">
                {shortId(project.id)}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-muted">
              {project.root_dir}
            </p>
          </div>
          <div className="text-right text-[11px] text-faint">
            <p>Created {formatDate(project.created_at)}</p>
            <p>Updated {formatDate(project.updated_at)}</p>
          </div>
        </CardBody>
      </Card>
      </motion.div>

      {project.description && (
        <p className="max-w-3xl text-sm leading-6 text-text-dim">
          {project.description}
        </p>
      )}

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "command", label: "Command" },
          { id: "board", label: "Board" },
          { id: "deployments", label: "Deployments" },
        ]}
        active={tab}
        onChange={setTab}
      >
        <TabPanel active={tab} id="overview">
          <ProjectOverview project={project} runs={runs.data} />
        </TabPanel>
        <TabPanel active={tab} id="command">
          <CommandConsole defaultProjectId={projectId} />
        </TabPanel>
        <TabPanel active={tab} id="board">
          <TaskBoard projectId={projectId} />
        </TabPanel>
        <TabPanel active={tab} id="deployments">
          <DeploymentsTab projectId={projectId} />
        </TabPanel>
      </Tabs>
    </div>
  );
}
