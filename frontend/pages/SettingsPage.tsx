import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import { useToast } from "../hooks/useToast";

const SHELL_OPTIONS = [
  { value: "powershell", label: "PowerShell" },
  { value: "cmd", label: "Command Prompt (cmd)" },
  { value: "wt", label: "Windows Terminal" },
  { value: "bash", label: "Bash" },
  { value: "zsh", label: "Zsh" },
];

const EXEC_MODE_OPTIONS = [
  { value: "", label: "Use recommendation" },
  { value: "teams", label: "Agent Teams" },
  { value: "subagents", label: "Subagents" },
];

const MODEL_OPTIONS = [
  { value: "", label: "Default" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export function SettingsPage() {
  const tauri = useTauri();
  const { addToast } = useToast();
  const [shell, setShell] = useState("");
  const [defaultExecutionMode, setDefaultExecutionMode] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [autoValidate, setAutoValidate] = useState(false);

  useEffect(() => {
    tauri.getPreferences().then((prefs) => {
      setShell(prefs.shell);
      setDefaultExecutionMode(prefs.default_execution_mode || "");
      setDefaultModel(prefs.default_model || "");
      setAutoValidate(prefs.auto_validate || false);
    });
  }, []);

  const handleSave = async () => {
    await tauri.setPreferences({
      shell,
      defaultExecutionMode,
      defaultModel,
      autoValidate,
    });
    addToast("Settings saved", "success");
  };

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Tune things to your liking.</p>
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
        <div className="panel-title" style={{ marginBottom: 16 }}>
          Execution Defaults
        </div>

        <div className="form-group">
          <label className="form-label">Default Execution Mode</label>
          <select
            className="form-select"
            value={defaultExecutionMode}
            onChange={(e) => setDefaultExecutionMode(e.target.value)}
            style={{ maxWidth: 300 }}
          >
            {EXEC_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="form-help">
            Pre-select an execution mode for new features, or let the planner decide.
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Preferred Model</label>
          <select
            className="form-select"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            style={{ maxWidth: 300 }}
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="form-help">
            The Claude model used for ideation and agent tasks.
          </div>
        </div>

        <div className="form-group">
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={autoValidate}
              onChange={(e) => setAutoValidate(e.target.checked)}
              style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
            />
            Auto-run validators when execution completes
          </label>
          <div className="form-help" style={{ marginLeft: 26 }}>
            Automatically kick off validators as soon as a feature reaches the ready state.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
