"use client";

import { Activity } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/skeleton";
import { Hero } from "@/components/home/hero";
import { StatsScene } from "@/components/home/stats";
import { PipelineScene } from "@/components/home/pipeline";
import { ProjectShowcaseScene } from "@/components/home/project-showcase";
import { FinalCtaScene } from "@/components/home/final-cta";
import { useHealth } from "@/lib/hooks";

export default function OverviewPage() {
  const health = useHealth(10_000);

  if (health.isLoading) return <PageLoader label="Contacting the studio…" />;

  const healthError = health.error as Error | null;

  if (healthError || !health.data) {
    return (
      <div className="mx-auto max-w-[1300px] px-4 py-10 sm:px-6">
        <Card>
          <CardBody className="flex items-center gap-4 py-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold tracking-tight text-text">
                The studio is offline
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                {healthError?.message ??
                  "DevPilot AI API did not respond. Start it with `uvicorn agency.api.main:app` on port 8000."}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Hero />
      <StatsScene />
      <PipelineScene />
      <ProjectShowcaseScene />
      <FinalCtaScene />
    </>
  );
}
