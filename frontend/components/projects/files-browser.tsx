"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import {
  AlertCircle,
  Archive,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileCode2,
  FileText,
  Folder,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { api, fetchBlob, saveBlob, type ApiClientError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { DirListing, FileContent, FolderEntry } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useDeleteProject } from "@/lib/hooks";
import { formatCount } from "@/lib/format";

const EASE = [0.22, 1, 0.36, 1] as const;

const LANGS: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  mdx: "markdown",
  html: "markup",
  htm: "markup",
  css: "css",
  scss: "scss",
  go: "go",
  rs: "rust",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  toml: "ini",
  ini: "ini",
  env: "ini",
  gitignore: "ignore",
  dockerfile: "docker",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  graphql: "graphql",
  prisma: "graphql",
};

function languageOf(name: string): string {
  const base = name.split("/").pop() ?? name;
  if (base.toLowerCase() === "dockerfile") return "docker";
  if (base.toLowerCase().startsWith(".env")) return "ini";
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() ?? "" : "";
  return LANGS[ext] ?? "text";
}

const codeTheme: PrismTheme = {
  plain: { color: "#c9d4e3", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "#64748b", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "#8b9bb4" } },
    { types: ["keyword", "operator", "atrule", "selector"], style: { color: "#79b8ff" } },
    { types: ["string", "attr-value", "char", "url"], style: { color: "#7ee787" } },
    { types: ["number", "constant", "boolean", "builtin"], style: { color: "#ffab70" } },
    { types: ["function", "class-name", "function-variable", "attr-name", "tag"], style: { color: "#d2a8ff" } },
    { types: ["variable"], style: { color: "#c9d4e3" } },
    { types: ["property"], style: { color: "#7ee787" } },
    { types: ["important"], style: { color: "#f97583", fontWeight: "bold" } },
  ],
};

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function entryIcon(entry: FolderEntry) {
  if (entry.type === "dir") return Folder;
  const ext = entry.name.includes(".")
    ? entry.name.split(".").pop()?.toLowerCase()
    : "";
  if (ext === "md") return FileText;
  if (ext === "zip" || ext === "tar" || ext === "gz") return FileArchive;
  if (
    ["ts", "tsx", "js", "jsx", "py", "go", "rs", "ts", "json", "yml", "yaml"].includes(
      ext ?? "",
    )
  ) {
    return FileCode2;
  }
  return File;
}

function isSensitiveName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith(".env")) return true;
  if (lower.includes("secret") || lower.includes("credential") || lower.includes("password")) return true;
  if (lower.endsWith(".pem") || lower.endsWith(".key") || lower.endsWith(".pfx") || lower.endsWith(".p12")) return true;
  if (lower === "id_rsa" || lower === "id_ed25519" || lower === "docker_auth.json") return true;
  return false;
}

export function FilesBrowser({ slug, projectId }: { slug: string; projectId: string }) {
  const { push } = useToast();
  const router = useRouter();
  const del = useDeleteProject();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dirs, setDirs] = useState<Record<string, FolderEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fileCount, setFileCount] = useState(0);
  const [rootLoading, setRootLoading] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDirs({});
    setExpanded({});
    setSelected(null);
    setFile(null);
    setRootLoading(true);
    setRootError(null);
    api
      .get<DirListing>(`/workspace/folders/${slug}/dir`)
      .then((listing) => {
        if (cancelled) return;
        setDirs({ "": listing.entries });
        setFileCount(listing.file_count);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRootError((err as ApiClientError).message);
      })
      .finally(() => {
        if (!cancelled) setRootLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const loadDir = useCallback(
    async (path: string) => {
      const listing = await api.get<DirListing>(
        `/workspace/folders/${slug}/dir?path=${encodeURIComponent(path)}`,
      );
      setDirs((prev) => ({ ...prev, [path]: listing.entries }));
    },
    [slug],
  );

  const toggleDir = useCallback(
    async (entry: FolderEntry, parent: string) => {
      const path = joinPath(parent, entry.name);
      const next = { ...expanded };
      if (next[path]) {
        next[path] = false;
        setExpanded(next);
        return;
      }
      next[path] = true;
      setExpanded(next);
      if (!(path in dirs)) {
        try {
          await loadDir(path);
        } catch (err) {
          push((err as Error).message, "error");
          const reset = { ...next };
          reset[path] = false;
          setExpanded(reset);
        }
      }
    },
    [dirs, expanded, loadDir, push],
  );

  const openFile = useCallback(
    async (entry: FolderEntry, parent: string) => {
      const path = joinPath(parent, entry.name);
      setSelected(path);
      setFile(null);
      setFileLoading(true);
      setFileError(null);
      try {
        const content = await api.get<FileContent>(
          `/workspace/folders/${slug}/file?path=${encodeURIComponent(path)}`,
        );
        setFile(content);
      } catch (err) {
        setFileError((err as Error).message);
      } finally {
        setFileLoading(false);
      }
    },
    [slug],
  );

  const downloadFile = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const blob = await fetchBlob(
        `/workspace/folders/${slug}/download?path=${encodeURIComponent(selected)}`,
      );
      saveBlob(blob, selected.split("/").pop() ?? "download");
      push("Download started.", "success");
    } catch (err) {
      push((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }, [selected, slug, push]);

  const downloadArchive = useCallback(async () => {
    setBusy(true);
    try {
      const blob = await fetchBlob(`/workspace/folders/${slug}/archive`);
      saveBlob(blob, `${slug}.zip`);
      push("Project archive downloaded.", "success");
    } catch (err) {
      push((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }, [slug, push]);

  const handleDeleteProject = async () => {
    try {
      await del.mutateAsync(projectId);
      setDeleteOpen(false);
      push("Project deleted.", "success");
      router.push("/projects");
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete project.", "error");
    }
  };

  const renderRows = (parent: string, depth: number): ReactElement[] => {
    const entries = dirs[parent] ?? [];
    return entries.flatMap((entry) => {
      const path = joinPath(parent, entry.name);
      const isDir = entry.type === "dir";
      const open = !!expanded[path];
      const Icon = entryIcon(entry);
      const rows: ReactElement[] = [
        <motion.div key={path}>
          <button
            onClick={() => (isDir ? toggleDir(entry, parent) : openFile(entry, parent))}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
              selected === path && !isDir
                ? "bg-primary-soft text-primary"
                : "text-text-dim hover:bg-surface-2 hover:text-text",
            )}
            style={{ paddingLeft: 8 + depth * 14 }}
            aria-expanded={isDir ? open : undefined}
          >
            {isDir ? (
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-150",
                  open && "rotate-90",
                )}
              />
            ) : (
              <span className="w-3.5" />
            )}
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isDir
                  ? open
                    ? "text-primary"
                    : "text-muted"
                  : "text-faint",
              )}
            />
            <span className="truncate">{entry.name}</span>
            {!isDir && isSensitiveName(entry.name) && (
              <ShieldCheck className="h-3 w-3 shrink-0 text-warning" aria-label="protected" />
            )}
            {entry.type === "file" && entry.size !== null && (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">
                {formatCount(entry.size)}B
              </span>
            )}
            {isDir && entry.children > 0 && (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">
                {formatCount(entry.children)}
              </span>
            )}
          </button>
        </motion.div>,
        ...(isDir && open ? renderRows(path, depth + 1) : []),
      ];
      return rows;
    });
  };

  return (
    <Card>
      <CardHeader className="flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          <CardTitle>Files</CardTitle>
          {!rootLoading && !rootError && (
            <Badge tone="neutral">
              {formatCount(fileCount)} files
            </Badge>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={downloadArchive}
          >
            <Archive className="h-3.5 w-3.5" /> Download .zip
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete project
          </Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <div className="grid gap-px lg:grid-cols-[minmax(0,300px)_1fr]">
          <div className="min-h-[360px] border-b border-edge-soft p-2 lg:border-b-0 lg:border-r">
            {rootLoading && (
              <div className="space-y-1.5 p-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-8 animate-shimmer rounded-md bg-surface-3"
                    style={{ opacity: 1 - i * 0.12 }}
                  />
                ))}
              </div>
            )}
            {rootError && (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <AlertCircle className="h-5 w-5 text-danger" />
                <p className="text-xs text-text-dim">{rootError}</p>
              </div>
            )}
            {!rootLoading && !rootError && (dirs[""]?.length ?? 0) === 0 && (
              <EmptyState
                title="Empty project folder"
                description="This project has no files in its working area yet."
              />
            )}
            {!rootLoading && !rootError && (dirs[""]?.length ?? 0) > 0 && (
              <div className="space-y-0.5">{renderRows("", 0)}</div>
            )}
          </div>

          <div className="flex min-h-[360px] flex-col">
            {!selected && (
              <EmptyState
                title="No file selected"
                description="Pick a file from the tree to preview it, or download the whole project as a .zip."
              />
            )}
            {selected && fileLoading && (
              <EmptyState title="Loading file…" />
            )}
            {selected && fileError && (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <AlertCircle className="h-5 w-5 text-danger" />
                <p className="text-xs text-text-dim">{fileError}</p>
              </div>
            )}
            {selected && file && !fileLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-edge-soft px-4 py-2.5">
                  <span className="min-w-0 truncate font-mono text-xs text-text-dim">
                    {file.path}
                  </span>
                  <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {file.binary && <Badge tone="warning">binary</Badge>}
                    {file.truncated && <Badge tone="info">truncated</Badge>}
                    {file.redacted && <Badge tone="danger">protected</Badge>}
                    <Badge tone="neutral">
                      {formatCount(file.size)}B
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={downloadFile}
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </span>
                </div>
                {file.redacted ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-danger/40 bg-danger-soft/40 text-danger">
                      <ShieldAlert className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-display text-sm font-semibold text-text">
                        Content hidden
                      </p>
                      <p className="mt-1 max-w-xs text-xs leading-5 text-muted">
                        {file.reason ||
                          "This file is protected to keep secrets out of the workspace preview."}
                      </p>
                    </div>
                  </div>
                ) : file.binary ? (
                  <div className="flex flex-1 items-center justify-center p-6">
                    <p className="text-xs text-muted">
                      Binary file — not previewable. Use Download.
                    </p>
                  </div>
                ) : (
                  <Highlight
                    code={file.content}
                    language={languageOf(file.path)}
                    theme={codeTheme}
                  >
                    {({ tokens, getLineProps, getTokenProps }) => (
                      <pre className="max-h-[520px] flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[11px] leading-relaxed">
                        {tokens.map((line, i) => {
                          const lineProps = getLineProps({ line });
                          return (
                            <div key={i} {...lineProps}>
                              {line.map((token, j) => {
                                const tokenProps = getTokenProps({ token });
                                return <span key={j} {...tokenProps} />;
                              })}
                            </div>
                          );
                        })}
                      </pre>
                    )}
                  </Highlight>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </CardBody>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete project?"
        description="This removes the project and everything tied to it — tasks, runs, milestones and knowledge. Files on disk are left untouched."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={del.isPending}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteProject} loading={del.isPending}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-text-dim">
          You are about to delete this project
          (<span className="font-mono text-muted">{slug}</span>). This cannot be
          undone.
        </p>
      </Dialog>
    </Card>
  );
}
