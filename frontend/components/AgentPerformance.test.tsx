import { render, screen } from "@testing-library/react";
import { AgentPerformanceBar, AgentPerformanceDetail } from "./AgentPerformance";
import type { AgentPerformanceSummary } from "../types";

const mockSummary: AgentPerformanceSummary = {
  agent: "frontend-dev",
  total_tasks: 10,
  successful_tasks: 8,
  success_rate: 0.8,
  top_categories: [
    { category: "frontend", count: 6, success_count: 5 },
    { category: "testing", count: 3, success_count: 2 },
    { category: "backend", count: 1, success_count: 1 },
  ],
  avg_duration_secs: 3600,
  last_active: "2026-03-20T12:00:00Z",
  feature_count: 3,
};

describe("AgentPerformanceBar", () => {
  it("renders nothing when summary is undefined", () => {
    const { container } = render(<AgentPerformanceBar summary={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when feature_count is 0", () => {
    const empty: AgentPerformanceSummary = {
      ...mockSummary,
      feature_count: 0,
    };
    const { container } = render(<AgentPerformanceBar summary={empty} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders feature count with plural", () => {
    render(<AgentPerformanceBar summary={mockSummary} />);
    expect(screen.getByText("Used in 3 features")).toBeInTheDocument();
  });

  it("renders singular for 1 feature", () => {
    const single: AgentPerformanceSummary = {
      ...mockSummary,
      feature_count: 1,
    };
    render(<AgentPerformanceBar summary={single} />);
    expect(screen.getByText("Used in 1 feature")).toBeInTheDocument();
  });
});

describe("AgentPerformanceDetail", () => {
  it("renders stat blocks", () => {
    render(<AgentPerformanceDetail summary={mockSummary} />);
    expect(screen.getByText("10")).toBeInTheDocument(); // Total Tasks
    expect(screen.getByText("8")).toBeInTheDocument(); // Succeeded
    expect(screen.getByText("80%")).toBeInTheDocument(); // Success Rate
  });

  it("renders formatted duration", () => {
    render(<AgentPerformanceDetail summary={mockSummary} />);
    expect(screen.getByText("1h 0m")).toBeInTheDocument();
  });

  it("renders category list", () => {
    render(<AgentPerformanceDetail summary={mockSummary} />);
    expect(screen.getByText("frontend")).toBeInTheDocument();
  });

  it("renders last active date", () => {
    render(<AgentPerformanceDetail summary={mockSummary} />);
    expect(screen.getByText(/Last active:/)).toBeInTheDocument();
  });

  it("omits duration when not available", () => {
    const noDuration: AgentPerformanceSummary = {
      ...mockSummary,
      avg_duration_secs: null,
    };
    render(<AgentPerformanceDetail summary={noDuration} />);
    expect(screen.queryByText("Avg Duration")).not.toBeInTheDocument();
  });
});
