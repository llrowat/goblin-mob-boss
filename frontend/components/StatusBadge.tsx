import type { FeatureStatus } from "../types";

import statusPlanning from "../assets/status/status-planning.png";
import statusRunning from "../assets/status/status-running.png";
import statusValidating from "../assets/status/status-validating.png";
import statusPassed from "../assets/status/status-passed.png";
import statusFailed from "../assets/status/status-failed.png";
import statusMerged from "../assets/status/status-merged.png";

const statusIcons: Record<string, string> = {
  planning: statusPlanning,
  ideation: statusPlanning,
  configuring: statusPlanning,
  running: statusRunning,
  executing: statusRunning,
  validating: statusValidating,
  verifying: statusValidating,
  testing: statusValidating,
  completed: statusPassed,
  passed: statusPassed,
  ready: statusPassed,
  pushed: statusPassed,
  complete: statusPassed,
  failed: statusFailed,
  merged: statusMerged,
};

interface Props {
  status: FeatureStatus;
}

export function StatusBadge({ status }: Props) {
  const displayStatus = status === "executing" ? "running" : status === "testing" ? "testing" : status;
  const icon = statusIcons[status] || statusIcons[displayStatus];
  return (
    <span className={`status-badge ${displayStatus}`}>
      {icon ? (
        <img src={icon} className="status-icon" alt="" />
      ) : (
        <span className="status-dot" />
      )}
      {status}
    </span>
  );
}
