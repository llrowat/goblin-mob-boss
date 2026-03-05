export interface Repository {
  id: string;
  name: string;
  path: string;
  base_branch: string;
  validators: string[];
  pr_command: string | null;
  created_at: string;
}

export type TaskPhase = "plan" | "code" | "verify" | "ready";
export type TaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface Task {
  schema: string;
  task_id: string;
  repo_id: string;
  title: string;
  description: string;
  phase: TaskPhase;
  status: TaskStatus;
  base_branch: string;
  branch: string;
  worktree_path: string;
  acceptance_criteria: string[];
  created_at: string;
  updated_at: string;
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

export interface TaskEvent {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface RepoInfo {
  name: string;
  base_branch: string;
}

export interface Preferences {
  shell: string;
}
