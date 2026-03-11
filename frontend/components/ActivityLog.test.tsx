import { render, screen } from "@testing-library/react";
import { ActivityLog, buildActivityLog } from "./ActivityLog";
import type { Feature, PlanSnapshot } from "../types";

const baseFeature: Feature = {
  id: "f1",
  repo_ids: ["r1"],
  name: "Test Feature",
  description: "A test",
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
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("buildActivityLog", () => {
  it("includes feature creation entry", () => {
    const entries = buildActivityLog(baseFeature, [], null, null, null);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toContain("Test Feature");
    expect(entries[0].type).toBe("info");
  });

  it("includes plan history entries", () => {
    const snapshots: PlanSnapshot[] = [
      {
        trigger: "start",
        feedback: null,
        tasks: [{ title: "T1", description: "", acceptance_criteria: [], dependencies: [], agent: "" }],
        execution_mode: null,
        created_at: "2026-01-01T01:00:00Z",
      },
      {
        trigger: "feedback",
        feedback: "Add more tests",
        tasks: [
          { title: "T1", description: "", acceptance_criteria: [], dependencies: [], agent: "" },
          { title: "T2", description: "", acceptance_criteria: [], dependencies: [], agent: "" },
        ],
        execution_mode: null,
        created_at: "2026-01-01T02:00:00Z",
      },
    ];

    const entries = buildActivityLog(baseFeature, snapshots, null, null, null);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.some((e) => e.message.includes("Initial plan generated"))).toBe(true);
    expect(entries.some((e) => e.message.includes("Plan revised"))).toBe(true);
    expect(entries.some((e) => e.message.includes("Add more tests"))).toBe(true);
  });

  it("includes execution launch entry", () => {
    const feature: Feature = {
      ...baseFeature,
      status: "executing",
      execution_mode: "subagents",
      launched_command: "claude --subagents",
    };

    const entries = buildActivityLog(feature, [], null, null, null);
    expect(entries.some((e) => e.message.includes("subagents mode"))).toBe(true);
  });

  it("includes ready status entry", () => {
    const feature: Feature = { ...baseFeature, status: "ready" };
    const entries = buildActivityLog(feature, [], null, null, null);
    expect(entries.some((e) => e.message.includes("marked ready"))).toBe(true);
  });

  it("includes failed status entry", () => {
    const feature: Feature = { ...baseFeature, status: "failed" };
    const entries = buildActivityLog(feature, [], null, null, null);
    expect(entries.some((e) => e.message.includes("failures"))).toBe(true);
  });

  it("includes push status entry", () => {
    const feature: Feature = {
      ...baseFeature,
      status: "pushed",
      repo_push_status: { r1: "pushed" },
    };
    const entries = buildActivityLog(feature, [], null, null, null);
    expect(entries.some((e) => e.message.includes("Pushed to 1 repo"))).toBe(true);
  });

  it("includes complete entry", () => {
    const feature: Feature = { ...baseFeature, status: "complete" };
    const entries = buildActivityLog(feature, [], null, null, null);
    expect(entries.some((e) => e.message.includes("marked complete"))).toBe(true);
  });

  it("includes validation results", () => {
    const entries = buildActivityLog(baseFeature, [], null, {
      attempt: 1,
      all_passed: true,
      results: [
        { command: "npm test", exit_code: 0, stdout: "", stderr: "", success: true },
      ],
      timestamp: "2026-01-01T03:00:00Z",
    }, null);
    expect(entries.some((e) => e.message.includes("Validators passed"))).toBe(true);
  });

  it("sorts entries chronologically", () => {
    const snapshots: PlanSnapshot[] = [
      {
        trigger: "start",
        feedback: null,
        tasks: [],
        execution_mode: null,
        created_at: "2026-01-01T02:00:00Z",
      },
    ];
    const entries = buildActivityLog(baseFeature, snapshots, null, null, null);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].timestamp >= entries[i - 1].timestamp).toBe(true);
    }
  });
});

describe("ActivityLog component", () => {
  it("renders empty state", () => {
    render(<ActivityLog entries={[]} />);
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
  });

  it("renders entries with timeline dots", () => {
    const entries = [
      { id: "1", message: "Feature created", timestamp: "2026-01-01T00:00:00Z", type: "info" as const },
      { id: "2", message: "Plan generated", timestamp: "2026-01-01T01:00:00Z", type: "success" as const },
    ];

    render(<ActivityLog entries={entries} />);
    expect(screen.getByText("Feature created")).toBeInTheDocument();
    expect(screen.getByText("Plan generated")).toBeInTheDocument();
  });

  it("renders timestamps", () => {
    const entries = [
      { id: "1", message: "Something happened", timestamp: "2026-06-15T14:30:00Z", type: "info" as const },
    ];

    render(<ActivityLog entries={entries} />);
    expect(screen.getByText("Something happened")).toBeInTheDocument();
    // Timestamp should be formatted (month + day + time)
    const timeElements = document.querySelectorAll(".activity-time");
    expect(timeElements.length).toBe(1);
  });
});
