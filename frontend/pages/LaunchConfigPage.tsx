import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type {
  Feature,
  AgentFile,
  TaskSpec,
  ExecutionMode,
  IdeationResult,
} from "../types";

export function LaunchConfigPage() {
  const { featureId } = useParams<{ featureId: string }>();
  const tauri = useTauri();
  const navigate = useNavigate();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [agents, setAgents] = useState<AgentFile[]>([]);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("subagents");
  const [rationale, setRationale] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [taskSpecs, setTaskSpecs] = useState<TaskSpec[]>([]);
  const [launchCmd, setLaunchCmd] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!featureId) return;

    tauri.getFeature(featureId).then((f) => {
      setFeature(f);

      // If feature already has config, use it
      if (f.execution_mode) {
        setExecutionMode(f.execution_mode);
        setRationale(f.execution_rationale ?? "");
        setSelectedAgents(f.selected_agents);
        setTaskSpecs(f.task_specs);
      }

      // Load repo and agents
      tauri.listRepositories().then((repos) => {
        const r = repos.find((repo) => repo.id === f.repo_id);
        if (r) {
          tauri.listAgents(r.path).then((agentList) => {
            setAgents(agentList);
            // Pre-select all agents if none selected
            if (f.selected_agents.length === 0) {
              setSelectedAgents(agentList.map((a) => a.filename));
            }
          });
        }
      });

      // If still in ideation, load the plan
      if (f.task_specs.length === 0) {
        tauri.pollIdeationResult(featureId).then((result: IdeationResult) => {
          if (result.tasks.length > 0) {
            setTaskSpecs(result.tasks);
          }
          if (result.execution_mode) {
            setExecutionMode(result.execution_mode.recommended);
            setRationale(result.execution_mode.rationale);
          }
        });
      }
    });
  }, [featureId]);

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
      // Refresh feature
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
          Review and override the execution configuration before launching.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

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
            No agents found. Add agent files to .claude/agents/ in your repo.
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
            No tasks defined.
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
              {copied ? "Copied! Redirecting..." : "Copy Command & Start Execution"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
