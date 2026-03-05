import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type { Feature, TaskSpec } from "../types";

export function IdeationPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [terminalCmd, setTerminalCmd] = useState("");
  const [discoveredTasks, setDiscoveredTasks] = useState<TaskSpec[]>([]);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!featureId) return;

    tauri.getFeature(featureId).then(setFeature).catch(() => {});
    tauri.getIdeationPrompt(featureId).then(setSystemPrompt).catch(() => {});
    tauri
      .getIdeationTerminalCommand(featureId)
      .then(setTerminalCmd)
      .catch(() => {});
  }, [featureId]);

  // Poll for discovered tasks
  const pollTasks = useCallback(() => {
    if (!featureId) return;
    tauri
      .pollIdeationTasks(featureId)
      .then(setDiscoveredTasks)
      .catch(() => {});
  }, [featureId]);

  useEffect(() => {
    pollTasks();
    const interval = setInterval(pollTasks, 3000);
    return () => clearInterval(interval);
  }, [pollTasks]);

  const handleLaunch = async () => {
    if (!featureId) return;
    try {
      await tauri.launchIdeation(featureId);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(terminalCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImportTasks = async () => {
    if (!featureId || discoveredTasks.length === 0) return;
    setImporting(true);
    setError("");
    try {
      await tauri.importTasks(featureId, discoveredTasks);
      navigate(`/feature/${featureId}/tasks`);
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  if (!feature) {
    return (
      <div className="empty-state">
        <p>Loading feature...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Planning: {feature.name}</h2>
        <p>{feature.description}</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Step 1: Interactive planning conversation */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title" style={{ marginBottom: 12 }}>
          Step 1: Plan with Claude
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: 16,
            lineHeight: 1.6,
          }}
        >
          This opens Claude Code in plan mode for an interactive conversation.
          Discuss your goals, ask questions, refine the approach — then when you
          agree on the plan, ask Claude to create the task files.
        </p>

        <div className="actions-bar" style={{ marginTop: 0 }}>
          <button className="btn btn-primary" onClick={handleLaunch}>
            Open Planning Session
          </button>
          <button className="btn btn-secondary" onClick={handleCopyCommand}>
            {copied ? "Copied!" : "Copy Command"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
          >
            {showSystemPrompt ? "Hide Context" : "View Context"}
          </button>
        </div>

        {showSystemPrompt && (
          <div className="code-block" style={{ marginTop: 12 }}>
            {systemPrompt}
          </div>
        )}
      </div>

      {/* Step 2: Discovered Tasks */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            Step 2: Review tasks ({discoveredTasks.length})
          </div>
          <button className="btn btn-secondary btn-sm" onClick={pollTasks}>
            Refresh
          </button>
        </div>

        {discoveredTasks.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              fontStyle: "italic",
            }}
          >
            No tasks yet. Once you and Claude agree on a plan, Claude will
            create task files that appear here automatically.
          </p>
        ) : (
          <>
            <div className="task-spec-list">
              {discoveredTasks.map((spec, i) => (
                <div key={i} className="task-spec-card">
                  <div className="task-spec-number">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="task-spec-content">
                    <div className="task-spec-title">{spec.title}</div>
                    <div className="task-spec-description">
                      {spec.description}
                    </div>
                    {spec.repo && (
                      <div className="task-spec-agent">Repo: {spec.repo}</div>
                    )}
                    {spec.agent && (
                      <div className="task-spec-agent">Agent: {spec.agent}</div>
                    )}
                    {spec.acceptance_criteria.length > 0 && (
                      <ul className="task-spec-criteria">
                        {spec.acceptance_criteria.map((c, j) => (
                          <li key={j}>{c}</li>
                        ))}
                      </ul>
                    )}
                    {spec.dependencies.length > 0 && (
                      <div className="task-spec-deps">
                        Depends on:{" "}
                        {spec.dependencies.map((d) => `#${d}`).join(", ")}
                      </div>
                    )}
                    {spec.subagents.length > 0 && (
                      <div className="task-spec-deps">
                        Subagents: {spec.subagents.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={handleImportTasks}
              disabled={importing}
              style={{ width: "100%", marginTop: 16 }}
            >
              {importing
                ? "Importing..."
                : `Import ${discoveredTasks.length} Tasks & Start Working`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
