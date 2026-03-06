export interface Repository {
  id: string;
  name: string;
  path: string;
  base_branch: string;
  validators: string[];
  pr_command: string | null;
  created_at: string;
}

export interface AgentFile {
  filename: string;
  name: string;
  description: string;
  tools: string | null;
  model: string | null;
  system_prompt: string;
  is_global: boolean;
  color: string;
}

export type ExecutionMode = "teams" | "subagents";

export interface ExecutionRecommendation {
  recommended: ExecutionMode;
  rationale: string;
  confidence: number;
}

export type FeatureStatus =
  | "ideation"
  | "configuring"
  | "executing"
  | "ready"
  | "failed";

export interface Feature {
  id: string;
  /** @deprecated Use repo_ids instead. Present for backward compat with old features. */
  repo_id?: string;
  /** Repository IDs this feature spans. Cross-repo features have multiple entries. */
  repo_ids: string[];
  name: string;
  description: string;
  branch: string;
  status: FeatureStatus;
  execution_mode: ExecutionMode | null;
  execution_rationale: string | null;
  selected_agents: string[];
  task_specs: TaskSpec[];
  pty_session_id: string | null;
  /** Per-repo worktree paths. Maps repo_id -> worktree directory path. */
  worktree_paths: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface TaskSpec {
  title: string;
  description: string;
  acceptance_criteria: string[];
  dependencies: string[];
  agent: string;
}

export interface IdeationResult {
  tasks: TaskSpec[];
  execution_mode: ExecutionRecommendation | null;
}

export interface ValidatorResult {
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface VerifyResult {
  attempt: number;
  all_passed: boolean;
  results: ValidatorResult[];
  timestamp: string;
}

export interface FileDiff {
  path: string;
  insertions: number;
  deletions: number;
}

export interface DiffSummary {
  files: FileDiff[];
  total_files: number;
  total_insertions: number;
  total_deletions: number;
}

export interface RepoInfo {
  name: string;
  base_branch: string;
}

export interface Preferences {
  shell: string;
}

// ── Recipes ──

export interface FeatureRecipe {
  id: string;
  name: string;
  description: string;
  category: string;
  suggested_mode: string;
  task_templates: RecipeTask[];
}

export interface RecipeTask {
  title: string;
  description: string;
  acceptance_criteria: string[];
  dependencies: string[];
  suggested_agent: string;
}

// ── Execution Observability ──

export interface CommitInfo {
  hash: string;
  message: string;
  time: string;
}

export interface ExecutionSnapshot {
  commit_count: number;
  files_changed: number;
  insertions: number;
  deletions: number;
  last_commit_message: string;
  last_commit_time: string | null;
  recent_commits: CommitInfo[];
  active_files: string[];
  timestamp: string;
}

// ── Analytics ──

export type CoverageStatus = "covered" | "partial" | "no_changes_detected";

export interface TaskCoverage {
  task_title: string;
  agent: string;
  likely_files: string[];
  coverage_status: CoverageStatus;
}

export interface ModeAssessment {
  mode_used: string | null;
  was_appropriate: boolean;
  reason: string;
  suggestion: string | null;
}

export interface ExecutionAnalysis {
  feature_id: string;
  planned_task_count: number;
  files_changed: number;
  task_file_coverage: TaskCoverage[];
  unplanned_files: string[];
  execution_mode_used: ExecutionMode | null;
  mode_assessment: ModeAssessment;
}

// ── Guidance ──

export type GuidancePriority = "info" | "important" | "critical";

export interface GuidanceNote {
  id: string;
  content: string;
  priority: GuidancePriority;
  created_at: string;
}

// ── System Map ──

export type ServiceType =
  | "backend"
  | "frontend"
  | "worker"
  | "gateway"
  | "database"
  | "queue"
  | "cache"
  | "external";

export type ConnectionType =
  | "rest"
  | "grpc"
  | "graphql"
  | "websocket"
  | "event"
  | "shared_db"
  | "file_system"
  | "ipc";

export interface ServiceEndpoint {
  type: ConnectionType;
  path: string;
  description: string;
}

export interface ServiceDependency {
  type: ConnectionType;
  target: string;
  description: string;
  sync: boolean;
}

export interface MapService {
  id: string;
  name: string;
  service_type: ServiceType;
  repo_id: string | null;
  runtime: string;
  framework: string;
  description: string;
  exposes: ServiceEndpoint[];
  consumes: ServiceDependency[];
  owns_data: string[];
  position: [number, number];
  color: string;
}

export interface MapConnection {
  id: string;
  from_service: string;
  to_service: string;
  connection_type: ConnectionType;
  sync: boolean;
  label: string;
  description: string;
}

export interface SystemMap {
  id: string;
  name: string;
  description: string;
  services: MapService[];
  connections: MapConnection[];
  created_at: string;
  updated_at: string;
}

// ── Heuristics ──

export interface TaskNode {
  index: number;
  title: string;
  agent: string;
  depth: number;
}

export interface TaskEdge {
  from: number;
  to: number;
}

export interface TaskGraph {
  nodes: TaskNode[];
  edges: TaskEdge[];
  parallelism_score: number;
  max_parallel: number;
  critical_path_length: number;
}

export interface ModeRecommendation {
  recommended_mode: ExecutionMode;
  confidence: number;
  reasoning: string[];
  task_graph: TaskGraph;
}
