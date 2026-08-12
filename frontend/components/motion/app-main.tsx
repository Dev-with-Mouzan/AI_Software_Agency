"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname === "/";

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
        transition={{ duration: 0.28, ease: EASE }}
        className={cn(
          "relative z-10 w-full flex-1 overflow-x-hidden",
          fullBleed
            ? ""
            : "mx-auto max-w-[1300px] px-4 py-6 sm:px-6 sm:py-8",
        )}
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );
}
