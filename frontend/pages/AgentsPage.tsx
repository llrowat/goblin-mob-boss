import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import type { Agent } from "../types";

export function AgentsPage() {
  const tauri = useTauri();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("developer");
  const [newPrompt, setNewPrompt] = useState("");
  const [error, setError] = useState("");

  const loadAgents = () => {
    tauri.listAgents().then(setAgents);
  };

  useEffect(loadAgents, []);

  const handleAdd = async () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    setError("");
    try {
      await tauri.addAgent(newName.trim(), newRole.trim(), newPrompt.trim());
      setShowAdd(false);
      setNewName("");
      setNewRole("developer");
      setNewPrompt("");
      loadAgents();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setEditName(agent.name);
    setEditRole(agent.role);
    setEditPrompt(agent.system_prompt);
  };

  const handleSave = async () => {
    if (!editingId) return;
    setError("");
    try {
      await tauri.updateAgent(
        editingId,
        editName.trim(),
        editRole.trim(),
        editPrompt.trim(),
      );
      setEditingId(null);
      loadAgents();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemove = async (id: string) => {
    setError("");
    try {
      await tauri.removeAgent(id);
      loadAgents();
    } catch (e) {
      setError(String(e));
    }
  };

  const builtinAgents = agents.filter((a) => a.is_builtin);
  const customAgents = agents.filter((a) => !a.is_builtin);

  return (
    <div>
      <div className="page-header">
        <h2>Agents</h2>
        <p>Configure AI agents for task execution.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

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
              placeholder="My Custom Agent"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select
              className="form-select"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{ maxWidth: 200 }}
            >
              <option value="developer">Developer</option>
              <option value="testing">Testing</option>
              <option value="reviewer">Reviewer</option>
              <option value="devops">DevOps</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">System Prompt</label>
            <textarea
              className="form-textarea"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="You are a specialist in..."
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

      {/* Built-in agents */}
      {builtinAgents.length > 0 && (
        <>
          <div className="sidebar-section-label" style={{ padding: "0 0 8px" }}>
            Built-in Agents
          </div>
          {builtinAgents.map((agent) => (
            <div key={agent.id} className="panel" style={{ marginBottom: 8 }}>
              {editingId === agent.id ? (
                <AgentEditForm
                  name={editName}
                  role={editRole}
                  prompt={editPrompt}
                  onNameChange={setEditName}
                  onRoleChange={setEditRole}
                  onPromptChange={setEditPrompt}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <AgentCard
                  agent={agent}
                  onEdit={() => handleEdit(agent)}
                  onRemove={undefined}
                />
              )}
            </div>
          ))}
        </>
      )}

      {/* Custom agents */}
      {customAgents.length > 0 && (
        <>
          <div
            className="sidebar-section-label"
            style={{ padding: "16px 0 8px" }}
          >
            Custom Agents
          </div>
          {customAgents.map((agent) => (
            <div key={agent.id} className="panel" style={{ marginBottom: 8 }}>
              {editingId === agent.id ? (
                <AgentEditForm
                  name={editName}
                  role={editRole}
                  prompt={editPrompt}
                  onNameChange={setEditName}
                  onRoleChange={setEditRole}
                  onPromptChange={setEditPrompt}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <AgentCard
                  agent={agent}
                  onEdit={() => handleEdit(agent)}
                  onRemove={() => handleRemove(agent.id)}
                />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  onEdit,
  onRemove,
}: {
  agent: Agent;
  onEdit: () => void;
  onRemove: (() => void) | undefined;
}) {
  return (
    <>
      <div className="panel-header">
        <div>
          <div className="panel-title">{agent.name}</div>
          <div className="form-help">{agent.role}</div>
        </div>
        <div className="actions-bar" style={{ marginTop: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>
            Edit
          </button>
          {onRemove && (
            <button className="btn btn-danger btn-sm" onClick={onRemove}>
              Remove
            </button>
          )}
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
    </>
  );
}

function AgentEditForm({
  name,
  role,
  prompt,
  onNameChange,
  onRoleChange,
  onPromptChange,
  onSave,
  onCancel,
}: {
  name: string;
  role: string;
  prompt: string;
  onNameChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onPromptChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">Name</label>
        <input
          className="form-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Role</label>
        <select
          className="form-select"
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <option value="developer">Developer</option>
          <option value="testing">Testing</option>
          <option value="reviewer">Reviewer</option>
          <option value="devops">DevOps</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">System Prompt</label>
        <textarea
          className="form-textarea"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          style={{ minHeight: 100 }}
        />
      </div>
      <div className="actions-bar" style={{ marginTop: 0 }}>
        <button className="btn btn-primary" onClick={onSave}>
          Save
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}
