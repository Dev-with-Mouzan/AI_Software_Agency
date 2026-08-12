"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useIsMobile } from "@/lib/use-media";

interface ScrollTilt3DProps {
  children: ReactNode;
  className?: string;
  /** Degrees of tilt across the scroll — enters tilted, straightens in the middle, leaves tilted. */
  max?: number;
  /** Rotation axis. */
  axis?: "x" | "y";
  /** Perspective depth in px (lower = stronger 3D). */
  perspective?: number;
  /** Fade near the edges of the viewport. */
  fade?: boolean;
}

/**
 * Scroll-driven 3D tilt. As the element travels through the viewport it
 * rotates in perspective — unfolding flat in the middle — which gives a
 * modern "panels rise out of the page" feel.
 */
export function ScrollTilt3D({
  children,
  className,
  max = 6,
  axis = "x",
  perspective = 1100,
  fade = true,
}: ScrollTilt3DProps) {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const rotate = useTransform(scrollYProgress, [0, 0.5, 1], [max, 0, -max]);
  const springRotate = useSpring(rotate, { stiffness: 80, damping: 22 });
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.95, 1, 0.95]);
  const opacity = useTransform(
    scrollYProgress,
    [0, 0.12, 0.88, 1],
    fade ? [0.6, 1, 1, 0.6] : [1, 1, 1, 1],
  );

  if (reduced || isMobile) {
    return <div ref={ref} className={className}>{children}</div>;
  }

  const rotation = reduced ? 0 : springRotate;
  const style =
    axis === "x" ? { rotateX: rotation } : { rotateY: rotation };

  return (
    <div style={{ perspective }} className="relative">
      <motion.div
        ref={ref}
        style={{ ...style, scale, opacity, transformStyle: "preserve-3d" }}
        className={className}
      >
        {children}
      </motion.div>
    </div>
  );
}
