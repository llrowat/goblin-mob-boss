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
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    // Send initial size to backend
    invoke("resize_pty", {
      sessionId,
      cols: term.cols,
      rows: term.rows,
    }).catch(() => {});

    // User input -> PTY
    const dataDisposable = term.onData((data) => {
      invoke("write_pty", { sessionId, data }).catch(() => {});
    });

    // PTY output -> terminal
    let unlistenOutput: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    listen<{ session_id: string; data: string }>("pty-output", (event) => {
      if (event.payload.session_id === sessionId) {
        term.write(event.payload.data);
      }
    }).then((fn) => {
      unlistenOutput = fn;
    });

    listen<{ session_id: string; exit_code: number | null }>(
      "pty-exit",
      (event) => {
        if (event.payload.session_id === sessionId) {
          term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
          onExitRef.current?.();
        }
      },
    ).then((fn) => {
      unlistenExit = fn;
    });

    // Auto-resize on container size change
    const doResize = () => {
      fitAddon.fit();
      invoke("resize_pty", {
        sessionId,
        cols: term.cols,
        rows: term.rows,
      }).catch(() => {});
    };

    const observer = new ResizeObserver(doResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      dataDisposable.dispose();
      unlistenOutput?.();
      unlistenExit?.();
      term.dispose();
    };
  }, [sessionId]);

  return <div ref={containerRef} className="terminal-container" />;
}
