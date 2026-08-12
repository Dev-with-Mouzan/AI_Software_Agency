"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api, uploadFile } from "@/lib/api";
import type {
  Agent,
  AgentRuntime,
  AgentRunRequest,
  AuditLog,
  ChatResponse,
  Deployment,
  DeploymentLog,
  DeploymentOptions,
  DeploymentValidate,
  DeployLaunch,
  DomainInfo,
  HealthStatus,
  LlmSettings,
  LlmSettingsInput,
  MemoryEntry,
  PlanUploadResult,
  Project,
  ProjectDetail,
  ProviderTestResult,
  WorkflowActivityPage,
  WorkflowRun,
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

export function useWorkflowRun(runId: string | null, autoPoll = false) {
  return useQuery({
    queryKey: ["workflows", runId, "detail"],
    queryFn: () => api.get<WorkflowRun>(`/workflows/${runId}`),
    enabled: !!runId,
    refetchInterval: autoPoll ? 2000 : false,
  });
}

export function useWorkflowActivity(runId: string | null, autoPoll = true) {
  return useQuery({
    queryKey: ["workflows", runId, "activity"],
    queryFn: () =>
      api.get<WorkflowActivityPage>(`/workflows/${runId}/activity`),
    enabled: !!runId && autoPoll,
    refetchInterval: (query) =>
      query.state.data?.done ? false : 1200,
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.delete(`/projects/${projectId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
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

export function useAuditLog() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditLog[]>("/audit"),
    refetchInterval: 10_000,
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

export function useDeployOptions(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "deploy", "options"],
    queryFn: () =>
      api.get<DeploymentOptions>(`/projects/${projectId}/deploy/options`),
    enabled: !!projectId,
  });
}

export function useDeploymentStatus(projectId: string, autoPoll = false) {
  return useQuery({
    queryKey: ["projects", projectId, "deployment"],
    queryFn: () =>
      api.get<Deployment | null>(`/projects/${projectId}/deployment`),
    enabled: !!projectId,
    refetchInterval: autoPoll ? 2500 : false,
  });
}

export function useDeploymentLogs(projectId: string, enabled = false) {
  return useQuery({
    queryKey: ["projects", projectId, "deployment", "logs"],
    queryFn: () =>
      api.get<DeploymentLog>(`/projects/${projectId}/deployment/logs`),
    enabled: !!projectId && enabled,
    refetchInterval: (query) =>
      query.state.data?.status === "RUNNING" ? 2000 : false,
  });
}

export function useDeployProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { provider: string; environment: string }) =>
      api.post<DeployLaunch>(`/projects/${projectId}/deploy`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "deploy"] });
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "deployment"] });
    },
  });
}

export function useRedeployProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<DeployLaunch>(`/projects/${projectId}/redeploy`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "deploy"] });
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "deployment"] });
    },
  });
}

export function useRemoveDeployment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.delete<Deployment>(`/projects/${projectId}/deployment`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "deploy"] });
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "deployment"] });
    },
  });
}

export function useAddDomain(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { domain: string }) =>
      api.post<DomainInfo>(`/projects/${projectId}/domain`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "deployment"] });
    },
  });
}

export function useVerifyDomain(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<DomainInfo>(`/projects/${projectId}/domain/verify`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects", projectId, "deployment"] });
    },
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
