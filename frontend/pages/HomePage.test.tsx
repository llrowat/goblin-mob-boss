import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { HomePage } from "./HomePage";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockDialogOpen = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockDialogOpen(...args),
}));

const mockReadTextFile = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => mockReadTextFile(...args),
}));

const mockAddPlanning = vi.fn();
vi.mock("../hooks/useBackgroundPlanning", () => ({
  useBackgroundPlanning: () => ({
    addPlanning: mockAddPlanning,
    planningCount: 0,
    executingCount: 0,
    planningIds: new Set(),
    isPlanning: () => false,
    completedPlans: new Map(),
    consumePlan: () => null,
  }),
}));

const mockRepo = {
  id: "r1",
  name: "my-app",
  path: "/app",
  base_branch: "main",
  validators: [],
  pr_command: null,
  created_at: "2025-01-01T00:00:00Z",
};

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddPlanning.mockClear();
  });

  it("shows empty state when no repositories exist", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No repositories yet")).toBeInTheDocument();
      expect(screen.getByText(/The crew needs a base of operations/)).toBeInTheDocument();
    });
  });

  it("shows New Feature button when repos exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("New Feature")).toBeInTheDocument();
    });
  });

  it("opens modal with form when New Feature is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("New Feature")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Feature"));

    expect(screen.getByPlaceholderText("User Authentication")).toBeInTheDocument();
    expect(screen.getByText("Start Feature")).toBeDisabled();
  });

  it("navigates to repos page from empty state", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Add Repository")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Repository"));
    expect(mockNavigate).toHaveBeenCalledWith("/repos");
  });

  it("shows active features with branch and repo tags", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      if (cmd === "list_features") {
        return Promise.resolve([
          {
            id: "f1",
            repo_ids: ["r1"],
            name: "Auth Feature",
            description: "Add authentication",
            branch: "feature/auth",
            status: "executing",
            execution_mode: null,
            execution_rationale: null,
            selected_agents: [],
            task_specs: [],
            pty_session_id: null,
            launched_command: null,
            worktree_paths: {},
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Auth Feature")).toBeInTheDocument();
      expect(screen.getByText("Executing")).toBeInTheDocument();
      expect(screen.getByText("feature/auth")).toBeInTheDocument();
      // "my-app" appears in both the feature card and the repo filter dropdown
      expect(screen.getAllByText("my-app").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows worktree tag when feature has a worktree", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      if (cmd === "list_features") {
        return Promise.resolve([
          {
            id: "f1",
            repo_ids: ["r1"],
            name: "Auth Feature",
            description: "Add authentication",
            branch: "feature/auth",
            status: "executing",
            execution_mode: null,
            execution_rationale: null,
            selected_agents: [],
            task_specs: [],
            pty_session_id: null,
            launched_command: null,
            worktree_paths: { r1: "/app/.gmb/worktrees/f1/my-app" },
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Worktree")).toBeInTheDocument();
    });
  });

  it("shows multiple repo names for cross-repo features", async () => {
    const mockRepo2 = {
      id: "r2",
      name: "api-service",
      path: "/api",
      base_branch: "main",
      validators: [],
      pr_command: null,
      created_at: "2025-01-01T00:00:00Z",
    };

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo, mockRepo2]);
      if (cmd === "list_features") {
        return Promise.resolve([
          {
            id: "f1",
            repo_ids: ["r1", "r2"],
            name: "Cross-Repo Feature",
            description: "Spans both repos",
            branch: "feature/cross",
            status: "executing",
            execution_mode: null,
            execution_rationale: null,
            selected_agents: [],
            task_specs: [],
            pty_session_id: null,
            launched_command: null,
            worktree_paths: {},
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Cross-Repo Feature")).toBeInTheDocument();
      expect(screen.getByText("my-app, api-service")).toBeInTheDocument();
    });
  });

  it("shows repo checkboxes in new feature modal", async () => {
    const mockRepo2 = {
      id: "r2",
      name: "api-service",
      path: "/api",
      base_branch: "main",
      validators: [],
      pr_command: null,
      created_at: "2025-01-01T00:00:00Z",
    };

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo, mockRepo2]);
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("New Feature")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Feature"));

    expect(screen.getByText("Repositories")).toBeInTheDocument();
    // Repos appear in both filter dropdown and modal checkboxes
    expect(screen.getAllByText("my-app").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("api-service").length).toBeGreaterThanOrEqual(2);
    // Should have checkboxes for repo selection
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it("auto-starts planning when a feature is created", async () => {
    const createdFeature = {
      id: "f-new",
      repo_ids: ["r1"],
      name: "New Feature",
      description: "Build something",
      branch: "feature/new-feature-abc1",
      status: "ideation",
      execution_mode: null,
      execution_rationale: null,
      selected_agents: [],
      task_specs: [],
      pty_session_id: null,
      launched_command: null,
      worktree_paths: {},
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      if (cmd === "list_features") return Promise.resolve([]);
      if (cmd === "start_feature") return Promise.resolve(createdFeature);
      if (cmd === "run_ideation") return Promise.resolve();
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("New Feature")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Feature"));

    // Fill in form
    fireEvent.change(screen.getByPlaceholderText("User Authentication"), {
      target: { value: "New Feature" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/Add user authentication/),
      { target: { value: "Build something cool" } },
    );

    // Select a repo (no longer auto-selected)
    const repoCheckbox = screen.getByRole("checkbox");
    fireEvent.click(repoCheckbox);

    fireEvent.click(screen.getByText("Start Feature"));

    await waitFor(() => {
      // Should have called run_ideation for the created feature
      expect(invoke).toHaveBeenCalledWith("run_ideation", { featureId: "f-new" });
      // Should have registered with background planning tracker
      expect(mockAddPlanning).toHaveBeenCalledWith("f-new");
      // Should navigate to detail page
      expect(mockNavigate).toHaveBeenCalledWith("/feature/f-new/detail");
    });
  });

  it("shows completed features in a separate section", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      if (cmd === "list_features") {
        return Promise.resolve([
          {
            id: "f1",
            repo_ids: ["r1"],
            name: "Active Feature",
            description: "Still in progress",
            branch: "feature/active",
            status: "executing",
            execution_mode: null,
            execution_rationale: null,
            selected_agents: [],
            task_specs: [],
            pty_session_id: null,
            launched_command: null,
            worktree_paths: {},
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
          {
            id: "f2",
            repo_ids: ["r1"],
            name: "Done Feature",
            description: "All wrapped up",
            branch: "feature/done",
            status: "complete",
            execution_mode: null,
            execution_rationale: null,
            selected_agents: [],
            task_specs: [],
            pty_session_id: null,
            launched_command: null,
            worktree_paths: {},
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Active Feature")).toBeInTheDocument();
      expect(screen.getByText("Done Feature")).toBeInTheDocument();
    });

    // Should show both section labels
    expect(screen.getByText("Active Features")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();

    // Completed card should be greyed out (opacity 0.5)
    const doneCard = screen.getByText("Done Feature").closest(".feature-card");
    expect(doneCard).toHaveStyle({ opacity: "0.5" });
  });

  it("closes modal when Cancel is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("New Feature")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Feature"));
    expect(screen.getByPlaceholderText("User Authentication")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByPlaceholderText("User Authentication")).not.toBeInTheDocument();
  });

  it("shows attachment controls in new feature modal", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("New Feature")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Feature"));

    expect(screen.getByText("Attachments")).toBeInTheDocument();
    expect(screen.getByText("Add Files")).toBeInTheDocument();
    expect(screen.getByText(/Attach design docs/)).toBeInTheDocument();
  });

  it("passes attachments to start_feature when files are attached", async () => {
    const createdFeature = {
      id: "f-att",
      repo_ids: ["r1"],
      name: "With Docs",
      description: "Feature with attached docs",
      branch: "feature/with-docs-abc1",
      status: "ideation",
      execution_mode: null,
      execution_rationale: null,
      selected_agents: [],
      task_specs: [],
      pty_session_id: null,
      launched_command: null,
      worktree_paths: {},
      attachments: [{ name: "spec.md", content: "# Spec" }],
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      if (cmd === "list_features") return Promise.resolve([]);
      if (cmd === "start_feature") return Promise.resolve(createdFeature);
      if (cmd === "run_ideation") return Promise.resolve();
      return Promise.resolve([]);
    });

    // Mock dialog to return a text file path, and readTextFile to return its content
    mockDialogOpen.mockResolvedValueOnce(["/home/user/spec.md"]);
    mockReadTextFile.mockResolvedValueOnce("# Spec");

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("New Feature")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Feature"));

    // Fill in form
    fireEvent.change(screen.getByPlaceholderText("User Authentication"), {
      target: { value: "With Docs" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/Add user authentication/),
      { target: { value: "Feature with attached docs" } },
    );

    // Click "Add Files" button to trigger Tauri dialog
    fireEvent.click(screen.getByText("Add Files"));

    // Wait for file to be read and displayed
    await waitFor(() => {
      expect(screen.getByText("spec.md")).toBeInTheDocument();
    });

    // Select the repo
    const repoCheckbox = screen.getByRole("checkbox");
    fireEvent.click(repoCheckbox);

    fireEvent.click(screen.getByText("Start Feature"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("start_feature", expect.objectContaining({
        attachments: [{ name: "spec.md", content: "# Spec" }],
      }));
    });
  });

  it("attaches image files with file_path instead of content", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([mockRepo]);
      if (cmd === "list_features") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    // Mock dialog to return an image file path
    mockDialogOpen.mockResolvedValueOnce(["/home/user/mockup.png"]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("New Feature")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Feature"));

    // Click "Add Files" to trigger dialog
    fireEvent.click(screen.getByText("Add Files"));

    // Image should show with "image" label instead of KB size
    await waitFor(() => {
      expect(screen.getByText("mockup.png")).toBeInTheDocument();
      expect(screen.getByText("image")).toBeInTheDocument();
    });

    // readTextFile should NOT have been called for an image
    expect(mockReadTextFile).not.toHaveBeenCalled();
  });
});
