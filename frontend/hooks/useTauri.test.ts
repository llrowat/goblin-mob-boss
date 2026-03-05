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
    expect(typeof tauri.addAgent).toBe("function");
    expect(typeof tauri.updateAgent).toBe("function");
    expect(typeof tauri.removeAgent).toBe("function");
    expect(typeof tauri.startFeature).toBe("function");
    expect(typeof tauri.listFeatures).toBe("function");
    expect(typeof tauri.listAllFeatures).toBe("function");
    expect(typeof tauri.getFeature).toBe("function");
    expect(typeof tauri.importTasks).toBe("function");
    expect(typeof tauri.listTasks).toBe("function");
    expect(typeof tauri.getTask).toBe("function");
    expect(typeof tauri.startTask).toBe("function");
    expect(typeof tauri.completeTask).toBe("function");
    expect(typeof tauri.mergeTask).toBe("function");
    expect(typeof tauri.deleteTask).toBe("function");
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
      validators: ["npm test"],
      prCommand: null,
    });
  });

  it("removeAgent passes id", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useTauri());
    await result.current.removeAgent("agent-1");
    expect(invoke).toHaveBeenCalledWith("remove_agent", { id: "agent-1" });
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
    expect(invoke).toHaveBeenCalledWith("list_features", { repoId: "repo-1" });
  });

  it("listAllFeatures passes null repoId", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useTauri());
    await result.current.listAllFeatures();
    expect(invoke).toHaveBeenCalledWith("list_features", { repoId: null });
  });

  it("setPreferences passes shell and agent IDs", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    const { result } = renderHook(() => useTauri());
    await result.current.setPreferences("zsh", ["agent-1"], ["agent-2"]);
    expect(invoke).toHaveBeenCalledWith("set_preferences", {
      shell: "zsh",
      verificationAgentIds: ["agent-1"],
      planningAgentIds: ["agent-2"],
    });
  });

  it("pollTaskStatuses calls invoke correctly", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useTauri());
    await result.current.pollTaskStatuses("feature-1");
    expect(invoke).toHaveBeenCalledWith("poll_task_statuses", {
      featureId: "feature-1",
    });
  });
});
