import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import { AddRepoModal } from "../components/AddRepoModal";
import type { Repository } from "../types";

export function ReposPage() {
  const tauri = useTauri();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBranch, setEditBranch] = useState("");
  const [editValidators, setEditValidators] = useState("");
  const [editPrCommand, setEditPrCommand] = useState("");

  const loadRepos = () => {
    tauri.listRepositories().then(setRepos);
  };

  useEffect(loadRepos, []);

  const handleEdit = (repo: Repository) => {
    setEditingId(repo.id);
    setEditName(repo.name);
    setEditBranch(repo.base_branch);
    setEditValidators(repo.validators.join("\n"));
    setEditPrCommand(repo.pr_command || "");
  };

  const handleSave = async () => {
    if (!editingId) return;
    await tauri.updateRepository({
      id: editingId,
      name: editName,
      baseBranch: editBranch,
      validators: editValidators
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
      prCommand: editPrCommand.trim() || null,
    });
    setEditingId(null);
    loadRepos();
  };

  const handleRemove = async (id: string) => {
    await tauri.removeRepository(id);
    loadRepos();
  };

  return (
    <div>
      <div className="page-header">
        <h2>Repositories</h2>
        <p>Manage the territories your mob operates in.</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Add Repository
        </button>
      </div>

      {repos.length === 0 ? (
        <div className="empty-state">
          <p>No territories claimed yet. Add a repository to stake your ground.</p>
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
                  <label className="form-label">Base Branch</label>
                  <input
                    className="form-input"
                    value={editBranch}
                    onChange={(e) => setEditBranch(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Validators</label>
                  <textarea
                    className="form-textarea"
                    value={editValidators}
                    onChange={(e) => setEditValidators(e.target.value)}
                    placeholder="npm test"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">PR Command</label>
                  <input
                    className="form-input"
                    value={editPrCommand}
                    onChange={(e) => setEditPrCommand(e.target.value)}
                  />
                </div>
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
                  </div>
                  <div className="actions-bar">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleEdit(repo)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemove(repo.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  <span>Branch: {repo.base_branch}</span>
                  {repo.validators.length > 0 && (
                    <span style={{ marginLeft: 16 }}>
                      Validators: {repo.validators.length}
                    </span>
                  )}
                </div>
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
