import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "./SettingsPage";

function mockInvoke(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    get_preferences: { shell: "bash" },
    list_repositories: [],
    list_global_agents: [],
    list_system_maps: [],
  };
  const data = { ...defaults, ...overrides };

  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd in data) return Promise.resolve(data[cmd]);
    return Promise.resolve({});
  });
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header", () => {
    mockInvoke();

    render(<SettingsPage />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByText("Tune things to your liking."),
    ).toBeInTheDocument();
  });

  it("loads and displays current preferences", async () => {
    mockInvoke({ get_preferences: { shell: "zsh" } });

    render(<SettingsPage />);

    await waitFor(() => {
      const select = screen.getByDisplayValue("Zsh");
      expect(select).toBeInTheDocument();
    });
  });

  it("shows shell options", async () => {
    mockInvoke();

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Bash")).toBeInTheDocument();
    });
    expect(screen.getByText("PowerShell")).toBeInTheDocument();
    expect(screen.getByText("Zsh")).toBeInTheDocument();
  });

  it("saves preferences when Save is clicked", async () => {
    mockInvoke({ set_preferences: { shell: "bash" } });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Save Settings")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Save Settings"));

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("renders terminal section", () => {
    mockInvoke();

    render(<SettingsPage />);

    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Shell")).toBeInTheDocument();
  });

  // Account Overview tests

  it("renders account overview panel", async () => {
    mockInvoke();

    render(<SettingsPage />);

    expect(screen.getByText("Account Overview")).toBeInTheDocument();
    expect(screen.getByText("Lairs")).toBeInTheDocument();
    expect(screen.getByText("Goblins")).toBeInTheDocument();
    expect(screen.getByText("Treasure Maps")).toBeInTheDocument();
  });

  it("displays counts for repos, agents, and system maps", async () => {
    mockInvoke({
      list_repositories: [
        { id: "1", name: "repo1", path: "/r1", base_branch: "main", validators: [], pr_command: null, description: null, similar_repo_ids: [] },
        { id: "2", name: "repo2", path: "/r2", base_branch: "main", validators: [], pr_command: null, description: null, similar_repo_ids: [] },
      ],
      list_global_agents: [
        { filename: "a1.md", name: "Agent 1", description: "", role: "developer", color: "#fff", system_prompt: "", tools: [], enabled: true },
        { filename: "a2.md", name: "Agent 2", description: "", role: "developer", color: "#fff", system_prompt: "", tools: [], enabled: true },
        { filename: "a3.md", name: "Agent 3", description: "", role: "developer", color: "#fff", system_prompt: "", tools: [], enabled: true },
      ],
      list_system_maps: [
        { id: "m1", name: "Map 1", description: "", services: [], connections: [] },
      ],
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument(); // repos
    });
    expect(screen.getByText("3")).toBeInTheDocument(); // agents
    expect(screen.getByText("1")).toBeInTheDocument(); // system maps
  });

  it("shows warning indicators when counts are zero", async () => {
    mockInvoke({
      list_repositories: [],
      list_global_agents: [],
      list_system_maps: [],
    });

    render(<SettingsPage />);

    await waitFor(() => {
      const warnings = screen.getAllByText("⚠");
      expect(warnings).toHaveLength(3);
    });
  });

  it("shows warning only for items with zero count", async () => {
    mockInvoke({
      list_repositories: [
        { id: "1", name: "repo1", path: "/r1", base_branch: "main", validators: [], pr_command: null, description: null, similar_repo_ids: [] },
      ],
      list_global_agents: [],
      list_system_maps: [
        { id: "m1", name: "Map 1", description: "", services: [], connections: [] },
      ],
    });

    render(<SettingsPage />);

    await waitFor(() => {
      // Only agents should have a warning
      const warnings = screen.getAllByText("⚠");
      expect(warnings).toHaveLength(1);
    });
  });
});
