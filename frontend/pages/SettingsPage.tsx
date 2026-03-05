import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import type { Agent } from "../types";

const SHELL_OPTIONS = [
  { value: "powershell", label: "PowerShell" },
  { value: "cmd", label: "Command Prompt (cmd)" },
  { value: "wt", label: "Windows Terminal" },
  { value: "bash", label: "Bash" },
  { value: "zsh", label: "Zsh" },
];

export function SettingsPage() {
  const tauri = useTauri();
  const [shell, setShell] = useState("");
  const [verificationAgentIds, setVerificationAgentIds] = useState<string[]>(
    [],
  );
  const [planningAgentIds, setPlanningAgentIds] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    tauri.getPreferences().then((prefs) => {
      setShell(prefs.shell);
      setVerificationAgentIds(prefs.verification_agent_ids);
      setPlanningAgentIds(prefs.planning_agent_ids);
    });
    tauri.listAgents().then(setAgents);
  }, []);

  const handleSave = async () => {
    await tauri.setPreferences(shell, verificationAgentIds, planningAgentIds);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleVerificationAgent = (id: string) => {
    setVerificationAgentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const togglePlanningAgent = (id: string) => {
    setPlanningAgentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Configure Goblin Mob Boss preferences.</p>
      </div>

      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 16 }}>
          Terminal
        </div>

        <div className="form-group">
          <label className="form-label">Shell</label>
          <select
            className="form-select"
            value={shell}
            onChange={(e) => setShell(e.target.value)}
            style={{ maxWidth: 300 }}
          >
            {SHELL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="form-help">
            The terminal used when launching Claude Code from a task.
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title" style={{ marginBottom: 8 }}>
          Planning Agents
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          Select which agents are available during the planning (ideation) stage.
          Only selected agents will be shown to Claude Code for task assignment
          during feature planning.
        </p>

        <div className="verification-agent-list">
          {agents.map((agent) => (
            <label key={agent.id} className="verification-agent-item">
              <input
                type="checkbox"
                checked={planningAgentIds.includes(agent.id)}
                onChange={() => togglePlanningAgent(agent.id)}
              />
              <div className="verification-agent-info">
                <span className="verification-agent-name">{agent.name}</span>
                <span className="verification-agent-role">{agent.role}</span>
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
            No agents configured. Add agents in the Agents page.
          </p>
        )}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title" style={{ marginBottom: 8 }}>
          Verification Agents
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          Select which agents are used during the final verification step after
          all tasks are merged. Their expertise is included in the verification
          prompt.
        </p>

        <div className="verification-agent-list">
          {agents.map((agent) => (
            <label key={agent.id} className="verification-agent-item">
              <input
                type="checkbox"
                checked={verificationAgentIds.includes(agent.id)}
                onChange={() => toggleVerificationAgent(agent.id)}
              />
              <div className="verification-agent-info">
                <span className="verification-agent-name">{agent.name}</span>
                <span className="verification-agent-role">{agent.role}</span>
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
            No agents configured. Add agents in the Agents page.
          </p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? "Saved" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
