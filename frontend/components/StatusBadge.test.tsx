import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("applies the correct CSS class for the status", () => {
    const { container } = render(<StatusBadge status="running" />);
    const badge = container.querySelector(".status-badge");
    expect(badge).toHaveClass("running");
  });

  it("renders a status dot element", () => {
    const { container } = render(<StatusBadge status="completed" />);
    expect(container.querySelector(".status-dot")).toBeInTheDocument();
  });

  it.each(["pending", "running", "completed", "merged", "failed"] as const)(
    "renders correctly for status: %s",
    (status) => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    },
  );
});
