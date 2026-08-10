const API_URL = "/api/proxy";

export class ApiClientError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiClientError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(
      0,
      `Cannot reach the agency API at ${API_URL}. Is the backend running?`,
    );
  }

  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string | Array<unknown> };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // ignore parse errors; keep default message
    }
    throw new ApiClientError(res.status, detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
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

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      body: form,
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(
      0,
      `Cannot reach the agency API at ${API_URL}. Is the backend running?`,
    );
  }

  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string | Array<unknown> };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep default message
    }
    throw new ApiClientError(res.status, detail);
  }
  return (await res.json()) as T;
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

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const TASK_STATUSES = [
  "BACKLOG",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "BLOCKED",
] as const;
