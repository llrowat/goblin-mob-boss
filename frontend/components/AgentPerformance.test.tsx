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
};

describe("AgentPerformanceBar", () => {
  it("shows 'No track record' when summary is undefined", () => {
    render(<AgentPerformanceBar summary={undefined} />);
    expect(screen.getByText("No track record yet")).toBeInTheDocument();
  });

  it("shows 'No track record' when total_tasks is 0", () => {
    const empty: AgentPerformanceSummary = {
      ...mockSummary,
      total_tasks: 0,
      successful_tasks: 0,
      success_rate: 0,
      top_categories: [],
    };
    render(<AgentPerformanceBar summary={empty} />);
    expect(screen.getByText("No track record yet")).toBeInTheDocument();
  });

  it("renders task count and success rate", () => {
    render(<AgentPerformanceBar summary={mockSummary} />);
    expect(screen.getByText("8/10 tasks")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("renders category tags", () => {
    render(<AgentPerformanceBar summary={mockSummary} />);
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("testing")).toBeInTheDocument();
  });

  it("limits category tags to 3", () => {
    render(<AgentPerformanceBar summary={mockSummary} />);
    // 3 categories exist, all should show (limit is 3)
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("testing")).toBeInTheDocument();
    expect(screen.getByText("backend")).toBeInTheDocument();
  });

  it("applies success color for high success rate", () => {
    const highSuccess: AgentPerformanceSummary = {
      ...mockSummary,
      success_rate: 0.9,
    };
    render(<AgentPerformanceBar summary={highSuccess} />);
    const rate = screen.getByText("90%");
    expect(rate.style.color).toBe("var(--success)");
  });

  it("applies warning color for moderate success rate", () => {
    const moderate: AgentPerformanceSummary = {
      ...mockSummary,
      success_rate: 0.6,
    };
    render(<AgentPerformanceBar summary={moderate} />);
    const rate = screen.getByText("60%");
    expect(rate.style.color).toBe("var(--warning)");
  });

  it("applies danger color for low success rate", () => {
    const low: AgentPerformanceSummary = {
      ...mockSummary,
      success_rate: 0.3,
    };
    render(<AgentPerformanceBar summary={low} />);
    const rate = screen.getByText("30%");
    expect(rate.style.color).toBe("var(--danger)");
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
