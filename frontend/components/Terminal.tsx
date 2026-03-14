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

// ── Single global listener architecture ──
// Instead of each Terminal component registering its own listen() call
// (which races with React StrictMode, HMR, and portal transitions),
// we maintain ONE global listener that dispatches to the active handler.
type OutputHandler = (data: string) => void;
type ExitHandler = (exitCode: number | null) => void;

const outputHandlers = new Map<string, OutputHandler>();
const exitHandlers = new Map<string, ExitHandler>();
let globalOutputUnsub: (() => void) | null = null;
let globalExitUnsub: (() => void) | null = null;
let listenerRefCount = 0;

function ensureGlobalListeners() {
  if (listenerRefCount++ > 0) return; // already set up

  listen<{ seq: number; session_id: string; data: string }>("pty-output", (event) => {
    const handler = outputHandlers.get(event.payload.session_id);
    if (handler) handler(event.payload.data);
  }).then((fn) => { globalOutputUnsub = fn; });

  listen<{ session_id: string; exit_code: number | null }>("pty-exit", (event) => {
    const handler = exitHandlers.get(event.payload.session_id);
    if (handler) handler(event.payload.exit_code);
  }).then((fn) => { globalExitUnsub = fn; });
}

function releaseGlobalListeners() {
  if (--listenerRefCount > 0) return; // other terminals still active
  globalOutputUnsub?.();
  globalExitUnsub?.();
  globalOutputUnsub = null;
  globalExitUnsub = null;
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

    // Register this terminal as the handler — replaces any previous
    // handler for the same session (e.g. from StrictMode double-mount).
    // There is exactly ONE global listener dispatching to this map,
    // so duplicate writes are impossible.
    outputHandlers.set(sessionId, (data) => term.write(data));
    exitHandlers.set(sessionId, () => {
      term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
      onExitRef.current?.();
    });
    ensureGlobalListeners();

    // Debounced resize to avoid flooding with rapid SIGWINCH signals
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const doResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncSize, 100);
    };

    const observer = new ResizeObserver(doResize);
    observer.observe(containerRef.current);

    return () => {
      clearTimeout(initTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      dataDisposable.dispose();
      outputHandlers.delete(sessionId);
      exitHandlers.delete(sessionId);
      releaseGlobalListeners();
      term.dispose();
    };
  }, [sessionId]);

  return <div ref={containerRef} className="terminal-container" />;
}
