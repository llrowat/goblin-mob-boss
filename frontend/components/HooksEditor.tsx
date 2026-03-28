import { useState, useEffect, useCallback, useRef } from "react";
import { useTauri } from "../hooks/useTauri";
import type {
  RepoHooks,
  HookRule,
  HookHandler,
  HookEventName,
  GeneratedHook,
} from "../types";
import { HOOK_EVENTS } from "../types";
import { useToast } from "../hooks/useToast";

interface HooksEditorProps {
  repoPath: string;
  onHooksChanged?: () => void;
}

const EMPTY_HANDLER: HookHandler = { type: "command", command: "" };

export function HooksEditor({ repoPath, onHooksChanged }: HooksEditorProps) {
  const tauri = useTauri();
  const { addToast } = useToast();

  const [hooks, setHooks] = useState<RepoHooks>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Auto-generate state
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateDesc, setGenerateDesc] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedHook, setGeneratedHook] = useState<GeneratedHook | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Custom hook form
  const [newEvent, setNewEvent] = useState<HookEventName>("PostToolUse");
  const [newMatcher, setNewMatcher] = useState("");
  const [newCommand, setNewCommand] = useState("");

  const loadHooks = useCallback(() => {
    setLoading(true);
    tauri.getRepoHooks(repoPath).then((h) => {
      setHooks(h);
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
      onHooksChanged?.();
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

  const handleAdd = () => {
    if (!newCommand.trim()) return;
    addRule(newEvent, newMatcher.trim(), newCommand.trim());
    setNewCommand("");
    setNewMatcher("");
    setShowAdd(false);
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const handleGenerate = async () => {
    if (!generateDesc.trim()) return;
    setGenerating(true);
    setGeneratedHook(null);

    try {
      await tauri.generateHook(generateDesc.trim());

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const result = await tauri.checkHookGeneration();
          if (result !== null) {
            stopPolling();
            setGenerating(false);
            try {
              const parsed = JSON.parse(result) as GeneratedHook;
              setGeneratedHook(parsed);
            } catch {
              addToast("Generated output wasn't valid JSON", "error");
            }
          }
        } catch (e) {
          stopPolling();
          setGenerating(false);
          addToast(`Hook generation failed: ${e}`, "error");
        }
      }, 2000);

      // Timeout after 2 minutes
      setTimeout(() => {
        if (pollRef.current) {
          stopPolling();
          setGenerating(false);
          addToast("Hook generation timed out", "error");
        }
      }, 120000);
    } catch (e) {
      setGenerating(false);
      addToast(`Failed to start generation: ${e}`, "error");
    }
  };

  const applyGeneratedHook = () => {
    if (!generatedHook) return;
    addRule(
      generatedHook.event as HookEventName,
      generatedHook.matcher,
      generatedHook.command,
    );
    setGeneratedHook(null);
    setGenerateDesc("");
    setShowGenerate(false);
    addToast(`Hook "${generatedHook.name}" added`, "success");
  };

  const discardGeneratedHook = () => {
    setGeneratedHook(null);
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
              setShowAdd(!showAdd);
              setShowGenerate(false);
            }}
            disabled={saving}
          >
            + Add
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setShowGenerate(!showGenerate);
              setShowAdd(false);
            }}
            disabled={saving || generating}
          >
            {generating ? "Generating..." : "Create with AI"}
          </button>
        </div>
      </div>

      {/* Add hook form */}
      {showAdd && (
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
              onClick={handleAdd}
              disabled={!newCommand.trim()}
            >
              Add Hook
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Auto-generate hook */}
      {showGenerate && !generating && !generatedHook && (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Describe your hook</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              Tell Claude what the hook should do. It will generate the event, matcher, and command.
            </div>
          </div>
          <textarea
            className="form-textarea"
            value={generateDesc}
            onChange={(e) => setGenerateDesc(e.target.value)}
            placeholder='e.g. "Block any commands that delete migration files", "Run cargo test after Rust file edits", "Log a warning when Claude reads files in the secrets/ directory"'
            style={{ minHeight: 60, marginBottom: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}
            autoFocus
          />
          <div className="actions-bar" style={{ gap: 4 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleGenerate}
              disabled={!generateDesc.trim()}
            >
              Generate
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setShowGenerate(false); setGenerateDesc(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {generating && (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 16,
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          <div className="spinner" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Claude is crafting your hook...
          </div>
        </div>
      )}

      {/* Generated hook preview */}
      {generatedHook && (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius)",
            padding: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
            Generated: {generatedHook.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
            {generatedHook.description}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: "2px 6px",
                background: "var(--panel)",
                borderRadius: "var(--radius-sm)",
                color: "var(--accent)",
              }}
            >
              {HOOK_EVENTS.find((e) => e.value === generatedHook.event)?.label || generatedHook.event}
            </span>
            {generatedHook.matcher && (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "2px 6px",
                  background: "var(--panel)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--accent-brass)",
                }}
              >
                {generatedHook.matcher}
              </span>
            )}
          </div>
          <code
            style={{
              display: "block",
              fontSize: 12,
              padding: 8,
              background: "var(--panel)",
              borderRadius: "var(--radius-sm)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              marginBottom: 8,
            }}
          >
            {generatedHook.command}
          </code>
          <div className="actions-bar" style={{ gap: 4 }}>
            <button className="btn btn-primary btn-sm" onClick={applyGeneratedHook}>
              Add to Repo
            </button>
            <button className="btn btn-secondary btn-sm" onClick={discardGeneratedHook}>
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Existing hooks */}
      {ruleCount === 0 && !showAdd ? (
        <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 0" }}>
          No hooks wired up yet.
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
