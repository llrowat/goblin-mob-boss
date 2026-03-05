import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import type { AgentFile, Repository } from "../types";

export function AgentsPage() {
  const tauri = useTauri();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [agents, setAgents] = useState<AgentFile[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newFilename, setNewFilename] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    tauri.listRepositories().then((r) => {
      setRepos(r);
      if (r.length > 0) {
        setSelectedRepoId(r[0].id);
      }
    });
  }, []);

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  const loadAgents = () => {
    if (!selectedRepo) return;
    tauri.listAgents(selectedRepo.path).then(setAgents).catch(() => setAgents([]));
  };

  useEffect(loadAgents, [selectedRepoId, repos]);

  const handleAdd = async () => {
    if (!selectedRepo || !newName.trim() || !newPrompt.trim()) return;
    setError("");
    const filename = newFilename.trim() || `${newName.trim().toLowerCase().replace(/\s+/g, "-")}.md`;
    const agent: AgentFile = {
      filename: filename.endsWith(".md") ? filename : `${filename}.md`,
      name: newName.trim(),
      description: newDescription.trim(),
      tools: null,
      model: null,
      system_prompt: newPrompt.trim(),
      is_global: false,
    };
    try {
      await tauri.saveAgent(selectedRepo.path, agent);
      setShowAdd(false);
      setNewFilename("");
      setNewName("");
      setNewDescription("");
      setNewPrompt("");
      loadAgents();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemove = async (filename: string) => {
    if (!selectedRepo) return;
    setError("");
    try {
      await tauri.deleteAgent(selectedRepo.path, filename);
      loadAgents();
    } catch (e) {
      setError(String(e));
    }
  };

  const repoAgents = agents.filter((a) => !a.is_global);
  const globalAgents = agents.filter((a) => a.is_global);

  return (
    <div>
      <div className="page-header">
        <h2>Agents</h2>
        <p>
          Manage .claude/agents/*.md files. These define the agents available
          for task execution.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {repos.length > 1 && (
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Repository</label>
          <select
            className="form-select"
            value={selectedRepoId}
            onChange={(e) => setSelectedRepoId(e.target.value)}
            style={{ maxWidth: 300 }}
          >
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          className="btn btn-primary"
          onClick={() => setShowAdd(!showAdd)}
        >
          + Add Agent
        </button>
      </div>

      {showAdd && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title" style={{ marginBottom: 12 }}>
            New Agent
          </div>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Frontend Developer"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Filename</label>
            <input
              className="form-input"
              value={newFilename}
              onChange={(e) => setNewFilename(e.target.value)}
              placeholder="frontend-dev.md (auto-generated from name)"
            />
            <div className="form-help">
              Optional. Will be auto-generated from the name if left blank.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              className="form-input"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Specializes in React and CSS"
            />
          </div>
          <div className="form-group">
            <label className="form-label">System Prompt</label>
            <textarea
              className="form-textarea"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="You are a frontend specialist. Focus on UI components, styling, and accessibility."
              style={{ minHeight: 100 }}
            />
          </div>
          <div className="actions-bar" style={{ marginTop: 0 }}>
            <button className="btn btn-primary" onClick={handleAdd}>
              Add
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Repo agents */}
      {repoAgents.length > 0 && (
        <>
          <div className="sidebar-section-label" style={{ padding: "0 0 8px" }}>
            Repository Agents
          </div>
          {repoAgents.map((agent) => (
            <div key={agent.filename} className="panel" style={{ marginBottom: 8 }}>
              <div className="panel-header">
                <div>
                  <div className="panel-title">{agent.name}</div>
                  <div className="form-help">
                    {agent.filename}
                    {agent.description && ` — ${agent.description}`}
                  </div>
                </div>
                <div className="actions-bar" style={{ marginTop: 0 }}>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRemove(agent.filename)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {agent.system_prompt}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Global agents */}
      {globalAgents.length > 0 && (
        <>
          <div
            className="sidebar-section-label"
            style={{ padding: "16px 0 8px" }}
          >
            Global Agents (~/.claude/agents/)
          </div>
          {globalAgents.map((agent) => (
            <div key={agent.filename} className="panel" style={{ marginBottom: 8 }}>
              <div className="panel-header">
                <div>
                  <div className="panel-title">{agent.name}</div>
                  <div className="form-help">
                    {agent.filename}
                    {agent.description && ` — ${agent.description}`}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {agent.system_prompt}
              </div>
            </div>
          ))}
        </>
      )}

      {agents.length === 0 && (
        <div className="empty-state">
          <p>
            No agents found. Create .md files in your repo's .claude/agents/
            directory, or add one above.
          </p>
        </div>
      )}
    </div>
  );
}
