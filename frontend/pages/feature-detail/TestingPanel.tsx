import type { Feature, FunctionalTestResult, TestProof } from "../../types";

interface TestingPanelProps {
  feature: Feature;
  isTesting: boolean;
  testResults: FunctionalTestResult[];
  onStartTesting: () => void;
  onSkipTesting: () => void;
  onCompleteTesting: () => void;
  startingTest: boolean;
  completingTest: boolean;
}

function ProofItem({ proof }: { proof: TestProof }) {
  const typeColors: Record<string, string> = {
    screenshot: "#7ba3cc",
    api_response: "#6b9e6b",
    console_output: "#c9a84c",
    error: "var(--danger)",
  };

  return (
    <div
      style={{
        padding: "8px 12px",
        marginBottom: 6,
        borderRadius: 4,
        border: "1px solid var(--border)",
        backgroundColor: proof.passed
          ? "rgba(107, 158, 107, 0.05)"
          : "rgba(196, 90, 106, 0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            color: proof.passed ? "var(--success)" : "var(--danger)",
            fontWeight: 600,
            fontSize: 10,
            textTransform: "uppercase",
          }}
        >
          {proof.passed ? "PASS" : "FAIL"}
        </span>
        <span
          style={{
            fontSize: 10,
            color: typeColors[proof.proof_type] || "var(--muted)",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          {proof.proof_type}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>
          {proof.step_description}
        </span>
      </div>
      {proof.content && (
        <div
          className="code-block"
          style={{
            fontSize: 11,
            maxHeight: 120,
            overflow: "auto",
            marginTop: 4,
          }}
        >
          {proof.content}
        </div>
      )}
      {proof.error && (
        <div
          style={{
            fontSize: 11,
            color: "var(--danger)",
            marginTop: 4,
            fontFamily: "var(--font-mono)",
          }}
        >
          {proof.error}
        </div>
      )}
    </div>
  );
}

export function TestingPanel({
  feature,
  isTesting,
  testResults,
  onStartTesting,
  onSkipTesting,
  onCompleteTesting,
  startingTest,
  completingTest,
}: TestingPanelProps) {
  const hasHarness = !!feature.test_harness;
  const hasSteps = feature.functional_test_steps.length > 0;
  const canTest = hasHarness;
  const latestResult = testResults.length > 0 ? testResults[testResults.length - 1] : null;
  const attemptLabel = feature.testing_attempt > 0
    ? `Attempt ${feature.testing_attempt}/${feature.max_testing_attempts}`
    : "";

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-header">
        <div className="panel-title">
          Functional Testing
          {attemptLabel && (
            <span
              style={{
                fontSize: 11,
                color: "var(--muted)",
                fontWeight: 400,
                marginLeft: 8,
              }}
            >
              {attemptLabel}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isTesting && canTest && feature.status !== "testing" && (
            <button
              className="btn btn-primary btn-sm"
              onClick={onStartTesting}
              disabled={startingTest}
              aria-label="Start functional testing"
            >
              {startingTest ? "Starting..." : "Run QA"}
            </button>
          )}
          {(feature.status === "testing" || isTesting) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onCompleteTesting}
              disabled={completingTest}
              aria-label="Complete functional testing"
            >
              {completingTest ? "Collecting..." : "Collect Results"}
            </button>
          )}
          {feature.status !== "testing" && !feature.testing_skipped && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onSkipTesting}
              aria-label="Skip functional testing"
            >
              Skip
            </button>
          )}
        </div>
      </div>

      {/* No harness configured */}
      {!canTest && (
        <div
          style={{
            fontSize: 12,
            color: "var(--muted)",
            padding: "12px 0",
            lineHeight: 1.5,
          }}
        >
          No test harness configured for this feature. The planner didn't
          include functional test steps — this is normal for internal or
          non-UI changes.
        </div>
      )}

      {/* Harness info */}
      {canTest && feature.test_harness && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Test Harness
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              lineHeight: 1.8,
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <div>
              <span style={{ color: "var(--muted)" }}>Start: </span>
              <code>{feature.test_harness.start_command}</code>
            </div>
            {feature.test_harness.ready_signal && (
              <div>
                <span style={{ color: "var(--muted)" }}>Ready: </span>
                <code>{feature.test_harness.ready_signal}</code>
              </div>
            )}
            <div>
              <span style={{ color: "var(--muted)" }}>Type: </span>
              {feature.test_harness.harness_type}
            </div>
          </div>
        </div>
      )}

      {/* Test steps */}
      {hasSteps && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Test Steps ({feature.functional_test_steps.length})
          </div>
          {feature.functional_test_steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "4px 0",
                borderBottom: "1px solid var(--border)",
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--muted)", minWidth: 20 }}>
                {i + 1}.
              </span>
              <span style={{ flex: 1, color: "var(--text-secondary)" }}>
                {step.description}
              </span>
              {step.tool && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {step.tool}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Testing in progress */}
      {(feature.status === "testing" || isTesting) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 0",
            color: "var(--text-secondary)",
            fontSize: 13,
          }}
        >
          <div className="spinner" />
          QA goblin is exercising the feature...
        </div>
      )}

      {/* Skipped notice */}
      {feature.testing_skipped && (
        <div
          style={{
            fontSize: 12,
            color: "var(--muted)",
            padding: "8px 0",
            fontStyle: "italic",
          }}
        >
          Functional testing was skipped for this feature.
        </div>
      )}

      {/* Test results */}
      {testResults.map((result, ri) => (
        <div
          key={ri}
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Round {result.attempt}
            <span
              style={{
                color: result.all_passed ? "var(--success)" : "var(--danger)",
                fontWeight: 400,
              }}
            >
              {result.all_passed ? "All passed" : "Some failed"}
            </span>
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>
              {result.proofs.length} proof
              {result.proofs.length !== 1 ? "s" : ""}
            </span>
          </div>
          {result.proofs.map((proof, pi) => (
            <ProofItem key={pi} proof={proof} />
          ))}
        </div>
      ))}

      {/* Loop feedback — shown when tests failed but attempts remain */}
      {latestResult &&
        !latestResult.all_passed &&
        feature.testing_attempt < feature.max_testing_attempts &&
        feature.status === "executing" && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 6,
              backgroundColor: "rgba(196, 90, 106, 0.1)",
              border: "1px solid rgba(196, 90, 106, 0.3)",
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            QA found issues. The mob is fixing things before the next
            round of testing.
          </div>
        )}
    </div>
  );
}
