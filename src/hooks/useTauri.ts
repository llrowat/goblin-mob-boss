import { invoke } from "@tauri-apps/api/core";
import type {
  Repository,
  Task,
  VerifyResult,
  TaskEvent,
  RepoInfo,
  TaskPhase,
  TaskStatus,
} from "../types";

export function useTauri() {
  return {
    // Repositories
    listRepositories: () => invoke<Repository[]>("list_repositories"),

    addRepository: (args: {
      name: string;
      path: string;
      baseBranch: string;
      validators: string[];
      prCommand: string | null;
    }) =>
      invoke<Repository>("add_repository", {
        name: args.name,
        path: args.path,
        baseBranch: args.baseBranch,
        validators: args.validators,
        prCommand: args.prCommand,
      }),

    updateRepository: (args: {
      id: string;
      name: string;
      baseBranch: string;
      validators: string[];
      prCommand: string | null;
    }) =>
      invoke<Repository>("update_repository", {
        id: args.id,
        name: args.name,
        baseBranch: args.baseBranch,
        validators: args.validators,
        prCommand: args.prCommand,
      }),

    removeRepository: (id: string) =>
      invoke<void>("remove_repository", { id }),

    detectRepoInfo: (path: string) =>
      invoke<RepoInfo>("detect_repo_info", { path }),

    // Tasks
    createTask: (args: {
      repoId: string;
      title: string;
      description: string;
    }) =>
      invoke<Task>("create_task", {
        repoId: args.repoId,
        title: args.title,
        description: args.description,
      }),

    listTasks: (repoId: string) =>
      invoke<Task[]>("list_tasks", { repoId }),

    getTask: (taskId: string) => invoke<Task>("get_task", { taskId }),

    advancePhase: (taskId: string) =>
      invoke<Task>("advance_phase", { taskId }),

    setTaskPhase: (taskId: string, phase: TaskPhase) =>
      invoke<Task>("set_task_phase", { taskId, phase }),

    updateTaskStatus: (taskId: string, status: TaskStatus) =>
      invoke<Task>("update_task_status", { taskId, status }),

    // Verification
    runVerification: (taskId: string) =>
      invoke<VerifyResult>("run_verification", { taskId }),

    // Prompts
    getPrompt: (taskId: string) =>
      invoke<string>("get_prompt", { taskId }),

    getTerminalCommand: (taskId: string) =>
      invoke<string>("get_terminal_command", { taskId }),

    // Events
    getEvents: (taskId: string) =>
      invoke<TaskEvent[]>("get_events", { taskId }),

    // Phase detection
    detectPhase: (taskId: string) =>
      invoke<Task>("detect_phase", { taskId }),

    // Cleanup
    deleteTask: (taskId: string) =>
      invoke<void>("delete_task", { taskId }),
  };
}
