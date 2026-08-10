"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api, uploadFile } from "@/lib/api";
import type {
  Agent,
  AgentRuntime,
  AgentRunRequest,
  ChatResponse,
  Deployment,
  DeploymentValidate,
  HealthStatus,
  LlmSettings,
  LlmSettingsInput,
  MemoryEntry,
  Notification,
  PlanUploadResult,
  Project,
  ProjectDetail,
  ProviderTestResult,
  Task,
  TaskBoardRow,
  WorkflowRun,
  WorkspaceFolder,
  WorkspaceTree,
} from "@/lib/types";

export function useHealth(refetchInterval?: number) {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<HealthStatus>("/health"),
    refetchInterval,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/projects"),
  });
}

export function useProjectDetail(id: string) {
  return useQuery({
    queryKey: ["projects", id, "detail"],
    queryFn: () => api.get<ProjectDetail>(`/projects/${id}/detail`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; slug?: string }) =>
      api.post<Project>("/projects", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useProjectTasks(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "tasks"],
    queryFn: () => api.get<Task[]>(`/tasks?project_id=${projectId}`),
    enabled: !!projectId,
  });
}

export function useProjectBoard(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "board"],
    queryFn: () => api.get<TaskBoardRow[]>(`/projects/${projectId}/board`),
    enabled: !!projectId,
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      priority?: string;
      owner?: string;
      estimated_points?: number;
    }) => api.post<Task>(`/projects/${projectId}/tasks`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "tasks"] });
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "board"] });
    },
  });
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string } & Record<string, unknown>) =>
      api.patch<Task>(`/tasks/${body.id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "tasks"] });
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "board"] });
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "detail"] });
    },
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { author: string; body: string }) =>
      api.post<Task["comments"][number]>(`/tasks/${taskId}/comments`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks", taskId] });
    },
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
    refetchInterval: 15_000,
  });
}

export function useAgentsRuntime() {
  return useQuery({
    queryKey: ["agents", "runtime"],
    queryFn: () => api.get<AgentRuntime[]>("/agents/runtime"),
    refetchInterval: 15_000,
  });
}

export function useWorkflowRuns(projectId?: string) {
  return useQuery({
    queryKey: ["workflows", projectId ?? "all"],
    queryFn: () => {
      const query = projectId
        ? `?project_id=${projectId}`
        : "";
      return api.get<WorkflowRun[]>(`/workflows${query}`);
    },
    refetchInterval: 10_000,
  });
}

export function useAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentRunRequest) =>
      api.post<WorkflowRun>("/agents/run", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useUploadPlan(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      uploadFile<PlanUploadResult>(`/projects/${projectId}/plan`, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useApproveWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      run_id: string;
      decision: "approve" | "reject";
      comment?: string;
    }) =>
      api.post<WorkflowRun>(`/workflows/${body.run_id}/approve`, {
        decision: body.decision,
        comment: body.comment ?? "",
        actor: "human",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useChat() {
  return useMutation({
    mutationFn: (body: {
      message: string;
      project_id?: string;
      task_id?: string;
    }) => api.post<ChatResponse>("/chat", body),
  });
}

export function useMemory(agentKind?: string) {
  return useQuery({
    queryKey: ["memory", agentKind ?? "all"],
    queryFn: () => {
      const query = agentKind ? `?agent_kind=${agentKind}` : "";
      return api.get<MemoryEntry[]>(`/memory${query}`);
    },
    enabled: !!agentKind,
    refetchInterval: 15_000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<Notification[]>("/notifications?unread_only=true"),
    refetchInterval: 15_000,
  });
}

export function useDeploymentValidate(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "deploy", "validate"],
    queryFn: () =>
      api.get<DeploymentValidate>(
        `/projects/${projectId}/deployments/validate`,
      ),
    enabled: !!projectId,
  });
}

export function useDeployments(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "deploy"],
    queryFn: () =>
      api.get<Deployment[]>(`/projects/${projectId}/deployments`),
    enabled: !!projectId,
  });
}

export function useRunDeployment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { environment?: string; version?: string }) =>
      api.post<Deployment>(`/projects/${projectId}/deployments`, {
        environment: body.environment ?? "staging",
        version: body.version ?? "0.0.0",
        skip_checks: false,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["projects", projectId, "deploy"],
      });
    },
  });
}

export function useApproveDeployment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      deployment_id: string;
      approve: boolean;
      comment?: string;
    }) =>
      api.post<Deployment>(`/deployments/${body.deployment_id}/approve`, {
        approve: body.approve,
        comment: body.comment ?? "",
        actor: "human",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["projects", projectId, "deploy"],
      });
    },
  });
}

export function useExecuteDeployment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deploymentId: string) =>
      api.post<Deployment>(`/deployments/${deploymentId}/execute`),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["projects", projectId, "deploy"],
      });
    },
  });
}

export function useWorkspaceFolders() {
  return useQuery({
    queryKey: ["workspace", "folders"],
    queryFn: () => api.get<WorkspaceFolder[]>("/workspace/folders"),
    refetchInterval: 15_000,
  });
}

export function useCreateWorkspaceFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      api.post<WorkspaceFolder>("/workspace/folders", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace", "folders"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useAdoptWorkspaceFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { folder_name: string }) =>
      api.post<WorkspaceFolder>("/workspace/folders/adopt", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace", "folders"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useFolderTree(slug: string | null) {
  return useQuery({
    queryKey: ["workspace", "folders", slug, "tree"],
    queryFn: () =>
      api.get<WorkspaceTree>(`/workspace/folders/${slug}/tree`),
    enabled: !!slug,
  });
}

export function useLlmSettings() {
  return useQuery({
    queryKey: ["settings", "llm"],
    queryFn: () => api.get<LlmSettings>("/settings/llm"),
  });
}

export function useUpdateLlmSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LlmSettingsInput) => api.put<LlmSettings>("/settings/llm", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings", "llm"] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useTestProvider() {
  return useMutation({
    mutationFn: (body: {
      provider: string;
      api_key?: string;
      model?: string;
      base_url?: string;
    }) => api.post<ProviderTestResult>("/settings/llm/test", body),
  });
}
