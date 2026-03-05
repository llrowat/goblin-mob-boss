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
  repo_id: string;
  name: string;
  description: string;
  branch: string;
  status: FeatureStatus;
  execution_mode: ExecutionMode | null;
  execution_rationale: string | null;
  selected_agents: string[];
  task_specs: TaskSpec[];
  pty_session_id: string | null;
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
