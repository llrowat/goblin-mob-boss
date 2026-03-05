import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type { Feature, IdeationResult } from "../types";

export function IdeationPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [terminalCmd, setTerminalCmd] = useState("");
  const [ideationResult, setIdeationResult] = useState<IdeationResult | null>(
    null,
  );
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [error] = useState("");
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

  // Poll for ideation result (plan.json)
  const pollResult = useCallback(() => {
    if (!featureId) return;
    tauri
      .pollIdeationResult(featureId)
      .then((result) => {
        if (result.tasks.length > 0) {
          setIdeationResult(result);
        }
      })
      .catch(() => {});
  }, [featureId]);

  useEffect(() => {
    pollResult();
    const interval = setInterval(pollResult, 3000);
    return () => clearInterval(interval);
  }, [pollResult]);

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(terminalCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          Open Claude Code in plan mode. Discuss your goals, refine the
          approach, then ask Claude to create the plan. The plan includes task
          specs and a recommended execution mode (teams vs subagents).
        </p>

        <div className="actions-bar" style={{ marginTop: 0 }}>
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

      {/* Step 2: Discovered Tasks + Execution Mode */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            Step 2: Review plan (
            {ideationResult?.tasks.length ?? 0} tasks)
          </div>
          <button className="btn btn-secondary btn-sm" onClick={pollResult}>
            Refresh
          </button>
        </div>

        {!ideationResult || ideationResult.tasks.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              fontStyle: "italic",
            }}
          >
            No plan yet. Once you and Claude agree on a plan, Claude will create
            a plan.json that appears here automatically.
          </p>
        ) : (
          <>
            {/* Execution mode recommendation */}
            {recommendation && (
              <div
                style={{
                  marginBottom: 16,
                  padding: 12,
                  background: "var(--surface-hover)",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Recommended Execution Mode
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {recommendation.recommended === "teams"
                    ? "Agent Teams (tmux)"
                    : "Subagents (single lead)"}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                      marginLeft: 8,
                    }}
                  >
                    {Math.round(recommendation.confidence * 100)}% confidence
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  {recommendation.rationale}
                </div>
              </div>
            )}

            {/* Task list */}
            <div className="task-spec-list">
              {ideationResult.tasks.map((spec, i) => (
                <div key={i} className="task-spec-card">
                  <div className="task-spec-number">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="task-spec-content">
                    <div className="task-spec-title">{spec.title}</div>
                    <div className="task-spec-description">
                      {spec.description}
                    </div>
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
                  </div>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={handleProceedToLaunch}
              style={{ width: "100%", marginTop: 16 }}
            >
              Configure & Launch
            </button>
          </>
        )}
      </div>
    </div>
  );
}
