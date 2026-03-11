import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { useBackgroundPlanning } from "../hooks/useBackgroundPlanning";
import { useCommandDisplay, CommandDisplayButton, CommandDisplayContent } from "../components/CommandDisplay";
import { TaskTable, ExecutionModeSelector, EditTaskModal, PlanHistory } from "./feature-detail/PlanningComponents";
import { ValidationPanel } from "./feature-detail/ValidationPanel";
import { TestingPanel } from "./feature-detail/TestingPanel";
import { ActivityLog, buildActivityLog } from "../components/ActivityLog";
import type {
  Feature,
  Repository,
  IdeationResult,
  TaskSpec,
  ExecutionMode,
  TaskProgress,
  DiffSummary,
  VerifyResult,
  ExecutionAnalysis,
  PlanningQuestion,
  PlanningAnswer,
  PlanSnapshot,
  FunctionalTestResult,
  TestingStatus,
} from "../types";

type IdeationStatus = "idle" | "running" | "questions" | "done" | "error";

export function FeatureDetailPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const { session: terminalSession, startSession, clearSession } = useTerminalSession();
  const { isPlanning, addPlanning, consumePlan } = useBackgroundPlanning();
  const [repos, setRepos] = useState<Repository[]>([]);
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
  const [ideationCommand, setIdeationCommand] = useState<string | null>(null);
  const ideationCmd = useCommandDisplay(ideationCommand);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);

  // Execution mode override
  const [modeOverride, setModeOverride] = useState<ExecutionMode | null>(null);

  // Edit dialog
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TaskSpec | null>(null);

  // Launch
  const [launching, setLaunching] = useState(false);
  const [tmuxAvailable, setTmuxAvailable] = useState<boolean | null>(null);

  // Task progress tracking during execution
  const [taskProgress, setTaskProgress] = useState<TaskProgress | null>(null);
  // Stale execution detection — warns user when execution appears stuck
  const [executionStale, setExecutionStale] = useState(false);

  // Plan history
  const [planHistory, setPlanHistory] = useState<PlanSnapshot[]>([]);

  // Ready-state: validation, diff, PR, analytics
  const [diff, setDiff] = useState<DiffSummary | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [analysis, setAnalysis] = useState<ExecutionAnalysis | null>(null);

  // Functional testing state
  const [testResults, setTestResults] = useState<FunctionalTestResult[]>([]);
  const [startingTest, setStartingTest] = useState(false);
  const [completingTest, setCompletingTest] = useState(false);
  const [testingStatus, setTestingStatus] = useState<TestingStatus | null>(null);
  const [testingError, setTestingError] = useState("");
  const autoCollectedRef = useRef(false);

  // Check tmux availability for Teams mode
  useEffect(() => {
    tauri.checkTmuxInstalled().then(setTmuxAvailable).catch(() => setTmuxAvailable(false));
  }, []);

  // Load repos for name display
  useEffect(() => {
    tauri.listRepositories().then((r) => setRepos(r || [])).catch((e) => setError(String(e)));
  }, []);

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
        setIdeationResult({ tasks: f.task_specs, execution_mode: null, questions: null, answered_questions: null, test_harness: null, functional_test_steps: null });
        setStatus("done");
      }
    }).catch(console.error);
    tauri.getIdeationPrompt(featureId).then(setSystemPrompt).catch(() => {/* prompt may not exist yet */});
    tauri.getPlanHistory(featureId).then(setPlanHistory).catch(() => {/* history may not exist yet */});
  }, [featureId]);

  // Auto-load execution analysis and diff when feature reaches ready/pushed state
  useEffect(() => {
    if (!featureId) return;
    const showResults = feature?.status === "ready" || feature?.status === "failed"
      || feature?.status === "pushed";
    if (!showResults) return;
    if (!analysis) {
      tauri.analyzeFeatureExecution(featureId).then(setAnalysis).catch((e) => setError(String(e)));
    }
    if (!diff) {
      tauri.getFeatureDiff(featureId).then(setDiff).catch((e) => setError(String(e)));
    }
  }, [featureId, feature?.status]);

  // Refresh feature when terminal session clears (execution completed or cancelled)
  useEffect(() => {
    if (!featureId || terminalSession) return;
    // Session just cleared — refresh feature to pick up ready/failed status
    tauri.getFeature(featureId).then(setFeature).catch((e) => setError(String(e)));
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
      }).catch(() => {/* polling — transient failures expected */});
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

      if (!isExecuting || autoEnded) return;

      // Auto-end execution when we detect completion. Three triggers:
      // 1. Claude wrote the execution-complete signal file (most reliable)
      // 2. All tasks are marked done with expected count met
      // 3. All tasks are marked done and at least 1 task exists (relaxed — handles
      //    task count mismatches where Claude reorganized the work)
      const allDone = p.tasks.length > 0 && p.tasks.every((t) => t.status === "done");
      const completionSignaled = p.completion_detected === true;
      const countMatches = expectedTaskCount === 0 || p.tasks.length >= expectedTaskCount;

      if (completionSignaled || (allDone && countMatches)) {
        autoEnded = true;
        const sid = terminalSessionIdRef.current;
        // Kill the PTY and clear session directly.
        if (sid) {
          tauri.killPty(sid).catch(() => {/* best-effort cleanup */});
        }

        // If the feature has a test harness and testing hasn't been skipped,
        // route to testing instead of ready.
        tauri.getFeature(featureId).then((latestFeature) => {
          const hasHarness = !!latestFeature.test_harness;
          const testingSkipped = latestFeature.testing_skipped;
          if (hasHarness && !testingSkipped) {
            tauri.markFeatureTesting(featureId).then((f) => {
              setFeature(f);
              clearSession();
            }).catch(() => {
              // Fallback to ready if testing transition fails
              tauri.markFeatureReady(featureId).then((f) => {
                setFeature(f);
                clearSession();
              }).catch(() => {});
            });
          } else {
            tauri.markFeatureReady(featureId).then((f) => {
              setFeature(f);
              clearSession();
            }).catch(() => {/* best-effort auto-complete */});
          }
        }).catch(() => {
          tauri.markFeatureReady(featureId).then((f) => {
            setFeature(f);
            clearSession();
          }).catch(() => {});
        });
      }
    };

    // Fetch once immediately
    tauri.pollTaskProgress(featureId).then(handleProgress).catch(() => {/* progress may not exist yet */});
    // Only keep polling while executing
    if (!isExecuting) return;
    const interval = setInterval(() => {
      tauri.pollTaskProgress(featureId).then(handleProgress).catch(() => {/* polling — transient failures expected */});
    }, 5000);
    return () => clearInterval(interval);
  }, [featureId, feature?.status, ideationResult?.tasks?.length]);

  // Detect stale execution — warn user when progress hasn't changed for a long time.
  // Uses a ref to track the last progress snapshot so we detect actual stalls,
  // not just time since launch.
  const lastProgressRef = useRef<string>("");
  const staleTimerRef = useRef<number>(0);
  useEffect(() => {
    if (feature?.status !== "executing") {
      setExecutionStale(false);
      staleTimerRef.current = 0;
      return;
    }
    const STALE_THRESHOLD = 60; // polls (5s each = 5 minutes of no progress change)
    const currentSnapshot = JSON.stringify(taskProgress?.tasks?.map((t) => t.status) ?? []);
    if (currentSnapshot !== lastProgressRef.current) {
      lastProgressRef.current = currentSnapshot;
      staleTimerRef.current = 0;
      setExecutionStale(false);
    } else {
      staleTimerRef.current += 1;
      if (staleTimerRef.current >= STALE_THRESHOLD) {
        setExecutionStale(true);
      }
    }
  }, [feature?.status, taskProgress]);

  // Start ideation on mount
  const startIdeation = useCallback(async () => {
    if (!featureId) return;
    setStatus("running");
    setError("");
    setIdeationResult(null);
    clearSession();
    try {
      // Fetch the command being run for transparency
      tauri.getIdeationTerminalCommand(featureId).then(setIdeationCommand).catch(() => {/* command display is best-effort */});
      addPlanning(featureId);
      await tauri.runIdeation(featureId);
      tauri.getPlanHistory(featureId).then(setPlanHistory).catch(() => {});
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

    // Always fetch the ideation command for transparency
    tauri.getIdeationTerminalCommand(featureId).then(setIdeationCommand).catch(() => {/* command display is best-effort */});

    // If the feature already has saved task_specs (from configureLaunch), always use those.
    // This prevents plan.json (which may be stale or modified by execution) from overwriting
    // the user's configured plan.
    tauri.getFeature(featureId).then((f) => {
      if (f.task_specs.length > 0) {
        setIdeationResult({ tasks: f.task_specs, execution_mode: null, questions: null, answered_questions: null, test_harness: null, functional_test_steps: null });
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
      }).catch(() => {/* polling — plan may not exist yet */});
    };

    const interval = setInterval(() => {
      poll();
      // Check for ideation process crash every 5 polls (~15s)
      if (pollCountRef.current % 5 === 0) {
        tauri.pollIdeationError(featureId).then((errMsg) => {
          if (errMsg) {
            setStatus("error");
            setError(errMsg);
          }
        }).catch(() => {});
      }
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
      tauri.getPlanHistory(featureId).then(setPlanHistory).catch(() => {});
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
      tauri.getPlanHistory(featureId).then(setPlanHistory).catch(() => {});
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
        ideationResult.test_harness,
        ideationResult.functional_test_steps,
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

  // Functional testing handlers
  const handleStartTesting = async () => {
    if (!featureId) return;
    setStartingTest(true);
    setError("");
    setTestingError("");
    autoCollectedRef.current = false;
    try {
      const cols = Math.max(80, Math.floor(window.innerWidth / 8));
      const rows = Math.max(24, Math.floor(window.innerHeight / 20));
      const sessionId = await tauri.startFunctionalTesting(featureId, cols, rows);
      startSession(featureId, sessionId);
      const updated = await tauri.getFeature(featureId);
      setFeature(updated);
    } catch (e) {
      setTestingError(String(e));
    } finally {
      setStartingTest(false);
    }
  };

  const handleSkipTesting = async () => {
    if (!featureId) return;
    try {
      const updated = await tauri.skipFunctionalTesting(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCompleteTesting = async () => {
    if (!featureId) return;
    setCompletingTest(true);
    setTestingError("");
    try {
      const sid = terminalSessionIdRef.current;
      if (sid) {
        await tauri.killPty(sid).catch(() => {});
      }
      clearSession();
      const updated = await tauri.completeFunctionalTesting(featureId);
      setFeature(updated);
      // Reload test results
      const results = await tauri.getFunctionalTestResults(featureId);
      setTestResults(results);
    } catch (e) {
      setTestingError(String(e));
    } finally {
      setCompletingTest(false);
    }
  };

  const handleRelaunchFix = async () => {
    if (!featureId) return;
    setError("");
    try {
      const cols = Math.max(80, Math.floor(window.innerWidth / 8));
      const rows = Math.max(24, Math.floor(window.innerHeight / 20));
      const sessionId = await tauri.relaunchWithFixContext(featureId, cols, rows);
      startSession(featureId, sessionId);
      const updated = await tauri.getFeature(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    }
  };

  // Load test results when feature reaches testing/ready/failed states
  useEffect(() => {
    if (!featureId) return;
    const shouldLoad = feature?.status === "testing" || feature?.status === "ready"
      || feature?.status === "failed" || feature?.status === "pushed"
      || feature?.status === "executing";
    if (!shouldLoad) return;
    tauri.getFunctionalTestResults(featureId).then(setTestResults).catch(() => {});
  }, [featureId, feature?.status]);

  // Poll testing status while in testing phase
  useEffect(() => {
    if (!featureId || feature?.status !== "testing") {
      setTestingStatus(null);
      autoCollectedRef.current = false;
      return;
    }
    const poll = () => {
      tauri.pollTestingStatus(featureId).then((s) => {
        setTestingStatus(s);
        // Auto-collect when completion signal or timeout detected (guard prevents double-fire)
        if ((s.completion_signal || s.timed_out) && !completingTest && !autoCollectedRef.current) {
          autoCollectedRef.current = true;
          handleCompleteTesting();
        }
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [featureId, feature?.status]);

  // handleViewDiff removed — diff is loaded automatically via useEffect

  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [pushingRepoId, setPushingRepoId] = useState<string | null>(null);

  const isMultiRepo = feature ? (feature.repo_ids?.length ?? 0) > 1 : false;

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

  const handlePushRepo = async (repoId: string) => {
    if (!featureId) return;
    setPushingRepoId(repoId);
    setError("");
    try {
      await tauri.pushFeatureRepo(featureId, repoId);
      const updated = await tauri.getFeature(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setPushingRepoId(null);
    }
  };

  const allReposPushed = feature
    ? (feature.repo_ids ?? []).every(
        (id) => feature.repo_push_status?.[id] === "pushed",
      )
    : false;

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

  // Activity log
  const [showActivityLog, setShowActivityLog] = useState(false);

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
  const executionCmd = useCommandDisplay(feature?.launched_command ?? null);
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

  const recommendation = ideationResult?.execution_mode ?? null;
  const isExecuting = feature.status === "executing";
  const isTesting = feature.status === "testing";
  const isReady = feature.status === "ready" || feature.status === "failed";
  const isPushed = feature.status === "pushed";
  const isComplete = feature.status === "complete";
  const isReadOnly = isExecuting || isTesting || isReady || isPushed || isComplete;
  // activeMode removed — mode selection is handled by ExecutionModeSelector
  const teamsMissingTmux = false; // tmux is optional — just a recommendation

  const featureRepoIds = feature.repo_ids?.length > 0 ? feature.repo_ids : feature.repo_id ? [feature.repo_id] : [];
  const featureRepoNames = featureRepoIds
    .map((id) => repos.find((r) => r.id === id)?.name ?? id)
    .join(", ");

  const headerLabel = isExecuting
    ? "Executing"
    : isTesting
      ? "Testing"
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
        <div className="page-header-with-back">
          <button className="back-btn" onClick={() => navigate("/")} title="Back to features">
            &larr;
          </button>
          <div>
          <h2>{headerLabel}: {feature.name}</h2>
          <p>
            {feature.description}
          </p>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {featureRepoNames && (
              <span title="Repository" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 2h8v8H2z" stroke="currentColor" strokeWidth="1" />
                  <path d="M2 5h8" stroke="currentColor" strokeWidth="1" />
                </svg>
                {featureRepoNames}
              </span>
            )}
            {feature.branch && (
              <span title="Branch" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1" />
                  <circle cx="9" cy="9" r="1.5" stroke="currentColor" strokeWidth="1" />
                  <path d="M3 4.5V7a2 2 0 0 0 2 2h2.5" stroke="currentColor" strokeWidth="1" />
                </svg>
                {feature.branch}
              </span>
            )}
          </div>
          </div>
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

      {/* Stale execution warning — shown when progress hasn't changed for 5+ minutes */}
      {executionStale && isExecuting && (
        <div
          className="error-banner"
          style={{ backgroundColor: "var(--warning-bg, #332b00)", borderColor: "var(--warning, #f0c000)" }}
        >
          <div style={{ marginBottom: 8 }}>
            Execution appears stuck — no progress changes detected for several minutes.
            Claude may have gotten stuck or finished without updating the progress file.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                staleTimerRef.current = 0;
                setExecutionStale(false);
              }}
            >
              Dismiss
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                const sid = terminalSessionIdRef.current;
                if (sid) tauri.killPty(sid).catch(() => {});
                tauri.markFeatureReady(featureId!).then((f) => {
                  setFeature(f);
                  clearSession();
                  setExecutionStale(false);
                }).catch(() => {});
              }}
            >
              Mark as Ready
            </button>
          </div>
        </div>
      )}

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
            <CommandDisplayButton {...ideationCmd} />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowContext(!showContext)}
            >
              {showContext ? "Hide Context" : "View Context"}
            </button>
          </div>
        </div>

        <CommandDisplayContent {...ideationCmd} />

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

      <PlanHistory snapshots={planHistory} />

      {status === "done" && ideationResult && ideationResult.tasks.length > 0 && (
        <>

          <ExecutionModeSelector
            recommendation={recommendation}
            modeOverride={modeOverride}
            isReadOnly={isReadOnly}
            tmuxAvailable={tmuxAvailable}
            onModeChange={setModeOverride}
          />

          <TaskTable
            tasks={ideationResult.tasks}
            taskProgress={taskProgress}
            expandedTask={expandedTask}
            setExpandedTask={setExpandedTask}
            isReadOnly={isReadOnly}
            onEditTask={openEditTask}
          />

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
                disabled={launching || teamsMissingTmux}
                title={teamsMissingTmux ? "tmux must be installed for Agent Teams mode" : undefined}
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

      {/* Execution panel for ready/pushed features (when no active terminal) */}
      {(isReady || isPushed) && !hasActiveTerminal && feature.launched_command && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <div className="panel-title">
              <span
                className="status-dot"
                role="img"
                aria-label="Execution complete"
                style={{ backgroundColor: "var(--muted)", marginRight: 8 }}
              />
              Execution Complete
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <CommandDisplayButton {...executionCmd} />
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
          <CommandDisplayContent {...executionCmd} />
        </div>
      )}

      {/* Portal target for PersistentTerminal — renders the active terminal here
          instead of at the bottom of the page (App level) */}
      <div id="terminal-portal-target" />

      {/* Complete state — simple confirmation */}
      {isComplete && (
        <div className="panel" style={{ marginTop: 16, opacity: 0.7 }}>
          <div className="panel-header">
            <div className="panel-title">
              <span
                className="status-dot"
                role="img"
                aria-label="Feature complete"
                style={{ backgroundColor: "var(--success)", marginRight: 8 }}
              />
              Complete
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>
            This feature is done. The worktree has been cleaned up.
          </div>
        </div>
      )}

      {/* Functional testing panel — shown when feature has test harness */}
      {(isTesting || isReady || isPushed || isExecuting) && !hasActiveTerminal && feature.test_harness && (
        <TestingPanel
          feature={feature}
          isTesting={isTesting}
          testResults={testResults}
          testingStatus={testingStatus}
          onStartTesting={handleStartTesting}
          onSkipTesting={handleSkipTesting}
          onCompleteTesting={handleCompleteTesting}
          onRelaunchFix={handleRelaunchFix}
          startingTest={startingTest}
          completingTest={completingTest}
          error={testingError}
        />
      )}

      {/* Validation & review panel — shown for ready and pushed states */}
      {(isReady || isPushed) && !hasActiveTerminal && (
        <ValidationPanel
          featureId={featureId!}
          isPushed={isPushed}
          isReady={isReady}
          isComplete={isComplete}
          isMultiRepo={isMultiRepo}
          allReposPushed={allReposPushed}
          featureRepoIds={featureRepoIds}
          repos={repos}
          repoPushStatus={feature.repo_push_status}
          verifyResult={verifyResult}
          verifying={verifying}
          onRunValidators={handleRunValidators}
          pushing={pushing}
          pushed={pushed}
          pushingRepoId={pushingRepoId}
          onPush={handlePush}
          onPushRepo={handlePushRepo}
          showMakeChanges={showMakeChanges}
          changesFeedback={changesFeedback}
          submittingChanges={submittingChanges}
          onToggleMakeChanges={() => setShowMakeChanges(!showMakeChanges)}
          onChangesFeedbackChange={setChangesFeedback}
          onSubmitMakeChanges={handleMakeChanges}
          completing={completing}
          onComplete={handleComplete}
          diff={diff}
          analysis={analysis}
        />
      )}

      {/* Activity Log */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div
          className="panel-header"
          style={{ cursor: "pointer", marginBottom: showActivityLog ? 16 : 0 }}
          onClick={() => setShowActivityLog(!showActivityLog)}
        >
          <div className="panel-title" style={{ fontSize: 14 }}>
            Activity Log
          </div>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {showActivityLog ? "Hide" : "Show"}
          </span>
        </div>
        {showActivityLog && (
          <ActivityLog
            entries={buildActivityLog(
              feature,
              planHistory,
              taskProgress,
              verifyResult,
              analysis,
            )}
          />
        )}
      </div>

      {/* Edit Task Dialog */}
      {editingTask !== null && editDraft && (
        <EditTaskModal
          taskIndex={editingTask}
          draft={editDraft}
          onDraftChange={setEditDraft}
          onSave={saveEditTask}
          onCancel={cancelEditTask}
        />
      )}
    </div>
  );
}
