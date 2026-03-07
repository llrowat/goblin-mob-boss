import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";

// Mock Terminal component (xterm.js doesn't work in jsdom)
vi.mock("./Terminal", () => ({
  Terminal: ({ onExit }: { sessionId: string; onExit: () => void }) => (
    <div data-testid="mock-terminal">
      <button onClick={onExit}>exit</button>
    </div>
  ),
}));

// Mock useTerminalSession
const mockClearSession = vi.fn();
let mockSession: { featureId: string; sessionId: string } | null = null;
vi.mock("../hooks/useTerminalSession", () => ({
  useTerminalSession: () => ({
    session: mockSession,
    startSession: vi.fn(),
    clearSession: mockClearSession,
  }),
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
let mockPathname = "/feature/f1/detail";
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mockPathname }),
  useNavigate: () => mockNavigate,
}));

import { PersistentTerminal } from "./PersistentTerminal";

const mockedInvoke = vi.mocked(invoke);

describe("PersistentTerminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { featureId: "f1", sessionId: "pty-1" };
    mockPathname = "/feature/f1/detail";
    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders nothing when no session", () => {
    mockSession = null;
    const { container } = render(<PersistentTerminal />);
    expect(container.innerHTML).toBe("");
  });

  it("shows execution section with cancel button on detail page", () => {
    render(<PersistentTerminal />);
    expect(screen.getByText("Execution")).toBeInTheDocument();
    expect(screen.getByText("Cancel Execution")).toBeInTheDocument();
    expect(screen.getByTestId("mock-terminal")).toBeInTheDocument();
  });

  it("is hidden on other pages", () => {
    mockPathname = "/";
    render(<PersistentTerminal />);
    const container = screen.getByText("Execution").closest(".persistent-terminal-inline");
    expect(container).toHaveStyle({ display: "none" });
  });

  it("calls cancel_execution and clears session on cancel", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    render(<PersistentTerminal />);

    await userEvent.click(screen.getByText("Cancel Execution"));

    expect(mockedInvoke).toHaveBeenCalledWith("cancel_execution", {
      featureId: "f1",
    });
    expect(mockClearSession).toHaveBeenCalled();
  });

  it("calls mark_feature_ready on terminal exit", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    render(<PersistentTerminal />);

    await userEvent.click(screen.getByText("exit"));

    expect(mockedInvoke).toHaveBeenCalledWith("mark_feature_ready", {
      featureId: "f1",
    });
    expect(mockClearSession).toHaveBeenCalled();
  });
});
