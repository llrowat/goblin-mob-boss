import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTauri } from "../hooks/useTauri";
import { useBackgroundPlanning } from "../hooks/useBackgroundPlanning";
import type { Repository, Feature } from "../types";

export function HomePage() {
  const tauri = useTauri();
  const navigate = useNavigate();
  const { addPlanning } = useBackgroundPlanning();
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
    const loadFeatures = () => {
      const fetcher = filterRepoId
        ? tauri.listFeatures(filterRepoId)
        : tauri.listAllFeatures();
      fetcher.then(setFeatures).catch(() => {});
    };
    loadFeatures();
    // Poll to keep statuses fresh (executing -> ready, etc.)
    const interval = setInterval(loadFeatures, 5000);
    return () => clearInterval(interval);
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
      // Start planning immediately in the background
      addPlanning(feature.id);
      tauri.runIdeation(feature.id).catch(() => {});
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
        <p>The crew needs a base of operations. Add a repository to get started.</p>
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
    pushed: "Pushed",
    complete: "Complete",
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
      {(() => {
        const activeFeatures = features.filter((f) => f.status !== "complete");
        const completedFeatures = features.filter((f) => f.status === "complete");

        const renderFeatureCard = (f: Feature, isCompleted = false) => {
          const hasWorktree = f.worktree_paths && Object.keys(f.worktree_paths).length > 0;
          return (
            <div
              key={f.id}
              className="feature-card panel"
              style={isCompleted ? { opacity: 0.5 } : undefined}
              onClick={() => navigate(featureRoute(f))}
            >
              <div className="feature-card-top">
                <div className="feature-card-title">{f.name}</div>
                <span
                  className={`status-badge ${f.status === "executing" ? "running" : f.status}`}
                >
                  <span className="status-dot" />
                  {statusLabel[f.status] ?? f.status}
                </span>
              </div>
              <div className="feature-card-desc">{f.description}</div>
              <div className="feature-card-meta">
                <span className="feature-card-tag" title="Branch">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1" />
                    <circle cx="9" cy="9" r="1.5" stroke="currentColor" strokeWidth="1" />
                    <path d="M3 4.5V7a2 2 0 0 0 2 2h2.5" stroke="currentColor" strokeWidth="1" />
                  </svg>
                  {f.branch}
                </span>
                <span className="feature-card-tag" title="Repository">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2h8v8H2z" stroke="currentColor" strokeWidth="1" />
                    <path d="M2 5h8" stroke="currentColor" strokeWidth="1" />
                  </svg>
                  {featureRepoNames(f)}
                </span>
                {hasWorktree && (
                  <span className="feature-card-tag feature-card-tag-wt" title="Running in worktree (isolated copy)">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1" />
                      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1" />
                    </svg>
                    Worktree
                  </span>
                )}
              </div>
            </div>
          );
        };

        return (
          <>
            <div>
              <div
                className="section-label"
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
              {activeFeatures.length === 0 ? (
                <div className="empty-state">
                  <h3>No active features</h3>
                  <p>The mob is idle. Click &quot;New Feature&quot; to start something new.</p>
                </div>
              ) : (
                [...activeFeatures].sort((a, b) => {
                  if (a.status === "executing" && b.status !== "executing") return -1;
                  if (a.status !== "executing" && b.status === "executing") return 1;
                  return 0;
                }).map((f) => renderFeatureCard(f))
              )}
            </div>

            {completedFeatures.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div
                  className="section-label"
                  style={{ padding: "0 0 8px" }}
                >
                  Completed
                </div>
                {completedFeatures.map((f) => renderFeatureCard(f, true))}
              </div>
            )}
          </>
        );
      })()}

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
