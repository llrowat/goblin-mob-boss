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
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Sync PTY dimensions when xterm.js resizes (per official docs).
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      invoke("resize_pty", { sessionId, cols, rows }).catch(() => {});
    });

    // fit() measures the container and resizes the terminal to match.
    // Call immediately (setTimeout 0 lets the browser finish layout).
    const initTimer = setTimeout(() => fitAddon.fit(), 0);

    // User input -> PTY
    const dataDisposable = term.onData((data) => {
      invoke("write_pty", { sessionId, data }).catch(() => {});
    });


    // PTY output -> terminal
    let disposed = false;
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    listen<{ seq: number; session_id: string; data: string }>("pty-output", (event) => {
      if (!disposed && event.payload.session_id === sessionId) {
        term.write(event.payload.data);
      }
    }).then((fn) => {
      if (disposed) fn(); else unlistenOutput = fn;
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
      if (disposed) fn(); else unlistenExit = fn;
    });

    // Debounced resize — fit() measures container and resizes terminal;
    // onResize handler above sends the new dimensions to the PTY.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const doResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => fitAddon.fit(), 200);
    };

    const observer = new ResizeObserver(doResize);
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      clearTimeout(initTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      unlistenOutput?.();
      unlistenExit?.();
      term.dispose();
    };
  }, [sessionId]);

  return <div ref={containerRef} className="terminal-container" />;
}
