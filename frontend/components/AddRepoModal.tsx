import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTauri } from "../hooks/useTauri";

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

export function AddRepoModal({ onClose, onAdded }: Props) {
  const tauri = useTauri();
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [validators, setValidators] = useState("");
  const [prCommand, setPrCommand] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState(false);

  const handleBrowse = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      setPath(selected as string);
      setDetected(false);
    }
  };

  const handleDetect = async () => {
    if (!path.trim()) return;
    setError("");
    try {
      const info = await tauri.detectRepoInfo(path.trim());
      setName(info.name);
      setBaseBranch(info.base_branch);
      setDetected(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSubmit = async () => {
    if (!path.trim() || !name.trim()) {
      setError("Path and name are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const validatorList = validators
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
      await tauri.addRepository({
        name: name.trim(),
        path: path.trim(),
        baseBranch: baseBranch.trim() || "main",
        validators: validatorList,
        prCommand: prCommand.trim() || null,
      });
      onAdded();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Add Repository</h3>

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

        <div className="form-group">
          <label className="form-label">Repository Path</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="form-input"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setDetected(false);
              }}
              placeholder="/home/user/my-project"
            />
            <button className="btn btn-secondary" onClick={handleBrowse}>
              Browse
            </button>
            <button className="btn btn-secondary" onClick={handleDetect}>
              Detect
            </button>
          </div>
        </div>

        {detected && (
          <>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Base Branch</label>
              <input
                className="form-input"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Validators</label>
              <textarea
                className="form-textarea"
                value={validators}
                onChange={(e) => setValidators(e.target.value)}
                placeholder={"npm test\nnpm run lint"}
              />
              <div className="form-help">One command per line (optional)</div>
            </div>

            <div className="form-group">
              <label className="form-label">PR Command</label>
              <input
                className="form-input"
                value={prCommand}
                onChange={(e) => setPrCommand(e.target.value)}
                placeholder="gh pr create"
              />
              <div className="form-help">Optional</div>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {detected && (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Adding..." : "Add Repository"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
