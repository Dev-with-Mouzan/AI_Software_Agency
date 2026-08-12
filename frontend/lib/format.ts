function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // The backend stores timestamps in UTC, but on SQLite the offset is lost on
  // read-back, so strings arrive as "2026-08-12T09:00:00" with no timezone.
  // JS would parse that as *local* time (making a just-created project show
  // as "5h ago" in UTC+5). Treat offset-less timestamps as UTC.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  const normalized = !hasOffset && iso.includes("T") ? `${iso}Z` : iso;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const date = parseDate(iso);
  if (!date) return "unknown";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = parseDate(iso);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start) return "—";
  const from = parseDate(start)?.getTime() ?? NaN;
  if (Number.isNaN(from)) return "—";
  const to = end ? (parseDate(end)?.getTime() ?? NaN) : Date.now();
  if (Number.isNaN(to)) return "—";
  const seconds = Math.max(0, Math.floor((to - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.slice(0, 8);
}

export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}
