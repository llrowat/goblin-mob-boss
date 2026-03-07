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
  const [showNewFeature, setShowNewFeature] = useState(false);

  useEffect(() => {
    tauri.listRepositories().then((r) => {
      setRepos(r);
      if (r.length > 0 && selectedRepoIds.length === 0) {
        setSelectedRepoIds([r[0].id]);
      }
    });
  }, []);

  useEffect(() => {
    const loadFeatures = filterRepoId
      ? tauri.listFeatures(filterRepoId)
      : tauri.listAllFeatures();
    loadFeatures.then(setFeatures).catch(() => {});
  }, [filterRepoId]);

  const handleStartFeature = async () => {
    if (selectedRepoIds.length === 0 || !name.trim() || !description.trim()) return;
    setLoading(true);
    setError("");
    try {
      const feature = await tauri.startFeature(
        selectedRepoIds,
        name.trim(),
        description.trim(),
      );
      setShowNewFeature(false);
      setName("");
      setDescription("");
      navigate(`/feature/${feature.id}/detail`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowNewFeature(false);
    setName("");
    setDescription("");
    setError("");
  };

  const handleDeleteFeature = async (e: React.MouseEvent, featureId: string) => {
    e.stopPropagation();
    try {
      await tauri.deleteFeature(featureId);
      setFeatures((prev) => prev.filter((f) => f.id !== featureId));
    } catch (err) {
      setError(String(err));
    }
  };

  const repoNameById = (id: string) =>
    repos.find((r) => r.id === id)?.name ?? id;

  const featureRepoIds = (f: Feature) =>
    f.repo_ids?.length > 0 ? f.repo_ids : f.repo_id ? [f.repo_id] : [];

  const featureRepoNames = (f: Feature) =>
    featureRepoIds(f).map(repoNameById).join(", ");

  const toggleRepoSelection = (id: string) => {
    setSelectedRepoIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
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
    configuring: "Configuring",
    executing: "Executing",
    ready: "Ready",
    failed: "Failed",
  };

  const featureRoute = (f: Feature) => {
    switch (f.status) {
      case "ideation":
      case "configuring":
      case "executing":
        return `/feature/${f.id}/detail`;
      default:
        return `/feature/${f.id}/detail`;
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>Features</h2>
          <p>
            Start a new feature to plan and execute with Claude.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowNewFeature(true)}
        >
          New Feature
        </button>
      </div>

      {/* Active features */}
      <div>
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
          <div className="empty-state">
            <h3>No active features</h3>
            <p>No features yet. Click &quot;New Feature&quot; to get started.</p>
          </div>
        ) : (
          [...features].sort((a, b) => {
            if (a.status === "executing" && b.status !== "executing") return -1;
            if (a.status !== "executing" && b.status === "executing") return 1;
            return 0;
          }).map((f) => (
            <div
              key={f.id}
              className="panel"
              style={{ marginBottom: 8, cursor: "pointer", position: "relative" }}
              onClick={() => navigate(featureRoute(f))}
            >
              <button
                className="feature-delete-btn"
                onClick={(e) => handleDeleteFeature(e, f.id)}
                title="Delete feature"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 3.5h9M5 3.5V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5.5 6v4M8.5 6v4M3.5 3.5l.5 8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="panel-header" style={{ marginBottom: 0 }}>
                <div>
                  <div className="panel-title">{f.name}</div>
                  <div className="form-help">
                    {f.description}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "var(--muted)",
                      }}
                    >
                      [{featureRepoNames(f)}]
                    </span>
                  </div>
                  {f.worktree_paths && Object.values(f.worktree_paths).length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {Object.values(f.worktree_paths).join(", ")}
                    </div>
                  )}
                </div>
                <span
                  className={`status-badge ${f.status === "executing" ? "running" : f.status}`}
                >
                  <span className="status-dot" />
                  {statusLabel[f.status] ?? f.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Feature Modal */}
      {showNewFeature && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">New Feature</div>

            {error && <div className="error-banner">{error}</div>}

            <div className="form-group">
              <label className="form-label">
                Repositories
                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)", marginLeft: 8 }}>
                  ({selectedRepoIds.length} selected)
                </span>
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {repos.map((r) => (
                  <label
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRepoIds.includes(r.id)}
                      onChange={() => toggleRepoSelection(r.id)}
                    />
                    {r.name}
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      {r.path}
                    </span>
                  </label>
                ))}
              </div>
              <div className="form-help">
                Select one or more repositories for this feature.
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
                  if (e.key === "Enter" && e.metaKey) handleStartFeature();
                }}
              />
              <div className="form-help">
                Be specific. Claude will plan the work interactively with
                you.
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStartFeature}
                disabled={
                  loading ||
                  selectedRepoIds.length === 0 ||
                  !name.trim() ||
                  !description.trim()
                }
              >
                {loading ? "Creating..." : "Start Feature"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
