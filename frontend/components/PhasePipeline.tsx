import type { TaskPhase } from "../types";

const PHASES: TaskPhase[] = ["plan", "code", "verify", "ready"];

const PHASE_LABELS: Record<TaskPhase, string> = {
  plan: "Plan",
  code: "Code",
  verify: "Verify",
  ready: "Ready",
};

interface Props {
  current: TaskPhase;
}

export function PhasePipeline({ current }: Props) {
  const currentIdx = PHASES.indexOf(current);

  return (
    <div className="phase-pipeline">
      {PHASES.map((phase, idx) => (
        <span key={phase}>
          {idx > 0 && <span className="phase-arrow">&rarr; </span>}
          <span
            className={`phase-step ${
              idx === currentIdx ? "active" : idx < currentIdx ? "completed" : ""
            }`}
          >
            {PHASE_LABELS[phase]}
          </span>
        </span>
      ))}
    </div>
  );
}
