import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { Terminal } from "./Terminal";

export function PersistentTerminal() {
  const { session, clearSession } = useTerminalSession();
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const isOnFeaturePage = session
    ? location.pathname === `/feature/${session.featureId}/ideation`
    : false;

  // Scroll into view when terminal first appears on the ideation page
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
    navigate(`/feature/${session.featureId}/status`);
    clearSession();
  };

  // Terminal is always rendered to preserve scrollback, but only
  // visible on the executing feature's ideation page. On all other
  // pages the entire container is hidden (no bar, no chrome).
  return (
    <div
      ref={containerRef}
      className="persistent-terminal-inline"
      style={isOnFeaturePage ? undefined : { display: "none" }}
    >
      <Terminal sessionId={session.sessionId} onExit={handleExit} />
    </div>
  );
}
