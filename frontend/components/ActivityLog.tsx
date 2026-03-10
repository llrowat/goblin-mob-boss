import type {
  Feature,
  PlanSnapshot,
  TaskProgress,
  VerifyResult,
  ExecutionAnalysis,
} from "../types";

export interface ActivityEntry {
  id: string;
  message: string;
  timestamp: string;
  type: "success" | "error" | "warning" | "info";
}

/**
 * Builds a unified activity timeline from feature data that already exists
 * in the app — plan history, task progress, validation results, etc.
 */
export function buildActivityLog(
  feature: Feature,
  planHistory: PlanSnapshot[],
  taskProgress: TaskProgress | null,
  verifyResult: VerifyResult | null,
  analysis: ExecutionAnalysis | null,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  let seq = 0;

  // Feature created
  entries.push({
    id: `act-${seq++}`,
    message: `Feature "${feature.name}" created`,
    timestamp: feature.created_at,
    type: "info",
  });

  // Plan history snapshots
  for (const snap of planHistory) {
    const triggerLabel =
      snap.trigger === "start"
        ? "Initial plan generated"
        : snap.trigger === "feedback"
          ? `Plan revised${snap.feedback ? `: "${truncate(snap.feedback, 60)}"` : ""}`
          : snap.trigger === "answers"
            ? "Plan updated after Q&A"
            : `Plan updated (${snap.trigger})`;
    entries.push({
      id: `act-${seq++}`,
      message: `${triggerLabel} — ${snap.tasks.length} task${snap.tasks.length !== 1 ? "s" : ""}`,
      timestamp: snap.created_at,
      type: "info",
    });
  }

  // Execution started (feature has launched_command)
  if (feature.launched_command && feature.execution_mode) {
    entries.push({
      id: `act-${seq++}`,
      message: `Execution launched in ${feature.execution_mode} mode`,
      timestamp: feature.updated_at,
      type: "info",
    });
  }

  // Task progress
  if (taskProgress) {
    const done = taskProgress.tasks.filter((t) => t.status === "done").length;
    const total = taskProgress.tasks.length;
    if (total > 0) {
      entries.push({
        id: `act-${seq++}`,
        message: `Task progress: ${done}/${total} complete`,
        timestamp: feature.updated_at,
        type: done === total ? "success" : "info",
      });
    }
  }

  // Status transitions
  if (feature.status === "ready") {
    entries.push({
      id: `act-${seq++}`,
      message: "Execution finished — feature marked ready for review",
      timestamp: feature.updated_at,
      type: "success",
    });
  } else if (feature.status === "failed") {
    entries.push({
      id: `act-${seq++}`,
      message: "Execution finished with failures",
      timestamp: feature.updated_at,
      type: "error",
    });
  }

  // Validation
  if (verifyResult) {
    const passCount = verifyResult.results.filter((r) => r.success).length;
    const total = verifyResult.results.length;
    entries.push({
      id: `act-${seq++}`,
      message: verifyResult.all_passed
        ? `Validators passed (${passCount}/${total})`
        : `Validators: ${passCount}/${total} passed`,
      timestamp: verifyResult.timestamp,
      type: verifyResult.all_passed ? "success" : "warning",
    });
  }

  // Analytics
  if (analysis) {
    const covered = analysis.task_file_coverage.filter(
      (t) => t.coverage_status === "covered",
    ).length;
    entries.push({
      id: `act-${seq++}`,
      message: `Analysis: ${covered}/${analysis.planned_task_count} tasks covered, ${analysis.files_changed} files changed`,
      timestamp: feature.updated_at,
      type: analysis.mode_assessment.was_appropriate ? "info" : "warning",
    });
  }

  // Push status
  const pushedRepos = Object.entries(feature.repo_push_status || {}).filter(
    ([, s]) => s === "pushed",
  );
  if (pushedRepos.length > 0) {
    entries.push({
      id: `act-${seq++}`,
      message: `Pushed to ${pushedRepos.length} repo${pushedRepos.length !== 1 ? "s" : ""}`,
      timestamp: feature.updated_at,
      type: "success",
    });
  }

  if (feature.status === "complete") {
    entries.push({
      id: `act-${seq++}`,
      message: "Feature marked complete",
      timestamp: feature.updated_at,
      type: "success",
    });
  }

  // Sort chronologically
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return entries;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface ActivityLogProps {
  entries: ActivityEntry[];
}

export function ActivityLog({ entries }: ActivityLogProps) {
  if (entries.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>
        No activity yet.
      </div>
    );
  }

  return (
    <div className="activity-log">
      {entries.map((entry, i) => (
        <div className="activity-item" key={entry.id}>
          <div className="activity-rail">
            <div className={`activity-dot dot-${entry.type}`} />
            {i < entries.length - 1 && <div className="activity-line" />}
          </div>
          <div className="activity-content">
            <div className="activity-message">{entry.message}</div>
            <div className="activity-time">{formatTime(entry.timestamp)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
