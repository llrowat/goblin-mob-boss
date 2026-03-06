import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FeatureStatusPage } from "./FeatureStatusPage";

describe("FeatureStatusPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const executingFeature = {
    id: "feat-1",
    repo_ids: ["repo-1"],
    name: "Auth Feature",
    description: "Add authentication",
    branch: "feature/auth-ab12",
    status: "executing",
    execution_mode: "subagents",
    execution_rationale: "Sequential tasks",
    selected_agents: ["backend-dev.md"],
    task_specs: [
      {
        title: "Add auth middleware",
        description: "Create auth middleware",
        acceptance_criteria: [],
        dependencies: [],
        agent: "backend-dev",
      },
    ],
    pty_session_id: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };

  const readyFeature = {
    ...executingFeature,
    status: "ready",
  };

  const mockSnapshot = {
    commit_count: 3,
    files_changed: 5,
    insertions: 100,
    deletions: 20,
    last_commit_message: "Add auth middleware",
    last_commit_time: "2025-01-01 12:00:00 +0000",
    recent_commits: [
      {
        hash: "abc1234",
        message: "Add auth middleware",
        time: "2025-01-01 12:00:00 +0000",
      },
      {
        hash: "def5678",
        message: "Add login route",
        time: "2025-01-01 11:00:00 +0000",
      },
    ],
    active_files: ["src/auth.rs", "src/routes.rs"],
    timestamp: "2025-01-01T12:00:00Z",
  };

  const mockAnalysis = {
    feature_id: "feat-1",
    planned_task_count: 1,
    files_changed: 2,
    task_file_coverage: [
      {
        task_title: "Add auth middleware",
        agent: "backend-dev",
        likely_files: ["src/auth.rs"],
        coverage_status: "covered" as const,
      },
    ],
    unplanned_files: ["package.json"],
    execution_mode_used: "subagents" as const,
    mode_assessment: {
      mode_used: "subagents",
      was_appropriate: true,
      reason: "Good choice: tasks had dependencies.",
      suggestion: null,
    },
  };

  function renderWithRouter(featureId: string) {
    return render(
      <MemoryRouter initialEntries={[`/feature/${featureId}/status`]}>
        <Routes>
          <Route
            path="/feature/:featureId/status"
            element={<FeatureStatusPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("shows loading state initially", () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));
    renderWithRouter("feat-1");
    expect(screen.getByText(/Loading feature/)).toBeInTheDocument();
  });

  it("displays executing feature with live progress", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_feature") return Promise.resolve(executingFeature);
      if (cmd === "get_launch_command") return Promise.resolve("claude ...");
      if (cmd === "poll_execution_status") return Promise.resolve(mockSnapshot);
      if (cmd === "list_guidance_notes") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithRouter("feat-1");

    await waitFor(() => {
      expect(screen.getByText("Auth Feature")).toBeInTheDocument();
      expect(screen.getByText("Executing")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Live Progress")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument(); // commit count
      expect(screen.getByText("5")).toBeInTheDocument(); // files changed
      expect(screen.getByText("+100")).toBeInTheDocument(); // insertions
      expect(screen.getByText("-20")).toBeInTheDocument(); // deletions
    });
  });

  it("shows recent commits in snapshot", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_feature") return Promise.resolve(executingFeature);
      if (cmd === "get_launch_command") return Promise.resolve("claude ...");
      if (cmd === "poll_execution_status") return Promise.resolve(mockSnapshot);
      if (cmd === "list_guidance_notes") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithRouter("feat-1");

    await waitFor(() => {
      expect(screen.getByText("abc1234")).toBeInTheDocument();
      expect(screen.getByText("def5678")).toBeInTheDocument();
      expect(screen.getByText("Add login route")).toBeInTheDocument();
    });
  });

  it("shows guidance notes form during execution", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_feature") return Promise.resolve(executingFeature);
      if (cmd === "get_launch_command") return Promise.resolve("claude ...");
      if (cmd === "poll_execution_status")
        return Promise.resolve({ ...mockSnapshot, commit_count: 0 });
      if (cmd === "list_guidance_notes") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithRouter("feat-1");

    await waitFor(() => {
      expect(screen.getByText("Send Guidance")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/Focus on the login flow/),
      ).toBeInTheDocument();
      expect(screen.getByText("Send")).toBeInTheDocument();
    });
  });

  it("sends guidance note", async () => {
    const mockNote = {
      id: "note-1",
      content: "Focus on tests",
      priority: "important",
      created_at: "2025-01-01T12:00:00Z",
    };

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_feature") return Promise.resolve(executingFeature);
      if (cmd === "get_launch_command") return Promise.resolve("claude ...");
      if (cmd === "poll_execution_status")
        return Promise.resolve({ ...mockSnapshot, commit_count: 0 });
      if (cmd === "list_guidance_notes") return Promise.resolve([]);
      if (cmd === "add_guidance_note") return Promise.resolve(mockNote);
      return Promise.resolve(null);
    });

    renderWithRouter("feat-1");

    await waitFor(() => {
      expect(screen.getByText("Send Guidance")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Focus on the login flow/);
    fireEvent.change(input, { target: { value: "Focus on tests" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(screen.getByText("Focus on tests")).toBeInTheDocument();
    });
  });

  it("shows existing guidance notes", async () => {
    const existingNotes = [
      {
        id: "note-1",
        content: "Existing guidance",
        priority: "critical",
        created_at: "2025-01-01T10:00:00Z",
      },
    ];

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_feature") return Promise.resolve(executingFeature);
      if (cmd === "get_launch_command") return Promise.resolve("claude ...");
      if (cmd === "poll_execution_status")
        return Promise.resolve({ ...mockSnapshot, commit_count: 0 });
      if (cmd === "list_guidance_notes") return Promise.resolve(existingNotes);
      return Promise.resolve(null);
    });

    renderWithRouter("feat-1");

    await waitFor(() => {
      expect(screen.getByText("Existing guidance")).toBeInTheDocument();
      expect(screen.getByText("critical")).toBeInTheDocument();
    });
  });

  it("shows analyze button when ready", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_feature") return Promise.resolve(readyFeature);
      if (cmd === "get_launch_command") return Promise.resolve("claude ...");
      if (cmd === "list_guidance_notes") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithRouter("feat-1");

    await waitFor(() => {
      expect(screen.getByText("Analyze Execution")).toBeInTheDocument();
    });
  });

  it("shows execution analysis results", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_feature") return Promise.resolve(readyFeature);
      if (cmd === "get_launch_command") return Promise.resolve("claude ...");
      if (cmd === "list_guidance_notes") return Promise.resolve([]);
      if (cmd === "analyze_feature_execution")
        return Promise.resolve(mockAnalysis);
      return Promise.resolve(null);
    });

    renderWithRouter("feat-1");

    await waitFor(() => {
      expect(screen.getByText("Analyze Execution")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Analyze Execution"));

    await waitFor(() => {
      expect(screen.getByText("Execution Analysis")).toBeInTheDocument();
      expect(screen.getByText("Good mode choice")).toBeInTheDocument();
      expect(
        screen.getByText("Good choice: tasks had dependencies."),
      ).toBeInTheDocument();
    });
  });

  it("shows unplanned files in analysis", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_feature") return Promise.resolve(readyFeature);
      if (cmd === "get_launch_command") return Promise.resolve("claude ...");
      if (cmd === "list_guidance_notes") return Promise.resolve([]);
      if (cmd === "analyze_feature_execution")
        return Promise.resolve(mockAnalysis);
      return Promise.resolve(null);
    });

    renderWithRouter("feat-1");

    await waitFor(() => {
      expect(screen.getByText("Analyze Execution")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Analyze Execution"));

    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeInTheDocument();
      expect(screen.getByText("Unplanned file changes:")).toBeInTheDocument();
    });
  });

  it("shows Mark as Ready button during execution", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_feature") return Promise.resolve(executingFeature);
      if (cmd === "get_launch_command") return Promise.resolve("claude ...");
      if (cmd === "poll_execution_status")
        return Promise.resolve({ ...mockSnapshot, commit_count: 0 });
      if (cmd === "list_guidance_notes") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithRouter("feat-1");

    await waitFor(() => {
      expect(screen.getByText("Mark as Ready")).toBeInTheDocument();
    });
  });
});
