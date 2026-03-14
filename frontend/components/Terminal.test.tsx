import { render, cleanup, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

  it("sends initial resize to backend after layout delay", async () => {
    render(<Terminal sessionId="test-session" />);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("resize_pty", {
        sessionId: "test-session",
        cols: 80,
        rows: 24,
      });
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

  it("sets up global listeners on first mount", () => {
    const mockListen = listen as ReturnType<typeof vi.fn>;
    mockListen.mockImplementation(() => Promise.resolve(() => {}));

    render(<Terminal sessionId="test-session" />);
    // Global listeners: one for pty-output, one for pty-exit
    expect(mockListen).toHaveBeenCalledWith("pty-output", expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith("pty-exit", expect.any(Function));
  });

  it("dispatches pty-output to the correct terminal", async () => {
    let outputHandler!: (event: { payload: { seq: number; session_id: string; data: string } }) => void;
    const mockListen = listen as ReturnType<typeof vi.fn>;
    mockListen.mockImplementation((event: string, handler: typeof outputHandler) => {
      if (event === "pty-output") outputHandler = handler;
      return Promise.resolve(() => {});
    });

    render(<Terminal sessionId="test-session" />);

    // Simulate a pty-output event
    outputHandler({ payload: { seq: 0, session_id: "test-session", data: "hello" } });
    expect(mockWrite).toHaveBeenCalledWith("hello");

    // Event for a different session should be ignored
    mockWrite.mockClear();
    outputHandler({ payload: { seq: 1, session_id: "other-session", data: "nope" } });
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

    // Fire event after unmount — handler should be removed from map
    mockWrite.mockClear();
    outputHandler({ payload: { seq: 0, session_id: "test-session", data: "late data" } });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("immediately unsubscribes stale listeners that resolve after teardown", async () => {
    // Simulate the race condition: listen() returns a promise that resolves
    // AFTER the component unmounts and cleanup runs.
    const unsubFns: Array<ReturnType<typeof vi.fn>> = [];
    let resolveOutput!: (fn: () => void) => void;
    let resolveExit!: (fn: () => void) => void;

    const mockListen = listen as ReturnType<typeof vi.fn>;
    mockListen.mockImplementation((event: string) => {
      if (event === "pty-output") {
        const unsub = vi.fn();
        unsubFns.push(unsub);
        return new Promise<() => void>((resolve) => { resolveOutput = resolve; })
          .then((fn) => fn || unsub);
      }
      const unsub = vi.fn();
      unsubFns.push(unsub);
      return new Promise<() => void>((resolve) => { resolveExit = resolve; })
        .then((fn) => fn || unsub);
    });

    const { unmount } = render(<Terminal sessionId="test-session" />);

    // Unmount BEFORE the listen promises resolve — this is the race condition
    unmount();

    // Now resolve the promises (simulating late async resolution)
    const staleOutputUnsub = vi.fn();
    const staleExitUnsub = vi.fn();
    resolveOutput(staleOutputUnsub);
    resolveExit(staleExitUnsub);

    // Wait for microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));

    // The stale unsub functions should have been called immediately
    // because the generation has advanced past when they were created
    expect(staleOutputUnsub).toHaveBeenCalled();
    expect(staleExitUnsub).toHaveBeenCalled();
  });
});
