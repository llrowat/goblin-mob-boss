import type { AgentPerformanceSummary } from "../types";

/**
 * Compact feature count shown in the bottom-right of agent cards.
 */
export function AgentPerformanceBar({
  summary,
}: {
  summary: AgentPerformanceSummary | undefined;
}) {
  const count = summary?.feature_count ?? 0;
  if (count === 0) {
    return null;
  }

  return (
    <span className="agent-perf-feature-count">
      Used in {count} {count === 1 ? "feature" : "features"}
    </span>
  );
}

/**
 * Full agent performance panel shown when expanding agent details.
 */
export function AgentPerformanceDetail({
  summary,
}: {
  summary: AgentPerformanceSummary;
}) {
  const pct = Math.round(summary.success_rate * 100);

  return (
    <div className="agent-perf-detail">
      <h4>Track Record</h4>
      <div className="agent-perf-detail-grid">
        <div className="agent-perf-stat-block">
          <div className="agent-perf-stat-value">{summary.total_tasks}</div>
          <div className="agent-perf-stat-label">Total Tasks</div>
        </div>
        <div className="agent-perf-stat-block">
          <div className="agent-perf-stat-value">{summary.successful_tasks}</div>
          <div className="agent-perf-stat-label">Succeeded</div>
        </div>
        <div className="agent-perf-stat-block">
          <div className="agent-perf-stat-value">{pct}%</div>
          <div className="agent-perf-stat-label">Success Rate</div>
        </div>
        {summary.avg_duration_secs != null && (
          <div className="agent-perf-stat-block">
            <div className="agent-perf-stat-value">
              {formatDuration(summary.avg_duration_secs)}
            </div>
            <div className="agent-perf-stat-label">Avg Duration</div>
          </div>
        )}
      </div>
      {summary.top_categories.length > 0 && (
        <>
          <h4 style={{ marginTop: 12 }}>Specialties</h4>
          <div className="agent-perf-categories">
            {summary.top_categories.map((cat) => (
              <span key={cat.category} className="agent-perf-category-tag">
                {cat.category}
                <span className="agent-perf-category-count">
                  {cat.success_count}/{cat.count} succeeded
                </span>
              </span>
            ))}
          </div>
        </>
      )}
      {summary.last_active && (
        <div className="agent-perf-last-active">
          Last active: {new Date(summary.last_active).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return `${h}h ${m}m`;
}
