import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type { Feature, IdeationResult } from "../types";

type IdeationStatus = "idle" | "running" | "done" | "error";

export function IdeationPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
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

  // Load feature data
  useEffect(() => {
    if (!featureId) return;
    tauri.getFeature(featureId).then(setFeature).catch(console.error);
    tauri.getIdeationPrompt(featureId).then(setSystemPrompt).catch(() => {});
  }, [featureId]);

  // Start ideation on mount
  const startIdeation = useCallback(async () => {
    if (!featureId) return;
    setStatus("running");
    setError("");
    setIdeationResult(null);
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

  const handleProceedToLaunch = () => {
    if (!featureId) return;
    navigate(`/feature/${featureId}/launch`);
  };

  if (!feature) {
    return (
      <div className="empty-state">
        <p>Loading feature...</p>
      </div>
    );
  }

  const recommendation = ideationResult?.execution_mode;

  return (
    <div>
      <div className="page-header">
        <h2>Planning: {feature.name}</h2>
        <p>{feature.description}</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Planning status */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <div className="panel-title">
            {status === "running" ? "Planning in progress..." : "Plan"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {status !== "running" && (
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
      </div>

      {/* Plan result */}
      {status === "done" && ideationResult && ideationResult.tasks.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              Plan ({ideationResult.tasks.length} tasks)
            </div>
          </div>

          {/* Execution mode recommendation */}
          {recommendation && (
            <div className="exec-mode-card">
              <div className={`exec-mode-icon ${recommendation.recommended === "teams" ? "exec-mode-teams" : "exec-mode-sub"}`}>
                {recommendation.recommended === "teams" ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="12" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="1" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="12" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="4" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="10" y1="7" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="10" y1="12" x2="4" y2="17" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="10" y1="12" x2="16" y2="17" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="4" cy="17" r="2" fill="currentColor" opacity="0.4" />
                    <circle cx="16" cy="17" r="2" fill="currentColor" opacity="0.4" />
                  </svg>
                )}
              </div>
              <div className="exec-mode-body">
                <div className="exec-mode-title">
                  {recommendation.recommended === "teams"
                    ? "Agent Teams"
                    : "Subagents"}
                </div>
                <div className="exec-mode-desc">
                  {recommendation.rationale}
                </div>
              </div>
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
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleProceedToLaunch}
              style={{ flex: 1 }}
            >
              Approve & Configure Launch
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => setShowFeedback(!showFeedback)}
            >
              Request Changes
            </button>
          </div>

          {/* Feedback form */}
          {showFeedback && (
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
        </div>
      )}
    </div>
  );
}
