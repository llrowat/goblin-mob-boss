import { invoke } from "@tauri-apps/api/core";
import type {
  Repository,
  AgentFile,
  SkillFile,
  Feature,
  TaskSpec,
  ExecutionMode,
  IdeationResult,
  PlanningAnswer,
  PlanSnapshot,
  TaskProgress,
  VerifyResult,
  FunctionalTestResult,
  TestHarness,
  FunctionalTestStep,
  TestingStatus,
  DiffSummary,
  Preferences,
  FeatureRecipe,
  ExecutionSnapshot,
  ExecutionAnalysis,
  GuidanceNote,
  GuidancePriority,
  ModeRecommendation,
  SystemMap,
  DiscoveryStatus,
  DocumentAttachment,
  RepoHooks,
  HookTemplate,
  AgentPerformanceSummary,
  AgentTaskRecord,
} from "../types";

export function useTauri() {
  return {
    // Repositories
    listRepositories: () => invoke<Repository[]>("list_repositories"),

    addRepository: (args: {
      name: string;
      path: string;
      baseBranch: string;
      description?: string;
      validators: string[];
      prCommand: string | null;
      similarRepoIds?: string[];
      commitPattern?: string | null;
    }) =>
      invoke<Repository>("add_repository", {
        name: args.name,
        path: args.path,
        baseBranch: args.baseBranch,
        description: args.description || null,
        validators: args.validators,
        prCommand: args.prCommand,
        similarRepoIds: args.similarRepoIds || null,
        commitPattern: args.commitPattern || null,
      }),

    updateRepository: (args: {
      id: string;
      name: string;
      baseBranch: string;
      description?: string;
      validators: string[];
      prCommand: string | null;
      similarRepoIds?: string[];
      commitPattern?: string | null;
    }) =>
      invoke<Repository>("update_repository", {
        id: args.id,
        name: args.name,
        baseBranch: args.baseBranch,
        description: args.description || null,
        validators: args.validators,
        prCommand: args.prCommand,
        similarRepoIds: args.similarRepoIds || null,
        commitPattern: args.commitPattern || null,
      }),

    removeRepository: (id: string) =>
      invoke<void>("remove_repository", { id }),

    detectRepoInfo: (path: string) =>
      invoke<{ name: string; base_branch: string; has_claude_md: boolean; is_empty?: boolean; commit_pattern?: string | null }>(
        "detect_repo_info",
        { path },
      ),

    checkClaudeMd: (path: string) =>
      invoke<boolean>("check_claude_md", { path }),

    generateClaudeMd: (path: string) =>
      invoke<void>("generate_claude_md", { path }),

    getClaudeMdCommand: (path: string) =>
      invoke<string>("get_claude_md_command", { path }),

    // Agents (file-based)
    listAgents: (repoPath: string) =>
      invoke<AgentFile[]>("list_agents", { repoPath }),

    saveAgent: (repoPath: string, agent: AgentFile) =>
      invoke<void>("save_agent", { repoPath, agent }),

    deleteAgent: (repoPath: string, filename: string) =>
      invoke<void>("delete_agent", { repoPath, filename }),

    listGlobalAgents: () =>
      invoke<AgentFile[]>("list_global_agents"),

    saveGlobalAgent: (agent: AgentFile) =>
      invoke<void>("save_global_agent", { agent }),

    deleteGlobalAgent: (filename: string) =>
      invoke<void>("delete_global_agent", { filename }),

    // Skills (file-based)
    listGlobalSkills: () =>
      invoke<SkillFile[]>("list_global_skills"),

    saveGlobalSkill: (skill: SkillFile) =>
      invoke<void>("save_global_skill", { skill }),

    deleteGlobalSkill: (dirName: string) =>
      invoke<void>("delete_global_skill", { dirName }),

    generateSkill: (description: string) =>
      invoke<string>("generate_skill", { description }),

    checkSkillGeneration: (name: string) =>
      invoke<boolean>("check_skill_generation", { name }),

    // Features
    startFeature: (repoIds: string[], name: string, description: string, mapId?: string | null, attachments?: DocumentAttachment[]) =>
      invoke<Feature>("start_feature", { repoIds, name, description, mapId: mapId ?? null, attachments: attachments ?? null }),

    listFeatures: (repoId?: string) =>
      invoke<Feature[]>("list_features", { repoId: repoId ?? null }),

    listAllFeatures: () =>
      invoke<Feature[]>("list_features", { repoId: null }),

    getFeature: (featureId: string) =>
      invoke<Feature>("get_feature", { featureId }),

    getPlanHistory: (featureId: string) =>
      invoke<PlanSnapshot[]>("get_plan_history", { featureId }),

    deleteFeature: (featureId: string) =>
      invoke<void>("delete_feature", { featureId }),

    // Ideation
    getIdeationPrompt: (featureId: string) =>
      invoke<string>("get_ideation_prompt", { featureId }),

    getIdeationUserPrompt: (featureId: string) =>
      invoke<string>("get_ideation_user_prompt", { featureId }),

    getIdeationTerminalCommand: (featureId: string) =>
      invoke<string>("get_ideation_terminal_command", { featureId }),

    pollIdeationResult: (featureId: string) =>
      invoke<IdeationResult>("poll_ideation_result", { featureId }),

    // Launch Configuration
    checkTmuxInstalled: () => invoke<boolean>("check_tmux_installed"),
    detectAvailableShells: () =>
      invoke<[string, string][]>("detect_available_shells"),

    configureLaunch: (
      featureId: string,
      executionMode: ExecutionMode,
      executionRationale: string,
      selectedAgents: string[],
      taskSpecs: TaskSpec[],
      testHarness?: TestHarness | null,
      functionalTestSteps?: FunctionalTestStep[] | null,
    ) =>
      invoke<Feature>("configure_launch", {
        featureId,
        executionMode,
        executionRationale,
        selectedAgents,
        taskSpecs,
        testHarness: testHarness ?? null,
        functionalTestSteps: functionalTestSteps ?? null,
      }),

    getLaunchCommand: (featureId: string) =>
      invoke<string>("get_launch_command", { featureId }),

    markFeatureExecuting: (featureId: string) =>
      invoke<Feature>("mark_feature_executing", { featureId }),

    markFeatureReady: (featureId: string) =>
      invoke<Feature>("mark_feature_ready", { featureId }),

    completeFeature: (featureId: string) =>
      invoke<Feature>("complete_feature", { featureId }),

    cancelExecution: (featureId: string) =>
      invoke<Feature>("cancel_execution", { featureId }),

    // Validation
    runFeatureValidators: (featureId: string) =>
      invoke<VerifyResult>("run_feature_validators", { featureId }),

    // Functional Testing
    startFunctionalTesting: (featureId: string, cols: number, rows: number) =>
      invoke<string>("start_functional_testing", { featureId, cols, rows }),

    skipFunctionalTesting: (featureId: string) =>
      invoke<Feature>("skip_functional_testing", { featureId }),

    completeFunctionalTesting: (featureId: string) =>
      invoke<Feature>("complete_functional_testing", { featureId }),

    getFunctionalTestResults: (featureId: string) =>
      invoke<FunctionalTestResult[]>("get_functional_test_results", { featureId }),

    markFeatureTesting: (featureId: string) =>
      invoke<Feature>("mark_feature_testing", { featureId }),

    pollTestingStatus: (featureId: string) =>
      invoke<TestingStatus>("poll_testing_status", { featureId }),

    startTestHarness: (featureId: string) =>
      invoke<void>("start_test_harness", { featureId }),

    stopTestHarness: (featureId: string) =>
      invoke<void>("stop_test_harness", { featureId }),

    relaunchWithFixContext: (featureId: string, cols: number, rows: number) =>
      invoke<string>("relaunch_with_fix_context", { featureId, cols, rows }),

    // Diff
    getFeatureDiff: (featureId: string) =>
      invoke<DiffSummary>("get_feature_diff", { featureId }),

    // Feature PR
    pushFeature: (featureId: string, commitMessage?: string) =>
      invoke<string>("push_feature", { featureId, commitMessage: commitMessage ?? null }),

    pushFeatureRepo: (featureId: string, repoId: string, commitMessage?: string) =>
      invoke<string>("push_feature_repo", { featureId, repoId, commitMessage: commitMessage ?? null }),

    getPrCommand: (featureId: string) =>
      invoke<string>("get_pr_command", { featureId }),

    generateCommitMessage: (featureId: string, repoId: string) =>
      invoke<string>("generate_commit_message", { featureId, repoId }),

    generatePrDescription: (featureId: string) =>
      invoke<string>("generate_pr_description", { featureId }),

    // Preferences
    getPreferences: () => invoke<Preferences>("get_preferences"),

    setPreferences: (prefs: {
      shell: string;
      claudePath?: string;
      defaultExecutionMode?: string;
      defaultModel?: string;
      autoValidate?: boolean;
      functionalTestingEnabled?: boolean;
    }) =>
      invoke<Preferences>("set_preferences", {
        shell: prefs.shell,
        claudePath: prefs.claudePath ?? null,
        defaultExecutionMode: prefs.defaultExecutionMode ?? null,
        defaultModel: prefs.defaultModel ?? null,
        autoValidate: prefs.autoValidate ?? null,
        functionalTestingEnabled: prefs.functionalTestingEnabled ?? null,
      }),

    // Ideation (background)
    runIdeation: (featureId: string) =>
      invoke<void>("run_ideation", { featureId }),

    pollIdeationError: (featureId: string) =>
      invoke<string | null>("poll_ideation_error", { featureId }),

    reviseIdeation: (featureId: string, feedback: string) =>
      invoke<void>("revise_ideation", { featureId, feedback }),

    submitPlanningAnswers: (featureId: string, answers: PlanningAnswer[]) =>
      invoke<void>("submit_planning_answers", { featureId, answers }),

    // PTY
    startLaunchPty: (featureId: string, cols: number, rows: number) =>
      invoke<string>("start_launch_pty", { featureId, cols, rows }),

    writePty: (sessionId: string, data: string) =>
      invoke<void>("write_pty", { sessionId, data }),

    resizePty: (sessionId: string, cols: number, rows: number) =>
      invoke<void>("resize_pty", { sessionId, cols, rows }),

    killPty: (sessionId: string) =>
      invoke<void>("kill_pty", { sessionId }),

    ptySessionExists: (sessionId: string) =>
      invoke<boolean>("pty_session_exists", { sessionId }),

    pollPtyOutput: (sessionId: string) =>
      invoke<[string, boolean, number | null]>("poll_pty_output", { sessionId }),

    // Built-in Agents, Skills & Recipes
    listBuiltInAgents: () =>
      invoke<AgentFile[]>("list_built_in_agents"),

    addBuiltInAgent: (repoPath: string, filename: string) =>
      invoke<AgentFile>("add_built_in_agent", { repoPath, filename }),

    listBuiltInSkills: () =>
      invoke<SkillFile[]>("list_built_in_skills"),

    listFeatureRecipes: () =>
      invoke<FeatureRecipe[]>("list_feature_recipes"),

    // Task Progress
    pollTaskProgress: (featureId: string) =>
      invoke<TaskProgress | null>("poll_task_progress", { featureId }),

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

    startMapDiscovery: (mapId: string, repoIds: string[]) =>
      invoke<string>("start_map_discovery", { mapId, repoIds }),

    startDiscoveryPty: (mapId: string, repoIds: string[], cols: number, rows: number) =>
      invoke<string>("start_discovery_pty", { mapId, repoIds, cols, rows }),

    pollMapDiscovery: (mapId: string, repoIds: string[]) =>
      invoke<DiscoveryStatus>("poll_map_discovery", { mapId, repoIds }),

    // Hooks
    getRepoHooks: (repoPath: string) =>
      invoke<RepoHooks>("get_repo_hooks", { repoPath }),

    saveRepoHooks: (repoPath: string, hooks: RepoHooks) =>
      invoke<void>("save_repo_hooks", { repoPath, hooks }),

    listHookTemplates: () =>
      invoke<HookTemplate[]>("list_hook_templates"),

    generateHook: (description: string) =>
      invoke<void>("generate_hook", { description }),

    checkHookGeneration: () =>
      invoke<string | null>("check_hook_generation"),

    // Agent History
    getAgentSummaries: () =>
      invoke<AgentPerformanceSummary[]>("get_agent_summaries"),

    getAgentHistory: (agent?: string) =>
      invoke<AgentTaskRecord[]>("get_agent_history", { agent: agent || null }),
  };
}
