import { useState, useEffect, useRef } from "react";
import { useTauri } from "../hooks/useTauri";
import type { AgentFile } from "../types";


const PRESET_COLORS = [
  "#5a8a5c",
  "#5b8abd",
  "#7a6abf",
  "#b8944a",
  "#c4654a",
  "#4a9e8e",
  "#9a6bb5",
  "#c45a6a",
  "#8a7a4a",
  "#6a8a8a",
  "#aa6a3a",
  "#5a7a9a",
];

interface AgentFormData {
  filename: string;
  name: string;
  description: string;
  tools: string;
  model: string;
  system_prompt: string;
  color: string;
  role: string;
}

const emptyForm: AgentFormData = {
  filename: "",
  name: "",
  description: "",
  tools: "",
  model: "",
  system_prompt: "",
  color: "#5a8a5c",
  role: "developer",
};

export function AgentsPage() {
  const tauri = useTauri();
  const [agents, setAgents] = useState<AgentFile[]>([]);
  const [error, setError] = useState("");
  const [modalAgent, setModalAgent] = useState<AgentFile | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [builtInAgents, setBuiltInAgents] = useState<AgentFile[]>([]);
  const [addingBuiltIn, setAddingBuiltIn] = useState<string | null>(null);

  useEffect(() => {
    tauri.listBuiltInAgents().then(setBuiltInAgents).catch(() => setBuiltInAgents([]));
  }, []);

  const loadAgents = () => {
    tauri
      .listGlobalAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  };

  useEffect(loadAgents, []);

  const openCreate = () => {
    setModalAgent(null);
    setModalMode("create");
    setError("");
  };

  const openEdit = (agent: AgentFile) => {
    setModalAgent(agent);
    setModalMode("edit");
    setError("");
  };

  const closeModal = () => {
    setModalMode(null);
    setModalAgent(null);
    setError("");
  };

  const handleSave = async (data: AgentFormData) => {
    if (!data.name.trim() || !data.system_prompt.trim()) return;
    setError("");

    const filename =
      data.filename.trim() ||
      `${data.name.trim().toLowerCase().replace(/\s+/g, "-")}.md`;

    const agent: AgentFile = {
      filename: filename.endsWith(".md") ? filename : `${filename}.md`,
      name: data.name.trim(),
      description: data.description.trim(),
      tools: data.tools.trim() || null,
      model: data.model.trim() || null,
      system_prompt: data.system_prompt.trim(),
      is_global: true,
      color: data.color,
      role: data.role as AgentFile["role"],
      enabled: modalAgent ? modalAgent.enabled : true,
    };

    try {
      await tauri.saveGlobalAgent(agent);
      closeModal();
      loadAgents();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemove = async (filename: string) => {
    setError("");
    try {
      await tauri.deleteGlobalAgent(filename);
      setDeleteConfirm(null);
      loadAgents();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleToggleEnabled = async (agent: AgentFile) => {
    setError("");
    try {
      await tauri.saveGlobalAgent({ ...agent, enabled: !agent.enabled });
      loadAgents();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAddBuiltIn = async (filename: string) => {
    if (addingBuiltIn) return;
    setAddingBuiltIn(filename);
    setError("");
    try {
      // Find the built-in agent template and save it globally
      const template = builtInAgents.find((a) => a.filename === filename);
      if (template) {
        await tauri.saveGlobalAgent({ ...template, is_global: true });
      }
      loadAgents();
    } catch (e) {
      setError(String(e));
    } finally {
      setAddingBuiltIn(null);
    }
  };

  // Built-in agents not yet added (match by filename)
  const agentFilenames = new Set(agents.map((a) => a.filename));
  const unappliedBuiltIns = builtInAgents.filter(
    (a) => !agentFilenames.has(a.filename),
  );

  return (
    <div>
      <div className="page-header">
        <h2>Agents</h2>
        <p>
          Manage your global agents. These ~/.claude/agents/*.md files define
          who&apos;s available for task execution across all repos.
        </p>
      </div>

      {error && !modalMode && <div className="error-banner">{error}</div>}

      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={openCreate}>
          + Add Agent
        </button>
      </div>

      {/* Global agents */}
      {agents.length > 0 && (
        <div className="agent-grid">
          {agents.map((agent) => (
            <AgentCard
              key={agent.filename}
              agent={agent}
              onEdit={() => openEdit(agent)}
              onRemove={() => setDeleteConfirm(agent.filename)}
              onConfirmDelete={() => handleRemove(agent.filename)}
              deleteConfirm={deleteConfirm === agent.filename}
              onCancelDelete={() => setDeleteConfirm(null)}
              onToggleEnabled={() => handleToggleEnabled(agent)}
            />
          ))}
        </div>
      )}

      {/* Built-in agents (not yet added) */}
      {unappliedBuiltIns.length > 0 && (
        <>
          <div
            className="section-label"
            style={{ padding: agents.length > 0 ? "20px 0 8px" : "0 0 8px" }}
          >
            Built-in Agents
          </div>
          <div className="agent-grid">
            {unappliedBuiltIns.map((agent) => (
              <BuiltInAgentCard
                key={agent.filename}
                agent={agent}
                adding={addingBuiltIn === agent.filename}
                onAdd={() => handleAddBuiltIn(agent.filename)}
              />
            ))}
          </div>
        </>
      )}

      {agents.length === 0 && unappliedBuiltIns.length === 0 && (
        <div className="empty-state">
          <h3>No Agents</h3>
          <p>
            No crew members yet. Add an agent above to populate your
            ~/.claude/agents/ directory.
          </p>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <AgentFormModal
          mode={modalMode}
          agent={modalAgent}
          error={error}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function AgentCard({
  agent,
  onEdit,
  onRemove,
  onConfirmDelete,
  deleteConfirm,
  onCancelDelete,
  onToggleEnabled,
}: {
  agent: AgentFile;
  onEdit: () => void;
  onRemove: (() => void) | undefined;
  onConfirmDelete: (() => void) | undefined;
  deleteConfirm: boolean;
  onCancelDelete: (() => void) | undefined;
  onToggleEnabled: () => void;
}) {
  const disabled = agent.enabled === false;
  return (
    <div className={`agent-card${disabled ? " agent-card-disabled" : ""}`}>
      <div
        className="agent-card-color-bar"
        style={{ background: agent.color || "#5a8a5c" }}
      />
      <div className="agent-card-body">
        <div className="agent-card-top">
          <div
            className="agent-card-avatar"
            style={{ background: agent.color || "#5a8a5c" }}
          >
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="agent-card-info">
            <div className="agent-card-name">{agent.name}</div>
            <div className="agent-card-role">
              {agent.filename}
              {agent.is_global && (
                <span className="agent-card-builtin-badge">global</span>
              )}
            </div>
          </div>
          <label
            className="agent-toggle"
            title={disabled ? "Enable agent" : "Disable agent"}
          >
            <input
              type="checkbox"
              checked={agent.enabled !== false}
              onChange={onToggleEnabled}
            />
            <span className="agent-toggle-slider" />
          </label>
        </div>
        {agent.description && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            {agent.description}
          </div>
        )}
        <div className="agent-card-prompt">{agent.system_prompt}</div>
        {(agent.tools || agent.model) && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            {agent.tools && (
              <span className="agent-tag" style={{ fontSize: 10 }}>
                Tools: {agent.tools}
              </span>
            )}
            {agent.model && (
              <span
                className="agent-tag agent-tag-sub"
                style={{ fontSize: 10 }}
              >
                Model: {agent.model}
              </span>
            )}
          </div>
        )}
        <div className="agent-card-actions">
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>
            Edit
          </button>
          {onRemove && !deleteConfirm && (
            <button className="btn btn-danger btn-sm" onClick={onRemove}>
              Remove
            </button>
          )}
          {deleteConfirm && (
            <div className="agent-card-confirm">
              <span style={{ fontSize: 12, color: "var(--danger)" }}>
                Delete?
              </span>
              <button
                className="btn btn-danger btn-sm"
                onClick={onConfirmDelete}
              >
                Yes
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={onCancelDelete}
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BuiltInAgentCard({
  agent,
  adding,
  onAdd,
}: {
  agent: AgentFile;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="agent-card agent-card-template">
      <div
        className="agent-card-color-bar"
        style={{ background: agent.color || "#5a8a5c" }}
      />
      <div className="agent-card-body">
        <div className="agent-card-top">
          <div
            className="agent-card-avatar"
            style={{ background: agent.color || "#5a8a5c", opacity: 0.5 }}
          >
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="agent-card-info">
            <div className="agent-card-name">{agent.name}</div>
            <div className="agent-card-role">
              {agent.filename}
              <span className="agent-card-builtin-badge">built-in</span>
            </div>
          </div>
        </div>
        {agent.description && (
          <div
            style={{
              fontSize: 12,
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            {agent.description}
          </div>
        )}
        {agent.tools && (
          <div style={{ marginBottom: 8 }}>
            <span className="agent-tag" style={{ fontSize: 10, opacity: 0.6 }}>
              Tools: {agent.tools}
            </span>
          </div>
        )}
        <div className="agent-card-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={onAdd}
            disabled={adding}
          >
            {adding ? "Adding..." : "+ Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentFormModal({
  mode,
  agent,
  error,
  onSave,
  onClose,
}: {
  mode: "create" | "edit";
  agent: AgentFile | null;
  error: string;
  onSave: (data: AgentFormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AgentFormData>(() => {
    if (agent) {
      return {
        filename: agent.filename,
        name: agent.name,
        description: agent.description,
        tools: agent.tools || "",
        model: agent.model || "",
        system_prompt: agent.system_prompt,
        color: agent.color || "#5a8a5c",
        role: agent.role || "developer",
      };
    }
    return { ...emptyForm };
  });

  const [showCustomColor, setShowCustomColor] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const update = (field: keyof AgentFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  const isValid = form.name.trim() !== "" && form.system_prompt.trim() !== "";

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
    >
      <div className="modal agent-form-modal">
        {/* Color preview header */}
        <div className="agent-form-header" style={{ background: form.color }}>
          <div className="agent-form-avatar">
            {form.name ? form.name.charAt(0).toUpperCase() : "?"}
          </div>
          <div className="agent-form-header-text">
            <div className="agent-form-header-title">
              {mode === "create" ? "Create Agent" : "Edit Agent"}
            </div>
            <div className="agent-form-header-subtitle">
              {form.name || "Unnamed Agent"}
            </div>
          </div>
        </div>

        <div className="agent-form-body">
          {error && <div className="error-banner">{error}</div>}

          {/* Name */}
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="My Custom Agent"
              autoFocus
            />
          </div>

          {/* Filename */}
          <div className="form-group">
            <label className="form-label">Filename</label>
            <input
              className="form-input"
              value={form.filename}
              onChange={(e) => update("filename", e.target.value)}
              placeholder="auto-generated-from-name.md"
              disabled={mode === "edit"}
            />
            <div className="form-help">
              {mode === "edit"
                ? "Filename cannot be changed after creation."
                : "Optional. Auto-generated from name if left blank."}
            </div>
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              className="form-input"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Specializes in React and CSS"
            />
          </div>

          {/* Color */}
          <div className="form-group">
            <label className="form-label">Color</label>
            <div className="agent-color-picker">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`agent-color-swatch ${form.color === c ? "selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => {
                    update("color", c);
                    setShowCustomColor(false);
                  }}
                  title={c}
                />
              ))}
              <button
                type="button"
                className={`agent-color-swatch agent-color-custom-btn ${showCustomColor ? "selected" : ""}`}
                onClick={() => setShowCustomColor(!showCustomColor)}
                title="Custom color"
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>...</span>
              </button>
            </div>
            {showCustomColor && (
              <div className="agent-color-custom-row">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => update("color", e.target.value)}
                  className="agent-color-native-picker"
                />
                <input
                  className="form-input"
                  value={form.color}
                  onChange={(e) => update("color", e.target.value)}
                  placeholder="#5a8a5c"
                  style={{
                    maxWidth: 120,
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                  }}
                />
              </div>
            )}
          </div>

          {/* Role */}
          <div className="form-group">
            <label className="form-label">Role</label>
            <select
              className="form-input"
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
            >
              <option value="developer">Developer</option>
              <option value="quality">Quality (verifies work)</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="documentation">Documentation</option>
              <option value="explorer">Explorer</option>
            </select>
            <div className="form-help">
              Quality agents are automatically included as verification steps in plans.
            </div>
          </div>

          {/* Tools */}
          <div className="form-group">
            <label className="form-label">Tools</label>
            <input
              className="form-input"
              value={form.tools}
              onChange={(e) => update("tools", e.target.value)}
              placeholder="Read, Edit, Write, Bash"
            />
            <div className="form-help">
              Comma-separated list of allowed tools. Leave blank for all.
            </div>
          </div>

          {/* Model */}
          <div className="form-group">
            <label className="form-label">Model</label>
            <input
              className="form-input"
              value={form.model}
              onChange={(e) => update("model", e.target.value)}
              placeholder="claude-sonnet-4-5-20250514"
            />
            <div className="form-help">
              Optional model override. Leave blank for default.
            </div>
          </div>

          {/* System Prompt */}
          <div className="form-group">
            <label className="form-label">System Prompt</label>
            <textarea
              className="form-textarea"
              value={form.system_prompt}
              onChange={(e) => update("system_prompt", e.target.value)}
              placeholder="You are a specialist in..."
              style={{ minHeight: 200 }}
            />
            <div className="form-help">
              Instructions defining this agent&apos;s behavior during task
              execution.
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="agent-form-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onSave(form)}
            disabled={!isValid}
          >
            {mode === "create" ? "Create Agent" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
