import { render, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { BackgroundPlanningProvider, useBackgroundPlanning } from "./useBackgroundPlanning";

const mockedInvoke = vi.mocked(invoke);

function TestConsumer({ onRender }: { onRender: (state: ReturnType<typeof useBackgroundPlanning>) => void }) {
  const state = useBackgroundPlanning();
  onRender(state);
  return null;
}

describe("useBackgroundPlanning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockedInvoke.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with zero counts", async () => {
    let captured: ReturnType<typeof useBackgroundPlanning> | null = null;

    render(
      <BackgroundPlanningProvider>
        <TestConsumer onRender={(s) => { captured = s; }} />
      </BackgroundPlanningProvider>,
    );

    expect(captured!.planningCount).toBe(0);
    expect(captured!.executingCount).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  });

  it("increments planningCount when addPlanning is called", async () => {
    let captured: ReturnType<typeof useBackgroundPlanning> | null = null;

    render(
      <BackgroundPlanningProvider>
        <TestConsumer onRender={(s) => { captured = s; }} />
      </BackgroundPlanningProvider>,
    );

    await act(async () => {
      captured!.addPlanning("f1");
    });

    expect(captured!.planningCount).toBe(1);
    expect(captured!.isPlanning("f1")).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  });

  it("tracks multiple planning features", async () => {
    let captured: ReturnType<typeof useBackgroundPlanning> | null = null;

    render(
      <BackgroundPlanningProvider>
        <TestConsumer onRender={(s) => { captured = s; }} />
      </BackgroundPlanningProvider>,
    );

    await act(async () => {
      captured!.addPlanning("f1");
      captured!.addPlanning("f2");
    });

    expect(captured!.planningCount).toBe(2);
    expect(captured!.isPlanning("f1")).toBe(true);
    expect(captured!.isPlanning("f2")).toBe(true);
    expect(captured!.isPlanning("f3")).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  });

  it("does not double-count the same feature", async () => {
    let captured: ReturnType<typeof useBackgroundPlanning> | null = null;

    render(
      <BackgroundPlanningProvider>
        <TestConsumer onRender={(s) => { captured = s; }} />
      </BackgroundPlanningProvider>,
    );

    await act(async () => {
      captured!.addPlanning("f1");
      captured!.addPlanning("f1");
    });

    expect(captured!.planningCount).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  });

  it("updates executingCount from polled features", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_features") {
        return [
          { id: "f1", status: "executing", task_specs: [] },
          { id: "f2", status: "executing", task_specs: [] },
          { id: "f3", status: "ideation", task_specs: [] },
        ];
      }
      return { tasks: [], execution_mode: null };
    });

    let captured: ReturnType<typeof useBackgroundPlanning> | null = null;

    render(
      <BackgroundPlanningProvider>
        <TestConsumer onRender={(s) => { captured = s; }} />
      </BackgroundPlanningProvider>,
    );

    // Initial poll fires on mount
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(captured!.executingCount).toBe(2);
  });

  it("removes planning feature when plan is found", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_features") {
        return [{ id: "f1", status: "ideation", task_specs: [] }];
      }
      if (cmd === "poll_ideation_result") {
        return {
          tasks: [{ title: "Task 1", description: "desc", acceptance_criteria: [], dependencies: [], agent: "" }],
          execution_mode: null,
        };
      }
      return undefined;
    });

    let captured: ReturnType<typeof useBackgroundPlanning> | null = null;

    render(
      <BackgroundPlanningProvider>
        <TestConsumer onRender={(s) => { captured = s; }} />
      </BackgroundPlanningProvider>,
    );

    await act(async () => {
      captured!.addPlanning("f1");
    });

    expect(captured!.planningCount).toBe(1);

    // Advance timer to trigger poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(captured!.planningCount).toBe(0);
    expect(captured!.isPlanning("f1")).toBe(false);
  });

  it("stores completed plan result for consumption", async () => {
    const mockPlan = {
      tasks: [{ title: "Task 1", description: "desc", acceptance_criteria: [], dependencies: [], agent: "" }],
      execution_mode: null,
    };

    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_features") {
        return [{ id: "f1", status: "ideation", task_specs: [] }];
      }
      if (cmd === "poll_ideation_result") return mockPlan;
      return undefined;
    });

    let captured: ReturnType<typeof useBackgroundPlanning> | null = null;

    render(
      <BackgroundPlanningProvider>
        <TestConsumer onRender={(s) => { captured = s; }} />
      </BackgroundPlanningProvider>,
    );

    await act(async () => {
      captured!.addPlanning("f1");
    });

    // Advance timer to trigger poll and plan discovery
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    // Plan should be available for consumption
    let plan: ReturnType<typeof captured.consumePlan> = null;
    act(() => {
      plan = captured!.consumePlan("f1");
    });
    expect(plan).not.toBeNull();
    expect(plan!.tasks).toHaveLength(1);
    expect(plan!.tasks[0].title).toBe("Task 1");
  });

  it("consumePlan returns null for unknown feature", async () => {
    let captured: ReturnType<typeof useBackgroundPlanning> | null = null;

    render(
      <BackgroundPlanningProvider>
        <TestConsumer onRender={(s) => { captured = s; }} />
      </BackgroundPlanningProvider>,
    );

    expect(captured!.consumePlan("nonexistent")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  });

  it("removes planning feature if it is no longer in ideation status", async () => {
    let featureStatus = "ideation";
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_features") {
        return [{ id: "f1", status: featureStatus, task_specs: [] }];
      }
      if (cmd === "poll_ideation_result") {
        return { tasks: [], execution_mode: null };
      }
      return undefined;
    });

    let captured: ReturnType<typeof useBackgroundPlanning> | null = null;

    render(
      <BackgroundPlanningProvider>
        <TestConsumer onRender={(s) => { captured = s; }} />
      </BackgroundPlanningProvider>,
    );

    await act(async () => {
      captured!.addPlanning("f1");
    });

    expect(captured!.planningCount).toBe(1);

    // Feature transitions to executing
    featureStatus = "executing";

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(captured!.planningCount).toBe(0);
    expect(captured!.isPlanning("f1")).toBe(false);
  });
});
