import { useState, useEffect, useCallback } from "react";
import { useTauri } from "../hooks/useTauri";
import type {
  RepoHooks,
  HookRule,
  HookHandler,
  HookTemplate,
  HookEventName,
} from "../types";
import { HOOK_EVENTS } from "../types";
import { useToast } from "../hooks/useToast";

interface HooksEditorProps {
  repoPath: string;
}

const EMPTY_HANDLER: HookHandler = { type: "command", command: "" };

export function HooksEditor({ repoPath }: HooksEditorProps) {
  const tauri = useTauri();
  const { addToast } = useToast();

  const [hooks, setHooks] = useState<RepoHooks>({});
  const [templates, setTemplates] = useState<HookTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);

  // Custom hook form
  const [newEvent, setNewEvent] = useState<HookEventName>("PostToolUse");
  const [newMatcher, setNewMatcher] = useState("");
  const [newCommand, setNewCommand] = useState("");

  const loadHooks = useCallback(() => {
    setLoading(true);
    Promise.all([
      tauri.getRepoHooks(repoPath),
      tauri.listHookTemplates(),
    ]).then(([h, t]) => {
      setHooks(h);
      setTemplates(t);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoPath]);

  useEffect(loadHooks, [loadHooks]);

  const save = async (updated: RepoHooks) => {
    setSaving(true);
    try {
      await tauri.saveRepoHooks(repoPath, updated);
      setHooks(updated);
      addToast("Hooks saved", "success");
    } catch (e) {
      addToast(`Failed to save hooks: ${e}`, "error");
    }
    setSaving(false);
  };

  const countRules = (h: RepoHooks): number =>
    Object.values(h).reduce(
      (sum, rules) => sum + (Array.isArray(rules) ? rules.length : 0),
      0,
    );

  const addRule = (event: HookEventName, matcher: string, command: string) => {
    const rule: HookRule = {
      matcher,
      hooks: [{ ...EMPTY_HANDLER, command }],
    };
    const updated = { ...hooks };
    const existing = (updated[event] || []) as HookRule[];
    updated[event] = [...existing, rule];
    save(updated);
  };

  const removeRule = (event: HookEventName, index: number) => {
    const updated = { ...hooks };
    const rules = [...((updated[event] || []) as HookRule[])];
    rules.splice(index, 1);
    updated[event] = rules;
    save(updated);
  };

  const applyTemplate = (template: HookTemplate) => {
    addRule(template.event as HookEventName, template.matcher, template.command);
    setShowTemplates(false);
  };

  const handleAddCustom = () => {
    if (!newCommand.trim()) return;
    addRule(newEvent, newMatcher.trim(), newCommand.trim());
    setNewCommand("");
    setNewMatcher("");
    setShowAddCustom(false);
  };

  if (loading) {
    return (
      <div style={{ padding: "8px 0", color: "var(--text-secondary)", fontSize: 13 }}>
        Loading hooks...
      </div>
    );
  }

  const ruleCount = countRules(hooks);

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          Hooks
          {ruleCount > 0 && (
            <span style={{ color: "var(--text-secondary)", fontWeight: 400, marginLeft: 6 }}>
              ({ruleCount} rule{ruleCount !== 1 ? "s" : ""})
            </span>
          )}
        </div>
        <div className="actions-bar" style={{ gap: 4 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setShowTemplates(!showTemplates);
              setShowAddCustom(false);
            }}
            disabled={saving}
          >
            + Template
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setShowAddCustom(!showAddCustom);
              setShowTemplates(false);
            }}
            disabled={saving}
          >
            + Custom
          </button>
        </div>
      </div>

      {/* Template picker */}
      {showTemplates && (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
            Quick-add a hook from a template. You can customize the command after adding.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {templates.map((t) => {
              const eventInfo = HOOK_EVENTS.find((e) => e.value === t.event);
              return (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    background: "var(--panel)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                  onClick={() => applyTemplate(t)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && applyTemplate(t)}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {t.description}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 6px",
                      background: "var(--bg)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--accent)",
                      whiteSpace: "nowrap",
                      marginLeft: 8,
                    }}
                  >
                    {eventInfo?.label || t.event}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom hook form */}
      {showAddCustom && (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 12,
            marginBottom: 8,
          }}
        >
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label" style={{ fontSize: 12 }}>
              Event
            </label>
            <select
              className="form-input"
              value={newEvent}
              onChange={(e) => setNewEvent(e.target.value as HookEventName)}
              style={{ fontSize: 13 }}
            >
              {HOOK_EVENTS.map((ev) => (
                <option key={ev.value} value={ev.value}>
                  {ev.label} — {ev.description}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label" style={{ fontSize: 12 }}>
              Matcher
            </label>
            <input
              className="form-input"
              value={newMatcher}
              onChange={(e) => setNewMatcher(e.target.value)}
              placeholder="e.g. Bash, Edit|Write, or leave blank for all"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
            <div className="form-help">
              Tool name regex. Common: Bash, Edit, Write, Edit|Write. Leave empty to match everything.
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label" style={{ fontSize: 12 }}>
              Command
            </label>
            <input
              className="form-input"
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              placeholder="e.g. npm run lint --fix"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          </div>
          <div className="actions-bar" style={{ gap: 4 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAddCustom}
              disabled={!newCommand.trim()}
            >
              Add Hook
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAddCustom(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing hooks */}
      {ruleCount === 0 && !showTemplates && !showAddCustom ? (
        <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 0" }}>
          No hooks wired up yet. Add a template or write your own.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {HOOK_EVENTS.map((eventDef) => {
            const rules = (hooks[eventDef.value] || []) as HookRule[];
            if (rules.length === 0) return null;
            return (
              <div key={eventDef.value}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--accent)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginTop: 4,
                    marginBottom: 2,
                  }}
                >
                  {eventDef.label}
                </div>
                {rules.map((rule, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 8px",
                      background: "var(--bg-raised)",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: 2,
                    }}
                  >
                    {rule.matcher && (
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          padding: "1px 5px",
                          background: "var(--panel)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--accent-brass)",
                          flexShrink: 0,
                        }}
                      >
                        {rule.matcher}
                      </span>
                    )}
                    <code
                      style={{
                        fontSize: 12,
                        color: "var(--text)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {rule.hooks.map((h) => h.command).join(" && ")}
                    </code>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{
                        padding: "0 6px",
                        fontSize: 11,
                        lineHeight: "20px",
                        minWidth: "unset",
                        flexShrink: 0,
                      }}
                      onClick={() => removeRule(eventDef.value, idx)}
                      disabled={saving}
                      title="Remove this hook"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
