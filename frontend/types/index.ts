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

export type IdeationStatus = "running" | "completed";

export interface Ideation {
  id: string;
  repo_id: string;
  description: string;
  status: IdeationStatus;
  created_at: string;
}

export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface Task {
  task_id: string;
  ideation_id: string;
  repo_id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  dependencies: string[];
  status: TaskStatus;
  branch: string;
  worktree_path: string;
  agent_pid: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskSpec {
  title: string;
  description: string;
  acceptance_criteria: string[];
  dependencies: string[];
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
