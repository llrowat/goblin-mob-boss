import { render, screen } from "@testing-library/react";
import { ActivityLog, toDisplayEntries } from "./ActivityLog";
import type { ActivityEntry } from "../types";

describe("toDisplayEntries", () => {
  it("converts backend entries to display entries with ids", () => {
    const raw: ActivityEntry[] = [
      { message: "Feature created", type: "info", timestamp: "2026-01-01T00:00:00Z" },
      { message: "Execution started", type: "info", timestamp: "2026-01-01T01:00:00Z" },
    ];
    const entries = toDisplayEntries(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe("act-0");
    expect(entries[0].message).toBe("Feature created");
    expect(entries[0].type).toBe("info");
    expect(entries[1].id).toBe("act-1");
    expect(entries[1].message).toBe("Execution started");
  });

  it("returns empty array for empty input", () => {
    expect(toDisplayEntries([])).toHaveLength(0);
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
    const timeElements = document.querySelectorAll(".activity-time");
    expect(timeElements.length).toBe(1);
  });
});
