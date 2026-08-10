export interface HealthStatus {
  status: string;
  version: string;
  environment: string;
  database: string;
  uptime_seconds: number;
  services: Record<string, string>;
  timestamp: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  root_dir: string;
  workspace_mode: string;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string;
  order_index: number;
  status: string;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends Project {
  milestones: Milestone[];
  task_stats: Record<string, number>;
  agent_stats: Record<string, string>;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
  owner: string | null;
  dependencies: string[];
  files_affected: string[];
  review_status: string;
  estimated_points: number;
  created_at: string;
  updated_at: string;
  comments: TaskComment[];
}

export interface TaskBoardRow extends Task {
  blocked_by: string[];
}

export interface Agent {
  id: string;
  kind: string;
  name: string;
  title: string;
  status: string;
  role_description: string;
  workspace: string;
  allowed_tools: string[];
  capabilities: string[];
  heartbeat: string | null;
  created_at: string;
  updated_at: string;
  llm_provider: string;
  llm_model: string;
}

export interface AgentRuntime {
  kind: string;
  name: string;
  status: string;
  current_task_id: string | null;
  current_workflow_id: string | null;
  last_activity: string | null;
  short_term: Record<string, unknown>[];
  stats: Record<string, unknown>;
}

export interface ChatResponse {
  agent: string;
  agent_kind: string;
  reply: string;
  actions: Record<string, unknown>[];
  needs_human: boolean;
  task_id: string | null;
  created_at: string;
}

export interface WorkflowStep {
  id: string;
  workflow_run_id: string;
  step_id: string;
  name: string;
  order_index: number;
  status: string;
  agent_kind: string | null;
  detail: string;
  output: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowRun {
  id: string;
  project_id: string | null;
  kind: string;
  status: string;
  current_step: string;
  context: Record<string, unknown>;
  result: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  steps: WorkflowStep[];
}

export interface DeploymentCheck {
  name: string;
  passed: boolean;
  detail: string;
  checked_at: string | null;
}

export interface DeploymentValidate {
  ready: boolean;
  environment: string;
  version: string;
  checks: DeploymentCheck[];
  all_tasks_complete: boolean;
  tests_passing: boolean;
  docker_build: boolean;
  lint_passing: boolean;
  secrets_validated: boolean;
  config_validated: boolean;
  human_approved: boolean;
}

export interface Deployment {
  id: string;
  project_id: string;
  environment: string;
  status: string;
  version: string;
  checks: Record<string, unknown>;
  approved: boolean;
  approved_by: string;
  approved_at: string | null;
  deployed_at: string | null;
  error: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntry {
  id: string;
  agent_kind: string;
  kind: string;
  scope_type: string;
  scope_id: string;
  content: string;
  summary: string;
  importance: number;
  created_at: string;
}

export interface WorkspaceFolder {
  name: string;
  slug: string;
  registered: boolean;
  project_id: string | null;
  file_count: number;
  root_dir: string;
}

export interface FolderEntry {
  name: string;
  type: "dir" | "file";
  size: number | null;
  children: number;
}

export interface WorkspaceTree {
  slug: string;
  root_dir: string;
  registered: boolean;
  project_id: string | null;
  entries: FolderEntry[];
  file_count: number;
}

export interface AgentRunRequest {
  project_id?: string;
  agents: string[];
  command: string;
  platform?: string;
  plan_source?: "agent" | "upload";
}

export interface PlanUploadResult {
  path: string;
  project_id: string;
  source: string;
  size: number;
}

export interface Notification {
  id: string;
  recipient: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface ProviderStatus {
  provider: string;
  label: string;
  model: string;
  base_url: string;
  has_key: boolean;
  key_masked: string;
}

export interface AgentRoute {
  kind: string;
  name: string;
  provider: string;
  model: string;
}

export interface LlmSettings {
  configured: boolean;
  default_provider: string;
  providers: ProviderStatus[];
  agents: AgentRoute[];
}

export interface ProviderConfigInput {
  provider: string;
  api_key: string;
  model: string;
  base_url: string;
  clear_key: boolean;
}

export interface AgentModelInput {
  provider: string;
  model: string;
}

export interface LlmSettingsInput {
  default_provider: string;
  providers: ProviderConfigInput[];
  agents: Record<string, AgentModelInput | null>;
}

export interface ProviderTestResult {
  ok: boolean;
  detail: string;
}

export interface ApiError {
  detail: string;
}
