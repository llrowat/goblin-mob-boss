import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import { AddRepoModal } from "../components/AddRepoModal";
import { HooksEditor } from "../components/HooksEditor";
import { ContextualHelp, HELP_CONTENT } from "../components/ContextualHelp";
import type { Repository, RepoHooks } from "../types";


export function ReposPage() {
  const tauri = useTauri();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBranch, setEditBranch] = useState("");
  const [editValidators, setEditValidators] = useState("");

  const [editCommitPattern, setEditCommitPattern] = useState("");
  const [editSimilarRepoIds, setEditSimilarRepoIds] = useState<string[]>([]);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [expandedHooksId, setExpandedHooksId] = useState<string | null>(null);
  const [hookCounts, setHookCounts] = useState<Record<string, number>>({});

  const countRules = (h: RepoHooks): number =>
    Object.values(h).reduce(
      (sum, rules) => sum + (Array.isArray(rules) ? rules.length : 0),
      0,
    );

  const loadRepos = () => {
    tauri.listRepositories().then(setRepos);
  };

  const loadHookCounts = (repoList: Repository[]) => {
    Promise.all(
      repoList.map((r) =>
        tauri
          .getRepoHooks(r.path)
          .then((h) => ({ id: r.id, count: countRules(h) }))
          .catch(() => ({ id: r.id, count: 0 })),
      ),
    ).then((results) => {
      const counts: Record<string, number> = {};
      for (const r of results) counts[r.id] = r.count;
      setHookCounts(counts);
    });
  };

  useEffect(() => {
    tauri.listRepositories().then((repoList) => {
      setRepos(repoList);
      loadHookCounts(repoList);
    });
  }, []);

  const handleEdit = (repo: Repository) => {
    setEditingId(repo.id);
    setEditName(repo.name);
    setEditDescription(repo.description || "");
    setEditBranch(repo.base_branch);
    setEditValidators(repo.validators.join("\n"));
    setEditCommitPattern(repo.commit_pattern || "");
    setEditSimilarRepoIds(repo.similar_repo_ids || []);
  };

  const handleSave = async () => {
    if (!editingId) return;
    await tauri.updateRepository({
      id: editingId,
      name: editName,
      description: editDescription.trim() || undefined,
      baseBranch: editBranch,
      validators: editValidators
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
      prCommand: null,
      similarRepoIds: editSimilarRepoIds.length > 0 ? editSimilarRepoIds : undefined,
      commitPattern: editCommitPattern.trim() || null,
    });
    setEditingId(null);
    loadRepos();
  };

  const handleRemove = async (id: string) => {
    await tauri.removeRepository(id);
    setConfirmRemoveId(null);
    loadRepos();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Repositories</h2>
        <p>Manage the repositories your agents work in.</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Add Repository
        </button>
      </div>

      {repos.length === 0 ? (
        <div className="empty-state">
          <p>No repos on the map yet. Add one to set up shop.</p>
        </div>
      ) : (
        repos.map((repo) => (
          <div key={repo.id} className="panel" style={{ marginBottom: 12 }}>
            {editingId === repo.id ? (
              <>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    className="form-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input
                    className="form-input"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Brief description of this repo"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Base Branch</label>
                  <input
                    className="form-input"
                    value={editBranch}
                    onChange={(e) => setEditBranch(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Validators</label>
                  <ContextualHelp title="What are validators?">{HELP_CONTENT.validators}</ContextualHelp>
                  <textarea
                    className="form-textarea"
                    value={editValidators}
                    onChange={(e) => setEditValidators(e.target.value)}
                    placeholder="npm test"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Commit Pattern</label>
                  <input
                    className="form-input"
                    value={editCommitPattern}
                    onChange={(e) => setEditCommitPattern(e.target.value)}
                    placeholder="^(feat|fix|chore|docs|refactor|test)(\(.+\))?: .+"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                  />
                  <div className="form-help">
                    Regex that commit messages must match (optional)
                  </div>
                </div>
                {repos.filter((r) => r.id !== editingId).length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Similar Repositories</label>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        maxHeight: 150,
                        overflowY: "auto",
                        padding: "6px 0",
                      }}
                    >
                      {repos
                        .filter((r) => r.id !== editingId)
                        .map((r) => (
                          <label
                            key={r.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={editSimilarRepoIds.includes(r.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditSimilarRepoIds((prev) => [
                                    ...prev,
                                    r.id,
                                  ]);
                                } else {
                                  setEditSimilarRepoIds((prev) =>
                                    prev.filter((id) => id !== r.id),
                                  );
                                }
                              }}
                            />
                            <span>{r.name}</span>
                          </label>
                        ))}
                    </div>
                    <div className="form-help">
                      Repos with similar patterns — agents will use them as
                      hints
                    </div>
                  </div>
                )}
                <div className="actions-bar">
                  <button className="btn btn-primary" onClick={handleSave}>
                    Save
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="panel-header">
                  <div>
                    <div className="panel-title">{repo.name}</div>
                    <div
                      className="form-help"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {repo.path}
                    </div>
                    {repo.description && (
                      <div
                        className="form-help"
                        style={{ marginTop: 4 }}
                      >
                        {repo.description}
                      </div>
                    )}
                  </div>
                  <div className="actions-bar">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleEdit(repo)}
                    >
                      Edit
                    </button>
                    {confirmRemoveId === repo.id ? (
                      <>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemove(repo.id)}
                        >
                          Confirm
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setConfirmRemoveId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmRemoveId(repo.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  <span>Branch: {repo.base_branch}</span>
                  {repo.validators.length > 0 && (
                    <span style={{ marginLeft: 16 }}>
                      Validators: {repo.validators.length}
                    </span>
                  )}
                  {repo.commit_pattern && (
                    <span style={{ marginLeft: 16 }}>
                      Commit: <code style={{ fontSize: 11 }}>{repo.commit_pattern}</code>
                    </span>
                  )}
                  {repo.similar_repo_ids && repo.similar_repo_ids.length > 0 && (
                    <span style={{ marginLeft: 16 }}>
                      Similar:{" "}
                      {repo.similar_repo_ids
                        .map((id) => repos.find((r) => r.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    onClick={() =>
                      setExpandedHooksId(
                        expandedHooksId === repo.id ? null : repo.id,
                      )
                    }
                  >
                    {expandedHooksId === repo.id ? "Hide Hooks" : "Hooks"}
                    {(hookCounts[repo.id] ?? -1) > 0 && (
                      <span style={{ marginLeft: 4, opacity: 0.7 }}>
                        ({hookCounts[repo.id]})
                      </span>
                    )}
                  </button>
                </div>
                {expandedHooksId === repo.id && (
                  <HooksEditor
                    repoPath={repo.path}
                    onHooksChanged={() => loadHookCounts(repos)}
                  />
                )}
              </>
            )}
          </div>
        ))
      )}

      {showModal && (
        <AddRepoModal
          onClose={() => setShowModal(false)}
          onAdded={() => {
            setShowModal(false);
            loadRepos();
          }}
        />
      )}
    </div>
  );
}
