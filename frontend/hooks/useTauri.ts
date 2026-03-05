import { invoke } from "@tauri-apps/api/core";
import type {
  Repository,
  Ideation,
  Task,
  TaskSpec,
  VerifyResult,
  RepoInfo,
  TaskStatus,
  Preferences,
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
      maxParallelAgents?: number;
    }) =>
      invoke<Repository>("update_repository", {
        id: args.id,
        name: args.name,
        baseBranch: args.baseBranch,
        validators: args.validators,
        prCommand: args.prCommand,
        maxParallelAgents: args.maxParallelAgents,
      }),

    removeRepository: (id: string) =>
      invoke<void>("remove_repository", { id }),

    detectRepoInfo: (path: string) =>
      invoke<RepoInfo>("detect_repo_info", { path }),

    // Ideation
    startIdeation: (repoId: string, description: string) =>
      invoke<Ideation>("start_ideation", { repoId, description }),

    getIdeationPrompt: (ideationId: string) =>
      invoke<string>("get_ideation_prompt", { ideationId }),

    launchIdeation: (ideationId: string) =>
      invoke<void>("launch_ideation", { ideationId }),

    getIdeationTerminalCommand: (ideationId: string) =>
      invoke<string>("get_ideation_terminal_command", { ideationId }),

    pollIdeationTasks: (ideationId: string) =>
      invoke<TaskSpec[]>("poll_ideation_tasks", { ideationId }),

    completeIdeation: (ideationId: string) =>
      invoke<Ideation>("complete_ideation", { ideationId }),

    listIdeations: (repoId: string) =>
      invoke<Ideation[]>("list_ideations", { repoId }),

    // Tasks
    importTasks: (ideationId: string, specs: TaskSpec[]) =>
      invoke<Task[]>("import_tasks", { ideationId, specs }),

    listTasks: (repoId: string) =>
      invoke<Task[]>("list_tasks", { repoId }),

    getTask: (taskId: string) => invoke<Task>("get_task", { taskId }),

    startAgent: (taskId: string) =>
      invoke<Task>("start_agent", { taskId }),

    getAgentTerminalCommand: (taskId: string) =>
      invoke<string>("get_agent_terminal_command", { taskId }),

    launchAgent: (taskId: string) =>
      invoke<void>("launch_agent", { taskId }),

    pollTaskStatus: (taskId: string) =>
      invoke<Task>("poll_task_status", { taskId }),

    updateTaskStatus: (taskId: string, status: TaskStatus) =>
      invoke<Task>("update_task_status", { taskId, status }),

    runVerification: (taskId: string) =>
      invoke<VerifyResult>("run_verification", { taskId }),

    deleteTask: (taskId: string) =>
      invoke<void>("delete_task", { taskId }),

    // Preferences
    getPreferences: () => invoke<Preferences>("get_preferences"),

    setPreferences: (shell: string) =>
      invoke<Preferences>("set_preferences", { shell }),
  };
}
