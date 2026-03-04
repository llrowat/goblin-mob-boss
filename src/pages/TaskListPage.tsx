import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import { StatusBadge } from "../components/StatusBadge";
import type { Repository, Task } from "../types";

export function TaskListPage() {
  const tauri = useTauri();
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    tauri.listRepositories().then((r) => {
      setRepos(r);
      if (r.length > 0) {
        setSelectedRepoId(r[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedRepoId) {
      tauri.listTasks(selectedRepoId).then(setTasks);
    }
  }, [selectedRepoId]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <div className="page-header">
        <h2>Tasks</h2>
        <p>Your development tasks across repositories.</p>
      </div>

      {repos.length > 1 && (
        <div className="form-group" style={{ maxWidth: 300 }}>
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
      )}

      {tasks.length === 0 ? (
        <div className="empty-state">
          <h3>No tasks yet</h3>
          <p>Start a new task from the home screen.</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            New Task
          </button>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <div
              key={task.task_id}
              className="task-row"
              onClick={() => navigate(`/task/${task.task_id}`)}
            >
              <div className="task-row-title">{task.title}</div>
              <div className="task-row-phase">{task.phase}</div>
              <StatusBadge status={task.status} />
              <div className="task-row-time">{formatTime(task.updated_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
