import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import {
  CommandDisplay,
  useCommandDisplay,
  CommandDisplayButton,
  CommandDisplayContent,
} from "./CommandDisplay";

describe("CommandDisplay", () => {
  it("renders nothing when command is null", () => {
    const { container } = render(<CommandDisplay command={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a View Command button when command is provided", () => {
    render(<CommandDisplay command="echo hello" />);
    expect(screen.getByText("View Command")).toBeInTheDocument();
  });

  it("does not show the command initially", () => {
    render(<CommandDisplay command="echo hello" />);
    expect(screen.queryByText("echo hello")).not.toBeInTheDocument();
  });

  it("shows the command when button is clicked", () => {
    render(<CommandDisplay command="echo hello" />);
    fireEvent.click(screen.getByText("View Command"));
    expect(screen.getByText("echo hello")).toBeInTheDocument();
    expect(screen.getByText("Hide Command")).toBeInTheDocument();
  });

  it("hides the command when button is clicked again", () => {
    render(<CommandDisplay command="echo hello" />);
    fireEvent.click(screen.getByText("View Command"));
    expect(screen.getByText("echo hello")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hide Command"));
    expect(screen.queryByText("echo hello")).not.toBeInTheDocument();
  });

  it("uses custom label", () => {
    render(<CommandDisplay command="echo hello" label="Show It" />);
    expect(screen.getByText("Show It")).toBeInTheDocument();
  });
});

describe("useCommandDisplay", () => {
  it("returns initial state with show=false", () => {
    const { result } = renderHook(() => useCommandDisplay("echo test"));
    expect(result.current.show).toBe(false);
    expect(result.current.command).toBe("echo test");
  });

  it("toggles show state", () => {
    const { result } = renderHook(() => useCommandDisplay("echo test"));
    act(() => result.current.toggle());
    expect(result.current.show).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.show).toBe(false);
  });
});

describe("CommandDisplayButton", () => {
  it("renders nothing when command is null", () => {
    const { container } = render(
      <CommandDisplayButton show={false} toggle={() => {}} command={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders View Command when not showing", () => {
    render(
      <CommandDisplayButton show={false} toggle={() => {}} command="echo hi" />,
    );
    expect(screen.getByText("View Command")).toBeInTheDocument();
  });

  it("renders Hide Command when showing", () => {
    render(
      <CommandDisplayButton show={true} toggle={() => {}} command="echo hi" />,
    );
    expect(screen.getByText("Hide Command")).toBeInTheDocument();
  });

  it("calls toggle on click", () => {
    const toggle = vi.fn();
    render(
      <CommandDisplayButton show={false} toggle={toggle} command="echo hi" />,
    );
    fireEvent.click(screen.getByText("View Command"));
    expect(toggle).toHaveBeenCalledOnce();
  });
});

describe("CommandDisplayContent", () => {
  it("renders nothing when show is false", () => {
    const { container } = render(
      <CommandDisplayContent show={false} command="echo hi" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when command is null", () => {
    const { container } = render(
      <CommandDisplayContent show={true} command={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the command when show is true and command exists", () => {
    render(<CommandDisplayContent show={true} command="echo hi" />);
    expect(screen.getByText("echo hi")).toBeInTheDocument();
  });
});
