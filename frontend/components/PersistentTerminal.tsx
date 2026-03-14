import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { Terminal } from "./Terminal";
import type { Feature } from "../types";

export function PersistentTerminal() {
  const { session, clearSession } = useTerminalSession();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCommand, setShowCommand] = useState(false);
  const [launchedCommand, setLaunchedCommand] = useState<string | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const isOnFeaturePage = session
    ? location.pathname === `/feature/${session.featureId}/detail`
    : false;

  // Look for the portal target element on the feature detail page
  useEffect(() => {
    if (isOnFeaturePage) {
      const timer = setTimeout(() => {
        setPortalTarget(document.getElementById("terminal-portal-target"));
      }, 0);
      return () => clearTimeout(timer);
    } else {
      setPortalTarget(null);
    }
  }, [isOnFeaturePage, location.pathname]);

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
    setShowCommand(false);
  }, [session?.sessionId]);

  if (!session) return null;

  const handleExit = async () => {
    try {
      await invoke("mark_feature_ready", { featureId: session.featureId });
    } catch {
      // Feature may already be in ready state
    }
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
    navigate(0);
  };

  // Only render the terminal once we have a stable portal target.
  // Previously, the Terminal mounted inline (hidden) then moved into
  // the portal, causing xterm + event listeners to tear down and
  // re-create — producing duplicate output.
  if (!isOnFeaturePage || !portalTarget) return null;

  return createPortal(
    <div ref={containerRef} className="persistent-terminal-inline">
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div className="panel-title">
            <span
              className="status-dot"
              style={{
                backgroundColor: "var(--success)",
                marginRight: 8,
              }}
            />
            Execution
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
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleCancel}
              disabled={cancelling}
              style={{ color: "var(--danger)" }}
            >
              {cancelling ? "Cancelling..." : "Cancel Execution"}
            </button>
          </div>
        </div>
        {showCommand && launchedCommand && (
          <div className="code-block" style={{ marginBottom: 8, wordBreak: "break-all" }}>
            {launchedCommand}
          </div>
        )}
        <Terminal sessionId={session.sessionId} onExit={handleExit} />
      </div>
    </div>,
    portalTarget,
  );
}
