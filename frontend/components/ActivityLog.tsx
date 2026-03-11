import type { ActivityEntry } from "../types";

export interface DisplayEntry {
  id: string;
  message: string;
  timestamp: string;
  type: "success" | "error" | "warning" | "info";
}

/**
 * Convert persisted ActivityEntry[] from the backend into DisplayEntry[] for rendering.
 */
export function toDisplayEntries(entries: ActivityEntry[]): DisplayEntry[] {
  return entries.map((e, i) => ({
    id: `act-${i}`,
    message: e.message,
    timestamp: e.timestamp,
    type: e.type as DisplayEntry["type"],
  }));
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
  entries: DisplayEntry[];
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
