export interface Repository {
  id: string;
  name: string;
  path: string;
  base_branch: string;
  description: string;
  validators: string[];
  pr_command: string | null;
  /** IDs of other repositories that implement similar patterns and can serve as hints. */
  similar_repo_ids: string[];
  created_at: string;
}

export type AgentRole = "developer" | "quality" | "infrastructure" | "documentation" | "explorer";

export interface AgentFile {
  filename: string;
  name: string;
  description: string;
  tools: string | null;
  model: string | null;
  system_prompt: string;
  is_global: boolean;
  color: string;
  role: AgentRole;
  enabled: boolean;
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
  | "testing"
  | "ready"
  | "failed"
  | "pushed"
  | "complete";

export type RepoPushStatus = "pending" | "pushed" | "failed";

export type HarnessType = "browser" | "api" | "cli";

export interface TestHarness {
  start_command: string;
  ready_signal: string;
  stop_command: string;
  harness_type: HarnessType;
}

export interface FunctionalTestStep {
  description: string;
  tool: string;
  agent: string;
}

export type ProofType = "screenshot" | "api_response" | "console_output" | "error";

export interface TestProof {
  step_description: string;
  proof_type: ProofType;
  content: string;
  passed: boolean;
  error: string | null;
  timestamp: string;
  /** Whether this is a meta/system proof (e.g. schema warnings) rather than a real test result. */
  is_meta: boolean;
}

export interface TestingDecision {
  action: string;
  reason: string;
  timestamp: string;
}

export interface FunctionalTestResult {
  attempt: number;
  all_passed: boolean;
  proofs: TestProof[];
  timestamp: string;
}

export interface HarnessStatus {
  running: boolean;
  ready: boolean;
  error: string | null;
  stdout_tail: string;
  pid: number | null;
}

export interface TestingStatus {
  harness: HarnessStatus;
  timed_out: boolean;
  elapsed_secs: number;
  timeout_secs: number;
  completion_signal: boolean;
  results_exist: boolean;
  attempt: number;
  max_attempts: number;
}

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
  /** The shell command that was executed when launching Claude Code. */
  launched_command: string | null;
  /** Per-repo worktree paths. Maps repo_id -> worktree directory path. */
  worktree_paths: Record<string, string>;
  /** Per-repo push status. Maps repo_id -> push status. */
  repo_push_status: Record<string, RepoPushStatus>;
  /** Functional test steps from ideation. */
  functional_test_steps: FunctionalTestStep[];
  /** Test harness config for starting the app. */
  test_harness: TestHarness | null;
  /** Current testing attempt number. */
  testing_attempt: number;
  /** Max testing attempts before giving up. */
  max_testing_attempts: number;
  /** Whether functional testing was skipped. */
  testing_skipped: boolean;
  /** Results from functional testing rounds. */
  functional_test_results: FunctionalTestResult[];
  /** When the current testing round started. */
  testing_started_at: string | null;
  /** Timeout per testing round in seconds. */
  testing_timeout_secs: number;
  /** Audit log of testing loop decisions. */
  testing_decisions: TestingDecision[];
  /** Persisted activity log entries from the backend. */
  activity_log: ActivityEntry[];
  created_at: string;
  updated_at: string;
}

export interface ActivityEntry {
  message: string;
  type: "success" | "error" | "warning" | "info";
  timestamp: string;
}

export interface TaskSpec {
  title: string;
  description: string;
  acceptance_criteria: string[];
  dependencies: string[];
  agent: string;
}

export type QuestionType = "single_choice" | "free_text";

export interface PlanningQuestion {
  id: string;
  question: string;
  context?: string;
  options?: string[];
  type: QuestionType;
}

export interface PlanningAnswer {
  id: string;
  question: string;
  answer: string;
}

export interface IdeationResult {
  tasks: TaskSpec[];
  execution_mode: ExecutionRecommendation | null;
  questions: PlanningQuestion[] | null;
  answered_questions: PlanningAnswer[] | null;
  test_harness: TestHarness | null;
  functional_test_steps: FunctionalTestStep[] | null;
}

// ── Plan History ──

export interface PlanSnapshot {
  trigger: string;
  feedback: string | null;
  tasks: TaskSpec[];
  execution_mode: ExecutionRecommendation | null;
  created_at: string;
}

// ── Task Progress ──

export type TaskStatus = "pending" | "in_progress" | "done";

export interface CriterionProgress {
  criterion: string;
  done: boolean;
}

export interface TaskProgressEntry {
  task: number;
  title: string;
  status: TaskStatus;
  acceptance_criteria: CriterionProgress[];
}

export interface TaskProgress {
  tasks: TaskProgressEntry[];
  completion_detected?: boolean;
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
  default_execution_mode: string;
  default_model: string;
  auto_validate: boolean;
  functional_testing_enabled: boolean;
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

export interface MapService {
  id: string;
  name: string;
  service_type: ServiceType;
  repo_id: string | null;
  runtime: string;
  framework: string;
  description: string;
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

export interface DiscoveryStatus {
  found: number;
  total: number;
  complete: boolean;
  services_discovered: number;
  connections_discovered: number;
  errors: string[];
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
