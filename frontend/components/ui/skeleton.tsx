import type { ReactNode } from "react";
import { motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-primary ${className ?? ""}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex flex-col items-center justify-center gap-3 py-24 font-mono text-[11px] uppercase tracking-[0.14em] text-muted"
    >
      <Spinner className="h-6 w-6" />
      {label}
    </motion.div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, filter: "blur(6px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.4, ease: EASE }}
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-edge bg-surface/40 py-14 text-center"
    >
      {icon && (
        <motion.div
          className="mb-1 text-faint"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          {icon}
        </motion.div>
      )}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: EASE }}
        className="font-display text-sm font-semibold tracking-tight text-text-dim"
      >
        {title}
      </motion.p>
      {description && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.18, ease: EASE }}
          className="max-w-sm text-xs leading-5 text-muted"
        >
          {description}
        </motion.p>
      )}
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.26, ease: EASE }}
          className="mt-3"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}
