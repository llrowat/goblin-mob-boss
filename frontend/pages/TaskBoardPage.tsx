import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import { StatusBadge } from "../components/StatusBadge";
import type { Task, Repository, VerifyResult } from "../types";

export function TaskBoardPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repo, setRepo] = useState<Repository | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [terminalCmds, setTerminalCmds] = useState<Record<string, string>>({});
  const [verifyResults, setVerifyResults] = useState<
    Record<string, VerifyResult>
  >({});
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load repo info
  useEffect(() => {
    tauri.listRepositories().then((repos) => {
      const found = repos.find((r) => r.id === repoId);
      if (found) setRepo(found);
    });
  }, [repoId]);

  // Load & poll tasks
  const loadTasks = useCallback(() => {
    if (!repoId) return;
    tauri.listTasks(repoId).then(setTasks).catch(() => {});
  }, [repoId]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Poll running task statuses
  useEffect(() => {
    const running = tasks.filter((t) => t.status === "running");
    running.forEach((t) => {
      tauri.pollTaskStatus(t.task_id).then((updated) => {
        if (updated.status !== t.status) {
          setTasks((prev) =>
            prev.map((p) =>
              p.task_id === updated.task_id ? updated : p
            )
          );
        }
      });
    });
  }, [tasks]);

  const canStart = (task: Task): boolean => {
    if (task.status !== "pending") return false;
    if (task.dependencies.length === 0) return true;
    // Check all dependencies are completed
    return task.dependencies.every((depNum) => {
      const depTask = tasks.find((_, i) =>
        depNum === String(i + 1).padStart(2, "0")
      );
      return depTask?.status === "completed";
    });
  };

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const maxParallel = repo?.max_parallel_agents ?? 4;

  const handleStartAgent = async (taskId: string) => {
    setError("");
    try {
      const updated = await tauri.startAgent(taskId);
      setTasks((prev) =>
        prev.map((t) => (t.task_id === updated.task_id ? updated : t))
      );
      // Get terminal command
      const cmd = await tauri.getAgentTerminalCommand(taskId);
      setTerminalCmds((prev) => ({ ...prev, [taskId]: cmd }));
    } catch (e) {
      setError(String(e));
    }
  };

  const handleLaunchAgent = async (taskId: string) => {
    try {
      await tauri.launchAgent(taskId);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCopyCommand = async (taskId: string) => {
    let cmd = terminalCmds[taskId];
    if (!cmd) {
      cmd = await tauri.getAgentTerminalCommand(taskId);
      setTerminalCmds((prev) => ({ ...prev, [taskId]: cmd }));
    }
    await navigator.clipboard.writeText(cmd);
    setCopiedId(taskId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRunVerification = async (taskId: string) => {
    setError("");
    try {
      const result = await tauri.runVerification(taskId);
      setVerifyResults((prev) => ({ ...prev, [taskId]: result }));
      loadTasks();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleMarkComplete = async (taskId: string) => {
    try {
      const updated = await tauri.updateTaskStatus(taskId, "completed");
      setTasks((prev) =>
        prev.map((t) => (t.task_id === updated.task_id ? updated : t))
      );
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await tauri.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStartAll = async () => {
    const startable = tasks.filter(
      (t) => canStart(t) && runningCount < maxParallel
    );
    for (const task of startable) {
      await handleStartAgent(task.task_id);
    }
  };

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <h3>No tasks yet</h3>
        <p>Start an ideation session to generate tasks.</p>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate("/")}
        >
          Start Ideation
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>{repo?.name ?? "Tasks"}</h2>
        <p>
          {completedCount}/{tasks.length} complete
          {runningCount > 0 && ` \u00B7 ${runningCount} running`}
          {pendingCount > 0 && ` \u00B7 ${pendingCount} pending`}
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Progress bar */}
      <div className="progress-bar-container" style={{ marginBottom: 16 }}>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{
              width: `${(completedCount / tasks.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Batch actions */}
      {pendingCount > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={handleStartAll}>
            Start Available Tasks
          </button>
        </div>
      )}

      {/* Task cards */}
      <div className="task-board">
        {tasks.map((task, index) => (
          <div key={task.task_id} className={`task-card ${task.status}`}>
            <div
              className="task-card-header"
              onClick={() =>
                setExpandedTask(
                  expandedTask === task.task_id ? null : task.task_id
                )
              }
            >
              <div className="task-card-number">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="task-card-title">{task.title}</div>
              <StatusBadge status={task.status} />
            </div>

            {expandedTask === task.task_id && (
              <div className="task-card-body">
                <p className="task-card-description">{task.description}</p>

                {task.acceptance_criteria.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Acceptance Criteria
                    </div>
                    <ul className="task-spec-criteria">
                      {task.acceptance_criteria.map((c, j) => (
                        <li key={j}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {task.branch && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      fontFamily: "var(--font-mono)",
                      marginTop: 8,
                    }}
                  >
                    {task.branch}
                  </div>
                )}

                <div className="actions-bar">
                  {task.status === "pending" && canStart(task) && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleStartAgent(task.task_id)}
                    >
                      Start Agent
                    </button>
                  )}

                  {task.status === "running" && (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleLaunchAgent(task.task_id)}
                      >
                        Launch Claude Code
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleCopyCommand(task.task_id)}
                      >
                        {copiedId === task.task_id ? "Copied!" : "Copy Cmd"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRunVerification(task.task_id)}
                      >
                        Verify
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleMarkComplete(task.task_id)}
                      >
                        Mark Done
                      </button>
                    </>
                  )}

                  {task.status === "failed" && (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleStartAgent(task.task_id)}
                      >
                        Retry Agent
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleLaunchAgent(task.task_id)}
                      >
                        Launch Claude Code
                      </button>
                    </>
                  )}

                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteTask(task.task_id)}
                  >
                    Delete
                  </button>
                </div>

                {/* Verify results */}
                {verifyResults[task.task_id] && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Verification (Attempt{" "}
                      {verifyResults[task.task_id].attempt})
                    </div>
                    {verifyResults[task.task_id].results.map((r, i) => (
                      <div
                        key={i}
                        className={`verify-result ${r.success ? "pass" : "fail"}`}
                      >
                        <div className="verify-result-header">
                          <span className="verify-result-cmd">
                            {r.command}
                          </span>
                          <span
                            style={{
                              color: r.success
                                ? "var(--success)"
                                : "var(--danger)",
                            }}
                          >
                            {r.success ? "PASS" : "FAIL"}
                          </span>
                        </div>
                        {!r.success && (r.stderr || r.stdout) && (
                          <div className="code-block" style={{ marginTop: 4 }}>
                            {r.stderr || r.stdout}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
