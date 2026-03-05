import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import { StatusBadge } from "../components/StatusBadge";
import type { Task, Feature, Repository, Agent, VerifyResult, DiffSummary } from "../types";

export function TaskBoardPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [feature, setFeature] = useState<Feature | null>(null);
  const [reposMap, setReposMap] = useState<Record<string, Repository>>({});
  const [agents, setAgents] = useState<Record<string, Agent>>({});
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [terminalCmds, setTerminalCmds] = useState<Record<string, string>>({});
  const [verifyResults, setVerifyResults] = useState<
    Record<string, VerifyResult>
  >({});
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [prCommand, setPrCommand] = useState("");
  const [diffSummaries, setDiffSummaries] = useState<Record<string, DiffSummary>>({});
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);

  const isMultiRepo = feature ? feature.repos.length > 1 : false;

  // Load feature and repos
  useEffect(() => {
    if (!featureId) return;
    tauri.getFeature(featureId).then((f) => {
      setFeature(f);
      tauri.listRepositories().then((repos) => {
        const map: Record<string, Repository> = {};
        repos.forEach((r) => (map[r.id] = r));
        setReposMap(map);
      });
    });
    tauri.listAgents().then((list) => {
      const map: Record<string, Agent> = {};
      list.forEach((a) => (map[a.id] = a));
      setAgents(map);
    });
  }, [featureId]);

  // Load & poll tasks
  const loadTasks = useCallback(() => {
    if (!featureId) return;
    tauri.listTasks(featureId).then(setTasks).catch(() => {});
  }, [featureId]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Fetch diff summaries for completed/merged tasks
  useEffect(() => {
    for (const task of tasks) {
      if (
        (task.status === "completed" || task.status === "merged") &&
        !diffSummaries[task.task_id]
      ) {
        tauri
          .getTaskDiff(task.task_id)
          .then((diff) =>
            setDiffSummaries((prev) => ({ ...prev, [task.task_id]: diff })),
          )
          .catch(() => {}); // silently ignore if diff unavailable
      }
    }
  }, [tasks]);

  const canStart = (task: Task): boolean => {
    if (task.status !== "pending") return false;
    if (task.dependencies.length === 0) return true;
    return task.dependencies.every((depNum) => {
      const depTask = tasks.find(
        (_, i) => depNum === String(i + 1).padStart(2, "0"),
      );
      return depTask?.status === "completed" || depTask?.status === "merged";
    });
  };

  const runningCount = tasks.filter((t) => t.status === "running").length;
  // Sum max parallel across all feature repos
  const maxParallel = feature
    ? feature.repos.reduce(
        (sum, fr) => sum + (reposMap[fr.repo_id]?.max_parallel_agents ?? 4),
        0,
      ) || 4
    : 4;

  const handleStartTask = async (taskId: string) => {
    setError("");
    try {
      const updated = await tauri.startTask(taskId);
      setTasks((prev) =>
        prev.map((t) => (t.task_id === updated.task_id ? updated : t)),
      );
      const cmd = await tauri.getTaskTerminalCommand(taskId);
      setTerminalCmds((prev) => ({ ...prev, [taskId]: cmd }));
    } catch (e) {
      setError(String(e));
    }
  };

  const handleLaunchTask = async (taskId: string) => {
    try {
      await tauri.launchTask(taskId);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCopyCommand = async (taskId: string) => {
    let cmd = terminalCmds[taskId];
    if (!cmd) {
      cmd = await tauri.getTaskTerminalCommand(taskId);
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

  const handleCompleteTask = async (taskId: string) => {
    try {
      const updated = await tauri.completeTask(taskId);
      setTasks((prev) =>
        prev.map((t) => (t.task_id === updated.task_id ? updated : t)),
      );
    } catch (e) {
      setError(String(e));
    }
  };

  const handleMergeTask = async (taskId: string) => {
    setError("");
    try {
      const updated = await tauri.mergeTask(taskId);
      setTasks((prev) =>
        prev.map((t) => (t.task_id === updated.task_id ? updated : t)),
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
    let running = runningCount;
    for (const task of tasks) {
      if (canStart(task) && running < maxParallel) {
        await handleStartTask(task.task_id);
        running++;
      }
    }
  };

  // Feature-level actions
  const handleStartVerification = async () => {
    if (!featureId) return;
    setError("");
    try {
      const updated = await tauri.startFeatureVerification(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleLaunchVerification = async () => {
    if (!featureId) return;
    try {
      await tauri.launchVerification(featureId);
    } catch (e) {
      setError(String(e));
    }
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

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const mergedCount = tasks.filter((t) => t.status === "merged").length;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const allDone =
    tasks.length > 0 &&
    tasks.every((t) => t.status === "completed" || t.status === "merged");

  if (!feature) {
    return (
      <div className="empty-state">
        <p>Loading feature...</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <h3>No tasks yet</h3>
        <p>Go to the planning session to create tasks.</p>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate(`/feature/${featureId}/ideation`)}
        >
          Open Planning
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>{feature.name}</h2>
        <p>
          {mergedCount + completedCount}/{tasks.length} done
          {runningCount > 0 && ` \u00B7 ${runningCount} running`}
          {pendingCount > 0 && ` \u00B7 ${pendingCount} pending`}
          {isMultiRepo && (
            <span
              style={{
                marginLeft: 12,
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              {feature.repos.length} repos
            </span>
          )}
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
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Progress bar */}
      <div className="progress-bar-container" style={{ marginBottom: 16 }}>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{
              width: `${((mergedCount + completedCount) / tasks.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Feature-level actions */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        {pendingCount > 0 && (
          <button className="btn btn-primary" onClick={handleStartAll}>
            Start Available Tasks
          </button>
        )}

        {allDone && feature.status === "in_progress" && (
          <button className="btn btn-brass" onClick={handleStartVerification}>
            Start Final Verification
          </button>
        )}

        {feature.status === "verifying" && (
          <>
            <button
              className="btn btn-primary"
              onClick={handleLaunchVerification}
            >
              Launch Verification
            </button>
            <button className="btn btn-brass" onClick={handleMarkReady}>
              Mark Ready
            </button>
          </>
        )}

        {feature.status === "ready" && (
          <button className="btn btn-primary" onClick={handlePushAndPR}>
            Push & Create PR
          </button>
        )}
      </div>

      {prCommand && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title" style={{ marginBottom: 8 }}>
            PR Command
          </div>
          <div className="code-block">{prCommand}</div>
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
                  expandedTask === task.task_id ? null : task.task_id,
                )
              }
            >
              <div className="task-card-number">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="task-card-title">{task.title}</div>
              {isMultiRepo && reposMap[task.repo_id] && (
                <span
                  className="agent-tag agent-tag-sub"
                  title={reposMap[task.repo_id].path}
                >
                  {reposMap[task.repo_id].name}
                </span>
              )}
              {agents[task.agent_id] && (
                <span className="agent-tag">
                  {agents[task.agent_id].name}
                </span>
              )}
              <StatusBadge status={task.status} />
              {diffSummaries[task.task_id] && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-secondary)",
                    marginLeft: 8,
                    whiteSpace: "nowrap",
                  }}
                >
                  {diffSummaries[task.task_id].total_files} file
                  {diffSummaries[task.task_id].total_files !== 1 ? "s" : ""}
                  {" "}
                  <span style={{ color: "var(--success)" }}>
                    +{diffSummaries[task.task_id].total_insertions}
                  </span>
                  {" "}
                  <span style={{ color: "var(--danger)" }}>
                    -{diffSummaries[task.task_id].total_deletions}
                  </span>
                </span>
              )}
            </div>

            {expandedTask === task.task_id && (
              <div className="task-card-body">
                <p className="task-card-description">{task.description}</p>

                {/* Agent & Subagents */}
                <div className="task-agents-section">
                  {agents[task.agent_id] && (
                    <div className="task-agent-row">
                      <span className="task-agent-label">Agent</span>
                      <span className="agent-tag">
                        {agents[task.agent_id].name}
                      </span>
                      <span className="task-agent-role">
                        {agents[task.agent_id].role}
                      </span>
                    </div>
                  )}
                  {task.subagent_ids.length > 0 && (
                    <div className="task-agent-row">
                      <span className="task-agent-label">Subagents</span>
                      <div className="task-agent-tags">
                        {task.subagent_ids.map((id) =>
                          agents[id] ? (
                            <span key={id} className="agent-tag agent-tag-sub">
                              {agents[id].name}
                              <span className="task-agent-role">
                                {agents[id].role}
                              </span>
                            </span>
                          ) : null,
                        )}
                      </div>
                    </div>
                  )}
                </div>

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

                {/* Changed files */}
                {diffSummaries[task.task_id] &&
                  diffSummaries[task.task_id].files.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          marginBottom: 4,
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                        onClick={() =>
                          setExpandedDiff(
                            expandedDiff === task.task_id
                              ? null
                              : task.task_id,
                          )
                        }
                      >
                        {expandedDiff === task.task_id ? "\u25BC" : "\u25B6"}{" "}
                        Changed Files (
                        {diffSummaries[task.task_id].total_files})
                      </div>
                      {expandedDiff === task.task_id && (
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                            lineHeight: 1.6,
                          }}
                        >
                          {diffSummaries[task.task_id].files.map((f) => (
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
                                title={f.path}
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
                      )}
                    </div>
                  )}

                <div className="actions-bar">
                  {task.status === "pending" && canStart(task) && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleStartTask(task.task_id)}
                    >
                      Start Agent
                    </button>
                  )}

                  {task.status === "running" && (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleLaunchTask(task.task_id)}
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
                        onClick={() => handleCompleteTask(task.task_id)}
                      >
                        Mark Done
                      </button>
                    </>
                  )}

                  {task.status === "completed" && (
                    <button
                      className="btn btn-brass btn-sm"
                      onClick={() => handleMergeTask(task.task_id)}
                    >
                      Merge to Feature
                    </button>
                  )}

                  {task.status === "failed" && (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleStartTask(task.task_id)}
                      >
                        Retry Agent
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleLaunchTask(task.task_id)}
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
                          <span className="verify-result-cmd">{r.command}</span>
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
                          <div
                            className="code-block"
                            style={{ marginTop: 4 }}
                          >
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
