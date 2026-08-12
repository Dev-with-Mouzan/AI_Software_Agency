import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionHeadingProps {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  align?: "left" | "center";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-primary",
          align === "center" && "justify-center",
        )}
      >
        <span className="h-1 w-1 rounded-full bg-primary" aria-hidden />
        {eyebrow}
      </span>
      <h2 className="mt-4 font-display text-2xl font-bold leading-[1.16] tracking-tight text-text sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-[15px] leading-6 text-text-dim sm:leading-7">{description}</p>
      )}
    </div>
  );
}
