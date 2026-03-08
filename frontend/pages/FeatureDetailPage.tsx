import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { useBackgroundPlanning } from "../hooks/useBackgroundPlanning";
import type {
  Feature,
  IdeationResult,
  TaskSpec,
  ExecutionMode,
  TaskProgress,
  DiffSummary,
  VerifyResult,
  ExecutionAnalysis,
  PlanningQuestion,
  PlanningAnswer,
} from "../types";

type IdeationStatus = "idle" | "running" | "questions" | "done" | "error";

export function FeatureDetailPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const { session: terminalSession, startSession, clearSession } = useTerminalSession();
  const { isPlanning, addPlanning, consumePlan } = useBackgroundPlanning();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [ideationResult, setIdeationResult] = useState<IdeationResult | null>(
    null,
  );
  const [status, setStatus] = useState<IdeationStatus>("idle");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [showContext, setShowContext] = useState(false);
  // Planning questions state
  const [questions, setQuestions] = useState<PlanningQuestion[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [answeredHistory, setAnsweredHistory] = useState<PlanningAnswer[]>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [expandedTask, setExpandedTask] = useState<number | null>(null);

  // Execution mode override
  const [modeOverride, setModeOverride] = useState<ExecutionMode | null>(null);

  // Edit dialog
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TaskSpec | null>(null);

  // Launch
  const [launching, setLaunching] = useState(false);

  // Task progress tracking during execution
  const [taskProgress, setTaskProgress] = useState<TaskProgress | null>(null);

  // Ready-state: validation, diff, PR, analytics
  const [diff, setDiff] = useState<DiffSummary | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [analysis, setAnalysis] = useState<ExecutionAnalysis | null>(null);

  // Load feature data
  useEffect(() => {
    if (!featureId) return;
    tauri.getFeature(featureId).then(async (f) => {
      // Restore execution mode override from saved feature config
      if (f.execution_mode) {
        setModeOverride(f.execution_mode);
      }
      if (f.status === "executing" && f.pty_session_id) {
        // Check whether the PTY session still exists
        // (it won't after an app refresh since the backend restarts)
        const exists = await tauri.ptySessionExists(f.pty_session_id).catch(() => false);
        if (exists) {
          startSession(f.id, f.pty_session_id);
        } else {
          // PTY session is gone — mark feature as ready
          try {
            const updated = await tauri.markFeatureReady(featureId);
            f = updated;
          } catch {
            // best-effort
          }
        }
      } else if (f.status !== "executing") {
        // Feature is not executing — ensure no stale terminal session remains
        clearSession();
      }
      setFeature(f);
      // If task_specs exist (set by configureLaunch), always use them as the plan source.
      // This covers executing, ready, failed, and cancelled-back-to-ideation features.
      if (f.task_specs.length > 0) {
        setIdeationResult({ tasks: f.task_specs, execution_mode: null, questions: null, answered_questions: null });
        setStatus("done");
      }
    }).catch(console.error);
    tauri.getIdeationPrompt(featureId).then(setSystemPrompt).catch(() => {});
  }, [featureId]);

  // Auto-load execution analysis and diff when feature reaches ready/pushed/complete state
  useEffect(() => {
    if (!featureId) return;
    const showResults = feature?.status === "ready" || feature?.status === "failed"
      || feature?.status === "pushed" || feature?.status === "complete";
    if (!showResults) return;
    if (!analysis) {
      tauri.analyzeFeatureExecution(featureId).then(setAnalysis).catch(() => {});
    }
    if (!diff) {
      tauri.getFeatureDiff(featureId).then(setDiff).catch(() => {});
    }
  }, [featureId, feature?.status]);

  // Refresh feature when terminal session clears (execution completed or cancelled)
  useEffect(() => {
    if (!featureId || terminalSession) return;
    // Session just cleared — refresh feature to pick up ready/failed status
    tauri.getFeature(featureId).then(setFeature).catch(() => {});
  }, [featureId, terminalSession]);

  // Poll feature status while executing to detect when it transitions to ready
  useEffect(() => {
    if (!featureId || feature?.status !== "executing") return;
    const interval = setInterval(() => {
      tauri.getFeature(featureId).then((f) => {
        if (f.status !== "executing") {
          setFeature(f);
          clearSession();
        }
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [featureId, feature?.status]);

  // Keep a ref to the terminal session ID so the progress handler always has the latest value
  const terminalSessionIdRef = useRef<string | null>(null);
  terminalSessionIdRef.current = terminalSession?.sessionId ?? null;

  // Load task progress — once for completed features, poll during execution
  useEffect(() => {
    if (!featureId) return;
    const isExecuting = feature?.status === "executing";
    const isComplete = feature?.status === "ready" || feature?.status === "failed"
      || feature?.status === "pushed" || feature?.status === "complete";
    if (!isExecuting && !isComplete) return;

    // Number of planned tasks (from ideation/launch config)
    const expectedTaskCount = ideationResult?.tasks?.length ?? 0;
    let autoEnded = false;

    const handleProgress = (p: TaskProgress | null) => {
      if (!p) return;
      setTaskProgress(p);
      // If all tasks are done during execution, end execution automatically.
      // Cross-reference against expected task count to avoid premature completion
      // when Claude has only written a subset of tasks to progress.json.
      if (
        isExecuting &&
        !autoEnded &&
        p.tasks.length > 0 &&
        (expectedTaskCount === 0 || p.tasks.length >= expectedTaskCount) &&
        p.tasks.every((t) => t.status === "done")
      ) {
        autoEnded = true;
        const sid = terminalSessionIdRef.current;
        // Kill the PTY, mark feature ready, and clear session directly.
        // Don't rely on pty-exit event chain — it can be unreliable on Windows.
        if (sid) {
          tauri.killPty(sid).catch(() => {});
        }
        tauri.markFeatureReady(featureId).then((f) => {
          setFeature(f);
          clearSession();
        }).catch(() => {});
      }
    };

    // Fetch once immediately
    tauri.pollTaskProgress(featureId).then(handleProgress).catch(() => {});
    // Only keep polling while executing
    if (!isExecuting) return;
    const interval = setInterval(() => {
      tauri.pollTaskProgress(featureId).then(handleProgress).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [featureId, feature?.status, ideationResult?.tasks?.length]);

  // Start ideation on mount
  const startIdeation = useCallback(async () => {
    if (!featureId) return;
    setStatus("running");
    setError("");
    setIdeationResult(null);
    clearSession();
    try {
      addPlanning(featureId);
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

    // If the feature already has saved task_specs (from configureLaunch), always use those.
    // This prevents plan.json (which may be stale or modified by execution) from overwriting
    // the user's configured plan.
    tauri.getFeature(featureId).then((f) => {
      if (f.task_specs.length > 0) {
        setIdeationResult({ tasks: f.task_specs, execution_mode: null, questions: null, answered_questions: null });
        setStatus("done");
        return;
      }

      // For ideation/configuring, check background planning first
      const bgPlan = consumePlan(featureId);
      if (bgPlan) {
        if (bgPlan.tasks.length > 0) {
          setIdeationResult(bgPlan);
          if (bgPlan.answered_questions) {
            setAnsweredHistory(bgPlan.answered_questions);
          }
          setStatus("done");
          return;
        }
        if (bgPlan.questions && bgPlan.questions.length > 0) {
          setQuestions(bgPlan.questions);
          if (bgPlan.answered_questions) {
            setAnsweredHistory(bgPlan.answered_questions);
          }
          setStatus("questions");
          return;
        }
      }

      // Poll plan.json for ideation results
      return tauri.pollIdeationResult(featureId).then((result) => {
        if (result.tasks.length > 0) {
          setIdeationResult(result);
          if (result.answered_questions) {
            setAnsweredHistory(result.answered_questions);
          }
          setStatus("done");
        } else if (result.questions && result.questions.length > 0) {
          setQuestions(result.questions);
          if (result.answered_questions) {
            setAnsweredHistory(result.answered_questions);
          }
          setStatus("questions");
        } else if (isPlanning(featureId)) {
          setStatus("running");
        } else {
          startIdeation();
        }
      }).catch(() => {
        if (isPlanning(featureId)) {
          setStatus("running");
        } else {
          startIdeation();
        }
      });
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
          if (result.answered_questions) {
            setAnsweredHistory(result.answered_questions);
          }
          setStatus("done");
        } else if (result.questions && result.questions.length > 0) {
          setQuestions(result.questions);
          if (result.answered_questions) {
            setAnsweredHistory(result.answered_questions);
          }
          setStatus("questions");
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

  const handleSubmitAnswers = async () => {
    if (!featureId || questions.length === 0) return;
    const answers: PlanningAnswer[] = questions.map((q) => ({
      id: q.id,
      question: q.question,
      answer: questionAnswers[q.id] || "",
    }));
    setStatus("running");
    setError("");
    setQuestions([]);
    setAnsweredHistory((prev) => [...prev, ...answers]);
    try {
      addPlanning(featureId);
      await tauri.submitPlanningAnswers(featureId, answers);
      setQuestionAnswers({});
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
      // Refresh feature state so polling effects detect "executing" status
      const updated = await tauri.getFeature(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setLaunching(false);
    }
  };

  // Ready-state handlers
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
      setDiff(await tauri.getFeatureDiff(featureId));
    } catch (e) {
      setError(String(e));
    }
  };

  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);
  const handlePush = async () => {
    if (!featureId) return;
    setPushing(true);
    setError("");
    try {
      await tauri.pushFeature(featureId);
      setPushed(true);
      const updated = await tauri.getFeature(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setPushing(false);
    }
  };

  const [completing, setCompleting] = useState(false);
  const handleComplete = async () => {
    if (!featureId) return;
    setCompleting(true);
    setError("");
    try {
      const updated = await tauri.completeFeature(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setCompleting(false);
    }
  };

  // Make Changes (from pushed state → back to ideation with feedback)
  const [showMakeChanges, setShowMakeChanges] = useState(false);
  const [changesFeedback, setChangesFeedback] = useState("");
  const [submittingChanges, setSubmittingChanges] = useState(false);
  const handleMakeChanges = async () => {
    if (!featureId || !changesFeedback.trim()) return;
    setSubmittingChanges(true);
    setError("");
    try {
      // Reset feature back to ideation
      await tauri.cancelExecution(featureId);
      // Feed the changes feedback into ideation
      await tauri.reviseIdeation(featureId, changesFeedback.trim());
      // Reset frontend state
      setShowMakeChanges(false);
      setChangesFeedback("");
      setIdeationResult(null);
      setStatus("running");
      setDiff(null);
      setAnalysis(null);
      setVerifyResult(null);
      setTaskProgress(null);
      const updated = await tauri.getFeature(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmittingChanges(false);
    }
  };

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const handleDelete = async () => {
    if (!featureId) return;
    try {
      await tauri.deleteFeature(featureId);
      navigate("/");
    } catch (e) {
      setError(String(e));
    }
  };

  // Execution panel state (for ready/failed features without active terminal)
  const [showCommand, setShowCommand] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const handleRestartExecution = async () => {
    if (!featureId) return;
    setRestarting(true);
    setError("");
    setTaskProgress(null);
    try {
      const sessionId = await tauri.startLaunchPty(featureId, 120, 30);
      startSession(featureId, sessionId);
      const updated = await tauri.getFeature(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setRestarting(false);
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
  const isReady = feature.status === "ready" || feature.status === "failed";
  const isPushed = feature.status === "pushed";
  const isComplete = feature.status === "complete";
  const isReadOnly = isExecuting || isReady || isPushed || isComplete;

  const headerLabel = isExecuting
    ? "Executing"
    : isComplete
      ? "Complete"
      : isPushed
        ? "Pushed"
        : isReady
          ? feature.status === "ready" ? "Ready" : "Failed"
          : "Planning";

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>{headerLabel}: {feature.name}</h2>
          <p>
            {feature.description}
            {feature.branch && (
              <span style={{ marginLeft: 12, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
                {feature.branch}
              </span>
            )}
          </p>
        </div>
        {!deleteConfirm ? (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setDeleteConfirm(true)}
            title="Delete feature"
            style={{ color: "var(--danger)", flexShrink: 0 }}
          >
            Delete
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>
              Confirm Delete
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeleteConfirm(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            {status === "running"
              ? "Planning in progress..."
              : status === "questions"
                ? "Questions from the planner"
                : status === "done" && ideationResult
                  ? `Plan (${ideationResult.tasks.length} tasks)`
                  : "Plan"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {status !== "running" && !isReadOnly && (
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

        {/* Planning questions UI */}
        {status === "questions" && questions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
              The planner has some questions before finalizing the plan.
            </div>

            {questions.map((q) => (
              <div
                key={q.id}
                style={{
                  padding: "12px 16px",
                  marginBottom: 12,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  {q.question}
                </div>
                {q.context && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5 }}>
                    {q.context}
                  </div>
                )}
                {q.type === "single_choice" && q.options ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {q.options.map((opt) => (
                      <label
                        key={opt}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 13,
                          cursor: "pointer",
                          padding: "4px 0",
                        }}
                      >
                        <input
                          type="radio"
                          name={`question-${q.id}`}
                          checked={questionAnswers[q.id] === opt}
                          onChange={() => setQuestionAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                        />
                        {opt}
                      </label>
                    ))}
                    <input
                      className="form-input"
                      placeholder="Or type a custom answer..."
                      style={{ marginTop: 4, fontSize: 12 }}
                      value={
                        q.options.includes(questionAnswers[q.id] || "")
                          ? ""
                          : questionAnswers[q.id] || ""
                      }
                      onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  </div>
                ) : (
                  <textarea
                    className="form-textarea"
                    placeholder="Type your answer..."
                    value={questionAnswers[q.id] || ""}
                    onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    style={{ minHeight: 60, marginTop: 4 }}
                  />
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleSubmitAnswers}
                disabled={questions.some((q) => !questionAnswers[q.id]?.trim())}
              >
                Submit Answers
              </button>
            </div>
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

      {/* Answer history — always visible when there are prior answers */}
      {answeredHistory.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
            Planning Q&A
          </div>
          {answeredHistory.map((a) => (
            <div
              key={a.id}
              style={{
                padding: "8px 12px",
                marginBottom: 6,
                borderRadius: 4,
                border: "1px solid var(--border)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Q: {a.question}</div>
              <div style={{ color: "var(--text-primary)", marginTop: 2 }}>A: {a.answer}</div>
            </div>
          ))}
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
                  onClick={() => !isReadOnly && setModeOverride("teams")}
                  style={isReadOnly ? { cursor: "default", opacity: activeMode === "teams" ? 1 : 0.35 } : undefined}
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
                  onClick={() => !isReadOnly && setModeOverride("subagents")}
                  style={isReadOnly ? { cursor: "default", opacity: activeMode === "subagents" ? 1 : 0.35 } : undefined}
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
              {!isReadOnly && <div className="jira-col-edit" />}
            </div>
            {ideationResult.tasks.map((spec, i) => {
              const tp = taskProgress?.tasks.find((t) => t.task === i + 1);
              const doneCount = tp?.acceptance_criteria.filter((c) => c.done).length ?? 0;
              const totalCount = spec.acceptance_criteria.length;
              const taskStatus = tp?.status ?? "pending";
              const allDone = doneCount === totalCount && totalCount > 0;
              return (
              <div key={i} className="jira-row-group">
                <div
                  className={`jira-row${expandedTask === i ? " jira-row-expanded" : ""}`}
                  onClick={() => setExpandedTask(expandedTask === i ? null : i)}
                >
                  <div className="jira-col-key">
                    <span
                      className="jira-task-status-icon"
                      data-status={taskStatus}
                      title={taskStatus.replace("_", " ")}
                    />
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
                    {totalCount > 0 && (
                      <span className={`jira-ac-count${allDone ? " jira-ac-done" : ""}`}>
                        {doneCount}/{totalCount}
                      </span>
                    )}
                  </div>
                  {!isReadOnly && (
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
                      {spec.acceptance_criteria.map((c, j) => {
                        const criterionDone = tp?.acceptance_criteria.find((cp) => cp.criterion === c)?.done ?? false;
                        return (
                        <li key={j}>
                          <span className={`jira-check-box${criterionDone ? " jira-check-done" : ""}`} />
                          <span style={criterionDone ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>
                            {c}
                          </span>
                        </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {/* Actions */}
          {!hasActiveTerminal && !isReadOnly ? (
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
          {showFeedback && !isReadOnly && (
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

      {/* Execution panel for ready/pushed/complete features (when no active terminal) */}
      {(isReady || isPushed || isComplete) && !hasActiveTerminal && feature.launched_command && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <div className="panel-title">
              <span
                className="status-dot"
                style={{ backgroundColor: "var(--muted)", marginRight: 8 }}
              />
              Execution Complete
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCommand(!showCommand)}
              >
                {showCommand ? "Hide Command" : "View Command"}
              </button>
              {isReady && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleRestartExecution}
                  disabled={restarting}
                >
                  {restarting ? "Restarting..." : "Restart Execution"}
                </button>
              )}
            </div>
          </div>
          {showCommand && (
            <div className="code-block" style={{ wordBreak: "break-all" }}>
              {feature.launched_command}
            </div>
          )}
        </div>
      )}

      {/* Portal target for PersistentTerminal — renders the active terminal here
          instead of at the bottom of the page (App level) */}
      <div id="terminal-portal-target" />

      {/* Validation & review panel — shown for ready, pushed, and complete states */}
      {(isReady || isPushed || isComplete) && !hasActiveTerminal && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <div className="panel-title">
              {isComplete ? "Summary" : isPushed ? "Pushed" : "Validation & PR"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!isComplete && !isPushed && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleRunValidators}
                  disabled={verifying}
                >
                  {verifying ? "Running..." : "Run Validators"}
                </button>
              )}
              {isReady && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handlePush}
                  disabled={pushing || pushed}
                >
                  {pushing ? "Pushing..." : pushed ? "Pushed" : "Commit & Push"}
                </button>
              )}
              {isPushed && (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowMakeChanges(!showMakeChanges)}
                  >
                    Make Changes
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleComplete}
                    disabled={completing}
                  >
                    {completing ? "Completing..." : "Mark Complete"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Make Changes feedback form */}
          {showMakeChanges && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                What needs to change?
              </div>
              <textarea
                className="form-textarea"
                value={changesFeedback}
                onChange={(e) => setChangesFeedback(e.target.value)}
                placeholder="Describe the changes needed..."
                style={{ minHeight: 80 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) handleMakeChanges();
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setShowMakeChanges(false); setChangesFeedback(""); }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleMakeChanges}
                  disabled={!changesFeedback.trim() || submittingChanges}
                >
                  {submittingChanges ? "Submitting..." : "Submit & Re-plan"}
                </button>
              </div>
            </div>
          )}

          {/* Validator results — inline */}
          {verifyResult && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                Validators
                <span style={{
                  color: verifyResult.all_passed ? "var(--success)" : "var(--danger)",
                  fontWeight: 400,
                  marginLeft: 8,
                }}>
                  {verifyResult.all_passed ? "All passed" : "Some failed"}
                </span>
              </div>
              {verifyResult.results.map((r, i) => (
                <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <span style={{ color: r.success ? "var(--success)" : "var(--danger)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>
                      {r.success ? "PASS" : "FAIL"}
                    </span>
                    <code style={{ fontSize: 11 }}>{r.command}</code>
                  </div>
                  {!r.success && r.stderr && (
                    <div className="code-block" style={{ marginTop: 4, fontSize: 11 }}>
                      {r.stderr}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Diff summary — inline */}
          {diff && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                Diff
                <span style={{ fontWeight: 400, marginLeft: 8, fontFamily: "var(--font-mono)" }}>
                  {diff.total_files} file{diff.total_files !== 1 ? "s" : ""}{" "}
                  <span style={{ color: "var(--success)" }}>+{diff.total_insertions}</span>{" "}
                  <span style={{ color: "var(--danger)" }}>-{diff.total_deletions}</span>
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6 }}>
                {diff.files.map((f) => (
                  <div key={f.path} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.path}
                    </span>
                    <span style={{ color: "var(--success)", minWidth: 32, textAlign: "right" }}>+{f.insertions}</span>
                    <span style={{ color: "var(--danger)", minWidth: 32, textAlign: "right" }}>-{f.deletions}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution analysis — inline, auto-loaded */}
          {analysis && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                Execution Analysis
              </div>
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  marginBottom: 8,
                  backgroundColor: analysis.mode_assessment.was_appropriate
                    ? "rgba(107, 158, 107, 0.1)"
                    : "rgba(196, 90, 106, 0.1)",
                  border: `1px solid ${analysis.mode_assessment.was_appropriate ? "rgba(107, 158, 107, 0.3)" : "rgba(196, 90, 106, 0.3)"}`,
                }}
              >
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 2,
                  color: analysis.mode_assessment.was_appropriate ? "var(--success)" : "var(--danger)",
                }}>
                  {analysis.mode_assessment.was_appropriate ? "Good mode choice" : "Mode could be improved"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {analysis.mode_assessment.reason}
                </div>
                {analysis.mode_assessment.suggestion && (
                  <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", marginTop: 2 }}>
                    Tip: {analysis.mode_assessment.suggestion}
                  </div>
                )}
              </div>
              {analysis.task_file_coverage.map((tc, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
                  <span style={{
                    color: tc.coverage_status === "covered" ? "var(--success)" : tc.coverage_status === "partial" ? "#c9a84c" : "var(--muted)",
                    fontWeight: 600, minWidth: 55, fontSize: 10, textTransform: "uppercase",
                  }}>
                    {tc.coverage_status === "no_changes_detected" ? "No files" : tc.coverage_status}
                  </span>
                  <span style={{ color: "var(--text-secondary)", flex: 1 }}>{tc.task_title}</span>
                  {tc.likely_files.length > 0 && (
                    <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                      {tc.likely_files.length} file{tc.likely_files.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              ))}
              {analysis.unplanned_files.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>Unplanned changes:</div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "#c9a84c" }}>
                    {analysis.unplanned_files.map((f) => <div key={f}>{f}</div>)}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

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
