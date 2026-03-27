import { render, screen, fireEvent } from "@testing-library/react";
import { ContextualHelp, HELP_CONTENT } from "./ContextualHelp";

describe("ContextualHelp", () => {
  it("renders the toggle button with default title", () => {
    render(
      <ContextualHelp>
        <p>Help content</p>
      </ContextualHelp>,
    );
    expect(screen.getByText("What is this?")).toBeInTheDocument();
  });

  it("renders with a custom title", () => {
    render(
      <ContextualHelp title="How do agents work?">
        <p>Help content</p>
      </ContextualHelp>,
    );
    expect(screen.getByText("How do agents work?")).toBeInTheDocument();
  });

  it("does not show content by default", () => {
    render(
      <ContextualHelp>
        <p>Hidden help</p>
      </ContextualHelp>,
    );
    expect(screen.queryByText("Hidden help")).not.toBeInTheDocument();
  });

  it("shows content when toggle is clicked", () => {
    render(
      <ContextualHelp>
        <p>Visible help</p>
      </ContextualHelp>,
    );
    fireEvent.click(screen.getByText("What is this?"));
    expect(screen.getByText("Visible help")).toBeInTheDocument();
  });

  it("hides content when toggle is clicked again", () => {
    render(
      <ContextualHelp>
        <p>Toggle help</p>
      </ContextualHelp>,
    );
    const toggle = screen.getByText("What is this?");
    fireEvent.click(toggle);
    expect(screen.getByText("Toggle help")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("Toggle help")).not.toBeInTheDocument();
  });

  it("sets aria-expanded correctly", () => {
    render(
      <ContextualHelp>
        <p>Content</p>
      </ContextualHelp>,
    );
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the question mark icon", () => {
    render(
      <ContextualHelp>
        <p>Content</p>
      </ContextualHelp>,
    );
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("HELP_CONTENT", () => {
  it("has content for execution modes", () => {
    render(<div>{HELP_CONTENT.executionModes}</div>);
    expect(screen.getByText(/Agent Teams/)).toBeInTheDocument();
    expect(screen.getByText(/Subagents/)).toBeInTheDocument();
  });

  it("has content for agents", () => {
    render(<div>{HELP_CONTENT.agents}</div>);
    expect(screen.getByText(/system prompt/)).toBeInTheDocument();
  });

  it("has content for validators", () => {
    render(<div>{HELP_CONTENT.validators}</div>);
    expect(screen.getByText(/shell commands/)).toBeInTheDocument();
  });

  it("has content for planning", () => {
    render(<div>{HELP_CONTENT.planning}</div>);
    expect(screen.getByText(/planning phase/)).toBeInTheDocument();
  });
});
