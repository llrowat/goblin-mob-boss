import { useState, useEffect, useRef } from "react";
import { useTauri } from "../hooks/useTauri";

interface ClauseOutputProps {
  /** The type of background process: "ideation", "claude-md", "skill", "discovery" */
  processType: string;
  /** Process identifier (featureId for ideation, mapId for discovery) */
  processId?: string;
  /** Repository path (for ideation and claude-md) */
  repoPath?: string;
  /** Whether the process is currently running (enables auto-polling) */
  active: boolean;
  /** Poll interval in ms (default 3000) */
  pollInterval?: number;
}

/**
 * Collapsible panel that shows the live output of a background Claude process.
 * Polls the log file while `active` is true, auto-scrolls to bottom.
 */
export function ClauseOutput({
  processType,
  processId,
  repoPath,
  active,
  pollInterval = 3000,
}: ClauseOutputProps) {
  const tauri = useTauri();
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const logRef = useRef<HTMLPreElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLog = async () => {
    try {
      const log = await tauri.readProcessLog({
        processType,
        processId,
        repoPath,
      });
      if (log) {
        setContent(log);
      }
    } catch {
      // Log may not exist yet — ignore
    }
  };

  // Poll while active and expanded
  useEffect(() => {
    if (!expanded) return;

    // Fetch immediately on expand
    fetchLog();

    if (active) {
      intervalRef.current = setInterval(fetchLog, pollInterval);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [expanded, active, processType, processId, repoPath]);

  // One final fetch when process completes (active → false)
  useEffect(() => {
    if (!active && expanded) {
      fetchLog();
    }
  }, [active]);

  // Auto-scroll to bottom when content updates
  useEffect(() => {
    if (logRef.current && expanded) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [content, expanded]);

  return (
    <div className="clause-output">
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Hide Output" : "View Output"}
      </button>
      {expanded && (
        <pre ref={logRef} className="clause-output-log">
          {content || (active ? "Waiting for output..." : "No output captured.")}
        </pre>
      )}
    </div>
  );
}
