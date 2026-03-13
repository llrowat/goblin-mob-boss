import { useEffect, useRef } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  onExit?: () => void;
}

export function Terminal({ sessionId, onExit }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerminal({
      theme: {
        background: "#1a1a1e",
        foreground: "#e0ddd8",
        cursor: "#e0ddd8",
        selectionBackground: "#3a3a42",
      },
      fontFamily:
        "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      rescaleOverlappingGlyphs: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Delay initial fit to ensure DOM layout is complete before measuring.
    // This prevents tmux from starting with wrong dimensions.
    let lastCols = 0;
    let lastRows = 0;
    const syncSize = () => {
      fitAddon.fit();
      if (term.cols !== lastCols || term.rows !== lastRows) {
        lastCols = term.cols;
        lastRows = term.rows;
        invoke("resize_pty", {
          sessionId,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      }
    };
    const initTimer = setTimeout(syncSize, 50);

    // User input -> PTY
    const dataDisposable = term.onData((data) => {
      invoke("write_pty", { sessionId, data }).catch(() => {});
    });

    // PTY output -> terminal
    // Use a disposed flag to handle the race between async listen() setup
    // and synchronous effect cleanup (e.g. React StrictMode double-mount).
    // Without this, cleanup can run before .then() assigns the unlisten fn,
    // leaving orphaned listeners that cause duplicate writes.
    let disposed = false;
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    listen<{ session_id: string; data: string }>("pty-output", (event) => {
      if (!disposed && event.payload.session_id === sessionId) {
        term.write(event.payload.data);
      }
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlistenOutput = fn;
      }
    });

    listen<{ session_id: string; exit_code: number | null }>(
      "pty-exit",
      (event) => {
        if (!disposed && event.payload.session_id === sessionId) {
          term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
          onExitRef.current?.();
        }
      },
    ).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlistenExit = fn;
      }
    });

    // Debounced resize to avoid flooding tmux with rapid SIGWINCH signals
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const doResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncSize, 100);
    };

    const observer = new ResizeObserver(doResize);
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      clearTimeout(initTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      dataDisposable.dispose();
      unlistenOutput?.();
      unlistenExit?.();
      term.dispose();
    };
  }, [sessionId]);

  return <div ref={containerRef} className="terminal-container" />;
}
