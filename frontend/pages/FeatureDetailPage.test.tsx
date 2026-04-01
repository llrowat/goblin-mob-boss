import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { FeatureDetailPage } from "./FeatureDetailPage";
import type { Feature, Repository, IdeationResult, PlanningQuestion, TaskProgress, PlanSnapshot } from "../types";

// Mock the useTerminalSession hook
const mockStartSession = vi.fn();
const mockClearSession = vi.fn();
vi.mock("../hooks/useTerminalSession", () => ({
  useTerminalSession: () => ({
    session: null,
    startSession: mockStartSession,
    clearSession: mockClearSession,
  }),
}));

// Mock the useBackgroundPlanning hook
const mockAddPlanning = vi.fn();
const mockIsPlanning = vi.fn(() => false);
const mockConsumePlan = vi.fn(() => null);
vi.mock("../hooks/useBackgroundPlanning", () => ({
  useBackgroundPlanning: () => ({
    isPlanning: mockIsPlanning,
    addPlanning: mockAddPlanning,
    consumePlan: mockConsumePlan,
  }),
}));

const mockedInvoke = vi.mocked(invoke);

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useParams: () => ({ featureId: "f1" }),
  useNavigate: () => mockNavigate,
}));

const mockRepos: Repository[] = [
  { id: "r1", name: "frontend-app", path: "/tmp/frontend", base_branch: "main", description: "", validators: [], pr_command: null, similar_repo_ids: [], commit_pattern: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "r2", name: "backend-api", path: "/tmp/backend", base_branch: "main", description: "", validators: [], pr_command: null, similar_repo_ids: [], commit_pattern: null, created_at: "2026-01-01T00:00:00Z" },
];

const mockFeature: Feature = {
  id: "f1",
  repo_ids: ["r1"],
  name: "Test Feature",
  description: "A test feature",
  branch: "feat/test",
  status: "ideation",
  execution_mode: null,
  execution_rationale: null,
  selected_agents: [],
  task_specs: [],
  pty_session_id: null,
  launched_command: null,
  worktree_paths: {},
  repo_push_status: {},
  functional_test_steps: [],
  test_harness: null,
  testing_attempt: 0,
  max_testing_attempts: 3,
  testing_skipped: false,
  functional_test_results: [],
  testing_started_at: null,
  testing_timeout_secs: 300,
  testing_decisions: [],
  attachments: [],
  activity_log: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockIdeationResult: IdeationResult = {
  tasks: [
    {
      title: "Add auth module",
      description: "Implement authentication",
      acceptance_criteria: ["Login works", "Logout works"],
      dependencies: [],
      agent: "backend-dev",
    },
    {
      title: "Add auth UI",
      description: "Build login form",
      acceptance_criteria: ["Form renders"],
      dependencies: ["1"],
      agent: "frontend-dev",
    },
  ],
  execution_mode: {
    recommended: "teams",
    rationale: "Tasks can run in parallel",
    confidence: 0.9,
  },
  questions: null,
  answered_questions: null,
  test_harness: null,
  functional_test_steps: null,
};

const emptyIdeationResult: IdeationResult = {
  tasks: [],
  execution_mode: null,
  questions: null,
  answered_questions: null,
  test_harness: null,
  functional_test_steps: null,
};

const mockQuestions: PlanningQuestion[] = [
  {
    id: "q1",
    question: "Should auth use JWT or sessions?",
    context: "Found both patterns in the codebase",
    options: ["JWT tokens", "Server sessions", "Both"],
    type: "single_choice",
  },
  {
    id: "q2",
    question: "Any specific auth provider requirements?",
    type: "free_text",
  },
];

const mockQuestionsResult: IdeationResult = {
  tasks: [],
  execution_mode: null,
  questions: mockQuestions,
  answered_questions: null,
  test_harness: null,
  functional_test_steps: null,
};

describe("FeatureDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return emptyIdeationResult;
      if (cmd === "run_ideation") return undefined;
      if (cmd === "check_tmux_installed") return true;
      if (cmd === "get_plan_history") return [];
      return undefined;
    });
  });

  it("shows feature name after loading", async () => {
    render(<FeatureDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Planning: Test Feature/)).toBeInTheDocument();
    });
  });

  it("shows spinner while planning", async () => {
    render(<FeatureDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Planning in progress/)).toBeInTheDocument();
    });
    expect(mockedInvoke).toHaveBeenCalledWith("run_ideation", { featureId: "f1" });
  });

  it("displays plan when polling returns tasks", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Add auth module")).toBeInTheDocument();
    });
    expect(screen.getByText("Add auth UI")).toBeInTheDocument();
    // Verify task keys render (TASK-1 appears in both key and deps columns)
    expect(screen.getAllByText("TASK-1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("TASK-2")).toBeInTheDocument();
    expect(screen.getByText(/^Launch$/)).toBeInTheDocument();
    expect(screen.getByText(/Request Changes/)).toBeInTheDocument();
  });

  it("shows execution mode selector with recommendation", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Agent Teams")).toBeInTheDocument();
    });
    expect(screen.getByText("Subagents")).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByText("90% confidence")).toBeInTheDocument();
  });

  it("opens feedback form on Request Changes click", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Request Changes/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/Request Changes/));

    expect(
      screen.getByPlaceholderText(/Describe what you'd like changed/),
    ).toBeInTheDocument();
    expect(screen.getByText("Revise Plan")).toBeInTheDocument();
  });

  it("submits revision feedback", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "revise_ideation") return undefined;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Request Changes/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/Request Changes/));

    const textarea = screen.getByPlaceholderText(/Describe what you'd like changed/);
    await userEvent.type(textarea, "Split auth into login and registration");
    await userEvent.click(screen.getByText("Revise Plan"));

    expect(mockedInvoke).toHaveBeenCalledWith("revise_ideation", {
      featureId: "f1",
      feedback: "Split auth into login and registration",
    });
  });

  it("skips ideation if plan already exists", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Add auth module")).toBeInTheDocument();
    });

    // run_ideation should NOT have been called since poll returned tasks
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "run_ideation",
      expect.anything(),
    );
  });

  it("shows view context toggle", async () => {
    render(<FeatureDetailPage />);
    const btn = await screen.findByText("View Context");
    expect(btn).toBeInTheDocument();
  });

  it("hides edit controls when feature is executing", async () => {
    const executingFeature: Feature = {
      ...mockFeature,
      status: "executing",
      pty_session_id: "launch-f1",
      task_specs: mockIdeationResult.tasks,
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return executingFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "pty_session_exists") return true;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Add auth module")).toBeInTheDocument();
    });

    // Should show "Executing" in the header
    expect(screen.getByText(/Executing: Test Feature/)).toBeInTheDocument();

    // Should NOT show Launch, Request Changes, or Restart buttons
    expect(screen.queryByText(/^Launch$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Request Changes/)).not.toBeInTheDocument();
    expect(screen.queryByText("Restart")).not.toBeInTheDocument();

    // Should NOT show edit pencil buttons
    expect(screen.queryAllByTitle("Edit task")).toHaveLength(0);

    // Should have called startSession with the feature's pty_session_id
    expect(mockStartSession).toHaveBeenCalledWith("f1", "launch-f1");

    // run_ideation should NOT have been called
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "run_ideation",
      expect.anything(),
    );
  });

  it("shows ready state with validation and PR actions", async () => {
    const readyFeature: Feature = {
      ...mockFeature,
      status: "ready",
      task_specs: mockIdeationResult.tasks,
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return readyFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Ready: Test Feature/)).toBeInTheDocument();
    });

    // Should show validation and PR buttons
    expect(screen.getByText("Run Validators")).toBeInTheDocument();
    expect(screen.getByText("Commit & Push")).toBeInTheDocument();

    // Should NOT show edit controls
    expect(screen.queryByText(/^Launch$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Request Changes/)).not.toBeInTheDocument();
    expect(screen.queryByText("Restart")).not.toBeInTheDocument();
    expect(screen.queryAllByTitle("Edit task")).toHaveLength(0);

    // Should show the plan read-only
    expect(screen.getByText("Add auth module")).toBeInTheDocument();
    expect(screen.getByText("Add auth UI")).toBeInTheDocument();
  });

  it("shows questions when polling returns questions", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockQuestionsResult;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Should auth use JWT or sessions?")).toBeInTheDocument();
    });
    expect(screen.getByText("Any specific auth provider requirements?")).toBeInTheDocument();
    expect(screen.getByText("Found both patterns in the codebase")).toBeInTheDocument();
    expect(screen.getByText("JWT tokens")).toBeInTheDocument();
    expect(screen.getByText("Server sessions")).toBeInTheDocument();
    expect(screen.getByText("Submit Answers")).toBeInTheDocument();
  });

  it("submits answers and resumes planning", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockQuestionsResult;
      if (cmd === "submit_planning_answers") return undefined;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Should auth use JWT or sessions?")).toBeInTheDocument();
    });

    // Answer the single choice question
    await userEvent.click(screen.getByText("JWT tokens"));

    // Answer the free text question
    const textarea = screen.getByPlaceholderText("Type your answer...");
    await userEvent.type(textarea, "Use OAuth2");

    await userEvent.click(screen.getByText("Submit Answers"));

    expect(mockedInvoke).toHaveBeenCalledWith("submit_planning_answers", {
      featureId: "f1",
      answers: [
        { id: "q1", question: "Should auth use JWT or sessions?", answer: "JWT tokens" },
        { id: "q2", question: "Any specific auth provider requirements?", answer: "Use OAuth2" },
      ],
    });
  });

  it("shows answer history when plan has answered_questions", async () => {
    const resultWithHistory: IdeationResult = {
      ...mockIdeationResult,
      answered_questions: [
        { id: "q1", question: "Which approach?", answer: "Option A" },
      ],
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return resultWithHistory;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Planning Q&A")).toBeInTheDocument();
    });
    expect(screen.getByText("Q: Which approach?")).toBeInTheDocument();
    expect(screen.getByText("A: Option A")).toBeInTheDocument();
  });

  it("shows task progress during execution", async () => {
    const executingFeature: Feature = {
      ...mockFeature,
      status: "executing",
      pty_session_id: "launch-f1",
      task_specs: mockIdeationResult.tasks,
    };

    const mockProgress: TaskProgress = {
      tasks: [
        {
          task: 1,
          title: "Add auth module",
          status: "in_progress",
          acceptance_criteria: [
            { criterion: "Login works", done: true },
            { criterion: "Logout works", done: false },
          ],
        },
        {
          task: 2,
          title: "Add auth UI",
          status: "pending",
          acceptance_criteria: [
            { criterion: "Form renders", done: false },
          ],
        },
      ],
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return executingFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "poll_task_progress") return mockProgress;
      if (cmd === "pty_session_exists") return true;
      return undefined;
    });

    render(<FeatureDetailPage />);

    // Wait for tasks to load and progress to be polled
    await waitFor(() => {
      expect(screen.getByText("Add auth module")).toBeInTheDocument();
    });

    // Should show progress fraction for task 1 (1/2) and task 2 (0/1)
    await waitFor(() => {
      expect(screen.getByText("1/2")).toBeInTheDocument();
    });
    expect(screen.getByText("0/1")).toBeInTheDocument();

    // Should show task status icons
    const statusIcons = document.querySelectorAll(".jira-task-status-icon");
    expect(statusIcons.length).toBe(2);
    expect(statusIcons[0].getAttribute("data-status")).toBe("in_progress");
    expect(statusIcons[1].getAttribute("data-status")).toBe("pending");

    // poll_task_progress should have been called
    expect(mockedInvoke).toHaveBeenCalledWith("poll_task_progress", { featureId: "f1" });
  });

  it("shows checked criteria when expanded during execution", async () => {
    const executingFeature: Feature = {
      ...mockFeature,
      status: "executing",
      pty_session_id: "launch-f1",
      task_specs: mockIdeationResult.tasks,
    };

    const mockProgress: TaskProgress = {
      tasks: [
        {
          task: 1,
          title: "Add auth module",
          status: "in_progress",
          acceptance_criteria: [
            { criterion: "Login works", done: true },
            { criterion: "Logout works", done: false },
          ],
        },
      ],
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return executingFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "poll_task_progress") return mockProgress;
      if (cmd === "pty_session_exists") return true;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Add auth module")).toBeInTheDocument();
    });

    // Wait for progress data
    await waitFor(() => {
      expect(screen.getByText("1/2")).toBeInTheDocument();
    });

    // Click on TASK-1 row to expand
    await userEvent.click(screen.getByText("Add auth module"));

    // Should show checked/unchecked criteria
    const checkBoxes = document.querySelectorAll(".jira-check-box");
    expect(checkBoxes.length).toBe(2);
    expect(checkBoxes[0].classList.contains("jira-check-done")).toBe(true);
    expect(checkBoxes[1].classList.contains("jira-check-done")).toBe(false);
  });

  it("deletes feature with confirmation and navigates home", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "delete_feature") return undefined;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Add auth module")).toBeInTheDocument();
    });

    // Click Delete button
    await userEvent.click(screen.getByText("Delete"));

    // Should show confirmation
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();

    // Confirm deletion
    await userEvent.click(screen.getByText("Confirm Delete"));

    expect(mockedInvoke).toHaveBeenCalledWith("delete_feature", { featureId: "f1" });
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("cancels delete confirmation", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Add auth module")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();

    // Cancel goes back to normal Delete button
    await userEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Confirm Delete")).not.toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows Make Changes and Mark Complete buttons in pushed state", async () => {
    const pushedFeature: Feature = {
      ...mockFeature,
      status: "pushed",
      task_specs: mockIdeationResult.tasks,
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return pushedFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "poll_task_progress") return null;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Mark Complete")).toBeInTheDocument();
    });
    expect(screen.getByText("Make Changes")).toBeInTheDocument();
  });

  it("submits make changes feedback and resets to ideation", async () => {
    const pushedFeature: Feature = {
      ...mockFeature,
      status: "pushed",
      task_specs: mockIdeationResult.tasks,
    };

    const ideationFeature: Feature = {
      ...mockFeature,
      status: "ideation",
      task_specs: [],
    };

    mockedInvoke.mockImplementation(async (cmd: string, _args?: any) => {
      if (cmd === "get_feature") {
        // Return ideation feature after cancel_execution has been called
        if (mockedInvoke.mock.calls.some(c => c[0] === "cancel_execution")) {
          return ideationFeature;
        }
        return pushedFeature;
      }
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "poll_task_progress") return null;
      if (cmd === "cancel_execution") return ideationFeature;
      if (cmd === "revise_ideation") return undefined;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Make Changes")).toBeInTheDocument();
    });

    // Click Make Changes
    await userEvent.click(screen.getByText("Make Changes"));

    // Should show the feedback textarea
    expect(screen.getByText("What needs to change?")).toBeInTheDocument();

    // Type feedback
    const textarea = screen.getByPlaceholderText("Describe the changes needed...");
    await userEvent.type(textarea, "Fix the login page");

    // Submit
    await userEvent.click(screen.getByText("Submit & Re-plan"));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("cancel_execution", { featureId: "f1" });
    });
    expect(mockedInvoke).toHaveBeenCalledWith("revise_ideation", {
      featureId: "f1",
      feedback: "Fix the login page",
    });
  });

  it("does not run ideation for ready features", async () => {
    const readyFeature: Feature = {
      ...mockFeature,
      status: "ready",
      task_specs: mockIdeationResult.tasks,
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return readyFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return emptyIdeationResult;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Add auth module")).toBeInTheDocument();
    });

    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "run_ideation",
      expect.anything(),
    );
  });

  it("shows tmux warning when teams mode is recommended and Agent Teams works better with tmux", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "check_tmux_installed") return false;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Agent Teams works better with tmux/)).toBeInTheDocument();
    });
  });

  it("does not disable launch button when teams mode selected without tmux", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "check_tmux_installed") return false;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/^Launch$/)).toBeInTheDocument();
    });

    const launchBtn = screen.getByText(/^Launch$/).closest("button")!;
    expect(launchBtn).not.toBeDisabled();
  });

  it("does not show tmux warning when tmux is installed", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "check_tmux_installed") return true;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Agent Teams")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Agent Teams works better with tmux/)).not.toBeInTheDocument();
  });

  it("does not show tmux warning when subagents mode is selected", async () => {
    const subagentsResult: IdeationResult = {
      ...mockIdeationResult,
      execution_mode: {
        recommended: "subagents",
        rationale: "Simple sequential tasks",
        confidence: 0.85,
      },
    };
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return subagentsResult;
      if (cmd === "check_tmux_installed") return false;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Subagents")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Agent Teams works better with tmux/)).not.toBeInTheDocument();
  });

  it("shows per-repo push status for multi-repo ready features", async () => {
    const multiRepoFeature: Feature = {
      ...mockFeature,
      repo_ids: ["r1", "r2"],
      status: "ready",
      task_specs: mockIdeationResult.tasks,
      repo_push_status: { r1: "pushed", r2: "pending" },
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return multiRepoFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "list_repositories") return mockRepos;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Per-Repo Push Status")).toBeInTheDocument();
    });

    // Should show repo names
    expect(screen.getByText("frontend-app")).toBeInTheDocument();
    expect(screen.getByText("backend-api")).toBeInTheDocument();

    // Should show push status labels
    expect(screen.getByText("pushed")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();

    // Should show Commit & Push only for the pending repo
    const pushButtons = screen.getAllByText("Commit & Push");
    expect(pushButtons).toHaveLength(1);
  });

  it("calls push_feature_repo when per-repo push button is clicked", async () => {
    const multiRepoFeature: Feature = {
      ...mockFeature,
      repo_ids: ["r1", "r2"],
      status: "ready",
      task_specs: mockIdeationResult.tasks,
      repo_push_status: {},
    };

    const afterPushFeature: Feature = {
      ...multiRepoFeature,
      repo_push_status: { r1: "pushed" },
    };

    mockedInvoke.mockImplementation(async (cmd: string, _args?: any) => {
      if (cmd === "get_feature") {
        if (mockedInvoke.mock.calls.some(c => c[0] === "push_feature_repo")) {
          return afterPushFeature;
        }
        return multiRepoFeature;
      }
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "list_repositories") return mockRepos;
      if (cmd === "push_feature_repo") return "r1: pushed";
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Per-Repo Push Status")).toBeInTheDocument();
    });

    // Both repos should show push buttons since neither is pushed
    const pushButtons = screen.getAllByText("Commit & Push");
    expect(pushButtons).toHaveLength(2);

    // Click the first push button
    await userEvent.click(pushButtons[0]);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("push_feature_repo", {
        featureId: "f1",
        repoId: "r1",
      });
    });
  });

  it("shows Mark Complete only when all repos are pushed in multi-repo feature", async () => {
    const allPushedFeature: Feature = {
      ...mockFeature,
      repo_ids: ["r1", "r2"],
      status: "ready",
      task_specs: mockIdeationResult.tasks,
      repo_push_status: { r1: "pushed", r2: "pushed" },
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return allPushedFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "list_repositories") return mockRepos;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Mark Complete")).toBeInTheDocument();
    });
    expect(screen.getByText("Make Changes")).toBeInTheDocument();
  });

  it("does not show Mark Complete when not all repos are pushed in multi-repo feature", async () => {
    const partialPushFeature: Feature = {
      ...mockFeature,
      repo_ids: ["r1", "r2"],
      status: "ready",
      task_specs: mockIdeationResult.tasks,
      repo_push_status: { r1: "pushed" },
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return partialPushFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "list_repositories") return mockRepos;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Per-Repo Push Status")).toBeInTheDocument();
    });

    // Should NOT show Mark Complete since r2 is not pushed
    expect(screen.queryByText("Mark Complete")).not.toBeInTheDocument();
  });

  it("loads and displays plan history when snapshots exist", async () => {
    const mockHistory: PlanSnapshot[] = [
      {
        trigger: "revision",
        feedback: "Split the tasks",
        tasks: [
          {
            title: "Original task",
            description: "The original plan",
            acceptance_criteria: [],
            dependencies: [],
            agent: "dev",
          },
        ],
        execution_mode: null,
        created_at: "2026-03-01T10:00:00Z",
      },
    ];

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "get_plan_history") return mockHistory;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Plan History \(1 prior version\)/)).toBeInTheDocument();
    });
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Revised")).toBeInTheDocument();
  });

  it("does not show plan history when no snapshots exist", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "get_plan_history") return [];
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Add auth module")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Plan History/)).not.toBeInTheDocument();
  });

  it("refreshes plan history after revision", async () => {
    const historyAfterRevision: PlanSnapshot[] = [
      {
        trigger: "revision",
        feedback: "Split auth into login and registration",
        tasks: mockIdeationResult.tasks,
        execution_mode: mockIdeationResult.execution_mode,
        created_at: "2026-03-01T10:00:00Z",
      },
    ];

    let revisionCalled = false;
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "get_plan_history") return revisionCalled ? historyAfterRevision : [];
      if (cmd === "revise_ideation") { revisionCalled = true; return undefined; }
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Request Changes/)).toBeInTheDocument();
    });

    // No plan history initially
    expect(screen.queryByText(/Plan History/)).not.toBeInTheDocument();

    // Trigger a revision
    await userEvent.click(screen.getByText(/Request Changes/));
    const textarea = screen.getByPlaceholderText(/Describe what you'd like changed/);
    await userEvent.type(textarea, "Split auth into login and registration");
    await userEvent.click(screen.getByText("Revise Plan"));

    // Plan history should appear after revision
    await waitFor(() => {
      expect(screen.getByText(/Plan History \(1 prior version\)/)).toBeInTheDocument();
    });
  });

  it("collapses and expands the activity log", async () => {
    const featureWithLog: Feature = {
      ...mockFeature,
      activity_log: [
        { message: "Feature created", type: "info", timestamp: "2026-01-01T00:00:00Z" },
        { message: "Plan generated", type: "success", timestamp: "2026-01-01T01:00:00Z" },
      ],
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return featureWithLog;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "get_plan_history") return [];
      return undefined;
    });

    render(<FeatureDetailPage />);

    // Activity log entries should be visible initially
    await waitFor(() => {
      expect(screen.getByText("Feature created")).toBeInTheDocument();
    });
    expect(screen.getByText("Plan generated")).toBeInTheDocument();

    // Click the toggle to collapse
    const toggle = screen.getByRole("button", { name: /Activity Log/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(toggle);

    // Entries should be hidden, toggle shows clock icon instead of text
    expect(screen.queryByText("Feature created")).not.toBeInTheDocument();
    expect(screen.queryByText("Plan generated")).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Click clock icon to expand (button title changes when collapsed)
    const collapsedToggle = screen.getByTitle("Show activity log");
    await userEvent.click(collapsedToggle);
    expect(screen.getByText("Feature created")).toBeInTheDocument();
    expect(screen.getByText("Plan generated")).toBeInTheDocument();
  });

  it("does not show per-repo panel for single-repo ready features", async () => {
    const singleRepoReady: Feature = {
      ...mockFeature,
      repo_ids: ["r1"],
      status: "ready",
      task_specs: mockIdeationResult.tasks,
      repo_push_status: {},
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return singleRepoReady;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return mockIdeationResult;
      if (cmd === "list_repositories") return mockRepos;
      return undefined;
    });

    render(<FeatureDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Ready: Test Feature/)).toBeInTheDocument();
    });

    // Should NOT show per-repo panel
    expect(screen.queryByText("Per-Repo Push Status")).not.toBeInTheDocument();

    // Should show the standard single Commit & Push button
    expect(screen.getByText("Commit & Push")).toBeInTheDocument();
  });
});
