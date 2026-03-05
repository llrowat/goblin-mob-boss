import { invoke } from "@tauri-apps/api/core";
import type {
  Repository,
  Agent,
  Feature,
  Task,
  TaskSpec,
  TaskStatus,
  VerifyResult,
  DiffSummary,
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
      invoke<{ name: string; base_branch: string }>("detect_repo_info", {
        path,
      }),

    // Agents
    listAgents: () => invoke<Agent[]>("list_agents"),

    addAgent: (name: string, role: string, systemPrompt: string) =>
      invoke<Agent>("add_agent", { name, role, systemPrompt }),

    updateAgent: (
      id: string,
      name: string,
      role: string,
      systemPrompt: string,
    ) => invoke<Agent>("update_agent", { id, name, role, systemPrompt }),

    removeAgent: (id: string) => invoke<void>("remove_agent", { id }),

    // Features
    startFeature: (repoIds: string[], name: string, description: string) =>
      invoke<Feature>("start_feature", { repoIds, name, description }),

    listFeatures: (repoId?: string) =>
      invoke<Feature[]>("list_features", { repoId: repoId ?? null }),

    listAllFeatures: () =>
      invoke<Feature[]>("list_features", { repoId: null }),

    getFeature: (featureId: string) =>
      invoke<Feature>("get_feature", { featureId }),

    // Ideation (on a feature)
    getIdeationPrompt: (featureId: string) =>
      invoke<string>("get_ideation_prompt", { featureId }),

    launchIdeation: (featureId: string) =>
      invoke<void>("launch_ideation", { featureId }),

    getIdeationTerminalCommand: (featureId: string) =>
      invoke<string>("get_ideation_terminal_command", { featureId }),

    pollIdeationTasks: (featureId: string) =>
      invoke<TaskSpec[]>("poll_ideation_tasks", { featureId }),

    // Tasks
    importTasks: (featureId: string, specs: TaskSpec[]) =>
      invoke<Task[]>("import_tasks", { featureId, specs }),

    listTasks: (featureId: string) =>
      invoke<Task[]>("list_tasks", { featureId }),

    getTask: (taskId: string) => invoke<Task>("get_task", { taskId }),

    startTask: (taskId: string) => invoke<Task>("start_task", { taskId }),

    getTaskTerminalCommand: (taskId: string) =>
      invoke<string>("get_task_terminal_command", { taskId }),

    launchTask: (taskId: string) =>
      invoke<void>("launch_task", { taskId }),

    completeTask: (taskId: string) =>
      invoke<Task>("complete_task", { taskId }),

    mergeTask: (taskId: string) => invoke<Task>("merge_task", { taskId }),

    updateTaskStatus: (taskId: string, status: TaskStatus) =>
      invoke<Task>("update_task_status", { taskId, status }),

    runVerification: (taskId: string) =>
      invoke<VerifyResult>("run_verification", { taskId }),

    deleteTask: (taskId: string) => invoke<void>("delete_task", { taskId }),

    getTaskDiff: (taskId: string) =>
      invoke<DiffSummary>("get_task_diff", { taskId }),

    // Feature verification & PR
    startFeatureVerification: (featureId: string) =>
      invoke<Feature>("start_feature_verification", { featureId }),

    getVerificationTerminalCommand: (featureId: string, repoId?: string) =>
      invoke<string>("get_verification_terminal_command", {
        featureId,
        repoId: repoId ?? null,
      }),

    launchVerification: (featureId: string, repoId?: string) =>
      invoke<void>("launch_verification", {
        featureId,
        repoId: repoId ?? null,
      }),

    markFeatureReady: (featureId: string) =>
      invoke<Feature>("mark_feature_ready", { featureId }),

    pushFeature: (featureId: string) =>
      invoke<string>("push_feature", { featureId }),

    getPrCommand: (featureId: string) =>
      invoke<string>("get_pr_command", { featureId }),

    // Preferences
    getPreferences: () => invoke<Preferences>("get_preferences"),

    setPreferences: (
      shell: string,
      verificationAgentIds: string[],
      planningAgentIds: string[],
    ) =>
      invoke<Preferences>("set_preferences", {
        shell,
        verificationAgentIds,
        planningAgentIds,
      }),
  };
}
