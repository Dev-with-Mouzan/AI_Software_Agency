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

interface Milestone {
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
  llm_error: string;
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

type WorkflowActivityKind =
  | "run"
  | "step"
  | "phase"
  | "reasoning"
  | "tool"
  | "review"
  | "agent.started"
  | "agent.file_created"
  | "agent.file_modified"
  | "review.started"
  | "review.completed"
  | "review.failed"
  | "review.retry_started"
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed"
  | "workflow.review_failed"
  | "workflow.checkpoint";

export type WorkflowActivityStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface WorkflowActivity {
  seq: number;
  run_id: string;
  step_id: string;
  agent_kind: string;
  agent_name: string;
  kind: WorkflowActivityKind;
  status: WorkflowActivityStatus;
  message: string;
  tool: string;
  detail: string;
  metadata?: Record<string, unknown>;
  ts: string;
}

export interface WorkflowActivityPage {
  run_id: string;
  status: string;
  done: boolean;
  activities: WorkflowActivity[];
}

type ReviewSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "suggestion";

export interface ReviewIssue {
  severity: ReviewSeverity;
  file: string;
  line: number;
  title: string;
  why: string;
  fix: string;
  agent: string;
}

export interface ReviewResult {
  status: "passed" | "failed";
  score: number;
  issues: ReviewIssue[];
  files_reviewed: string[];
  required_fixes: string[];
  summary: string;
  unstructured?: boolean;
}

interface WorkflowSummaryAgent {
  kind: string;
  name: string;
  status: string;
}

export interface WorkflowSummary {
  project_request: string;
  project_type: string;
  architecture: Record<string, unknown>;
  agents: WorkflowSummaryAgent[];
  files: { created: number; modified: number; deleted: number };
  files_created: string[];
  files_modified: string[];
  review: ReviewResult | null;
  checkpoints: Array<{
    label: string;
    created: boolean;
    commit?: string;
    reason?: string;
  }>;
  structure: string[];
}

interface DeploymentCheck {
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

  provider: string;
  deployment_url: string;
  project_url: string;
  deployment_id: string;
  custom_domain: string;
  domain_status: string;
  dns_records: Record<string, unknown> | unknown[];
  deployed_commit: string;
  run_id: string;
  logs: DeploymentLogItem[];
  removed: boolean;
}

interface DeploymentProviderOption {
  name: string;
  label: string;
  configured: boolean;
  missing: string[];
  compatible: boolean;
  reason: string;
  project_type: string;
  technology_stack: Record<string, unknown>;
}

export interface DeploymentOptions {
  project_type: string;
  technology_stack: Record<string, unknown>;
  providers: DeploymentProviderOption[];
}

interface DeploymentLogItem {
  ts: string;
  level: string;
  message: string;
  detail: string;
}

export interface DeploymentLog {
  deployment_id: string | null;
  status: string;
  logs: DeploymentLogItem[];
}

export interface DeployLaunch {
  deployment: Deployment;
  run: WorkflowRun;
}

export interface DomainInfo {
  domain: string;
  status: string;
  dns_records: Record<string, unknown> | unknown[];
  message: string;
  verified: boolean;
  ssl: string;
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

export interface FolderEntry {
  name: string;
  type: "dir" | "file";
  size: number | null;
  children: number;
}

export interface DirListing {
  slug: string;
  path: string;
  entries: FolderEntry[];
  file_count: number;
}

export interface FileContent {
  path: string;
  name: string;
  size: number;
  content: string;
  truncated: boolean;
  binary: boolean;
  redacted: boolean;
  reason: string;
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

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string;
  allowed: boolean;
  detail: Record<string, unknown>;
  created_at: string;
}

interface ProviderStatus {
  provider: string;
  label: string;
  model: string;
  base_url: string;
  has_key: boolean;
  key_masked: string;
}

interface AgentRoute {
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
