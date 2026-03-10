import { render, screen, fireEvent } from "@testing-library/react";
import { TestingPanel } from "./TestingPanel";
import type { Feature, FunctionalTestResult } from "../../types";

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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const noop = () => {};

describe("TestingPanel", () => {
  it("shows no-harness message when test_harness is null", () => {
    render(
      <TestingPanel
        feature={makeFeature()}
        isTesting={false}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(
      screen.getByText(/No test harness configured/),
    ).toBeInTheDocument();
  });

  it("shows harness info when test_harness is set", () => {
    const feature = makeFeature({
      test_harness: {
        start_command: "npm run dev",
        ready_signal: "ready on port 3000",
        stop_command: "kill $PID",
        harness_type: "browser",
      },
    });
    render(
      <TestingPanel
        feature={feature}
        isTesting={false}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(screen.getByText("Test Harness")).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    expect(screen.getByText("ready on port 3000")).toBeInTheDocument();
    expect(screen.getByText("browser")).toBeInTheDocument();
  });

  it("shows test steps when functional_test_steps are provided", () => {
    const feature = makeFeature({
      test_harness: {
        start_command: "npm start",
        ready_signal: "",
        stop_command: "",
        harness_type: "api",
      },
      functional_test_steps: [
        { description: "Login with valid creds", tool: "playwright", agent: "qa-goblin" },
        { description: "Check dashboard loads", tool: "playwright", agent: "qa-goblin" },
      ],
    });
    render(
      <TestingPanel
        feature={feature}
        isTesting={false}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(screen.getByText("Test Steps (2)")).toBeInTheDocument();
    expect(screen.getByText("Login with valid creds")).toBeInTheDocument();
    expect(screen.getByText("Check dashboard loads")).toBeInTheDocument();
  });

  it("shows Run QA button when harness exists and not testing", () => {
    const feature = makeFeature({
      test_harness: {
        start_command: "npm start",
        ready_signal: "",
        stop_command: "",
        harness_type: "cli",
      },
    });
    render(
      <TestingPanel
        feature={feature}
        isTesting={false}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(screen.getByLabelText("Start functional testing")).toBeInTheDocument();
    expect(screen.getByText("Run QA")).toBeInTheDocument();
  });

  it("calls onStartTesting when Run QA is clicked", () => {
    const onStart = vi.fn();
    const feature = makeFeature({
      test_harness: {
        start_command: "npm start",
        ready_signal: "",
        stop_command: "",
        harness_type: "cli",
      },
    });
    render(
      <TestingPanel
        feature={feature}
        isTesting={false}
        testResults={[]}
        onStartTesting={onStart}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    fireEvent.click(screen.getByText("Run QA"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows Starting... when startingTest is true", () => {
    const feature = makeFeature({
      test_harness: {
        start_command: "npm start",
        ready_signal: "",
        stop_command: "",
        harness_type: "cli",
      },
    });
    render(
      <TestingPanel
        feature={feature}
        isTesting={false}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={true}
        completingTest={false}
      />,
    );
    expect(screen.getByText("Starting...")).toBeInTheDocument();
  });

  it("shows Collect Results button when testing is in progress", () => {
    const feature = makeFeature({ status: "testing" });
    render(
      <TestingPanel
        feature={feature}
        isTesting={true}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(screen.getByLabelText("Complete functional testing")).toBeInTheDocument();
    expect(screen.getByText("Collect Results")).toBeInTheDocument();
  });

  it("calls onCompleteTesting when Collect Results is clicked", () => {
    const onComplete = vi.fn();
    const feature = makeFeature({ status: "testing" });
    render(
      <TestingPanel
        feature={feature}
        isTesting={true}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={onComplete}
        startingTest={false}
        completingTest={false}
      />,
    );
    fireEvent.click(screen.getByText("Collect Results"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows Skip button and calls onSkipTesting", () => {
    const onSkip = vi.fn();
    render(
      <TestingPanel
        feature={makeFeature()}
        isTesting={false}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={onSkip}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    const skipBtn = screen.getByLabelText("Skip functional testing");
    fireEvent.click(skipBtn);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("shows skipped notice when testing_skipped is true", () => {
    const feature = makeFeature({ testing_skipped: true });
    render(
      <TestingPanel
        feature={feature}
        isTesting={false}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(
      screen.getByText("Functional testing was skipped for this feature."),
    ).toBeInTheDocument();
  });

  it("shows testing in-progress spinner when isTesting", () => {
    const feature = makeFeature({ status: "testing" });
    render(
      <TestingPanel
        feature={feature}
        isTesting={true}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(
      screen.getByText("QA goblin is exercising the feature..."),
    ).toBeInTheDocument();
  });

  it("renders test results with proofs", () => {
    const results: FunctionalTestResult[] = [
      {
        attempt: 1,
        all_passed: false,
        proofs: [
          {
            step_description: "Login page loads",
            proof_type: "screenshot",
            content: "base64data",
            passed: true,
            error: null,
            timestamp: "2026-01-01T00:00:00Z",
          },
          {
            step_description: "Submit form",
            proof_type: "api_response",
            content: '{"ok": true}',
            passed: false,
            error: "Expected 200 got 500",
            timestamp: "2026-01-01T00:00:00Z",
          },
        ],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ];
    render(
      <TestingPanel
        feature={makeFeature()}
        isTesting={false}
        testResults={results}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
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
        attempt: 1,
        all_passed: true,
        proofs: [
          {
            step_description: "Check response",
            proof_type: "api_response",
            content: "ok",
            passed: true,
            error: null,
            timestamp: "2026-01-01T00:00:00Z",
          },
        ],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ];
    render(
      <TestingPanel
        feature={makeFeature()}
        isTesting={false}
        testResults={results}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(screen.getByText("All passed")).toBeInTheDocument();
    expect(screen.getByText("1 proof")).toBeInTheDocument();
  });

  it("shows attempt label when testing_attempt > 0", () => {
    const feature = makeFeature({
      testing_attempt: 2,
      max_testing_attempts: 3,
    });
    render(
      <TestingPanel
        feature={feature}
        isTesting={false}
        testResults={[]}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(screen.getByText("Attempt 2/3")).toBeInTheDocument();
  });

  it("shows loop feedback when tests failed and attempts remain", () => {
    const results: FunctionalTestResult[] = [
      {
        attempt: 1,
        all_passed: false,
        proofs: [],
        timestamp: "2026-01-01T00:00:00Z",
      },
    ];
    const feature = makeFeature({
      status: "executing",
      testing_attempt: 1,
      max_testing_attempts: 3,
    });
    render(
      <TestingPanel
        feature={feature}
        isTesting={false}
        testResults={results}
        onStartTesting={noop}
        onSkipTesting={noop}
        onCompleteTesting={noop}
        startingTest={false}
        completingTest={false}
      />,
    );
    expect(
      screen.getByText(/QA found issues/),
    ).toBeInTheDocument();
  });
});
