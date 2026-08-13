"use client";

import { Brain } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/skeleton";
import { useMemory } from "@/lib/hooks";
import { formatDate } from "@/lib/format";

export function AgentMemoryDialog({
  agentKind,
  agentName,
  onClose,
}: {
  agentKind: string;
  agentName: string;
  onClose: () => void;
}) {
  const memory = useMemory(agentKind);

  return (
    <Dialog
      open={!!agentKind}
      onClose={onClose}
      title={`${agentName} — memory`}
      wide
      clearOverlay
    >
      <div className="space-y-3">
        {memory.isLoading && <PageLoader label="Recalling memories…" />}
        {memory.data?.map((entry) => (
          <div
            key={entry.id}
            className="rounded-md border border-edge-soft bg-surface-2 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Badge tone="accent">{entry.kind}</Badge>
              <span className="font-mono text-[10px] text-faint">
                importance {entry.importance.toFixed(2)}
              </span>
              <span className="ml-auto text-[10px] text-faint">
                {formatDate(entry.created_at)}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-text-dim">{entry.content}</p>
            {entry.summary && (
              <p className="mt-1 text-[11px] text-faint">↳ {entry.summary}</p>
            )}
          </div>
        ))}
        {!memory.isLoading && memory.data?.length === 0 && (
          <EmptyState
            icon={<Brain className="h-8 w-8" />}
            title="No memories stored"
            description="Memories are written as the agent works and are shared across the team."
          />
        )}
      </div>
    </Dialog>
  );
}
