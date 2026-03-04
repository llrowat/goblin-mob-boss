import type { TaskStatus } from "../types";

interface Props {
  status: TaskStatus;
}

export function StatusBadge({ status }: Props) {
  return (
    <span className={`status-badge ${status}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}
