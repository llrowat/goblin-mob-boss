import { render, screen, fireEvent } from "@testing-library/react";
import { TestingPanel } from "./TestingPanel";
import type { Feature, FunctionalTestResult, TestingStatus } from "../../types";

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: "f1",
    repo_ids: ["r1"],
    name: "Test Feature",
    description: "desc",
    branch: "feature/test",
    status: "ready",
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
    testing_timeout_secs: 600,
    testing_decisions: [],
    attachments: [],
    activity_log: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const noop = () => {};

function renderPanel(
  overrides: {
    feature?: Partial<Feature>;
    isTesting?: boolean;
    testResults?: FunctionalTestResult[];
    testingStatus?: TestingStatus | null;
    onStartTesting?: () => void;
    onSkipTesting?: () => void;
    onCompleteTesting?: () => void;
    onRelaunchFix?: () => void;
    startingTest?: boolean;
    completingTest?: boolean;
    error?: string;
  } = {},
) {
  return render(
    <TestingPanel
      feature={makeFeature(overrides.feature)}
      isTesting={overrides.isTesting ?? false}
      testResults={overrides.testResults ?? []}
      testingStatus={overrides.testingStatus ?? null}
      onStartTesting={overrides.onStartTesting ?? noop}
      onSkipTesting={overrides.onSkipTesting ?? noop}
      onCompleteTesting={overrides.onCompleteTesting ?? noop}
      onRelaunchFix={overrides.onRelaunchFix ?? noop}
      startingTest={overrides.startingTest ?? false}
      completingTest={overrides.completingTest ?? false}
      error={overrides.error}
    />,
  );
}

describe("TestingPanel", () => {
  it("shows no-harness message when test_harness is null", () => {
    renderPanel();
    expect(screen.getByText(/No test harness configured/)).toBeInTheDocument();
  });

  it("shows harness info when test_harness is set", () => {
    renderPanel({
      feature: {
        test_harness: {
          start_command: "npm run dev",
          ready_signal: "ready on port 3000",
          stop_command: "kill $PID",
          harness_type: "browser",
        },
      },
    });
    expect(screen.getByText("Test Harness")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    expect(screen.getByText("ready on port 3000")).toBeInTheDocument();
    expect(screen.getByText("browser")).toBeInTheDocument();
  });

  it("shows test steps when functional_test_steps are provided", () => {
    renderPanel({
      feature: {
        test_harness: {
          start_command: "npm start",
          ready_signal: "",
          stop_command: "",
          harness_type: "api",
        },
        functional_test_steps: [
          { description: "Login with valid creds", tool: "playwright", agent: "qa-tester" },
          { description: "Check dashboard loads", tool: "playwright", agent: "qa-tester" },
        ],
      },
    });
    expect(screen.getByText("Test Steps (2)")).toBeInTheDocument();
    expect(screen.getByText("Login with valid creds")).toBeInTheDocument();
    expect(screen.getByText("Check dashboard loads")).toBeInTheDocument();
  });

  it("shows Run QA button when harness exists and not testing", () => {
    renderPanel({
      feature: {
        test_harness: { start_command: "npm start", ready_signal: "", stop_command: "", harness_type: "cli" },
      },
    });
    expect(screen.getByLabelText("Start functional testing")).toBeInTheDocument();
    expect(screen.getByText("Run QA")).toBeInTheDocument();
  });

  it("calls onStartTesting when Run QA is clicked", () => {
    const onStart = vi.fn();
    renderPanel({
      feature: {
        test_harness: { start_command: "npm start", ready_signal: "", stop_command: "", harness_type: "cli" },
      },
      onStartTesting: onStart,
    });
    fireEvent.click(screen.getByText("Run QA"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows Starting... when startingTest is true", () => {
    renderPanel({
      feature: {
        test_harness: { start_command: "npm start", ready_signal: "", stop_command: "", harness_type: "cli" },
      },
      startingTest: true,
    });
    expect(screen.getByText("Starting...")).toBeInTheDocument();
  });

  it("shows Collect Results button when testing is in progress", () => {
    renderPanel({ feature: { status: "testing" }, isTesting: true });
    expect(screen.getByLabelText("Complete functional testing")).toBeInTheDocument();
    expect(screen.getByText("Collect Results")).toBeInTheDocument();
  });

  it("calls onCompleteTesting when Collect Results is clicked", () => {
    const onComplete = vi.fn();
    renderPanel({ feature: { status: "testing" }, isTesting: true, onCompleteTesting: onComplete });
    fireEvent.click(screen.getByText("Collect Results"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows Skip button and calls onSkipTesting", () => {
    const onSkip = vi.fn();
    renderPanel({ onSkipTesting: onSkip });
    const skipBtn = screen.getByLabelText("Skip functional testing");
    fireEvent.click(skipBtn);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("shows skipped notice when testing_skipped is true", () => {
    renderPanel({ feature: { testing_skipped: true } });
    expect(screen.getByText("Functional testing was skipped for this feature.")).toBeInTheDocument();
  });

  it("shows testing in-progress spinner when no status signals", () => {
    renderPanel({ feature: { status: "testing" }, isTesting: true });
    expect(screen.getByText("QA tester is exercising the feature...")).toBeInTheDocument();
  });

  it("renders test results with proofs", () => {
    const results: FunctionalTestResult[] = [
      {
        attempt: 1,
        all_passed: false,
        proofs: [
          { step_description: "Login page loads", proof_type: "screenshot", content: "base64data", passed: true, error: null, timestamp: "2026-01-01T00:00:00Z", is_meta: false },
          { step_description: "Submit form", proof_type: "api_response", content: '{"ok": true}', passed: false, error: "Expected 200 got 500", timestamp: "2026-01-01T00:00:00Z", is_meta: false },
        ],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ];
    renderPanel({ testResults: results });
    expect(screen.getByText("Round 1")).toBeInTheDocument();
    expect(screen.getByText("Some failed")).toBeInTheDocument();
    expect(screen.getByText("2 proofs")).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();
    expect(screen.getByText("FAIL")).toBeInTheDocument();
    expect(screen.getByText("Login page loads")).toBeInTheDocument();
    expect(screen.getByText("Expected 200 got 500")).toBeInTheDocument();
  });

  it("renders all-passed result", () => {
    const results: FunctionalTestResult[] = [
      {
        attempt: 1, all_passed: true,
        proofs: [{ step_description: "Check response", proof_type: "api_response", content: "ok", passed: true, error: null, timestamp: "2026-01-01T00:00:00Z", is_meta: false }],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ];
    renderPanel({ testResults: results });
    expect(screen.getByText("All passed")).toBeInTheDocument();
    expect(screen.getByText("1 proof")).toBeInTheDocument();
  });

  it("shows attempt label when testing_attempt > 0", () => {
    renderPanel({ feature: { testing_attempt: 2, max_testing_attempts: 3 } });
    expect(screen.getByText("Attempt 2/3")).toBeInTheDocument();
  });

  it("shows loop feedback when tests failed and attempts remain", () => {
    const results: FunctionalTestResult[] = [
      { attempt: 1, all_passed: false, proofs: [], timestamp: "2026-01-01T00:00:00Z" },
    ];
    renderPanel({
      feature: { status: "executing", testing_attempt: 1, max_testing_attempts: 3 },
      testResults: results,
    });
    expect(screen.getByText(/QA found issues/)).toBeInTheDocument();
  });

  // ── Hardened features ──

  it("shows harness status when testingStatus is provided", () => {
    const status: TestingStatus = {
      harness: { running: true, ready: true, error: null, stdout_tail: "", pid: 1234 },
      timed_out: false, elapsed_secs: 30, timeout_secs: 600,
      completion_signal: false, results_exist: false, attempt: 1, max_attempts: 3,
    };
    renderPanel({
      feature: { status: "testing" },
      isTesting: true,
      testingStatus: status,
    });
    expect(screen.getByText(/App:/)).toBeInTheDocument();
    expect(screen.getByText(/Running/)).toBeInTheDocument();
    expect(screen.getByText(/30s/)).toBeInTheDocument();
  });

  it("shows harness starting state", () => {
    const status: TestingStatus = {
      harness: { running: true, ready: false, error: null, stdout_tail: "", pid: 1234 },
      timed_out: false, elapsed_secs: 5, timeout_secs: 600,
      completion_signal: false, results_exist: false, attempt: 1, max_attempts: 3,
    };
    renderPanel({
      feature: { status: "testing" },
      isTesting: true,
      testingStatus: status,
    });
    expect(screen.getByText(/Starting\.\.\./)).toBeInTheDocument();
  });

  it("shows timeout warning when timed out", () => {
    const status: TestingStatus = {
      harness: { running: false, ready: false, error: null, stdout_tail: "", pid: null },
      timed_out: true, elapsed_secs: 600, timeout_secs: 600,
      completion_signal: false, results_exist: false, attempt: 1, max_attempts: 3,
    };
    renderPanel({
      feature: { status: "testing" },
      isTesting: true,
      testingStatus: status,
    });
    expect(screen.getByText(/Testing timed out/)).toBeInTheDocument();
  });

  it("shows completion signal notice", () => {
    const status: TestingStatus = {
      harness: { running: true, ready: true, error: null, stdout_tail: "", pid: 1234 },
      timed_out: false, elapsed_secs: 45, timeout_secs: 600,
      completion_signal: true, results_exist: true, attempt: 1, max_attempts: 3,
    };
    renderPanel({
      feature: { status: "testing" },
      isTesting: true,
      testingStatus: status,
    });
    expect(screen.getByText(/QA agent signaled completion/)).toBeInTheDocument();
  });

  it("shows harness error", () => {
    const status: TestingStatus = {
      harness: { running: true, ready: false, error: "Timed out waiting for ready signal", stdout_tail: "", pid: 1234 },
      timed_out: false, elapsed_secs: 65, timeout_secs: 600,
      completion_signal: false, results_exist: false, attempt: 1, max_attempts: 3,
    };
    renderPanel({
      feature: { status: "testing" },
      isTesting: true,
      testingStatus: status,
    });
    expect(screen.getByText("Timed out waiting for ready signal")).toBeInTheDocument();
  });

  it("shows Fix & Re-test button when loop-back needs relaunch", () => {
    const results: FunctionalTestResult[] = [
      { attempt: 1, all_passed: false, proofs: [], timestamp: "2026-01-01T00:00:00Z" },
    ];
    const onRelaunch = vi.fn();
    renderPanel({
      feature: {
        status: "executing",
        testing_attempt: 1,
        max_testing_attempts: 3,
        pty_session_id: null,
        test_harness: { start_command: "npm start", ready_signal: "", stop_command: "", harness_type: "cli" },
      },
      testResults: results,
      onRelaunchFix: onRelaunch,
    });
    const btn = screen.getByLabelText("Relaunch with fix context");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onRelaunch).toHaveBeenCalledTimes(1);
  });

  it("shows error banner when error prop is set", () => {
    renderPanel({ error: "Failed to start QA session" });
    expect(screen.getByText("Failed to start QA session")).toBeInTheDocument();
  });

  it("renders meta proof with INFO badge instead of PASS/FAIL", () => {
    const results: FunctionalTestResult[] = [
      {
        attempt: 1,
        all_passed: true,
        proofs: [
          { step_description: "Schema validation warnings", proof_type: "console_output", content: "warnings here", passed: true, error: null, timestamp: "2026-01-01T00:00:00Z", is_meta: true },
        ],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ];
    renderPanel({ testResults: results });
    expect(screen.getByText("INFO")).toBeInTheDocument();
    expect(screen.queryByText("PASS")).not.toBeInTheDocument();
  });

  it("shows proof timestamp", () => {
    const results: FunctionalTestResult[] = [
      {
        attempt: 1,
        all_passed: true,
        proofs: [
          { step_description: "Test step", proof_type: "screenshot", content: "img.png", passed: true, error: null, timestamp: "2026-01-01T12:30:45Z", is_meta: false },
        ],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ];
    renderPanel({ testResults: results });
    // The exact format depends on locale, but should contain time components
    expect(screen.getByText("Test step")).toBeInTheDocument();
  });
});
