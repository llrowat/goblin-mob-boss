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
  const [repoCount, setRepoCount] = useState<number | null>(null);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [systemMapCount, setSystemMapCount] = useState<number | null>(null);

  useEffect(() => {
    tauri.getPreferences().then((prefs) => {
      setShell(prefs.shell);
    });
    tauri.listRepositories().then((repos) => {
      setRepoCount(repos.length);
    });
    tauri.listGlobalAgents().then((globals) => {
      setAgentCount(globals.length);
    });
    tauri.listSystemMaps().then((maps) => {
      setSystemMapCount(maps.length);
    });
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
        <p>Tune things to your liking.</p>
      </div>

      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 16 }}>
          Account Overview
        </div>
        <div className="account-counts">
          <AccountStat
            label="Lairs"
            count={repoCount}
            icon="📂"
            detail="Repositories"
          />
          <AccountStat
            label="Goblins"
            count={agentCount}
            icon="👤"
            detail="Global agents"
          />
          <AccountStat
            label="Treasure Maps"
            count={systemMapCount}
            icon="🗺"
            detail="System maps"
          />
        </div>
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

      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? "Saved" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function AccountStat({
  label,
  count,
  icon,
  detail,
}: {
  label: string;
  count: number | null;
  icon: string;
  detail: string;
}) {
  const isZero = count === 0;
  return (
    <div className={`account-stat${isZero ? " account-stat-warn" : ""}`}>
      <div className="account-stat-icon">{icon}</div>
      <div className="account-stat-body">
        <div className="account-stat-count">
          {count === null ? "—" : count}
          {isZero && (
            <span className="account-stat-warning" title={`No ${detail} configured`}>
              ⚠
            </span>
          )}
        </div>
        <div className="account-stat-label">{label}</div>
      </div>
    </div>
  );
}
