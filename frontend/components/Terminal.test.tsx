import { render, cleanup } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "./Terminal";

// Mock xterm.js with proper class constructors
const mockWrite = vi.fn();
const mockDispose = vi.fn();
const mockOpen = vi.fn();
const mockLoadAddon = vi.fn();
const mockOnData = vi.fn(() => ({ dispose: vi.fn() }));

vi.mock("@xterm/xterm", () => {
  return {
    Terminal: class MockTerminal {
      cols = 80;
      rows = 24;
      open = mockOpen;
      write = mockWrite;
      onData = mockOnData;
      dispose = mockDispose;
      loadAddon = mockLoadAddon;
    },
  };
});

vi.mock("@xterm/addon-fit", () => {
  return {
    FitAddon: class MockFitAddon {
      fit = vi.fn();
    },
  };
});

// CSS import is a no-op in test
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

describe("Terminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("renders a terminal container", () => {
    const { container } = render(<Terminal sessionId="test-session" />);
    expect(container.querySelector(".terminal-container")).toBeInTheDocument();
  });

  it("opens xterm terminal on mount", () => {
    render(<Terminal sessionId="test-session" />);
    expect(mockOpen).toHaveBeenCalled();
  });

  it("sends initial resize to backend", () => {
    render(<Terminal sessionId="test-session" />);
    expect(invoke).toHaveBeenCalledWith("resize_pty", {
      sessionId: "test-session",
      cols: 80,
      rows: 24,
    });
  });

  it("registers onData handler for user input", () => {
    render(<Terminal sessionId="test-session" />);
    expect(mockOnData).toHaveBeenCalled();
  });

  it("disposes terminal on unmount", () => {
    const { unmount } = render(<Terminal sessionId="test-session" />);
    unmount();
    expect(mockDispose).toHaveBeenCalled();
  });
});
