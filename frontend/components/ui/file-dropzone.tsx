"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useId, useRef, useState } from "react";
import { CloudUpload, FileText } from "lucide-react";

import { cn } from "@/lib/cn";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileDropzoneProps {
  accept?: string;
  disabled?: boolean;
  value?: File | null;
  onChange?: (file: File | null) => void;
}

export function FileDropzone({ accept, disabled, value, onChange }: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const handleFiles = (files: FileList | null) => {
    if (disabled) return;
    onChange?.(files?.[0] ?? null);
  };

  const endDrag = () => {
    dragDepth.current = 0;
    setDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    endDrag();
    handleFiles(event.dataTransfer.files);
  };

  return (
    <label
      htmlFor={inputId}
      onDragEnter={(event) => {
        if (disabled) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (disabled) return;
        event.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) endDrag();
      }}
      onDrop={onDrop}
      className={cn(
        "group relative flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-lg border-2 border-dashed px-4 py-4",
        "transition-colors duration-150",
        "focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
        dragging
          ? "border-primary bg-primary-soft/50"
          : "border-edge bg-surface-2/50 hover:border-primary/40 hover:bg-surface-2",
        disabled &&
          "cursor-not-allowed opacity-60 hover:border-edge hover:bg-surface-2/50",
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        aria-label="Choose implementation plan"
        onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files)}
      />
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150",
            value
              ? "border-primary/30 bg-primary-soft text-primary"
              : "border-edge bg-surface text-text-dim group-hover:text-primary",
          )}
        >
          {value ? <FileText className="h-5 w-5" /> : <CloudUpload className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          {value ? (
            <>
              <p className="truncate font-display text-sm font-medium tracking-tight text-text">
                {value.name}
              </p>
              <p className="truncate text-xs text-faint">
                {formatSize(value.size)} · click to choose another
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-sm font-medium tracking-tight text-text">
                Choose implementation plan
              </p>
              <p className="text-xs text-faint">.md or .txt files</p>
            </>
          )}
        </div>
      </div>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-edge bg-surface-2 px-3 text-xs font-medium text-text-dim",
          "transition-colors duration-150 group-hover:border-primary/30 group-hover:text-text",
        )}
      >
        Browse files
      </span>
    </label>
  );
}
