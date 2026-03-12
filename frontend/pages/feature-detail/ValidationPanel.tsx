import type { Repository, DiffSummary, VerifyResult, ExecutionAnalysis } from "../../types";

interface ValidationPanelProps {
  featureId: string;
  isPushed: boolean;
  isReady: boolean;
  isComplete: boolean;
  isMultiRepo: boolean;
  allReposPushed: boolean;
  featureRepoIds: string[];
  repos: Repository[];
  repoPushStatus: Record<string, string> | undefined;
  // Validator state
  verifyResult: VerifyResult | null;
  verifying: boolean;
  onRunValidators: () => void;
  // Push state
  pushing: boolean;
  pushed: boolean;
  pushingRepoId: string | null;
  onPush: () => void;
  onPushRepo: (repoId: string) => void;
  // Make changes
  showMakeChanges: boolean;
  changesFeedback: string;
  submittingChanges: boolean;
  onToggleMakeChanges: () => void;
  onChangesFeedbackChange: (value: string) => void;
  onSubmitMakeChanges: () => void;
  // Complete
  completing: boolean;
  onComplete: () => void;
  // Diff & analysis
  diff: DiffSummary | null;
  analysis: ExecutionAnalysis | null;
}

export function ValidationPanel({
  isPushed,
  isReady,
  isComplete,
  isMultiRepo,
  allReposPushed,
  featureRepoIds,
  repos,
  repoPushStatus,
  verifyResult,
  verifying,
  onRunValidators,
  pushing,
  pushed,
  pushingRepoId,
  onPush,
  onPushRepo,
  showMakeChanges,
  changesFeedback,
  submittingChanges,
  onToggleMakeChanges,
  onChangesFeedbackChange,
  onSubmitMakeChanges,
  completing,
  onComplete,
  diff,
  analysis,
}: ValidationPanelProps) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-header">
        <div className="panel-title">
          {isPushed ? "Pushed" : "Validation & PR"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isComplete && !isPushed && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onRunValidators}
              disabled={verifying}
              aria-label="Run validators"
            >
              {verifying ? "Running..." : "Run Validators"}
            </button>
          )}
          {isReady && !isMultiRepo && (
            <button
              className="btn btn-primary btn-sm"
              onClick={onPush}
              disabled={pushing || pushed}
              aria-label="Commit and push changes"
            >
              {pushing ? "Pushing..." : pushed ? "Pushed" : "Commit & Push"}
            </button>
          )}
          {(isPushed || (isReady && isMultiRepo && allReposPushed)) && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={onToggleMakeChanges}
              >
                Make Changes
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={onComplete}
                disabled={completing}
              >
                {completing ? "Completing..." : "Mark Complete"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Make Changes feedback form */}
      {showMakeChanges && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            What needs to change?
          </div>
          <textarea
            className="form-textarea"
            value={changesFeedback}
            onChange={(e) => onChangesFeedbackChange(e.target.value)}
            placeholder="Describe the changes needed..."
            style={{ minHeight: 80 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) onSubmitMakeChanges();
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { onToggleMakeChanges(); onChangesFeedbackChange(""); }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={onSubmitMakeChanges}
              disabled={!changesFeedback.trim() || submittingChanges}
            >
              {submittingChanges ? "Submitting..." : "Submit & Re-plan"}
            </button>
          </div>
        </div>
      )}

      {/* Per-repo push status */}
      {isMultiRepo && (isReady || isPushed) && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            Per-Repo Push Status
          </div>
          {featureRepoIds.map((repoId) => {
            const repoName = repos.find((r) => r.id === repoId)?.name ?? repoId;
            const status = repoPushStatus?.[repoId] ?? "pending";
            const isPushingThis = pushingRepoId === repoId;
            return (
              <div
                key={repoId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 10,
                    textTransform: "uppercase",
                    minWidth: 55,
                    color:
                      status === "pushed"
                        ? "var(--success)"
                        : status === "failed"
                          ? "var(--danger)"
                          : "var(--muted)",
                  }}
                >
                  {status}
                </span>
                <span style={{ flex: 1, color: "var(--text-secondary)" }}>{repoName}</span>
                {status !== "pushed" && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => onPushRepo(repoId)}
                    disabled={isPushingThis}
                    style={{ fontSize: 11, padding: "2px 10px" }}
                  >
                    {isPushingThis ? "Pushing..." : "Commit & Push"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Validator results */}
      {verifyResult && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            Validators
            <span style={{
              color: verifyResult.all_passed ? "var(--success)" : "var(--danger)",
              fontWeight: 400,
              marginLeft: 8,
            }}>
              {verifyResult.all_passed ? "All passed" : "Some failed"}
            </span>
          </div>
          {verifyResult.results.map((r, i) => (
            <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                <span style={{ color: r.success ? "var(--success)" : "var(--danger)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>
                  {r.success ? "PASS" : "FAIL"}
                </span>
                <code style={{ fontSize: 11 }}>{r.command}</code>
              </div>
              {!r.success && r.stderr && (
                <div className="code-block" style={{ marginTop: 4, fontSize: 11 }}>
                  {r.stderr}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Diff summary */}
      {diff && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            Diff
            <span style={{ fontWeight: 400, marginLeft: 8, fontFamily: "var(--font-mono)" }}>
              {diff.total_files} file{diff.total_files !== 1 ? "s" : ""}{" "}
              <span style={{ color: "var(--success)" }}>+{diff.total_insertions}</span>{" "}
              <span style={{ color: "var(--danger)" }}>-{diff.total_deletions}</span>
            </span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6 }}>
            {diff.files.map((f) => (
              <div key={f.path} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  minWidth: 20,
                  color: f.status === "added" ? "var(--success)" : f.status === "deleted" ? "var(--danger)" : "var(--muted)",
                }}>
                  {f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M"}
                </span>
                <span style={{ color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.path}
                </span>
                <span style={{ color: "var(--success)", minWidth: 32, textAlign: "right" }}>+{f.insertions}</span>
                <span style={{ color: "var(--danger)", minWidth: 32, textAlign: "right" }}>-{f.deletions}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution analysis */}
      {analysis && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
            Execution Analysis
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.4 }}>
            How well the execution matched the plan. {analysis.files_changed} file{analysis.files_changed !== 1 ? "s" : ""} changed across {analysis.planned_task_count} planned task{analysis.planned_task_count !== 1 ? "s" : ""}.
          </div>

          {/* Mode assessment */}
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
            Execution Mode
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              marginBottom: 12,
              backgroundColor: analysis.mode_assessment.was_appropriate
                ? "rgba(107, 158, 107, 0.1)"
                : "rgba(196, 90, 106, 0.1)",
              border: `1px solid ${analysis.mode_assessment.was_appropriate ? "rgba(107, 158, 107, 0.3)" : "rgba(196, 90, 106, 0.3)"}`,
            }}
          >
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 2,
              color: analysis.mode_assessment.was_appropriate ? "var(--success)" : "var(--danger)",
            }}>
              {analysis.mode_assessment.was_appropriate
                ? `${analysis.mode_assessment.mode_used ?? "Selected"} mode was a good fit`
                : `${analysis.mode_assessment.mode_used ?? "Selected"} mode may not have been ideal`}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {analysis.mode_assessment.reason}
            </div>
            {analysis.mode_assessment.suggestion && (
              <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", marginTop: 2 }}>
                Next time: {analysis.mode_assessment.suggestion}
              </div>
            )}
          </div>

          {/* Missed tasks — planned but not completed */}
          {(() => {
            const missed = analysis.task_file_coverage.filter((tc) =>
              tc.completion_status === "pending" || tc.completion_status === "in_progress"
              || (tc.completion_status === "unknown" && tc.coverage_status === "no_changes_detected")
            );
            if (missed.length === 0) return null;
            return (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--danger)", marginBottom: 4 }}>
                  Missed Tasks
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>
                  Planned tasks that weren&apos;t completed during execution.
                </div>
                {missed.map((tc, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
                    <span style={{ color: "var(--danger)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", minWidth: 65 }}>
                      {tc.completion_status === "in_progress" ? "Incomplete" : "Missed"}
                    </span>
                    <span style={{ color: "var(--text-secondary)", flex: 1 }}>{tc.task_title}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Unplanned files */}
          {analysis.unplanned_files.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#c9a84c", marginBottom: 4 }}>
                Unplanned Changes
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>
                Files changed that don&apos;t match any planned task.
              </div>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "#c9a84c" }}>
                {analysis.unplanned_files.map((f) => <div key={f}>{f}</div>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
