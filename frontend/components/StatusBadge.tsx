import type { FeatureStatus } from "../types";

interface Props {
  status: FeatureStatus;
}

export function StatusBadge({ status }: Props) {
  const displayStatus = status === "executing" ? "running" : status;
  return (
    <span className={`status-badge ${displayStatus}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}
