import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { Terminal } from "./Terminal";

export function PersistentTerminal() {
  const { session, clearSession } = useTerminalSession();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [cancelling, setCancelling] = useState(false);

  const isOnFeaturePage = session
    ? location.pathname === `/feature/${session.featureId}/detail`
    : false;

  // Scroll into view when terminal first appears on the detail page
  useEffect(() => {
    if (session && isOnFeaturePage && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [session?.sessionId, isOnFeaturePage]);

  if (!session) return null;

  const handleExit = async () => {
    try {
      await invoke("mark_feature_ready", { featureId: session.featureId });
    } catch {
      // Feature may already be in ready state
    }
    navigate(`/feature/${session.featureId}/detail`);
    clearSession();
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await invoke("cancel_execution", { featureId: session.featureId });
    } catch {
      // Best-effort cancel
    }
    clearSession();
    setCancelling(false);
    // Reload the page to reset component state back to planning
    navigate(0);
  };

  // Terminal is always rendered to preserve scrollback, but only
  // visible on the executing feature's detail page.
  return (
    <div
      ref={containerRef}
      className="persistent-terminal-inline"
      style={isOnFeaturePage ? undefined : { display: "none" }}
    >
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div className="panel-title">
            <span className="status-dot" style={{ backgroundColor: "var(--success)", marginRight: 8 }} />
            Execution
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleCancel}
            disabled={cancelling}
            style={{ color: "var(--danger)" }}
          >
            {cancelling ? "Cancelling..." : "Cancel Execution"}
          </button>
        </div>
        <Terminal sessionId={session.sessionId} onExit={handleExit} />
      </div>
    </div>
  );
}
