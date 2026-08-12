"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/cn";
import { useIsMobile } from "@/lib/use-media";

/**
 * ScrollScene — a full-width cinematic section wrapper.
 * Applies a gentle scroll-driven parallax drift and a fade-in as the
 * section enters the viewport. Children render inside an optional
 * max-width container.
 */
export function ScrollScene({
  children,
  className,
  innerClassName,
  speed = 0.1,
  fullWidth = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  /** Parallax intensity (0 disables the drift). */
  speed?: number;
  /** Skip the max-w container for genuinely full-bleed visuals. */
  fullWidth?: boolean;
  id?: string;
}) {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(
    scrollYProgress,
    [0, 1],
    [speed * 140, -speed * 140],
  );
  const springY = useSpring(y, { stiffness: 90, damping: 26 });
  const opacity = useTransform(scrollYProgress, [0, 0.16, 0.9, 1], [0.4, 1, 1, 0.55]);

  return (
    <section id={id} ref={ref} className={cn("relative", className)}>
      <motion.div
        style={{ y: reduced || isMobile ? 0 : springY, opacity: reduced ? 1 : opacity }}
        className={cn(
          !fullWidth && "mx-auto max-w-[1300px] sm:px-6",
          !fullWidth && !innerClassName && "px-5",
          innerClassName,
        )}
      >
        {children}
      </motion.div>
    </section>
  );
}
