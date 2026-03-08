import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanHistory } from "./PlanningComponents";
import type { PlanSnapshot } from "../../types";

describe("PlanHistory", () => {
  const mockSnapshots: PlanSnapshot[] = [
    {
      trigger: "revision",
      feedback: "Split the auth task",
      tasks: [
        {
          title: "Add auth module",
          description: "Build authentication",
          acceptance_criteria: ["Login works"],
          dependencies: [],
          agent: "backend-dev",
        },
      ],
      execution_mode: {
        recommended: "teams",
        rationale: "Parallel tasks",
        confidence: 0.85,
      },
      created_at: "2026-03-01T10:30:00Z",
    },
    {
      trigger: "restart",
      feedback: null,
      tasks: [
        {
          title: "Add login",
          description: "Login form",
          acceptance_criteria: [],
          dependencies: [],
          agent: "frontend-dev",
        },
        {
          title: "Add registration",
          description: "Registration form",
          acceptance_criteria: [],
          dependencies: [],
          agent: "frontend-dev",
        },
      ],
      execution_mode: null,
      created_at: "2026-03-01T11:00:00Z",
    },
  ];

  it("renders nothing when snapshots are empty", () => {
    const { container } = render(<PlanHistory snapshots={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows plan history header with count", () => {
    render(<PlanHistory snapshots={mockSnapshots} />);
    expect(screen.getByText(/Plan History \(2 prior versions\)/)).toBeInTheDocument();
  });

  it("shows singular version text for single snapshot", () => {
    render(<PlanHistory snapshots={[mockSnapshots[0]]} />);
    expect(screen.getByText(/Plan History \(1 prior version\)/)).toBeInTheDocument();
  });

  it("shows version labels and trigger types", () => {
    render(<PlanHistory snapshots={mockSnapshots} />);
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("Revised")).toBeInTheDocument();
    expect(screen.getByText("Restarted")).toBeInTheDocument();
  });

  it("shows task count for each snapshot", () => {
    render(<PlanHistory snapshots={mockSnapshots} />);
    expect(screen.getByText("1 task")).toBeInTheDocument();
    expect(screen.getByText("2 tasks")).toBeInTheDocument();
  });

  it("expands a snapshot on click to show tasks", async () => {
    render(<PlanHistory snapshots={mockSnapshots} />);

    // Tasks should not be visible initially
    expect(screen.queryByText("Add auth module")).not.toBeInTheDocument();

    // Click v1 to expand
    await userEvent.click(screen.getByLabelText("Plan version 1"));

    expect(screen.getByText("Add auth module")).toBeInTheDocument();
    expect(screen.getByText("TASK-1")).toBeInTheDocument();
    expect(screen.getByText("backend-dev")).toBeInTheDocument();
  });

  it("shows feedback when expanded and feedback exists", async () => {
    render(<PlanHistory snapshots={mockSnapshots} />);

    await userEvent.click(screen.getByLabelText("Plan version 1"));

    expect(screen.getByText(/Split the auth task/)).toBeInTheDocument();
  });

  it("shows execution mode when expanded", async () => {
    render(<PlanHistory snapshots={mockSnapshots} />);

    await userEvent.click(screen.getByLabelText("Plan version 1"));

    expect(screen.getByText(/Mode: teams \(85% confidence\)/)).toBeInTheDocument();
  });

  it("collapses an expanded snapshot on second click", async () => {
    render(<PlanHistory snapshots={mockSnapshots} />);

    await userEvent.click(screen.getByLabelText("Plan version 1"));
    expect(screen.getByText("Add auth module")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Plan version 1"));
    expect(screen.queryByText("Add auth module")).not.toBeInTheDocument();
  });

  it("expands different snapshot when clicking another version", async () => {
    render(<PlanHistory snapshots={mockSnapshots} />);

    // Expand v1
    await userEvent.click(screen.getByLabelText("Plan version 1"));
    expect(screen.getByText("Add auth module")).toBeInTheDocument();

    // Click v2 — should collapse v1 and expand v2
    await userEvent.click(screen.getByLabelText("Plan version 2"));
    expect(screen.queryByText("Add auth module")).not.toBeInTheDocument();
    expect(screen.getByText("Add login")).toBeInTheDocument();
    expect(screen.getByText("Add registration")).toBeInTheDocument();
  });

  it("does not show feedback section when feedback is null", async () => {
    render(<PlanHistory snapshots={[mockSnapshots[1]]} />);

    await userEvent.click(screen.getByLabelText("Plan version 1"));

    // Should not have feedback text
    expect(screen.queryByText(/Feedback:/)).not.toBeInTheDocument();
  });
});
