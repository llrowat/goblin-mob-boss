import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { Terminal } from "./Terminal";
import type { Feature } from "../types";

export function PersistentTerminal() {
  const { session, startSession, clearSession } = useTerminalSession();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [cancelling, setCancelling] = useState(false);
  const [exited, setExited] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showCommand, setShowCommand] = useState(false);
  const [launchedCommand, setLaunchedCommand] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const isOnFeaturePage = session
    ? location.pathname === `/feature/${session.featureId}/detail`
    : false;

  // Fetch launched_command when session starts
  useEffect(() => {
    if (!session) return;
    invoke<Feature>("get_feature", { featureId: session.featureId })
      .then((f) => setLaunchedCommand(f.launched_command ?? null))
      .catch(() => {});
  }, [session?.featureId]);

  // Scroll into view when terminal first appears on the detail page
  useEffect(() => {
    if (session && isOnFeaturePage && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [session?.sessionId, isOnFeaturePage]);

  // Reset state when session changes
  useEffect(() => {
    setExited(false);
    setCollapsed(false);
    setShowCommand(false);
  }, [session?.sessionId]);

  if (!session) return null;

  const handleExit = async () => {
    try {
      await invoke("mark_feature_ready", { featureId: session.featureId });
    } catch {
      // Feature may already be in ready state
    }
    setExited(true);
    setCollapsed(true);
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
    navigate(0);
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      const featureId = session.featureId;
      const sessionId = await invoke<string>("start_launch_pty", {
        featureId,
        cols: 120,
        rows: 30,
      });
      // Start new session — this triggers a new sessionId, which remounts the Terminal
      startSession(featureId, sessionId);
    } catch (e) {
      console.error("Failed to restart execution:", e);
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="persistent-terminal-inline"
      style={isOnFeaturePage ? undefined : { display: "none" }}
    >
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div className="panel-title">
            <span
              className="status-dot"
              style={{
                backgroundColor: exited ? "var(--muted)" : "var(--success)",
                marginRight: 8,
              }}
            />
            {exited ? "Execution Complete" : "Execution"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {launchedCommand && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCommand(!showCommand)}
              >
                {showCommand ? "Hide Command" : "View Command"}
              </button>
            )}
            {exited ? (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCollapsed(!collapsed)}
                >
                  {collapsed ? "Show Terminal" : "Hide Terminal"}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleRestart}
                  disabled={restarting}
                >
                  {restarting ? "Restarting..." : "Restart Execution"}
                </button>
              </>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleCancel}
                disabled={cancelling}
                style={{ color: "var(--danger)" }}
              >
                {cancelling ? "Cancelling..." : "Cancel Execution"}
              </button>
            )}
          </div>
        </div>
        {showCommand && launchedCommand && (
          <div className="code-block" style={{ marginBottom: 8, wordBreak: "break-all" }}>
            {launchedCommand}
          </div>
        )}
        <div style={collapsed ? { display: "none" } : undefined}>
          <Terminal sessionId={session.sessionId} onExit={handleExit} />
        </div>
      </div>
    </div>
  );
}
