import type { TaskSpec, TaskProgress, IdeationResult, ExecutionMode } from "../../types";

interface TaskTableProps {
  tasks: TaskSpec[];
  taskProgress: TaskProgress | null;
  expandedTask: number | null;
  setExpandedTask: (index: number | null) => void;
  isReadOnly: boolean;
  onEditTask: (index: number) => void;
}

export function TaskTable({
  tasks,
  taskProgress,
  expandedTask,
  setExpandedTask,
  isReadOnly,
  onEditTask,
}: TaskTableProps) {
  return (
    <div className="jira-table">
      <div className="jira-header">
        <div className="jira-col-key">Key</div>
        <div className="jira-col-summary">Summary</div>
        <div className="jira-col-assignee">Assignee</div>
        <div className="jira-col-deps">Blocked by</div>
        <div className="jira-col-ac">AC</div>
        {!isReadOnly && <div className="jira-col-edit" />}
      </div>
      {tasks.map((spec, i) => {
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
                  aria-label={`Task status: ${taskStatus.replace("_", " ")}`}
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
                    onClick={(e) => { e.stopPropagation(); onEditTask(i); }}
                    title="Edit task"
                    aria-label={`Edit task ${i + 1}`}
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
  );
}

interface ExecutionModeSelectorProps {
  recommendation: IdeationResult["execution_mode"];
  modeOverride: ExecutionMode | null;
  isReadOnly: boolean;
  tmuxAvailable: boolean | null;
  onModeChange: (mode: ExecutionMode) => void;
}

export function ExecutionModeSelector({
  recommendation,
  modeOverride,
  isReadOnly,
  tmuxAvailable,
  onModeChange,
}: ExecutionModeSelectorProps) {
  const activeMode = modeOverride ?? recommendation?.recommended ?? "subagents";

  return (
    <>
      <div className="exec-mode-selector" role="radiogroup" aria-label="Execution mode">
        <button
          className={`exec-mode-option${activeMode === "teams" ? " exec-mode-active" : ""}`}
          onClick={() => !isReadOnly && onModeChange("teams")}
          style={isReadOnly ? { cursor: "default", opacity: activeMode === "teams" ? 1 : 0.35 } : undefined}
          role="radio"
          aria-checked={activeMode === "teams"}
          aria-label="Agent Teams mode"
        >
          <div className="exec-mode-icon exec-mode-teams">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
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
          onClick={() => !isReadOnly && onModeChange("subagents")}
          style={isReadOnly ? { cursor: "default", opacity: activeMode === "subagents" ? 1 : 0.35 } : undefined}
          role="radio"
          aria-checked={activeMode === "subagents"}
          aria-label="Subagents mode"
        >
          <div className="exec-mode-icon exec-mode-sub">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
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
      {recommendation && (
        <div className="exec-mode-rationale">
          {recommendation.rationale}
          <span className="exec-mode-confidence">
            {Math.round(recommendation.confidence * 100)}% confidence
          </span>
        </div>
      )}
      {tmuxAvailable === false &&
        (modeOverride ?? recommendation?.recommended) === "teams" && (
        <div className="tmux-warning" role="alert" style={{
          marginTop: 8,
          padding: "8px 12px",
          background: "var(--warning-bg, #3d2e00)",
          border: "1px solid var(--warning-border, #665000)",
          borderRadius: 6,
          color: "var(--warning-text, #ffd866)",
          fontSize: 13,
        }}>
          tmux is not installed. Agent Teams mode requires tmux.
          Install it with: <code>brew install tmux</code> (macOS),{" "}
          <code>sudo apt install tmux</code> (Ubuntu/Debian), or{" "}
          <code>sudo pacman -S tmux</code> (Arch).
        </div>
      )}
    </>
  );
}

interface EditTaskModalProps {
  taskIndex: number;
  draft: TaskSpec;
  onDraftChange: (draft: TaskSpec) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function EditTaskModal({ taskIndex, draft, onDraftChange, onSave, onCancel }: EditTaskModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel} role="dialog" aria-label={`Edit TASK-${taskIndex + 1}`}>
      <div className="modal edit-task-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div className="panel-title">Edit TASK-{taskIndex + 1}</div>
        </div>
        <div className="edit-task-body">
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              className="form-input"
              value={draft.title}
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={draft.description}
              onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
              rows={5}
            />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Agent</label>
              <input
                className="form-input"
                value={draft.agent}
                onChange={(e) => onDraftChange({ ...draft, agent: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Dependencies (task numbers)</label>
              <input
                className="form-input"
                value={draft.dependencies.join(", ")}
                placeholder="e.g. 1, 2"
                onChange={(e) => onDraftChange({
                  ...draft,
                  dependencies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Acceptance Criteria</label>
            <div className="ac-edit-list">
              {draft.acceptance_criteria.map((criterion, j) => (
                <div key={j} className="ac-edit-row">
                  <input
                    className="form-input ac-edit-input"
                    value={criterion}
                    onChange={(e) => {
                      const updated = [...draft.acceptance_criteria];
                      updated[j] = e.target.value;
                      onDraftChange({ ...draft, acceptance_criteria: updated });
                    }}
                  />
                  <button
                    className="ac-edit-remove"
                    onClick={() => {
                      const updated = draft.acceptance_criteria.filter((_, k) => k !== j);
                      onDraftChange({ ...draft, acceptance_criteria: updated });
                    }}
                    title="Remove criterion"
                    aria-label={`Remove criterion ${j + 1}`}
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onDraftChange({
                  ...draft,
                  acceptance_criteria: [...draft.acceptance_criteria, ""],
                })}
                style={{ alignSelf: "flex-start" }}
              >
                + Add criterion
              </button>
            </div>
          </div>
        </div>
        <div className="edit-task-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
