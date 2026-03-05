export interface Repository {
  id: string;
  name: string;
  path: string;
  base_branch: string;
  validators: string[];
  pr_command: string | null;
  max_parallel_agents: number;
  created_at: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  is_builtin: boolean;
}

export type FeatureStatus = "ideation" | "in_progress" | "verifying" | "ready";

export interface Feature {
  id: string;
  repo_id: string;
  name: string;
  description: string;
  branch: string;
  status: FeatureStatus;
  created_at: string;
  updated_at: string;
}

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "merged"
  | "failed";

export interface Task {
  task_id: string;
  feature_id: string;
  repo_id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  dependencies: string[];
  agent_id: string;
  subagent_ids: string[];
  status: TaskStatus;
  branch: string;
  worktree_path: string;
  created_at: string;
  updated_at: string;
}

export interface TaskSpec {
  title: string;
  description: string;
  acceptance_criteria: string[];
  dependencies: string[];
  agent: string;
  subagents: string[];
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

export interface RepoInfo {
  name: string;
  base_branch: string;
}

export interface Preferences {
  shell: string;
}
