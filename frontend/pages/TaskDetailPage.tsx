import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import { PhasePipeline } from "../components/PhasePipeline";
import { StatusBadge } from "../components/StatusBadge";
import type { Task, VerifyResult, TaskEvent } from "../types";

const PHASE_SUBTITLES: Record<string, string> = {
  plan: "mapping the approach",
  code: "tinkering in the worktree",
  verify: "proof time",
  ready: "shippable loot",
};

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const tauri = useTauri();
  const [task, setTask] = useState<Task | null>(null);
  const [prompt, setPrompt] = useState("");
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [copied, setCopied] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");

  const loadTask = async () => {
    if (!taskId) return;
    try {
      // Auto-detect phase from worktree state first
      const t = await tauri.detectPhase(taskId);
      setTask(t);
      const p = await tauri.getPrompt(taskId);
      setPrompt(p);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    loadTask();
  }, [taskId]);

  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const handleRunVerification = async () => {
    if (!taskId) return;
    setLoading(true);
    setError("");
    try {
      const result = await tauri.runVerification(taskId);
      setVerifyResult(result);
      await loadTask();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadEvents = async () => {
    if (!taskId) return;
    const evts = await tauri.getEvents(taskId);
    setEvents(evts);
    setShowEvents(!showEvents);
  };

  const handleDelete = async () => {
    if (!taskId) return;
    await tauri.deleteTask(taskId);
    navigate("/tasks");
  };

  if (error && !task) {
    return (
      <div className="empty-state">
        <h3>Task not found</h3>
        <p>{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate("/tasks")}>
          Back to Tasks
        </button>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="empty-state">
        <p className="flavor-text">Gathering context...</p>
      </div>
    );
  }

  const isWorkPhase = task.phase === "plan" || task.phase === "code";

  return (
    <div>
      <div className="page-header">
        <h2>{task.title}</h2>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {task.branch}
        </p>
      </div>

      <PhasePipeline current={task.phase} />

      {error && (
        <div
          style={{
            color: "var(--danger)",
            fontSize: 13,
            marginBottom: 12,
            padding: "8px 12px",
            background: "rgba(196,101,74,0.1)",
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      {/* Status Card */}
      <div className="status-card">
        <div className="status-card-label">
          Currently <StatusBadge status={task.status} />
        </div>
        <div className="status-card-value">{task.phase}</div>
        <div className="status-card-subtitle">
          {PHASE_SUBTITLES[task.phase]}
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {/* Primary action: Launch Claude Code (for plan/code phases) */}
          {isWorkPhase && (
            <button
              className="btn btn-primary btn-lg"
              onClick={async () => {
                setLaunching(true);
                setError("");
                try {
                  await tauri.launchClaude(taskId!);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setLaunching(false);
                }
              }}
              disabled={launching}
            >
              {launching ? "Launching..." : "Launch Claude Code"}
            </button>
          )}

          {/* Verify phase: run validators */}
          {task.phase === "verify" && (
            <button
              className="btn btn-primary btn-lg"
              onClick={handleRunVerification}
              disabled={loading}
            >
              {loading ? "Running validators..." : "Run Verification"}
            </button>
          )}

          {/* Ready phase */}
          {task.phase === "ready" && (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => handleCopy(`cd ${task.worktree_path} && gh pr create`, "pr")}
            >
              {copied === "pr" ? "Copied!" : "Copy PR Command"}
            </button>
          )}
        </div>
      </div>

      {/* Secondary Actions */}
      <div className="actions-bar">
        <button
          className="btn btn-secondary"
          onClick={() => handleCopy(prompt, "prompt")}
        >
          {copied === "prompt" ? "Copied!" : "Copy Prompt"}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setShowPrompt(!showPrompt)}
        >
          {showPrompt ? "Hide Prompt" : "View Prompt"}
        </button>
        <button className="btn btn-secondary" onClick={handleLoadEvents}>
          {showEvents ? "Hide Events" : "View Events"}
        </button>
        <button
          className="btn btn-secondary"
          onClick={loadTask}
        >
          Refresh Status
        </button>
        <button className="btn btn-danger" onClick={handleDelete}>
          Delete Task
        </button>
      </div>

      {/* Prompt View */}
      {showPrompt && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-title" style={{ marginBottom: 8 }}>
            Current Prompt ({task.phase})
          </div>
          <div className="code-block">{prompt}</div>
        </div>
      )}

      {/* Events View */}
      {showEvents && events.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-title" style={{ marginBottom: 8 }}>
            Event Log
          </div>
          <div className="code-block">
            {events.map((evt, i) => (
              <div key={i}>
                <span style={{ color: "var(--muted)" }}>
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>{" "}
                <span style={{ color: "var(--accent-brass)" }}>
                  {evt.type}
                </span>{" "}
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(evt).filter(
                      ([k]) => k !== "type" && k !== "timestamp"
                    )
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verify Results */}
      {verifyResult && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <div className="panel-title">
              Verification Results (Attempt {verifyResult.attempt})
            </div>
            <StatusBadge
              status={verifyResult.all_passed ? "completed" : "failed"}
            />
          </div>
          {verifyResult.results.map((r, i) => (
            <div
              key={i}
              className={`verify-result ${r.success ? "pass" : "fail"}`}
            >
              <div className="verify-result-header">
                <code className="verify-result-cmd">{r.command}</code>
                <span
                  style={{
                    color: r.success ? "var(--success)" : "var(--danger)",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {r.success ? "PASS" : `FAIL (exit ${r.exit_code})`}
                </span>
              </div>
              {!r.success && (r.stdout || r.stderr) && (
                <div className="code-block" style={{ marginTop: 8 }}>
                  {r.stderr || r.stdout}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Worktree Info */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title" style={{ marginBottom: 8 }}>
          Worktree
        </div>
        <code className="code-block" style={{ display: "block" }}>
          cd {task.worktree_path}
        </code>
      </div>
    </div>
  );
}
