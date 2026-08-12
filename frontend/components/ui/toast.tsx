"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const toneStyles: Record<ToastTone, { bar: string; icon: ReactNode }> = {
  success: { bar: "bg-success", icon: <CheckCircle2 className="h-4 w-4 text-success" /> },
  error: { bar: "bg-danger", icon: <AlertTriangle className="h-4 w-4 text-danger" /> },
  info: { bar: "bg-info", icon: <Info className="h-4 w-4 text-info" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = "info") => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50 flex flex-col gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-80">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const style = toneStyles[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20, transition: { duration: 0.16 } }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="pointer-events-auto relative overflow-hidden rounded-md border border-edge bg-surface px-3 py-2.5 shadow-pop"
                role="status"
              >
                <div
                  className={cn("absolute inset-y-0 left-0 w-0.5", style.bar)}
                />
                <div className="flex items-start gap-2 pl-1">
                  <span className="mt-0.5">{style.icon}</span>
                  <p className="flex-1 text-xs leading-5 text-text">{toast.message}</p>
                  <button
                    onClick={() => dismiss(toast.id)}
                    className="text-muted hover:text-text"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
