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

  it("unregisters listeners that resolve after unmount (StrictMode double-mount)", async () => {
    // Simulate the race: listen() resolves AFTER the effect cleanup runs
    const unlistenOutput = vi.fn();
    const unlistenExit = vi.fn();
    let resolveOutput!: (fn: () => void) => void;
    let resolveExit!: (fn: () => void) => void;

    const mockListen = listen as ReturnType<typeof vi.fn>;
    mockListen
      .mockImplementationOnce(
        () => new Promise<() => void>((r) => (resolveOutput = r)),
      )
      .mockImplementationOnce(
        () => new Promise<() => void>((r) => (resolveExit = r)),
      );

    const { unmount } = render(<Terminal sessionId="test-session" />);
    // Unmount before listen promises resolve
    unmount();

    // Now resolve the listen promises — the unlisten fns should be called immediately
    resolveOutput(unlistenOutput);
    resolveExit(unlistenExit);
    await waitFor(() => {
      expect(unlistenOutput).toHaveBeenCalled();
      expect(unlistenExit).toHaveBeenCalled();
    });
  });

  it("ignores pty-output events after unmount", async () => {
    let outputHandler!: (event: { payload: { session_id: string; data: string } }) => void;
    const mockListen = listen as ReturnType<typeof vi.fn>;
    mockListen.mockImplementationOnce((_event: string, handler: typeof outputHandler) => {
      outputHandler = handler;
      return Promise.resolve(() => {});
    }).mockImplementationOnce(() => Promise.resolve(() => {}));

    const { unmount } = render(<Terminal sessionId="test-session" />);
    unmount();

    // Fire event after unmount — write should not be called
    mockWrite.mockClear();
    outputHandler({ payload: { session_id: "test-session", data: "late data" } });
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
