import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import { useTerminalSession } from "../hooks/useTerminalSession";
import type { Feature, IdeationResult, TaskSpec, ExecutionMode } from "../types";

type IdeationStatus = "idle" | "running" | "done" | "error";

export function IdeationPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const { session: terminalSession, startSession, clearSession } = useTerminalSession();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [ideationResult, setIdeationResult] = useState<IdeationResult | null>(
    null,
  );
  const [status, setStatus] = useState<IdeationStatus>("idle");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [expandedTask, setExpandedTask] = useState<number | null>(null);

  // Execution mode override
  const [modeOverride, setModeOverride] = useState<ExecutionMode | null>(null);

  // Edit dialog
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TaskSpec | null>(null);

  // Launch
  const [launching, setLaunching] = useState(false);

  // Load feature data
  useEffect(() => {
    if (!featureId) return;
    tauri.getFeature(featureId).then((f) => {
      setFeature(f);
      // If already executing, restore the terminal session via context
      if (f.status === "executing" && f.pty_session_id) {
        startSession(f.id, f.pty_session_id);
        // Load the saved plan from the feature's task_specs
        if (f.task_specs.length > 0) {
          setIdeationResult({ tasks: f.task_specs, execution_mode: null });
          setStatus("done");
        }
      }
    }).catch(console.error);
    tauri.getIdeationPrompt(featureId).then(setSystemPrompt).catch(() => {});
  }, [featureId]);

  // Start ideation on mount
  const startIdeation = useCallback(async () => {
    if (!featureId) return;
    setStatus("running");
    setError("");
    setIdeationResult(null);
    clearSession();
    try {
      await tauri.runIdeation(featureId);
    } catch (err) {
      setStatus("error");
      setError(String(err));
    }
  }, [featureId]);

  useEffect(() => {
    // Check if plan already exists before starting
    if (!featureId) return;
    // Skip if already executing (terminal session restored from feature load)
    if (terminalSession?.featureId === featureId) return;
    tauri.pollIdeationResult(featureId).then((result) => {
      if (result.tasks.length > 0) {
        setIdeationResult(result);
        setStatus("done");
      } else {
        startIdeation();
      }
    }).catch(() => {
      startIdeation();
    });
  }, [featureId]);

  // Poll for plan.json while running
  const pollCountRef = React.useRef(0);
  useEffect(() => {
    if (status !== "running" || !featureId) return;
    pollCountRef.current = 0;

    const poll = () => {
      pollCountRef.current += 1;
      tauri.pollIdeationResult(featureId).then((result) => {
        if (result.tasks.length > 0) {
          setIdeationResult(result);
          setStatus("done");
        }
      }).catch(() => {});
    };

    const interval = setInterval(() => {
      poll();
      if (pollCountRef.current > 600) {
        setStatus("error");
        setError("Planning timed out. Try restarting.");
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, featureId]);

  const handleRevise = async () => {
    if (!featureId || !feedback.trim()) return;
    setStatus("running");
    setError("");
    setShowFeedback(false);
    clearSession();
    try {
      await tauri.reviseIdeation(featureId, feedback.trim());
      setFeedback("");
      setIdeationResult(null);
    } catch (err) {
      setStatus("error");
      setError(String(err));
    }
  };

  const handleRestart = () => {
    startIdeation();
  };

  // Edit task handlers
  const openEditTask = (index: number) => {
    if (!ideationResult) return;
    setEditingTask(index);
    setEditDraft({ ...ideationResult.tasks[index] });
  };

  const saveEditTask = () => {
    if (editingTask === null || !editDraft || !ideationResult) return;
    const updated = [...ideationResult.tasks];
    updated[editingTask] = editDraft;
    setIdeationResult({ ...ideationResult, tasks: updated });
    setEditingTask(null);
    setEditDraft(null);
  };

  const cancelEditTask = () => {
    setEditingTask(null);
    setEditDraft(null);
  };

  // Launch handler — configure then spawn PTY terminal
  const handleLaunch = async () => {
    if (!featureId || !ideationResult) return;
    setLaunching(true);
    setError("");
    try {
      const mode = modeOverride ?? ideationResult.execution_mode?.recommended ?? "subagents";
      const rationale = ideationResult.execution_mode?.rationale ?? "";
      const agents = [...new Set(ideationResult.tasks.map((t) => t.agent).filter(Boolean))];
      await tauri.configureLaunch(
        featureId,
        mode,
        rationale,
        agents.map((a) => `${a}.md`),
        ideationResult.tasks,
      );
      const sessionId = await tauri.startLaunchPty(featureId, 120, 30);
      startSession(featureId, sessionId);
    } catch (e) {
      setError(String(e));
    } finally {
      setLaunching(false);
    }
  };

  const hasActiveTerminal = terminalSession?.featureId === featureId;

  if (!feature) {
    return (
      <div className="empty-state">
        <p>Loading feature...</p>
      </div>
    );
  }

  const recommendation = ideationResult?.execution_mode;
  const isExecuting = feature.status === "executing";

  return (
    <div>
      <div className="page-header">
        <h2>{isExecuting ? "Executing" : "Planning"}: {feature.name}</h2>
        <p>{feature.description}</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            {status === "running"
              ? "Planning in progress..."
              : status === "done" && ideationResult
                ? `Plan (${ideationResult.tasks.length} tasks)`
                : "Plan"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {status !== "running" && !isExecuting && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleRestart}
              >
                Restart
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowContext(!showContext)}
            >
              {showContext ? "Hide Context" : "View Context"}
            </button>
          </div>
        </div>

        {status === "running" && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "24px 0",
            color: "var(--text-secondary)",
            fontSize: 13,
          }}>
            <div className="spinner" />
            Claude is exploring the codebase and creating a plan. This
            usually takes 1-3 minutes.
          </div>
        )}

        {status === "error" && !error && (
          <p style={{ color: "var(--danger)", fontSize: 13 }}>
            Something went wrong. Try restarting.
          </p>
        )}

        {showContext && (
          <div className="code-block" style={{ marginTop: 12 }}>
            {systemPrompt}
          </div>
        )}

      {status === "done" && ideationResult && ideationResult.tasks.length > 0 && (
        <>

          {/* Execution mode selector */}
          {(() => {
            const activeMode = modeOverride ?? recommendation?.recommended ?? "subagents";
            return (
              <div className="exec-mode-selector">
                <button
                  className={`exec-mode-option${activeMode === "teams" ? " exec-mode-active" : ""}`}
                  onClick={() => !isExecuting && setModeOverride("teams")}
                  style={isExecuting ? { cursor: "default" } : undefined}
                >
                  <div className="exec-mode-icon exec-mode-teams">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="12" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="1" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="12" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div className="exec-mode-option-text">
                    <div className="exec-mode-title">Agent Teams</div>
                    <div className="exec-mode-desc">Multiple agents run in parallel and self-coordinate</div>
                  </div>
                  {recommendation?.recommended === "teams" && (
                    <span className="exec-mode-rec-badge">Recommended</span>
                  )}
                </button>
                <button
                  className={`exec-mode-option${activeMode === "subagents" ? " exec-mode-active" : ""}`}
                  onClick={() => !isExecuting && setModeOverride("subagents")}
                  style={isExecuting ? { cursor: "default" } : undefined}
                >
                  <div className="exec-mode-icon exec-mode-sub">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="4" r="3" stroke="currentColor" strokeWidth="1.5" />
                      <line x1="10" y1="7" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" />
                      <line x1="10" y1="12" x2="4" y2="17" stroke="currentColor" strokeWidth="1.5" />
                      <line x1="10" y1="12" x2="16" y2="17" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="4" cy="17" r="2" fill="currentColor" opacity="0.4" />
                      <circle cx="16" cy="17" r="2" fill="currentColor" opacity="0.4" />
                    </svg>
                  </div>
                  <div className="exec-mode-option-text">
                    <div className="exec-mode-title">Subagents</div>
                    <div className="exec-mode-desc">A single lead agent delegates to subagents</div>
                  </div>
                  {recommendation?.recommended === "subagents" && (
                    <span className="exec-mode-rec-badge">Recommended</span>
                  )}
                </button>
              </div>
            );
          })()}
          {recommendation && (
            <div className="exec-mode-rationale">
              {recommendation.rationale}
              <span className="exec-mode-confidence">
                {Math.round(recommendation.confidence * 100)}% confidence
              </span>
            </div>
          )}

          {/* Task list — JIRA-style table */}
          <div className="jira-table">
            <div className="jira-header">
              <div className="jira-col-key">Key</div>
              <div className="jira-col-summary">Summary</div>
              <div className="jira-col-assignee">Assignee</div>
              <div className="jira-col-deps">Blocked by</div>
              <div className="jira-col-ac">AC</div>
              {!isExecuting && <div className="jira-col-edit" />}
            </div>
            {ideationResult.tasks.map((spec, i) => (
              <div key={i} className="jira-row-group">
                <div
                  className={`jira-row${expandedTask === i ? " jira-row-expanded" : ""}`}
                  onClick={() => setExpandedTask(expandedTask === i ? null : i)}
                >
                  <div className="jira-col-key">
                    <span className="jira-task-icon" />
                    TASK-{i + 1}
                  </div>
                  <div className="jira-col-summary">{spec.title}</div>
                  <div className="jira-col-assignee">
                    {spec.agent && (
                      <span className="jira-assignee-badge">{spec.agent}</span>
                    )}
                  </div>
                  <div className="jira-col-deps">
                    {spec.dependencies.length > 0
                      ? spec.dependencies.map((d) => `TASK-${d}`).join(", ")
                      : "\u2014"}
                  </div>
                  <div className="jira-col-ac">
                    {spec.acceptance_criteria.length > 0 && (
                      <span className="jira-ac-count">
                        {spec.acceptance_criteria.length}
                      </span>
                    )}
                  </div>
                  {!isExecuting && (
                    <div className="jira-col-edit">
                      <button
                        className="jira-edit-btn"
                        onClick={(e) => { e.stopPropagation(); openEditTask(i); }}
                        title="Edit task"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M10.5 1.5L12.5 3.5L4.5 11.5L1.5 12.5L2.5 9.5L10.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                {expandedTask === i && spec.acceptance_criteria.length > 0 && (
                  <div className="jira-detail">
                    <div className="jira-detail-label">Acceptance Criteria</div>
                    <ul className="jira-checklist">
                      {spec.acceptance_criteria.map((c, j) => (
                        <li key={j}>
                          <span className="jira-check-box" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          {!hasActiveTerminal && !isExecuting ? (
            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowFeedback(!showFeedback)}
              >
                Request Changes
              </button>
              <button
                className="btn btn-primary"
                onClick={handleLaunch}
                disabled={launching}
              >
                {launching ? "Launching..." : "Launch"}
              </button>
            </div>
          ) : null}

          {/* Feedback form */}
          {showFeedback && !isExecuting && (
            <div style={{ marginTop: 12 }}>
              <textarea
                className="form-textarea"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe what you'd like changed. E.g., 'Split the auth task into separate login and registration tasks' or 'Add a task for database migrations'"
                style={{ minHeight: 80 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) handleRevise();
                }}
              />
              <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setShowFeedback(false); setFeedback(""); }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleRevise}
                  disabled={!feedback.trim()}
                >
                  Revise Plan
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </div>

      {/* Edit Task Dialog */}
      {editingTask !== null && editDraft && (
        <div className="modal-overlay" onClick={cancelEditTask}>
          <div className="modal edit-task-modal" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <div className="panel-title">Edit TASK-{editingTask + 1}</div>
            </div>
            <div className="edit-task-body">
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  value={editDraft.title}
                  onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  value={editDraft.description}
                  onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                  rows={5}
                />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Agent</label>
                  <input
                    className="form-input"
                    value={editDraft.agent}
                    onChange={(e) => setEditDraft({ ...editDraft, agent: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Dependencies (task numbers)</label>
                  <input
                    className="form-input"
                    value={editDraft.dependencies.join(", ")}
                    placeholder="e.g. 1, 2"
                    onChange={(e) => setEditDraft({
                      ...editDraft,
                      dependencies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Acceptance Criteria</label>
                <div className="ac-edit-list">
                  {editDraft.acceptance_criteria.map((criterion, j) => (
                    <div key={j} className="ac-edit-row">
                      <input
                        className="form-input ac-edit-input"
                        value={criterion}
                        onChange={(e) => {
                          const updated = [...editDraft.acceptance_criteria];
                          updated[j] = e.target.value;
                          setEditDraft({ ...editDraft, acceptance_criteria: updated });
                        }}
                      />
                      <button
                        className="ac-edit-remove"
                        onClick={() => {
                          const updated = editDraft.acceptance_criteria.filter((_, k) => k !== j);
                          setEditDraft({ ...editDraft, acceptance_criteria: updated });
                        }}
                        title="Remove"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditDraft({
                      ...editDraft,
                      acceptance_criteria: [...editDraft.acceptance_criteria, ""],
                    })}
                    style={{ alignSelf: "flex-start" }}
                  >
                    + Add criterion
                  </button>
                </div>
              </div>
            </div>
            <div className="edit-task-footer">
              <button className="btn btn-secondary" onClick={cancelEditTask}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveEditTask}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
