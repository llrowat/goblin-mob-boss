import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type { Ideation, TaskSpec } from "../types";

export function IdeationPage() {
  const { ideationId } = useParams<{ ideationId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const [ideation, setIdeation] = useState<Ideation | null>(null);
  const [prompt, setPrompt] = useState("");
  const [terminalCmd, setTerminalCmd] = useState("");
  const [discoveredTasks, setDiscoveredTasks] = useState<TaskSpec[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ideationId) return;

    // Load ideation details
    tauri.listIdeations("").then((ideations) => {
      const found = ideations.find((i) => i.id === ideationId);
      if (found) setIdeation(found);
    });

    // Load prompt
    tauri.getIdeationPrompt(ideationId).then(setPrompt).catch(() => {});

    // Load terminal command
    tauri
      .getIdeationTerminalCommand(ideationId)
      .then(setTerminalCmd)
      .catch(() => {});
  }, [ideationId]);

  // Poll for discovered tasks
  const pollTasks = useCallback(() => {
    if (!ideationId) return;
    tauri
      .pollIdeationTasks(ideationId)
      .then(setDiscoveredTasks)
      .catch(() => {});
  }, [ideationId]);

  useEffect(() => {
    pollTasks();
    const interval = setInterval(pollTasks, 3000);
    return () => clearInterval(interval);
  }, [pollTasks]);

  const handleLaunch = async () => {
    if (!ideationId) return;
    try {
      await tauri.launchIdeation(ideationId);
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
    if (!ideationId || discoveredTasks.length === 0) return;
    setImporting(true);
    setError("");
    try {
      await tauri.importTasks(ideationId, discoveredTasks);
      await tauri.completeIdeation(ideationId);
      // Navigate to task board
      if (ideation) {
        navigate(`/tasks/${ideation.repo_id}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  if (!ideation) {
    return (
      <div className="empty-state">
        <p>Loading ideation...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Ideation</h2>
        <p>{ideation.description}</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Step 1: Launch Claude Code */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title" style={{ marginBottom: 12 }}>
          Step 1: Run Claude Code to create tasks
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: 16,
          }}
        >
          Launch Claude Code in your repo. It will analyze the codebase and
          create task files for parallel execution.
        </p>

        <div className="actions-bar" style={{ marginTop: 0 }}>
          <button className="btn btn-primary" onClick={handleLaunch}>
            Launch Claude Code
          </button>
          <button className="btn btn-secondary" onClick={handleCopyCommand}>
            {copied ? "Copied!" : "Copy Command"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowPrompt(!showPrompt)}
          >
            {showPrompt ? "Hide Prompt" : "View Prompt"}
          </button>
        </div>

        {showPrompt && (
          <div className="code-block" style={{ marginTop: 12 }}>
            {prompt}
          </div>
        )}
      </div>

      {/* Step 2: Discovered Tasks */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            Step 2: Review discovered tasks ({discoveredTasks.length})
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={pollTasks}
          >
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
            No tasks discovered yet. Run Claude Code first, then tasks will
            appear here automatically.
          </p>
        ) : (
          <>
            <div className="task-spec-list">
              {discoveredTasks.map((spec, i) => (
                <div key={i} className="task-spec-card">
                  <div className="task-spec-number">{String(i + 1).padStart(2, "0")}</div>
                  <div className="task-spec-content">
                    <div className="task-spec-title">{spec.title}</div>
                    <div className="task-spec-description">
                      {spec.description}
                    </div>
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
                : `Import ${discoveredTasks.length} Tasks & Start`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
