"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

export function Tabs({
  tabs,
  active,
  onChange,
  children,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  children?: ReactNode;
}) {
  return (
    <div>
      <div
        className="flex items-center gap-1 border-b border-edge-soft"
        role="tablist"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 font-display text-[13px] font-medium tracking-tight transition-colors duration-150",
                selected
                  ? "text-primary"
                  : "text-muted hover:text-text-dim",
              )}
            >
              {selected && (
                <motion.span
                  layoutId="tab-indicator"
                  className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {tab.icon}
                {tab.label}
                {typeof tab.badge === "number" && tab.badge > 0 && (
                  <span className="rounded-full bg-surface-3 px-1.5 text-[10px] font-semibold leading-4 text-text-dim">
                    {tab.badge}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="pt-4">{children}</div>
    </div>
  );
}

export function TabPanel({
  active,
  id,
  children,
}: {
  active: string;
  id: string;
  children: ReactNode;
}) {
  if (active !== id) return null;
  return <div role="tabpanel">{children}</div>;
}
