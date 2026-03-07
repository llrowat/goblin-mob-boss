import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { FeatureDetailPage } from "./FeatureDetailPage";
import type { Feature, IdeationResult } from "../types";

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
  worktree_paths: {},
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
};

const emptyIdeationResult: IdeationResult = {
  tasks: [],
  execution_mode: null,
};

describe("FeatureDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_feature") return mockFeature;
      if (cmd === "get_ideation_prompt") return "system prompt";
      if (cmd === "poll_ideation_result") return emptyIdeationResult;
      if (cmd === "run_ideation") return undefined;
      return undefined;
    });
  });

  it("shows feature name after loading", async () => {
    render(<FeatureDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Test Feature/)).toBeInTheDocument();
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
    expect(screen.getByText("View Diff")).toBeInTheDocument();
    expect(screen.getByText("Analyze Execution")).toBeInTheDocument();
    expect(screen.getByText("Push & Create PR")).toBeInTheDocument();

    // Should NOT show edit controls
    expect(screen.queryByText(/^Launch$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Request Changes/)).not.toBeInTheDocument();
    expect(screen.queryByText("Restart")).not.toBeInTheDocument();
    expect(screen.queryAllByTitle("Edit task")).toHaveLength(0);

    // Should show the plan read-only
    expect(screen.getByText("Add auth module")).toBeInTheDocument();
    expect(screen.getByText("Add auth UI")).toBeInTheDocument();
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
});
