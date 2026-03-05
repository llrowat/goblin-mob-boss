import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import type { Repository, Feature } from "../types";

export function HomePage() {
  const tauri = useTauri();
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [features, setFeatures] = useState<Feature[]>([]);
  const [filterRepoId, setFilterRepoId] = useState<string>("");

  useEffect(() => {
    tauri.listRepositories().then((r) => {
      setRepos(r);
      if (r.length > 0 && selectedRepoIds.length === 0) {
        setSelectedRepoIds([r[0].id]);
      }
    });
  }, []);

  // Load features — show all or filter by repo
  useEffect(() => {
    const loadFeatures = filterRepoId
      ? tauri.listFeatures(filterRepoId)
      : tauri.listAllFeatures();
    loadFeatures.then(setFeatures).catch(() => {});
  }, [filterRepoId]);

  const toggleRepo = (repoId: string) => {
    setSelectedRepoIds((prev) =>
      prev.includes(repoId)
        ? prev.filter((id) => id !== repoId)
        : [...prev, repoId],
    );
  };

  const handleStartFeature = async () => {
    if (selectedRepoIds.length === 0 || !name.trim() || !description.trim())
      return;
    setLoading(true);
    setError("");
    try {
      const feature = await tauri.startFeature(
        selectedRepoIds,
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

  const repoNameById = (id: string) =>
    repos.find((r) => r.id === id)?.name ?? id;

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
          <label className="form-label">
            Repositories
            {selectedRepoIds.length > 1 && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginLeft: 8,
                }}
              >
                ({selectedRepoIds.length} selected — multi-repo feature)
              </span>
            )}
          </label>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 4,
            }}
          >
            {repos.map((r) => (
              <button
                key={r.id}
                className={`btn btn-sm ${selectedRepoIds.includes(r.id) ? "btn-primary" : "btn-secondary"}`}
                onClick={() => toggleRepo(r.id)}
                type="button"
              >
                {r.name}
              </button>
            ))}
          </div>
          <div className="form-help">
            Select one or more repositories. Multi-repo features create branches
            in all selected repos.
          </div>
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
          disabled={
            loading ||
            selectedRepoIds.length === 0 ||
            !name.trim() ||
            !description.trim()
          }
          style={{ width: "100%" }}
        >
          {loading
            ? "Creating feature branch..."
            : selectedRepoIds.length > 1
              ? `Start Multi-Repo Feature (${selectedRepoIds.length} repos)`
              : "Start Feature"}
        </button>
      </div>

      {/* Active features */}
      <div style={{ marginTop: 24 }}>
        <div
          className="sidebar-section-label"
          style={{
            padding: "0 0 8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Active Features</span>
          <select
            className="form-select"
            style={{ width: "auto", fontSize: 12, padding: "2px 8px" }}
            value={filterRepoId}
            onChange={(e) => setFilterRepoId(e.target.value)}
          >
            <option value="">All Repos</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {features.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              fontStyle: "italic",
            }}
          >
            No active features.
          </p>
        ) : (
          features.map((f) => (
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
                  <div className="form-help">
                    {f.description}
                    {f.repos && f.repos.length > 1 && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: "var(--muted)",
                        }}
                      >
                        [{f.repos
                          .map((fr) => repoNameById(fr.repo_id))
                          .join(", ")}]
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`status-badge ${f.status === "in_progress" ? "running" : f.status}`}
                >
                  <span className="status-dot" />
                  {statusLabel[f.status] ?? f.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
