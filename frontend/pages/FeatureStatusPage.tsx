import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type {
  Feature,
  DiffSummary,
  VerifyResult,
  ExecutionSnapshot,
  ExecutionAnalysis,
  GuidanceNote,
  GuidancePriority,
} from "../types";

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

  // Execution observability
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Guidance notes
  const [guidanceNotes, setGuidanceNotes] = useState<GuidanceNote[]>([]);
  const [noteContent, setNoteContent] = useState("");
  const [notePriority, setNotePriority] = useState<GuidancePriority>("info");
  const [sendingNote, setSendingNote] = useState(false);

  // Analytics
  const [analysis, setAnalysis] = useState<ExecutionAnalysis | null>(null);

  useEffect(() => {
    if (!featureId) return;
    tauri
      .getFeature(featureId)
      .then(setFeature)
      .catch((e) => setError(`Failed to load feature: ${e}`));
  }, [featureId]);

  useEffect(() => {
    if (!featureId || !feature) return;
    tauri.getLaunchCommand(featureId).then(setLaunchCmd).catch(() => {});
    // Load guidance notes
    tauri.listGuidanceNotes(featureId).then(setGuidanceNotes).catch(() => {});
  }, [featureId, feature]);

  // Poll execution status while executing, with max poll count
  const pollCountRef = useRef(0);
  const MAX_EXEC_POLLS = 720; // Stop after ~1 hour (5s * 720)
  useEffect(() => {
    if (!featureId || feature?.status !== "executing") return;
    pollCountRef.current = 0;

    const poll = () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_EXEC_POLLS) {
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      tauri.pollExecutionStatus(featureId).then(setSnapshot).catch(() => {});
      // Also refresh feature to detect status changes from outside
      tauri.getFeature(featureId).then((f) => {
        if (f.status !== "executing") {
          setFeature(f);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }).catch(() => {});
    };
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [featureId, feature?.status]);

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
      if (pollRef.current) clearInterval(pollRef.current);
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

  const handleSendGuidance = async () => {
    if (!featureId || !noteContent.trim()) return;
    setSendingNote(true);
    try {
      const note = await tauri.addGuidanceNote(
        featureId,
        noteContent.trim(),
        notePriority,
      );
      setGuidanceNotes((prev) => [...prev, note]);
      setNoteContent("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSendingNote(false);
    }
  };

  const handleAnalyze = async () => {
    if (!featureId) return;
    try {
      const a = await tauri.analyzeFeatureExecution(featureId);
      setAnalysis(a);
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

  const priorityColors: Record<GuidancePriority, string> = {
    info: "var(--text-secondary)",
    important: "#c9a84c",
    critical: "var(--danger)",
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
              Mode:{" "}
              {feature.execution_mode === "teams"
                ? "Agent Teams"
                : "Subagents"}
            </span>
          )}
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Execution info with live observability */}
      {feature.status === "executing" && (
        <>
          {/* Live Progress Panel */}
          {snapshot && snapshot.commit_count > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-title" style={{ marginBottom: 8 }}>
                Live Progress
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {snapshot.commit_count}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Commits
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {snapshot.files_changed}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Files
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 600,
                      color: "var(--success)",
                    }}
                  >
                    +{snapshot.insertions}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Insertions
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 600,
                      color: "var(--danger)",
                    }}
                  >
                    -{snapshot.deletions}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Deletions
                  </div>
                </div>
              </div>

              {/* Recent commits */}
              {snapshot.recent_commits.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    Recent commits:
                  </div>
                  {snapshot.recent_commits.slice(0, 5).map((c) => (
                    <div
                      key={c.hash}
                      style={{
                        display: "flex",
                        gap: 8,
                        fontSize: 12,
                        padding: "2px 0",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <span style={{ color: "var(--muted)" }}>{c.hash}</span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {c.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Active files */}
              {snapshot.active_files.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    Modified files ({snapshot.active_files.length}):
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      maxHeight: 120,
                      overflowY: "auto",
                    }}
                  >
                    {snapshot.active_files.map((f) => (
                      <div
                        key={f}
                        style={{ color: "var(--text-secondary)", padding: "1px 0" }}
                      >
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Guidance Notes (send mid-execution instructions) */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-title" style={{ marginBottom: 8 }}>
              Send Guidance
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--muted)",
                marginBottom: 8,
              }}
            >
              Send orders to the mob mid-raid. Notes are
              written to the feature directory for agents to read.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                className="form-select"
                value={notePriority}
                onChange={(e) =>
                  setNotePriority(e.target.value as GuidancePriority)
                }
                style={{ width: 120 }}
              >
                <option value="info">Info</option>
                <option value="important">Important</option>
                <option value="critical">Critical</option>
              </select>
              <input
                type="text"
                className="form-input"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="e.g., Focus on the login flow first..."
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendGuidance();
                }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSendGuidance}
                disabled={sendingNote || !noteContent.trim()}
              >
                {sendingNote ? "Sending..." : "Send"}
              </button>
            </div>
            {guidanceNotes.length > 0 && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                {guidanceNotes.map((note) => (
                  <div
                    key={note.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      padding: "4px 0",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        color: priorityColors[note.priority],
                        fontWeight: 600,
                        textTransform: "uppercase",
                        fontSize: 10,
                        minWidth: 60,
                      }}
                    >
                      {note.priority}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {note.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Execution controls */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-title" style={{ marginBottom: 8 }}>
              Execution Controls
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              The mob is at work. When execution completes,
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
        </>
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

      {/* Ready: validation, diff, PR, analytics */}
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
              <button
                className="btn btn-secondary"
                onClick={handleAnalyze}
              >
                Analyze Execution
              </button>
              <button className="btn btn-primary" onClick={handlePushAndPR}>
                Push & Create PR
              </button>
            </div>
          </div>

          {/* Execution Analysis */}
          {analysis && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-title" style={{ marginBottom: 8 }}>
                Execution Analysis
              </div>

              {/* Mode Assessment */}
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  marginBottom: 12,
                  backgroundColor: analysis.mode_assessment.was_appropriate
                    ? "rgba(107, 158, 107, 0.1)"
                    : "rgba(196, 90, 106, 0.1)",
                  border: `1px solid ${analysis.mode_assessment.was_appropriate ? "rgba(107, 158, 107, 0.3)" : "rgba(196, 90, 106, 0.3)"}`,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 4,
                    color: analysis.mode_assessment.was_appropriate
                      ? "var(--success)"
                      : "var(--danger)",
                  }}
                >
                  {analysis.mode_assessment.was_appropriate
                    ? "Good mode choice"
                    : "Mode could be improved"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  {analysis.mode_assessment.reason}
                </div>
                {analysis.mode_assessment.suggestion && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      fontStyle: "italic",
                      marginTop: 4,
                    }}
                  >
                    Tip: {analysis.mode_assessment.suggestion}
                  </div>
                )}
              </div>

              {/* Task Coverage */}
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  marginBottom: 4,
                }}
              >
                Task coverage ({analysis.planned_task_count} planned,{" "}
                {analysis.files_changed} files changed):
              </div>
              {analysis.task_file_coverage.map((tc, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "4px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      color:
                        tc.coverage_status === "covered"
                          ? "var(--success)"
                          : tc.coverage_status === "partial"
                            ? "#c9a84c"
                            : "var(--muted)",
                      fontWeight: 600,
                      minWidth: 60,
                      fontSize: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    {tc.coverage_status === "no_changes_detected"
                      ? "No files"
                      : tc.coverage_status}
                  </span>
                  <span style={{ color: "var(--text-secondary)", flex: 1 }}>
                    {tc.task_title}
                  </span>
                  {tc.likely_files.length > 0 && (
                    <span
                      style={{
                        color: "var(--muted)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                      }}
                    >
                      {tc.likely_files.length} file
                      {tc.likely_files.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              ))}

              {/* Unplanned files */}
              {analysis.unplanned_files.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    Unplanned file changes:
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "#c9a84c",
                    }}
                  >
                    {analysis.unplanned_files.map((f) => (
                      <div key={f}>{f}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        color: r.success
                          ? "var(--success)"
                          : "var(--danger)",
                      }}
                    >
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
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
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
