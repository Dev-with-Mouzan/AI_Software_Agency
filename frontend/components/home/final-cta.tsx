"use client";

import Link from "next/link";
import { MessageSquareText, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollScene } from "@/components/motion/scroll-scene";
import { Reveal } from "@/components/motion/primitives";

export function FinalCtaScene() {
  return (
    <ScrollScene className="pt-[72px] lg:pt-12">
      <Reveal direction="scale">
        <div className="panel-glow relative overflow-hidden rounded-3xl border border-edge bg-surface/60 px-5 py-12 text-center shadow-pop sm:px-12 sm:py-20">
          {/* Backdrop */}
          <div className="bg-grid-fade pointer-events-none absolute inset-0 opacity-[0.08] lg:opacity-40" />
          <div className="aurora-blob left-1/2 top-[-60%] h-64 w-64 -translate-x-1/2 animate-drift-a bg-[var(--color-aurora-a)] sm:h-96 sm:w-[36rem] lg:w-[36rem]" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Ready when you are
            </span>
            <h2 className="mx-auto mt-5 max-w-2xl font-display text-2xl font-extrabold leading-[1.16] tracking-tight text-text sm:text-5xl">
              Your software, built by an{" "}
              <span className="text-gradient">AI team</span> that reports to you.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-6 text-text-dim sm:leading-7">
              Give the planners a brief, watch the specialists build, review
              every diff — then ship with one approval.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
              <Link href="/workflows" className="flex-1 sm:flex-none">
                <Button
                  size="lg"
                  className="max-lg:h-14 max-lg:w-full max-lg:rounded-[18px] max-lg:text-base"
                >
                  <Play className="h-4 w-4" /> Start building
                </Button>
              </Link>
              <Link href="/chat" className="flex-1 sm:flex-none">
                <Button
                  variant="secondary"
                  size="lg"
                  className="max-lg:h-14 max-lg:w-full max-lg:rounded-[18px] max-lg:text-base"
                >
                  <MessageSquareText className="h-4 w-4" /> Ask the team
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </ScrollScene>
  );
}
