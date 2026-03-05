import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type { Repository, Feature } from "../types";

export function HomePage() {
  const tauri = useTauri();
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [features, setFeatures] = useState<Feature[]>([]);

  useEffect(() => {
    tauri.listRepositories().then((r) => {
      setRepos(r);
      if (r.length > 0 && !selectedRepoId) {
        setSelectedRepoId(r[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedRepoId) return;
    tauri.listFeatures(selectedRepoId).then(setFeatures).catch(() => {});
  }, [selectedRepoId]);

  const handleStartFeature = async () => {
    if (!selectedRepoId || !name.trim() || !description.trim()) return;
    setLoading(true);
    setError("");
    try {
      const feature = await tauri.startFeature(
        selectedRepoId,
        name.trim(),
        description.trim(),
      );
      navigate(`/feature/${feature.id}/ideation`);
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

  const statusLabel: Record<string, string> = {
    ideation: "Planning",
    in_progress: "In Progress",
    verifying: "Verifying",
    ready: "Ready",
  };

  return (
    <div>
      <div className="page-header">
        <h2>Start a Feature</h2>
        <p>
          Describe what you want to build. Claude will help you plan the work
          and break it into tasks that agents execute in parallel.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

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
          <label className="form-label">Feature Name</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="User Authentication"
          />
          <div className="form-help">
            Short name for the feature branch.
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">What do you want to build?</label>
          <textarea
            className="form-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add user authentication with OAuth2, including login page, callback handler, and session management..."
            style={{ minHeight: 120 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleStartFeature();
            }}
          />
          <div className="form-help">
            Be specific. Claude will plan the work interactively with you.
          </div>
        </div>

        <button
          className="btn btn-primary btn-lg"
          onClick={handleStartFeature}
          disabled={loading || !name.trim() || !description.trim()}
          style={{ width: "100%" }}
        >
          {loading ? "Creating feature branch..." : "Start Feature"}
        </button>
      </div>

      {/* Active features */}
      {features.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="sidebar-section-label" style={{ padding: "0 0 8px" }}>
            Active Features
          </div>
          {features.map((f) => (
            <div
              key={f.id}
              className="panel"
              style={{ marginBottom: 8, cursor: "pointer" }}
              onClick={() => {
                if (f.status === "ideation") {
                  navigate(`/feature/${f.id}/ideation`);
                } else {
                  navigate(`/feature/${f.id}/tasks`);
                }
              }}
            >
              <div className="panel-header" style={{ marginBottom: 0 }}>
                <div>
                  <div className="panel-title">{f.name}</div>
                  <div className="form-help">{f.description}</div>
                </div>
                <span
                  className={`status-badge ${f.status === "in_progress" ? "running" : f.status}`}
                >
                  <span className="status-dot" />
                  {statusLabel[f.status] ?? f.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
