import { useState, useEffect, useRef } from "react";
import { useTauri } from "../hooks/useTauri";
import type { AgentFile, AgentTemplate, Repository } from "../types";

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
}

const emptyForm: AgentFormData = {
  filename: "",
  name: "",
  description: "",
  tools: "",
  model: "",
  system_prompt: "",
  color: "#5a8a5c",
};

export function AgentsPage() {
  const tauri = useTauri();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [agents, setAgents] = useState<AgentFile[]>([]);
  const [error, setError] = useState("");
  const [modalAgent, setModalAgent] = useState<AgentFile | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [addingTemplate, setAddingTemplate] = useState<string | null>(null);

  useEffect(() => {
    tauri.listAgentTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

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
    tauri
      .listAgents(selectedRepo.path)
      .then(setAgents)
      .catch(() => setAgents([]));
  };

  useEffect(loadAgents, [selectedRepoId, repos]);

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
    if (!selectedRepo || !data.name.trim() || !data.system_prompt.trim())
      return;
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
      is_global: false,
      color: data.color,
    };

    try {
      await tauri.saveAgent(selectedRepo.path, agent);
      closeModal();
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
      setDeleteConfirm(null);
      loadAgents();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAddTemplate = async (templateId: string) => {
    if (!selectedRepo || addingTemplate) return;
    setAddingTemplate(templateId);
    setError("");
    try {
      await tauri.applyAgentTemplate(selectedRepo.path, templateId);
      loadAgents();
    } catch (e) {
      setError(String(e));
    } finally {
      setAddingTemplate(null);
    }
  };

  const repoAgents = agents.filter((a) => !a.is_global);
  const globalAgents = agents.filter((a) => a.is_global);

  // Templates not yet added as agents (match by filename)
  const agentFilenames = new Set(agents.map((a) => a.filename));
  const unappliedTemplates = templates.filter(
    (t) => !agentFilenames.has(t.agent.filename),
  );

  return (
    <div>
      <div className="page-header">
        <h2>Agents</h2>
        <p>
          Manage .claude/agents/*.md files. These define the agents available for
          task execution.
        </p>
      </div>

      {error && !modalMode && <div className="error-banner">{error}</div>}

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

      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={openCreate}>
          + Add Agent
        </button>
      </div>

      {/* Repo agents */}
      {repoAgents.length > 0 && (
        <>
          <div
            className="sidebar-section-label"
            style={{ padding: "0 0 8px" }}
          >
            Repository Agents
          </div>
          <div className="agent-grid">
            {repoAgents.map((agent) => (
              <AgentCard
                key={agent.filename}
                agent={agent}
                onEdit={() => openEdit(agent)}
                onRemove={() => setDeleteConfirm(agent.filename)}
                onConfirmDelete={() => handleRemove(agent.filename)}
                deleteConfirm={deleteConfirm === agent.filename}
                onCancelDelete={() => setDeleteConfirm(null)}
              />
            ))}
          </div>
        </>
      )}

      {/* Global agents */}
      {globalAgents.length > 0 && (
        <>
          <div
            className="sidebar-section-label"
            style={{ padding: "20px 0 8px" }}
          >
            Global Agents (~/.claude/agents/)
          </div>
          <div className="agent-grid">
            {globalAgents.map((agent) => (
              <AgentCard
                key={agent.filename}
                agent={agent}
                onEdit={() => openEdit(agent)}
                onRemove={undefined}
                onConfirmDelete={undefined}
                deleteConfirm={false}
                onCancelDelete={undefined}
              />
            ))}
          </div>
        </>
      )}

      {/* Built-in templates (not yet added) */}
      {unappliedTemplates.length > 0 && selectedRepo && (
        <>
          <div
            className="sidebar-section-label"
            style={{ padding: agents.length > 0 ? "20px 0 8px" : "0 0 8px" }}
          >
            Built-in Templates
          </div>
          <div className="agent-grid">
            {unappliedTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                adding={addingTemplate === template.id}
                onAdd={() => handleAddTemplate(template.id)}
              />
            ))}
          </div>
        </>
      )}

      {agents.length === 0 && unappliedTemplates.length === 0 && (
        <div className="empty-state">
          <h3>No Agents</h3>
          <p>
            Create .md files in your repo&apos;s .claude/agents/ directory, or
            add one above.
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
}: {
  agent: AgentFile;
  onEdit: () => void;
  onRemove: (() => void) | undefined;
  onConfirmDelete: (() => void) | undefined;
  deleteConfirm: boolean;
  onCancelDelete: (() => void) | undefined;
}) {
  return (
    <div className="agent-card">
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

function TemplateCard({
  template,
  adding,
  onAdd,
}: {
  template: AgentTemplate;
  adding: boolean;
  onAdd: () => void;
}) {
  const agent = template.agent;
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
              {template.category}
              <span className="agent-card-builtin-badge">template</span>
            </div>
          </div>
        </div>
        {template.description && (
          <div
            style={{
              fontSize: 12,
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            {template.description}
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
            {adding ? "Adding..." : "+ Add to Repo"}
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
