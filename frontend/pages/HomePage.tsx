import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type { Repository } from "../types";

export function HomePage() {
  const tauri = useTauri();
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [description, setDescription] = useState("");
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

  const handleStartIdeation = async () => {
    if (!selectedRepoId || !description.trim()) return;
    setLoading(true);
    setError("");
    try {
      const ideation = await tauri.startIdeation(
        selectedRepoId,
        description.trim()
      );
      navigate(`/ideation/${ideation.id}`);
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
        <p>Add a repository to get started.</p>
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
        <h2>Start Building</h2>
        <p>
          Describe what you want to build. Claude will analyze your codebase,
          plan the work, and break it into tasks that agents can execute in
          parallel.
        </p>
      </div>

      {error && (
        <div className="error-banner">{error}</div>
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
          <label className="form-label">
            What do you want to build?
          </label>
          <textarea
            className="form-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add user authentication with OAuth2, including login page, callback handler, and session management..."
            style={{ minHeight: 120 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleStartIdeation();
            }}
          />
          <div className="form-help">
            Be specific about what you want. Claude will create a plan and break
            it into parallelizable tasks.
          </div>
        </div>

        <button
          className="btn btn-primary btn-lg"
          onClick={handleStartIdeation}
          disabled={loading || !description.trim()}
          style={{ width: "100%" }}
        >
          {loading ? "Setting up..." : "Start Ideation"}
        </button>
      </div>
    </div>
  );
}
