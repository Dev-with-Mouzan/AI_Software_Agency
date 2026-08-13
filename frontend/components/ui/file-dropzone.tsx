"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useId, useRef, useState } from "react";
import { CloudUpload, FileText, X } from "lucide-react";

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

  const clearFile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange?.(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  /* ── Selected-file state: compact pill row ───────────────── */
  if (value) {
    return (
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5",
          "border-primary/40 bg-primary-soft/20",
          disabled && "opacity-60",
        )}
      >
        {/* Icon */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary-soft text-primary">
          <FileText className="h-4 w-4" />
        </span>

        {/* File info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-text leading-tight">
            {value.name}
          </p>
          <p className="text-[11px] text-faint leading-tight">{formatSize(value.size)}</p>
        </div>

        {/* Change button */}
        <label
          htmlFor={inputId}
          className={cn(
            "shrink-0 cursor-pointer rounded-md border border-edge bg-surface-2 px-2.5 py-1.5",
            "text-[11px] font-medium text-text-dim transition-colors",
            "hover:border-primary/30 hover:text-text",
            disabled && "cursor-not-allowed",
          )}
        >
          Change
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
        </label>

        {/* Remove button */}
        <button
          type="button"
          aria-label="Remove file"
          disabled={disabled}
          onClick={clearFile}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            "border border-edge bg-surface-2 text-muted transition-colors",
            "hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  /* ── Empty state: compact tap-target drop zone ───────────── */
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
        "group relative flex w-full cursor-pointer select-none items-center gap-3 rounded-lg border-2 border-dashed px-3 py-3 sm:px-4 sm:py-4",
        "transition-colors duration-150",
        "focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
        dragging
          ? "border-primary bg-primary-soft/50"
          : "border-edge bg-surface-2/50 hover:border-primary/40 hover:bg-surface-2",
        disabled && "cursor-not-allowed opacity-60 hover:border-edge hover:bg-surface-2/50",
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

      {/* Icon */}
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150",
          "border-edge bg-surface text-text-dim group-hover:text-primary",
        )}
      >
        <CloudUpload className="h-4 w-4" />
      </span>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-text leading-tight">
          Choose plan file
        </p>
        <p className="text-[11px] text-faint leading-tight">.md or .txt</p>
      </div>

      {/* Browse badge */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-edge bg-surface-2 px-2.5 text-[11px] font-medium text-text-dim",
          "transition-colors duration-150 group-hover:border-primary/30 group-hover:text-text",
        )}
      >
        Browse
      </span>
    </label>
  );
}
