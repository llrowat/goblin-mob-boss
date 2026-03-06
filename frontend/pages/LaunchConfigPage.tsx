import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type {
  Feature,
  AgentFile,
  TaskSpec,
  ExecutionMode,
  IdeationResult,
  ModeRecommendation,
} from "../types";

export function LaunchConfigPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [agents, setAgents] = useState<AgentFile[]>([]);
  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>("subagents");
  const [rationale, setRationale] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [taskSpecs, setTaskSpecs] = useState<TaskSpec[]>([]);
  const [launchCmd, setLaunchCmd] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Heuristics
  const [recommendation, setRecommendation] =
    useState<ModeRecommendation | null>(null);

  useEffect(() => {
    if (!featureId) return;

    tauri.getFeature(featureId).then((f) => {
      setFeature(f);

      if (f.execution_mode) {
        setExecutionMode(f.execution_mode);
        setRationale(f.execution_rationale ?? "");
        setSelectedAgents(f.selected_agents);
        setTaskSpecs(f.task_specs);
      }

      tauri.listRepositories().then((repos) => {
        const repoIds = f.repo_ids?.length > 0 ? f.repo_ids : f.repo_id ? [f.repo_id] : [];
        const matchedRepos = repos.filter((repo) => repoIds.includes(repo.id));
        if (matchedRepos.length > 0) {
          // Load agents from all repos, deduplicating by filename
          Promise.all(matchedRepos.map((r) => tauri.listAgents(r.path))).then(
            (agentLists) => {
              const seen = new Set<string>();
              const deduped: AgentFile[] = [];
              for (const list of agentLists) {
                for (const agent of list) {
                  if (!seen.has(agent.filename)) {
                    seen.add(agent.filename);
                    deduped.push(agent);
                  }
                }
              }
              setAgents(deduped);
              if (f.selected_agents.length === 0) {
                setSelectedAgents(deduped.map((a) => a.filename));
              }
            },
          );
        }
      });

      if (f.task_specs.length === 0) {
        tauri
          .pollIdeationResult(featureId)
          .then((result: IdeationResult) => {
            if (result.tasks.length > 0) {
              setTaskSpecs(result.tasks);
              // Analyze with heuristics
              tauri.analyzeTaskGraph(result.tasks).then(setRecommendation);
            }
            if (result.execution_mode) {
              setExecutionMode(result.execution_mode.recommended);
              setRationale(result.execution_mode.rationale);
            }
          });
      } else {
        tauri.analyzeTaskGraph(f.task_specs).then(setRecommendation);
      }
    });
  }, [featureId]);

  // Re-analyze when tasks change
  useEffect(() => {
    if (taskSpecs.length > 0) {
      tauri.analyzeTaskGraph(taskSpecs).then(setRecommendation);
    }
  }, [taskSpecs]);

  const toggleAgent = (filename: string) => {
    setSelectedAgents((prev) =>
      prev.includes(filename)
        ? prev.filter((a) => a !== filename)
        : [...prev, filename],
    );
  };

  const handleSaveAndGetCommand = async () => {
    if (!featureId) return;
    setSaving(true);
    setError("");
    try {
      await tauri.configureLaunch(
        featureId,
        executionMode,
        rationale,
        selectedAgents,
        taskSpecs,
      );
      const cmd = await tauri.getLaunchCommand(featureId);
      setLaunchCmd(cmd);
      const updated = await tauri.getFeature(featureId);
      setFeature(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyAndLaunch = async () => {
    if (!featureId || !launchCmd) return;
    await navigator.clipboard.writeText(launchCmd);
    setCopied(true);
    try {
      await tauri.markFeatureExecuting(featureId);
      navigate(`/feature/${featureId}/status`);
    } catch (e) {
      setError(String(e));
    }
  };

  const applyRecommendation = () => {
    if (!recommendation) return;
    setExecutionMode(recommendation.recommended_mode);
    setRationale(recommendation.reasoning.join(" "));
  };

  if (!feature) {
    return (
      <div className="empty-state">
        <p>Loading feature...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Launch: {feature.name}</h2>
        <p>
          Review the plan and pick your crew before launching.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Intelligent Mode Recommendation */}
      {recommendation && taskSpecs.length > 0 && (
        <div
          className="panel"
          style={{
            marginBottom: 16,
            borderLeft: `3px solid ${recommendation.recommended_mode === "teams" ? "#5b8abd" : "#6b9e6b"}`,
          }}
        >
          <div className="panel-title" style={{ marginBottom: 8 }}>
            Mode Analysis
            <span
              style={{
                fontSize: 12,
                fontWeight: 400,
                marginLeft: 8,
                color: "var(--muted)",
              }}
            >
              {Math.round(recommendation.confidence * 100)}% confidence
            </span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color:
                  recommendation.recommended_mode === "teams"
                    ? "#5b8abd"
                    : "#6b9e6b",
              }}
            >
              Recommends:{" "}
              {recommendation.recommended_mode === "teams"
                ? "Agent Teams"
                : "Subagents"}
            </span>
            {recommendation.recommended_mode !== executionMode && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={applyRecommendation}
                style={{ marginLeft: 8 }}
              >
                Apply
              </button>
            )}
          </div>

          {/* Reasoning */}
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {recommendation.reasoning.map((r, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                {r}
              </div>
            ))}
          </div>

          {/* Task Graph Visualization */}
          {recommendation.task_graph.nodes.length > 0 && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  marginBottom: 8,
                }}
              >
                Task dependency graph (max parallel:{" "}
                {recommendation.task_graph.max_parallel}, critical path:{" "}
                {recommendation.task_graph.critical_path_length})
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  flexWrap: "wrap",
                }}
              >
                {/* Group by depth level */}
                {Array.from(
                  new Set(
                    recommendation.task_graph.nodes.map((n) => n.depth),
                  ),
                )
                  .sort()
                  .map((depth) => (
                    <div
                      key={depth}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        padding: "4px 8px",
                        borderRadius: 4,
                        backgroundColor: "rgba(255,255,255,0.03)",
                        minWidth: 100,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--muted)",
                          textTransform: "uppercase",
                        }}
                      >
                        {depth === 0 ? "Start" : `Step ${depth + 1}`}
                      </div>
                      {recommendation.task_graph.nodes
                        .filter((n) => n.depth === depth)
                        .map((node) => (
                          <div
                            key={node.index}
                            style={{
                              fontSize: 11,
                              padding: "3px 6px",
                              borderRadius: 3,
                              backgroundColor: "rgba(255,255,255,0.05)",
                              border: "1px solid var(--border)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={`${node.title} (${node.agent || "unassigned"})`}
                          >
                            <span style={{ color: "var(--text-secondary)" }}>
                              {node.index + 1}.
                            </span>{" "}
                            {node.title}
                          </div>
                        ))}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Execution Mode */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title" style={{ marginBottom: 12 }}>
          Execution Mode
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <button
            className={`btn ${executionMode === "teams" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setExecutionMode("teams")}
          >
            Agent Teams (tmux)
          </button>
          <button
            className={`btn ${executionMode === "subagents" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setExecutionMode("subagents")}
          >
            Subagents (single lead)
          </button>
        </div>

        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          {executionMode === "teams"
            ? "Multiple Claude Code instances run in parallel via tmux. Best for 4+ independent tasks touching different files."
            : "A single Claude Code instance delegates work to subagents. Best for sequential or tightly-coupled tasks."}
        </p>

        {rationale && (
          <div
            style={{
              fontSize: 12,
              color: "var(--muted)",
              marginTop: 8,
              fontStyle: "italic",
            }}
          >
            AI rationale: {rationale}
          </div>
        )}
      </div>

      {/* Agents */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title" style={{ marginBottom: 8 }}>
          Agents ({selectedAgents.length} selected)
        </div>
        <div className="verification-agent-list">
          {agents.map((agent) => (
            <label key={agent.filename} className="verification-agent-item">
              <input
                type="checkbox"
                checked={selectedAgents.includes(agent.filename)}
                onChange={() => toggleAgent(agent.filename)}
              />
              <div className="verification-agent-info">
                <span className="verification-agent-name">{agent.name}</span>
                <span className="verification-agent-role">
                  {agent.description || agent.filename}
                  {agent.is_global && " (global)"}
                </span>
              </div>
            </label>
          ))}
        </div>
        {agents.length === 0 && (
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            No goblins hired yet. Add agent files to .claude/agents/ in your repo, or
            visit the Guide page to pick up built-in agents.
          </p>
        )}
      </div>

      {/* Tasks */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title" style={{ marginBottom: 8 }}>
          Tasks ({taskSpecs.length})
        </div>
        {taskSpecs.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            No tasks defined. The mob needs a plan first.
          </p>
        ) : (
          <div className="task-spec-list">
            {taskSpecs.map((spec, i) => (
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
                  {spec.dependencies.length > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        marginTop: 2,
                      }}
                    >
                      Depends on: Task {spec.dependencies.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Launch */}
      <div className="panel">
        {!launchCmd ? (
          <button
            className="btn btn-primary btn-lg"
            onClick={handleSaveAndGetCommand}
            disabled={saving || taskSpecs.length === 0}
            style={{ width: "100%" }}
          >
            {saving ? "Saving..." : "Generate Launch Command"}
          </button>
        ) : (
          <>
            <div className="panel-title" style={{ marginBottom: 8 }}>
              Launch Command
            </div>
            <div className="code-block" style={{ marginBottom: 12 }}>
              {launchCmd}
            </div>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleCopyAndLaunch}
              style={{ width: "100%" }}
            >
              {copied
                ? "Copied! Redirecting..."
                : "Copy Command & Start Execution"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
