import { invoke } from "@tauri-apps/api/core";
import type {
  Repository,
  AgentFile,
  Feature,
  TaskSpec,
  ExecutionMode,
  IdeationResult,
  VerifyResult,
  DiffSummary,
  Preferences,
  FeatureRecipe,
  ExecutionSnapshot,
  ExecutionAnalysis,
  GuidanceNote,
  GuidancePriority,
  ModeRecommendation,
  SystemMap,
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
      invoke<{ name: string; base_branch: string }>("detect_repo_info", {
        path,
      }),

    // Agents (file-based)
    listAgents: (repoPath: string) =>
      invoke<AgentFile[]>("list_agents", { repoPath }),

    saveAgent: (repoPath: string, agent: AgentFile) =>
      invoke<void>("save_agent", { repoPath, agent }),

    deleteAgent: (repoPath: string, filename: string) =>
      invoke<void>("delete_agent", { repoPath, filename }),

    // Features
    startFeature: (repoIds: string[], name: string, description: string) =>
      invoke<Feature>("start_feature", { repoIds, name, description }),

    listFeatures: (repoId?: string) =>
      invoke<Feature[]>("list_features", { repoId: repoId ?? null }),

    listAllFeatures: () =>
      invoke<Feature[]>("list_features", { repoId: null }),

    getFeature: (featureId: string) =>
      invoke<Feature>("get_feature", { featureId }),

    deleteFeature: (featureId: string) =>
      invoke<void>("delete_feature", { featureId }),

    // Ideation
    getIdeationPrompt: (featureId: string) =>
      invoke<string>("get_ideation_prompt", { featureId }),

    getIdeationTerminalCommand: (featureId: string) =>
      invoke<string>("get_ideation_terminal_command", { featureId }),

    pollIdeationResult: (featureId: string) =>
      invoke<IdeationResult>("poll_ideation_result", { featureId }),

    // Launch Configuration
    configureLaunch: (
      featureId: string,
      executionMode: ExecutionMode,
      executionRationale: string,
      selectedAgents: string[],
      taskSpecs: TaskSpec[],
    ) =>
      invoke<Feature>("configure_launch", {
        featureId,
        executionMode,
        executionRationale,
        selectedAgents,
        taskSpecs,
      }),

    getLaunchCommand: (featureId: string) =>
      invoke<string>("get_launch_command", { featureId }),

    markFeatureExecuting: (featureId: string) =>
      invoke<Feature>("mark_feature_executing", { featureId }),

    markFeatureReady: (featureId: string) =>
      invoke<Feature>("mark_feature_ready", { featureId }),

    // Validation
    runFeatureValidators: (featureId: string) =>
      invoke<VerifyResult>("run_feature_validators", { featureId }),

    // Diff
    getFeatureDiff: (featureId: string) =>
      invoke<DiffSummary>("get_feature_diff", { featureId }),

    // Feature PR
    pushFeature: (featureId: string) =>
      invoke<string>("push_feature", { featureId }),

    getPrCommand: (featureId: string) =>
      invoke<string>("get_pr_command", { featureId }),

    // Preferences
    getPreferences: () => invoke<Preferences>("get_preferences"),

    setPreferences: (shell: string) =>
      invoke<Preferences>("set_preferences", { shell }),

    // PTY
    startIdeationPty: (featureId: string) =>
      invoke<string>("start_ideation_pty", { featureId }),

    writePty: (sessionId: string, data: string) =>
      invoke<void>("write_pty", { sessionId, data }),

    resizePty: (sessionId: string, cols: number, rows: number) =>
      invoke<void>("resize_pty", { sessionId, cols, rows }),

    killPty: (sessionId: string) =>
      invoke<void>("kill_pty", { sessionId }),

    // Built-in Agents & Recipes
    listBuiltInAgents: () =>
      invoke<AgentFile[]>("list_built_in_agents"),

    addBuiltInAgent: (repoPath: string, filename: string) =>
      invoke<AgentFile>("add_built_in_agent", { repoPath, filename }),

    listFeatureRecipes: () =>
      invoke<FeatureRecipe[]>("list_feature_recipes"),

    // Execution Observability
    pollExecutionStatus: (featureId: string) =>
      invoke<ExecutionSnapshot>("poll_execution_status", { featureId }),

    // Analytics
    analyzeFeatureExecution: (featureId: string) =>
      invoke<ExecutionAnalysis>("analyze_feature_execution", { featureId }),

    // Guidance
    addGuidanceNote: (
      featureId: string,
      content: string,
      priority: GuidancePriority,
    ) =>
      invoke<GuidanceNote>("add_guidance_note", {
        featureId,
        content,
        priority,
      }),

    listGuidanceNotes: (featureId: string) =>
      invoke<GuidanceNote[]>("list_guidance_notes", { featureId }),

    // Heuristics
    analyzeTaskGraph: (taskSpecs: TaskSpec[]) =>
      invoke<ModeRecommendation>("analyze_task_graph", { taskSpecs }),

    // System Map
    listSystemMaps: () =>
      invoke<SystemMap[]>("list_system_maps"),

    getSystemMap: (mapId: string) =>
      invoke<SystemMap>("get_system_map", { mapId }),

    createSystemMap: (name: string, description: string) =>
      invoke<SystemMap>("create_system_map", { name, description }),

    updateSystemMap: (map: SystemMap) =>
      invoke<SystemMap>("update_system_map", { map }),

    deleteSystemMap: (mapId: string) =>
      invoke<void>("delete_system_map", { mapId }),
  };
}
