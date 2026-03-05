import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type { Feature, DiffSummary, VerifyResult } from "../types";

export function FeatureStatusPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [error, setError] = useState("");
  const [launchCmd, setLaunchCmd] = useState("");
  const [copied, setCopied] = useState(false);
  const [prCommand, setPrCommand] = useState("");
  const [diff, setDiff] = useState<DiffSummary | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!featureId) return;
    tauri.getFeature(featureId).then(setFeature).catch(() => {});
  }, [featureId]);

  useEffect(() => {
    if (!featureId || !feature) return;
    // Get launch command for reference
    tauri.getLaunchCommand(featureId).then(setLaunchCmd).catch(() => {});
  }, [featureId, feature]);

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(launchCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMarkReady = async () => {
    if (!featureId) return;
    try {
      const updated = await tauri.markFeatureReady(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRunValidators = async () => {
    if (!featureId) return;
    setVerifying(true);
    setError("");
    try {
      const result = await tauri.runFeatureValidators(featureId);
      setVerifyResult(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setVerifying(false);
    }
  };

  const handleViewDiff = async () => {
    if (!featureId) return;
    try {
      const d = await tauri.getFeatureDiff(featureId);
      setDiff(d);
    } catch (e) {
      setError(String(e));
    }
  };

  const handlePushAndPR = async () => {
    if (!featureId) return;
    setError("");
    try {
      await tauri.pushFeature(featureId);
      const cmd = await tauri.getPrCommand(featureId);
      setPrCommand(cmd);
    } catch (e) {
      setError(String(e));
    }
  };

  if (!feature) {
    return (
      <div className="empty-state">
        <p>Loading feature...</p>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    ideation: "Planning",
    configuring: "Configuring",
    executing: "Executing",
    ready: "Ready",
    failed: "Failed",
  };

  return (
    <div>
      <div className="page-header">
        <h2>{feature.name}</h2>
        <p>
          <span
            className={`status-badge ${feature.status === "executing" ? "running" : feature.status}`}
          >
            <span className="status-dot" />
            {statusLabel[feature.status] ?? feature.status}
          </span>
          <span
            style={{
              marginLeft: 12,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            {feature.branch}
          </span>
          {feature.execution_mode && (
            <span
              style={{
                marginLeft: 12,
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              Mode: {feature.execution_mode === "teams" ? "Agent Teams" : "Subagents"}
            </span>
          )}
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Execution info */}
      {feature.status === "executing" && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title" style={{ marginBottom: 8 }}>
            Execution In Progress
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            Claude Code is working on your feature. When execution completes,
            mark the feature as ready to proceed to validation and PR creation.
          </p>

          {launchCmd && (
            <div style={{ marginBottom: 12 }}>
              <div className="code-block">{launchCmd}</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleCopyCommand}
                style={{ marginTop: 8 }}
              >
                {copied ? "Copied!" : "Copy Command"}
              </button>
            </div>
          )}

          <button className="btn btn-primary" onClick={handleMarkReady}>
            Mark as Ready
          </button>
        </div>
      )}

      {/* Task specs summary */}
      {feature.task_specs.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title" style={{ marginBottom: 8 }}>
            Tasks ({feature.task_specs.length})
          </div>
          <div className="task-spec-list">
            {feature.task_specs.map((spec, i) => (
              <div key={i} className="task-spec-card">
                <div className="task-spec-number">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="task-spec-content">
                  <div className="task-spec-title">{spec.title}</div>
                  {spec.agent && (
                    <div className="task-spec-agent">Agent: {spec.agent}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ready: validation, diff, PR */}
      {feature.status === "ready" && (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-title" style={{ marginBottom: 8 }}>
              Validation & PR
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-secondary"
                onClick={handleRunValidators}
                disabled={verifying}
              >
                {verifying ? "Running..." : "Run Validators"}
              </button>
              <button className="btn btn-secondary" onClick={handleViewDiff}>
                View Diff
              </button>
              <button className="btn btn-primary" onClick={handlePushAndPR}>
                Push & Create PR
              </button>
            </div>
          </div>

          {/* Validator results */}
          {verifyResult && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-title" style={{ marginBottom: 8 }}>
                Validation Results
                {verifyResult.all_passed ? (
                  <span
                    style={{
                      color: "var(--success)",
                      fontSize: 13,
                      fontWeight: 400,
                      marginLeft: 8,
                    }}
                  >
                    All passed
                  </span>
                ) : (
                  <span
                    style={{
                      color: "var(--danger)",
                      fontSize: 13,
                      fontWeight: 400,
                      marginLeft: 8,
                    }}
                  >
                    Some failed
                  </span>
                )}
              </div>
              {verifyResult.results.map((r, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: r.success ? "var(--success)" : "var(--danger)" }}>
                      {r.success ? "PASS" : "FAIL"}
                    </span>
                    <code style={{ fontSize: 12 }}>{r.command}</code>
                  </div>
                  {!r.success && r.stderr && (
                    <div
                      className="code-block"
                      style={{ marginTop: 4, fontSize: 11 }}
                    >
                      {r.stderr}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Diff summary */}
          {diff && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-title" style={{ marginBottom: 8 }}>
                Diff Summary
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 400,
                    marginLeft: 8,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {diff.total_files} files{" "}
                  <span style={{ color: "var(--success)" }}>
                    +{diff.total_insertions}
                  </span>{" "}
                  <span style={{ color: "var(--danger)" }}>
                    -{diff.total_deletions}
                  </span>
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                {diff.files.map((f) => (
                  <div
                    key={f.path}
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.path}
                    </span>
                    <span style={{ color: "var(--success)" }}>
                      +{f.insertions}
                    </span>
                    <span style={{ color: "var(--danger)" }}>
                      -{f.deletions}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PR command */}
          {prCommand && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-title" style={{ marginBottom: 8 }}>
                PR Command
              </div>
              <div className="code-block">{prCommand}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
