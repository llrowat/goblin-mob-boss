import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { HomePage } from "./HomePage";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

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
});
