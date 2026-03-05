import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";

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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    tauri.getPreferences().then((prefs) => setShell(prefs.shell));
  }, []);

  const handleSave = async () => {
    await tauri.setPreferences(shell);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
