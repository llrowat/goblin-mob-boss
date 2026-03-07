import { renderHook } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useTauri } from "./useTauri";

describe("useTauri", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with all expected methods", () => {
    const { result } = renderHook(() => useTauri());
    const tauri = result.current;

    expect(typeof tauri.listRepositories).toBe("function");
    expect(typeof tauri.addRepository).toBe("function");
    expect(typeof tauri.updateRepository).toBe("function");
    expect(typeof tauri.removeRepository).toBe("function");
    expect(typeof tauri.detectRepoInfo).toBe("function");
    expect(typeof tauri.listAgents).toBe("function");
    expect(typeof tauri.saveAgent).toBe("function");
    expect(typeof tauri.deleteAgent).toBe("function");
    expect(typeof tauri.startFeature).toBe("function");
    expect(typeof tauri.listFeatures).toBe("function");
    expect(typeof tauri.listAllFeatures).toBe("function");
    expect(typeof tauri.getFeature).toBe("function");
    expect(typeof tauri.pollIdeationResult).toBe("function");
    expect(typeof tauri.configureLaunch).toBe("function");
    expect(typeof tauri.getLaunchCommand).toBe("function");
    expect(typeof tauri.markFeatureExecuting).toBe("function");
    expect(typeof tauri.markFeatureReady).toBe("function");
    expect(typeof tauri.runFeatureValidators).toBe("function");
    expect(typeof tauri.getFeatureDiff).toBe("function");
    expect(typeof tauri.getPreferences).toBe("function");
    expect(typeof tauri.setPreferences).toBe("function");
  });

  it("listRepositories calls invoke with correct command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useTauri());
    await result.current.listRepositories();
    expect(invoke).toHaveBeenCalledWith("list_repositories");
  });

  it("addRepository passes correct arguments", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTauri());
    await result.current.addRepository({
      name: "test",
      path: "/test",
      baseBranch: "main",
      validators: ["npm test"],
      prCommand: null,
    });
    expect(invoke).toHaveBeenCalledWith("add_repository", {
      name: "test",
      path: "/test",
      baseBranch: "main",
      description: null,
      validators: ["npm test"],
      prCommand: null,
    });
  });

  it("deleteAgent passes repoPath and filename", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useTauri());
    await result.current.deleteAgent("/repo", "agent.md");
    expect(invoke).toHaveBeenCalledWith("delete_agent", {
      repoPath: "/repo",
      filename: "agent.md",
    });
  });

  it("startFeature passes repoIds, name, description", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTauri());
    await result.current.startFeature(["r1", "r2"], "Auth", "Add auth");
    expect(invoke).toHaveBeenCalledWith("start_feature", {
      repoIds: ["r1", "r2"],
      name: "Auth",
      description: "Add auth",
    });
  });

  it("listFeatures passes repoId when provided", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useTauri());
    await result.current.listFeatures("repo-1");
    expect(invoke).toHaveBeenCalledWith("list_features", {
      repoId: "repo-1",
    });
  });

  it("listAllFeatures passes null repoId", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useTauri());
    await result.current.listAllFeatures();
    expect(invoke).toHaveBeenCalledWith("list_features", { repoId: null });
  });

  it("setPreferences passes shell", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTauri());
    await result.current.setPreferences("zsh");
    expect(invoke).toHaveBeenCalledWith("set_preferences", {
      shell: "zsh",
    });
  });

  it("pollIdeationResult calls invoke correctly", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ tasks: [], execution_mode: null });
    const { result } = renderHook(() => useTauri());
    await result.current.pollIdeationResult("feature-1");
    expect(invoke).toHaveBeenCalledWith("poll_ideation_result", {
      featureId: "feature-1",
    });
  });

  it("submitPlanningAnswers calls invoke correctly", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useTauri());
    const answers = [
      { id: "q1", question: "Which approach?", answer: "Option A" },
    ];
    await result.current.submitPlanningAnswers("feature-1", answers);
    expect(invoke).toHaveBeenCalledWith("submit_planning_answers", {
      featureId: "feature-1",
      answers,
    });
  });

  it("markFeatureExecuting calls invoke correctly", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTauri());
    await result.current.markFeatureExecuting("feature-1");
    expect(invoke).toHaveBeenCalledWith("mark_feature_executing", {
      featureId: "feature-1",
    });
  });
});
