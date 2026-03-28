import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTauri } from "../hooks/useTauri";
import { CommandDisplay } from "./CommandDisplay";

import type { Repository } from "../types";

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
  const [description, setDescription] = useState("");
  const [commitPattern, setCommitPattern] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState(false);
  const [similarRepoIds, setSimilarRepoIds] = useState<string[]>([]);
  const [existingRepos, setExistingRepos] = useState<Repository[]>([]);

  // Repo emptiness state
  const [isRepoEmpty, setIsRepoEmpty] = useState(false);
  // CLAUDE.md state
  const [hasClaudeMd, setHasClaudeMd] = useState(false);
  const [generatingClaudeMd, setGeneratingClaudeMd] = useState(false);
  const [claudeMdGenerated, setClaudeMdGenerated] = useState(false);
  const [claudeMdCommand, setClaudeMdCommand] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tauri.listRepositories().then(setExistingRepos);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleBrowse = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      setPath(selected as string);
      setDetected(false);
      setIsRepoEmpty(false);
      setHasClaudeMd(false);
      setGeneratingClaudeMd(false);
      setClaudeMdGenerated(false);
    }
  };

  const handleDetect = async () => {
    if (!path.trim()) return;
    setError("");
    try {
      const info = await tauri.detectRepoInfo(path.trim());
      setName(info.name);
      setBaseBranch(info.base_branch);
      setHasClaudeMd(info.has_claude_md);
      setIsRepoEmpty(info.is_empty ?? false);
      setCommitPattern(info.commit_pattern ?? "");
      setDetected(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleGenerateClaudeMd = async () => {
    setGeneratingClaudeMd(true);
    setError("");
    try {
      // Fetch the command for transparency
      tauri.getClaudeMdCommand(path.trim()).then(setClaudeMdCommand).catch(() => {});
      await tauri.generateClaudeMd(path.trim());
      // Poll for CLAUDE.md creation
      pollRef.current = setInterval(async () => {
        try {
          const exists = await tauri.checkClaudeMd(path.trim());
          if (exists) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setGeneratingClaudeMd(false);
            setHasClaudeMd(true);
            setClaudeMdGenerated(true);
          }
        } catch {
          // keep polling
        }
      }, 2000);
    } catch (e) {
      setGeneratingClaudeMd(false);
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
        description: description.trim() || undefined,
        validators: validatorList,
        prCommand: null,
        similarRepoIds: similarRepoIds.length > 0 ? similarRepoIds : undefined,
        commitPattern: commitPattern.trim() || null,
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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }}>
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
                setIsRepoEmpty(false);
                setHasClaudeMd(false);
                setGeneratingClaudeMd(false);
                setClaudeMdGenerated(false);
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
            {/* CLAUDE.md status — skip for empty repos (nothing to analyze) */}
            {!isRepoEmpty && (
              <div
                className="form-group"
                style={{
                  padding: "10px 12px",
                  background: hasClaudeMd
                    ? "rgba(90,138,92,0.1)"
                    : "rgba(184,148,74,0.1)",
                  borderRadius: 6,
                  border: `1px solid ${hasClaudeMd ? "var(--success)" : "var(--warning)"}`,
                }}
              >
                {hasClaudeMd ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        color: "var(--success)",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      CLAUDE.md found
                    </span>
                    {claudeMdGenerated && (
                      <span
                        style={{ color: "var(--text-secondary)", fontSize: 12 }}
                      >
                        — fresh loot from the goblins
                      </span>
                    )}
                  </div>
                ) : generatingClaudeMd ? (
                  <div style={{ fontSize: 13 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <span style={{ color: "var(--warning)", fontWeight: 600 }}>
                          Generating CLAUDE.md...
                        </span>
                        <span
                          style={{
                            color: "var(--text-secondary)",
                            marginLeft: 8,
                            fontSize: 12,
                          }}
                        >
                          Goblins exploring the lair
                        </span>
                      </div>
                    </div>
                    <CommandDisplay command={claudeMdCommand} />

                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          color: "var(--warning)",
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        No CLAUDE.md
                      </span>
                      <div
                        style={{
                          color: "var(--text-secondary)",
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        Your mob works better with a CLAUDE.md — it tells agents
                        how the lair is set up.
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleGenerateClaudeMd}
                      style={{ whiteSpace: "nowrap", marginLeft: 12 }}
                    >
                      Generate
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this repo"
              />
              <div className="form-help">Optional — helps give agents context about the repository</div>
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
              <label className="form-label">Commit Pattern</label>
              <input
                className="form-input"
                value={commitPattern}
                onChange={(e) => setCommitPattern(e.target.value)}
                placeholder="^(feat|fix|chore|docs|refactor|test)(\(.+\))?: .+"
                style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
              />
              <div className="form-help">
                Regex that commit messages must match (optional)
              </div>
            </div>

            {existingRepos.length > 0 && (
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
                  {existingRepos.map((repo) => (
                    <label
                      key={repo.id}
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
                        checked={similarRepoIds.includes(repo.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSimilarRepoIds((prev) => [...prev, repo.id]);
                          } else {
                            setSimilarRepoIds((prev) =>
                              prev.filter((id) => id !== repo.id),
                            );
                          }
                        }}
                      />
                      <span>{repo.name}</span>
                      {repo.description && (
                        <span
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: 12,
                          }}
                        >
                          — {repo.description}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                <div className="form-help">
                  Repos with similar patterns — agents will use them as hints
                </div>
              </div>
            )}
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
