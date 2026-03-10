import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(<StatusBadge status="ideation" />);
    expect(screen.getByText("ideation")).toBeInTheDocument();
  });

  it("applies the correct CSS class for the status", () => {
    const { container } = render(<StatusBadge status="executing" />);
    const badge = container.querySelector(".status-badge");
    expect(badge).toHaveClass("running");
  });

  it("renders a status dot element", () => {
    const { container } = render(<StatusBadge status="ready" />);
    expect(container.querySelector(".status-dot")).toBeInTheDocument();
  });

  it("applies the correct CSS class for testing status", () => {
    const { container } = render(<StatusBadge status="testing" />);
    const badge = container.querySelector(".status-badge");
    expect(badge).toHaveClass("testing");
  });

  it.each([
    "ideation",
    "configuring",
    "executing",
    "testing",
    "ready",
    "failed",
  ] as const)(
    "renders correctly for status: %s",
    (status) => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    },
  );
});
