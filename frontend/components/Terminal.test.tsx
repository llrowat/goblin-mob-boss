import { render, cleanup, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "./Terminal";

const mockWrite = vi.fn();
const mockDispose = vi.fn();
const mockOpen = vi.fn();
const mockLoadAddon = vi.fn();
const mockOnData = vi.fn(() => ({ dispose: vi.fn() }));
const mockOnResize = vi.fn(() => ({ dispose: vi.fn() }));

vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    cols = 80;
    rows = 24;
    open = mockOpen;
    write = mockWrite;
    onData = mockOnData;
    onResize = mockOnResize;
    dispose = mockDispose;
    loadAddon = mockLoadAddon;
    resize = vi.fn();
    refresh = vi.fn();
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn();
    proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
  },
}));

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

  it("registers onResize handler for PTY sync", () => {
    render(<Terminal sessionId="test-session" />);
    expect(mockOnResize).toHaveBeenCalled();
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

  it("registers pty-output and pty-exit listeners", () => {
    const mockListen = listen as ReturnType<typeof vi.fn>;
    mockListen.mockImplementation(() => Promise.resolve(() => {}));

    render(<Terminal sessionId="test-session" />);
    expect(mockListen).toHaveBeenCalledWith("pty-output", expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith("pty-exit", expect.any(Function));
  });

  it("writes pty-output data to terminal", async () => {
    let outputHandler!: (event: { payload: { seq: number; session_id: string; data: string } }) => void;
    const mockListen = listen as ReturnType<typeof vi.fn>;
    mockListen.mockImplementation((event: string, handler: typeof outputHandler) => {
      if (event === "pty-output") outputHandler = handler;
      return Promise.resolve(() => {});
    });

    render(<Terminal sessionId="test-session" />);

    outputHandler({ payload: { seq: 0, session_id: "test-session", data: "hello" } });
    expect(mockWrite).toHaveBeenCalledWith("hello");

    // Different session should be ignored
    mockWrite.mockClear();
    outputHandler({ payload: { seq: 1, session_id: "other", data: "nope" } });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("does not write after unmount", async () => {
    let outputHandler!: (event: { payload: { seq: number; session_id: string; data: string } }) => void;
    const mockListen = listen as ReturnType<typeof vi.fn>;
    mockListen.mockImplementation((event: string, handler: typeof outputHandler) => {
      if (event === "pty-output") outputHandler = handler;
      return Promise.resolve(() => {});
    });

    const { unmount } = render(<Terminal sessionId="test-session" />);
    unmount();

    mockWrite.mockClear();
    outputHandler({ payload: { seq: 0, session_id: "test-session", data: "late" } });
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
