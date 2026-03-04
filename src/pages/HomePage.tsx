import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type { Repository } from "../types";

export function HomePage() {
  const tauri = useTauri();
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    tauri.listRepositories().then((r) => {
      setRepos(r);
      if (r.length > 0 && !selectedRepoId) {
        setSelectedRepoId(r[0].id);
      }
    });
  }, []);

  const handleStart = async () => {
    if (!selectedRepoId || !taskInput.trim()) return;
    setLoading(true);
    setError("");
    try {
      const task = await tauri.createTask({
        repoId: selectedRepoId,
        title: taskInput.trim(),
        description: taskInput.trim(),
      });
      navigate(`/task/${task.task_id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  if (repos.length === 0) {
    return (
      <div className="empty-state">
        <h3>No repositories yet</h3>
        <p>Add a repository to get started with your first task.</p>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate("/repos")}
        >
          Add Repository
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>New Task</h2>
        <p>Describe what you want to build or fix.</p>
      </div>

      {error && (
        <div
          style={{
            color: "var(--danger)",
            fontSize: 13,
            marginBottom: 12,
            padding: "8px 12px",
            background: "rgba(196,101,74,0.1)",
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      <div className="panel">
        <div className="form-group">
          <label className="form-label">Repository</label>
          <select
            className="form-select"
            value={selectedRepoId}
            onChange={(e) => setSelectedRepoId(e.target.value)}
          >
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">What do you want to build or fix?</label>
          <textarea
            className="form-textarea"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder="Fix login redirect loop when session expires"
            style={{ minHeight: 100 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleStart();
            }}
          />
        </div>

        <button
          className="btn btn-primary btn-lg"
          onClick={handleStart}
          disabled={loading || !taskInput.trim()}
          style={{ width: "100%" }}
        >
          {loading ? "Gathering context..." : "Start"}
        </button>
      </div>
    </div>
  );
}
