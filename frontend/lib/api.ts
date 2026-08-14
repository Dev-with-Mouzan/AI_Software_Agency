import { getAccessToken, refreshAccessToken } from "@/lib/auth-session";

const API_URL = "/api/proxy";

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/** Auth endpoints are public — never refresh-loop against them. */
const PUBLIC_AUTH_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
  "/auth/google",
  "/auth/send-code",
  "/auth/verify-code",
  "/auth/avatar",
]);

export class ApiClientError extends Error {
  status: number;
  detail: string;
  code?: string;

  constructor(status: number, detail: string, code?: string) {
    super(detail);
    this.name = "ApiClientError";
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

export const AI_PROVIDER_NOT_CONFIGURED_CODE = "AI_PROVIDER_NOT_CONFIGURED";

export function isProviderNotConfigured(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.code === AI_PROVIDER_NOT_CONFIGURED_CODE ||
      /provider.*(?:is )?not configured|no (?:ai )?provider|add an api key|connect an api key/i.test(
        error.detail,
      ))
  );
}

interface ErrorBody {
  detail?: string | Array<unknown>;
  code?: string;
}

function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(id) };
}

function requestError(err: unknown, path: string, timeoutMs: number): ApiClientError {
  if (err instanceof DOMException && err.name === "AbortError") {
    return new ApiClientError(
      0,
      `Request to ${path} timed out after ${Math.round(timeoutMs / 1000)}s.`,
    );
  }
  return new ApiClientError(
    0,
    `Cannot reach the agency API at ${API_URL}. Is the backend running?`,
  );
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiClientError(
      res.status,
      "The agency API returned an unexpected (non-JSON) response.",
    );
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const { signal, done } = timeoutSignal(timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
      cache: "no-store",
      signal,
    });
  } catch (err) {
    done();
    throw requestError(err, path, timeoutMs);
  }

  // Access token expired — rotate the refresh token and retry exactly once.
  if (res.status === 401 && token && !PUBLIC_AUTH_PATHS.has(path)) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      try {
        res = await fetch(`${API_URL}${path}`, {
          ...init,
          headers: {
            ...headers,
            Authorization: `Bearer ${fresh}`,
            ...(init?.headers ?? {}),
          },
          cache: "no-store",
          signal,
        });
      } catch (err) {
        done();
        throw requestError(err, path, timeoutMs);
      }
    }
  }
  done();

  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as ErrorBody;
      if (typeof body.detail === "string") detail = body.detail;
      if (typeof body.code === "string") code = body.code;
    } catch {
      // ignore parse errors; keep default message
    }
    throw new ApiClientError(res.status, detail, code);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return readJson<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  delete: <T>(path: string) =>
    request<T>(path, {
      method: "DELETE",
    }),
};

export async function uploadFile<T>(
  path: string,
  file: File,
  field = "file",
): Promise<T> {
  const form = new FormData();
  form.append(field, file);

  const { signal, done } = timeoutSignal(UPLOAD_TIMEOUT_MS);
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      body: form,
      headers,
      cache: "no-store",
      signal,
    });
  } catch (err) {
    done();
    throw requestError(err, path, UPLOAD_TIMEOUT_MS);
  }

  if (res.status === 401 && token && !PUBLIC_AUTH_PATHS.has(path)) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      try {
        res = await fetch(`${API_URL}${path}`, {
          method: "POST",
          body: form,
          headers: { Authorization: `Bearer ${fresh}` },
          cache: "no-store",
          signal,
        });
      } catch (err) {
        done();
        throw requestError(err, path, UPLOAD_TIMEOUT_MS);
      }
    }
  }
  done();

  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as ErrorBody;
      if (typeof body.detail === "string") detail = body.detail;
      if (typeof body.code === "string") code = body.code;
    } catch {
      // keep default message
    }
    throw new ApiClientError(res.status, detail, code);
  }
  return readJson<T>(res);
}

export async function fetchBlob(path: string): Promise<Blob> {
  const { signal, done } = timeoutSignal(UPLOAD_TIMEOUT_MS);
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers,
      cache: "no-store",
      signal,
    });
  } catch (err) {
    done();
    throw requestError(err, path, UPLOAD_TIMEOUT_MS);
  }

  if (res.status === 401 && token && !PUBLIC_AUTH_PATHS.has(path)) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      try {
        res = await fetch(`${API_URL}${path}`, {
          headers: { Authorization: `Bearer ${fresh}` },
          cache: "no-store",
          signal,
        });
      } catch (err) {
        done();
        throw requestError(err, path, UPLOAD_TIMEOUT_MS);
      }
    }
  }
  done();

  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as ErrorBody;
      if (typeof body.detail === "string") detail = body.detail;
      if (typeof body.code === "string") code = body.code;
    } catch {
      // keep default message
    }
    throw new ApiClientError(res.status, detail, code);
  }
  return res.blob();
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const AGENTS = [
  {
    id: "planner",
    label: "Planner",
    description: "Researches the idea on the web and writes the implementation plan",
  },
  {
    id: "backend_engineer",
    label: "Backend Engineer",
    description: "Builds the backend inside backend/ per the plan",
  },
  {
    id: "frontend_engineer",
    label: "Frontend Engineer",
    description: "Builds the frontend inside frontend/ per the plan",
  },
  {
    id: "devops_engineer",
    label: "DevOps Engineer",
    description: "Generates deployment files under deployment/",
  },
  {
    id: "code_reviewer",
    label: "Code Reviewer",
    description: "Audits the project in depth for flaws and loopholes",
  },
] as const;

export const DEPLOY_PLATFORMS = [
  "docker",
  "railway",
  "aws",
  "vercel",
  "render",
  "fly-io",
  "netlify",
] as const;

