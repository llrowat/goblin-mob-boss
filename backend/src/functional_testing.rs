use crate::models::{FunctionalTestResult, ProofType, TestProof};
use chrono::Utc;
use std::fs;
use std::path::Path;

/// Directory where proof artifacts are stored for a feature testing round.
pub fn proofs_dir(worktree_path: &str, feature_id: &str, attempt: u32) -> std::path::PathBuf {
    Path::new(worktree_path)
        .join(".gmb")
        .join("features")
        .join(feature_id)
        .join("proofs")
        .join(format!("{}", attempt))
}

/// Validate a single TestProof entry. Returns a list of warnings (non-fatal)
/// and optionally an error message if the proof is malformed beyond recovery.
fn validate_proof(proof: &TestProof, index: usize) -> Vec<String> {
    let mut warnings = Vec::new();

    if proof.step_description.trim().is_empty() {
        warnings.push(format!(
            "Proof #{}: missing step_description — cannot identify what was tested",
            index + 1
        ));
    }

    if proof.content.trim().is_empty() && proof.passed {
        warnings.push(format!(
            "Proof #{} ({}): marked as passed but has empty content — may be incomplete",
            index + 1,
            proof.step_description,
        ));
    }

    if !proof.passed && proof.error.is_none() {
        warnings.push(format!(
            "Proof #{} ({}): marked as failed but has no error description",
            index + 1,
            proof.step_description,
        ));
    }

    warnings
}

/// Attempt to parse results.json with lenient handling.
/// If the file is a JSON object (instead of array), try to extract proofs from common shapes.
fn parse_results_lenient(content: &str) -> Result<Vec<TestProof>, String> {
    // Try array first (the expected format)
    if let Ok(proofs) = serde_json::from_str::<Vec<TestProof>>(content) {
        return Ok(proofs);
    }

    // Try single proof object — wrap in array
    if let Ok(proof) = serde_json::from_str::<TestProof>(content) {
        return Ok(vec![proof]);
    }

    // Try object with a "results" or "proofs" key
    if let Ok(obj) = serde_json::from_str::<serde_json::Value>(content) {
        if let Some(arr) = obj.get("results").or_else(|| obj.get("proofs")) {
            if let Ok(proofs) = serde_json::from_value::<Vec<TestProof>>(arr.clone()) {
                return Ok(proofs);
            }
        }
    }

    // Give a helpful error
    Err(format!(
        "results.json is not valid. Expected a JSON array of proof objects, e.g.:\n\
        [{{\"step_description\": \"...\", \"proof_type\": \"screenshot|api_response|console_output|error\", \
        \"content\": \"...\", \"passed\": true, \"error\": null, \"timestamp\": \"...\"}}]\n\
        Parse error: {}",
        serde_json::from_str::<serde_json::Value>(content)
            .err()
            .map(|e| e.to_string())
            .unwrap_or_else(|| "JSON structure doesn't match expected schema".to_string())
    ))
}

/// Read proof artifacts written by the QA agent during functional testing.
/// The QA agent writes a `results.json` file containing an array of TestProof entries.
/// This function performs lenient parsing and schema validation with actionable error messages.
pub fn collect_proofs(
    worktree_path: &str,
    feature_id: &str,
    attempt: u32,
) -> Result<FunctionalTestResult, String> {
    let dir = proofs_dir(worktree_path, feature_id, attempt);
    let results_file = dir.join("results.json");

    if !results_file.exists() {
        // Check if the proofs directory even exists
        let hint = if !dir.exists() {
            "The proofs directory was never created — the QA agent may not have run at all."
        } else {
            "The proofs directory exists but results.json was not written. \
             The QA agent may have crashed or not completed."
        };
        return Ok(FunctionalTestResult {
            attempt,
            all_passed: false,
            proofs: vec![TestProof {
                step_description: "Functional testing".to_string(),
                proof_type: ProofType::Error,
                content: format!(
                    "QA agent did not produce results.json at {}\n\n{}",
                    results_file.display(),
                    hint
                ),
                passed: false,
                error: Some("No results file found".to_string()),
                timestamp: Utc::now(),
                is_meta: false,
            }],
            timestamp: Utc::now(),
        });
    }

    let content =
        fs::read_to_string(&results_file).map_err(|e| format!("Failed to read results: {}", e))?;

    // Empty file
    if content.trim().is_empty() {
        return Ok(FunctionalTestResult {
            attempt,
            all_passed: false,
            proofs: vec![TestProof {
                step_description: "Functional testing".to_string(),
                proof_type: ProofType::Error,
                content: "results.json is empty — the QA agent wrote the file but no content."
                    .to_string(),
                passed: false,
                error: Some("Empty results file".to_string()),
                timestamp: Utc::now(),
                is_meta: false,
            }],
            timestamp: Utc::now(),
        });
    }

    let proofs = match parse_results_lenient(&content) {
        Ok(p) => p,
        Err(msg) => {
            return Ok(FunctionalTestResult {
                attempt,
                all_passed: false,
                proofs: vec![TestProof {
                    step_description: "Functional testing".to_string(),
                    proof_type: ProofType::Error,
                    content: msg,
                    passed: false,
                    error: Some("Invalid results.json format".to_string()),
                    timestamp: Utc::now(),
                    is_meta: false,
                }],
                timestamp: Utc::now(),
            });
        }
    };

    // Validate each proof and collect warnings
    let mut all_warnings = Vec::new();
    for (i, proof) in proofs.iter().enumerate() {
        all_warnings.extend(validate_proof(proof, i));
    }

    // If there are warnings, append a summary proof
    let mut final_proofs = proofs;
    if !all_warnings.is_empty() {
        final_proofs.push(TestProof {
            step_description: "Schema validation warnings".to_string(),
            proof_type: ProofType::ConsoleOutput,
            content: all_warnings.join("\n"),
            passed: true, // warnings don't fail the run
            error: None,
            timestamp: Utc::now(),
            is_meta: true,
        });
    }

    // Filter out meta proofs (e.g. schema warnings) for pass/fail determination
    let real_proofs: Vec<_> = final_proofs.iter().filter(|p| !p.is_meta).collect();
    let all_passed = !real_proofs.is_empty() && real_proofs.iter().all(|p| p.passed);

    Ok(FunctionalTestResult {
        attempt,
        all_passed,
        proofs: final_proofs,
        timestamp: Utc::now(),
    })
}

/// Ensure the proofs directory exists for a given feature/attempt.
pub fn ensure_proofs_dir(
    worktree_path: &str,
    feature_id: &str,
    attempt: u32,
) -> Result<std::path::PathBuf, String> {
    let dir = proofs_dir(worktree_path, feature_id, attempt);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create proofs dir: {}", e))?;
    Ok(dir)
}

/// Build the prompt for the QA agent to functionally test the feature.
/// This is the user prompt passed to `claude` when spawning the testing session.
pub fn build_testing_prompt(
    feature_name: &str,
    feature_description: &str,
    test_steps: &[crate::models::FunctionalTestStep],
    harness: &crate::models::TestHarness,
    proofs_path: &str,
    validator_feedback: Option<&str>,
    prior_proof_feedback: Option<&str>,
) -> String {
    let steps_section = if test_steps.is_empty() {
        "No specific test steps defined — exercise the feature as you see fit based on the description above.".to_string()
    } else {
        let mut s = String::from("## Test Steps\n\n");
        for (i, step) in test_steps.iter().enumerate() {
            s.push_str(&format!("{}. {}\n", i + 1, step.description));
            if !step.tool.is_empty() {
                s.push_str(&format!("   Tool: {}\n", step.tool));
            }
        }
        s
    };

    let harness_section = format!(
        r#"## App Harness

- **Start command**: `{start}`
- **Ready signal**: {ready}
- **Stop command**: {stop}
- **Test type**: {harness_type:?}

Start the app using the start command. Wait for the ready signal before testing.
When done, stop the app using the stop command (or kill the process)."#,
        start = harness.start_command,
        ready = if harness.ready_signal.is_empty() {
            "None specified — wait a few seconds after starting".to_string()
        } else {
            format!("`{}`", harness.ready_signal)
        },
        stop = if harness.stop_command.is_empty() {
            "Kill the process".to_string()
        } else {
            format!("`{}`", harness.stop_command)
        },
        harness_type = harness.harness_type,
    );

    let feedback_section = match (validator_feedback, prior_proof_feedback) {
        (Some(vf), Some(pf)) => format!(
            "\n## Prior Feedback\n\n### Validator failures:\n{}\n\n### Prior testing failures:\n{}\n\nFix these issues and re-test.\n",
            vf, pf
        ),
        (Some(vf), None) => format!(
            "\n## Prior Feedback\n\n### Validator failures:\n{}\n\nThese validators failed after the last implementation round. The issues may already be fixed.\n",
            vf
        ),
        (None, Some(pf)) => format!(
            "\n## Prior Feedback\n\n### Prior testing failures:\n{}\n\nThese functional tests failed in the previous round. Verify they work now.\n",
            pf
        ),
        (None, None) => String::new(),
    };

    format!(
        r#"You are a QA tester. Your job is to functionally test a feature by actually running the application and exercising it.

## Feature: {name}

{description}

{harness_section}

{steps_section}
{feedback_section}
## Proof Artifacts

As you test, capture proof of each step. Write a JSON file to `{proofs_path}/results.json` with this format:

```json
[
  {{
    "step_description": "What was tested",
    "proof_type": "screenshot|api_response|console_output|error",
    "content": "Path to screenshot file, API response body, or console output",
    "passed": true,
    "error": null,
    "timestamp": "2025-01-01T00:00:00Z"
  }}
]
```

### Rules:
- Save screenshots to `{proofs_path}/` (e.g., `{proofs_path}/login-page.png`)
- For API responses, include the status code and response body in `content`
- For console output, include the relevant terminal output in `content`
- Set `passed` to `false` and fill `error` if a step fails
- Write `results.json` after completing ALL test steps
- If the app fails to start, write a single error proof and stop
- After writing results.json, create a completion signal: `echo "done" > {proofs_path}/testing-complete`

## Important
- This is best-effort testing. If a step is not feasible (e.g., requires manual browser interaction you can't automate), skip it and note why.
- Focus on verifying the core functionality works, not exhaustive edge cases.
- If you discover bugs, document them clearly in the error field."#,
        name = feature_name,
        description = feature_description,
        harness_section = harness_section,
        steps_section = steps_section,
        feedback_section = feedback_section,
        proofs_path = proofs_path,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{FunctionalTestStep, HarnessType, ProofType, TestHarness};
    use tempfile::TempDir;

    #[test]
    fn proofs_dir_builds_correct_path() {
        let path = proofs_dir("/tmp/repo", "feat-123", 1);
        assert_eq!(
            path,
            Path::new("/tmp/repo/.gmb/features/feat-123/proofs/1")
        );
    }

    #[test]
    fn proofs_dir_increments_attempt() {
        let path = proofs_dir("/tmp/repo", "feat-123", 3);
        assert!(path.ends_with("proofs/3"));
    }

    #[test]
    fn collect_proofs_no_results_file() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(!result.all_passed);
        assert_eq!(result.attempt, 1);
        assert_eq!(result.proofs.len(), 1);
        assert_eq!(result.proofs[0].proof_type, ProofType::Error);
    }

    #[test]
    fn collect_proofs_reads_results_file() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let proofs_path = proofs_dir(&worktree, "feat-1", 1);
        fs::create_dir_all(&proofs_path).unwrap();

        let proofs_json = serde_json::to_string(&vec![
            TestProof {
                step_description: "Login page loads".to_string(),
                proof_type: ProofType::Screenshot,
                content: "login.png".to_string(),
                passed: true,
                error: None,
                timestamp: Utc::now(),
                is_meta: false,
            },
            TestProof {
                step_description: "Dashboard renders".to_string(),
                proof_type: ProofType::Screenshot,
                content: "dashboard.png".to_string(),
                passed: true,
                error: None,
                timestamp: Utc::now(),
                is_meta: false,
            },
        ])
        .unwrap();
        fs::write(proofs_path.join("results.json"), proofs_json).unwrap();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(result.all_passed);
        assert_eq!(result.proofs.len(), 2);
    }

    #[test]
    fn collect_proofs_empty_array_fails() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();
        let proofs_path = proofs_dir(&worktree, "feat-1", 1);
        fs::create_dir_all(&proofs_path).unwrap();
        fs::write(proofs_path.join("results.json"), "[]").unwrap();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(!result.all_passed, "Empty proofs array should not pass");
    }

    #[test]
    fn collect_proofs_partial_failure() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let proofs_path = proofs_dir(&worktree, "feat-1", 1);
        fs::create_dir_all(&proofs_path).unwrap();

        let proofs_json = serde_json::to_string(&vec![
            TestProof {
                step_description: "Login works".to_string(),
                proof_type: ProofType::Screenshot,
                content: "login.png".to_string(),
                passed: true,
                error: None,
                timestamp: Utc::now(),
                is_meta: false,
            },
            TestProof {
                step_description: "Dashboard crashes".to_string(),
                proof_type: ProofType::Error,
                content: "TypeError: Cannot read property 'map' of undefined".to_string(),
                passed: false,
                error: Some("Component crash on render".to_string()),
                timestamp: Utc::now(),
                is_meta: false,
            },
        ])
        .unwrap();
        fs::write(proofs_path.join("results.json"), proofs_json).unwrap();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(!result.all_passed);
        assert_eq!(result.proofs.len(), 2);
        assert!(result.proofs[0].passed);
        assert!(!result.proofs[1].passed);
    }

    #[test]
    fn ensure_proofs_dir_creates_directory() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let path = ensure_proofs_dir(&worktree, "feat-1", 2).unwrap();
        assert!(path.exists());
        assert!(path.is_dir());
    }

    #[test]
    fn build_testing_prompt_includes_feature_info() {
        let harness = TestHarness {
            start_command: "npm run dev".to_string(),
            ready_signal: "Local: http://localhost:5173".to_string(),
            stop_command: String::new(),
            harness_type: HarnessType::Browser,
        };
        let steps = vec![FunctionalTestStep {
            description: "Login page renders".to_string(),
            tool: "playwright".to_string(),
            agent: "qa-tester".to_string(),
        }];

        let prompt =
            build_testing_prompt("Dark Mode", "Add dark mode toggle", &steps, &harness, "/tmp/proofs", None, None);

        assert!(prompt.contains("Dark Mode"));
        assert!(prompt.contains("Add dark mode toggle"));
        assert!(prompt.contains("npm run dev"));
        assert!(prompt.contains("Login page renders"));
        assert!(prompt.contains("playwright"));
        assert!(prompt.contains("results.json"));
    }

    #[test]
    fn build_testing_prompt_includes_feedback() {
        let harness = TestHarness {
            start_command: "npm start".to_string(),
            ready_signal: String::new(),
            stop_command: String::new(),
            harness_type: HarnessType::Api,
        };

        let prompt = build_testing_prompt(
            "API",
            "Add API endpoint",
            &[],
            &harness,
            "/tmp/proofs",
            Some("npm test failed: 2 failures"),
            Some("GET /api/users returned 500"),
        );

        assert!(prompt.contains("Validator failures"));
        assert!(prompt.contains("npm test failed"));
        assert!(prompt.contains("Prior testing failures"));
        assert!(prompt.contains("GET /api/users returned 500"));
    }

    #[test]
    fn build_testing_prompt_no_steps() {
        let harness = TestHarness {
            start_command: "cargo run".to_string(),
            ready_signal: String::new(),
            stop_command: String::new(),
            harness_type: HarnessType::Cli,
        };

        let prompt = build_testing_prompt("CLI Tool", "Add CLI command", &[], &harness, "/tmp/proofs", None, None);
        assert!(prompt.contains("exercise the feature as you see fit"));
    }

    // ── Schema Validation Tests ──

    #[test]
    fn collect_proofs_empty_file() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();
        let proofs_path = proofs_dir(&worktree, "feat-1", 1);
        fs::create_dir_all(&proofs_path).unwrap();
        fs::write(proofs_path.join("results.json"), "").unwrap();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(!result.all_passed);
        assert_eq!(result.proofs[0].proof_type, ProofType::Error);
        assert!(result.proofs[0].content.contains("empty"));
    }

    #[test]
    fn collect_proofs_lenient_single_object() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();
        let proofs_path = proofs_dir(&worktree, "feat-1", 1);
        fs::create_dir_all(&proofs_path).unwrap();

        // Agent writes a single object instead of an array
        let single = serde_json::to_string(&TestProof {
            step_description: "Single test".to_string(),
            proof_type: ProofType::ApiResponse,
            content: "200 OK".to_string(),
            passed: true,
            error: None,
            timestamp: Utc::now(),
            is_meta: false,
        })
        .unwrap();
        fs::write(proofs_path.join("results.json"), single).unwrap();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(result.all_passed);
        assert!(result.proofs.iter().any(|p| p.step_description == "Single test"));
    }

    #[test]
    fn collect_proofs_lenient_wrapped_object() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();
        let proofs_path = proofs_dir(&worktree, "feat-1", 1);
        fs::create_dir_all(&proofs_path).unwrap();

        // Agent wraps in {"results": [...]}
        let proof = TestProof {
            step_description: "Wrapped test".to_string(),
            proof_type: ProofType::ConsoleOutput,
            content: "OK".to_string(),
            passed: true,
            error: None,
            timestamp: Utc::now(),
            is_meta: false,
        };
        let wrapped = format!(
            r#"{{"results": [{}]}}"#,
            serde_json::to_string(&proof).unwrap()
        );
        fs::write(proofs_path.join("results.json"), wrapped).unwrap();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(result.all_passed);
        assert!(result.proofs.iter().any(|p| p.step_description == "Wrapped test"));
    }

    #[test]
    fn collect_proofs_invalid_json() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();
        let proofs_path = proofs_dir(&worktree, "feat-1", 1);
        fs::create_dir_all(&proofs_path).unwrap();
        fs::write(proofs_path.join("results.json"), "not json at all").unwrap();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(!result.all_passed);
        assert!(result.proofs[0].content.contains("not valid"));
    }

    #[test]
    fn unknown_proof_type_rejected_at_parse() {
        // With ProofType as an enum, invalid types are caught during JSON parsing
        let json = r#"[{"step_description":"Test","proof_type":"video_recording","content":"vid","passed":true,"error":null,"timestamp":"2026-01-01T00:00:00Z"}]"#;
        let result = parse_results_lenient(json);
        assert!(result.is_err(), "Unknown proof_type should fail to parse");
    }

    #[test]
    fn validate_proof_warns_on_empty_description() {
        let proof = TestProof {
            step_description: "".to_string(),
            proof_type: ProofType::Screenshot,
            content: "img.png".to_string(),
            passed: true,
            error: None,
            timestamp: Utc::now(),
            is_meta: false,
        };
        let warnings = validate_proof(&proof, 0);
        assert!(warnings.iter().any(|w| w.contains("missing step_description")));
    }

    #[test]
    fn validate_proof_warns_on_passed_empty_content() {
        let proof = TestProof {
            step_description: "Check page".to_string(),
            proof_type: ProofType::Screenshot,
            content: "".to_string(),
            passed: true,
            error: None,
            timestamp: Utc::now(),
            is_meta: false,
        };
        let warnings = validate_proof(&proof, 0);
        assert!(warnings.iter().any(|w| w.contains("empty content")));
    }

    #[test]
    fn validate_proof_warns_on_failed_no_error() {
        let proof = TestProof {
            step_description: "Login".to_string(),
            proof_type: ProofType::Error,
            content: "crash".to_string(),
            passed: false,
            error: None,
            timestamp: Utc::now(),
            is_meta: false,
        };
        let warnings = validate_proof(&proof, 0);
        assert!(warnings.iter().any(|w| w.contains("no error description")));
    }

    #[test]
    fn validate_proof_no_warnings_for_valid_proof() {
        let proof = TestProof {
            step_description: "Login page".to_string(),
            proof_type: ProofType::Screenshot,
            content: "login.png".to_string(),
            passed: true,
            error: None,
            timestamp: Utc::now(),
            is_meta: false,
        };
        let warnings = validate_proof(&proof, 0);
        assert!(warnings.is_empty());
    }

    #[test]
    fn collect_proofs_appends_validation_warnings() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();
        let proofs_path = proofs_dir(&worktree, "feat-1", 1);
        fs::create_dir_all(&proofs_path).unwrap();

        // Proof with empty description — should trigger a warning
        let proofs_json = serde_json::to_string(&vec![TestProof {
            step_description: "".to_string(),
            proof_type: ProofType::Screenshot,
            content: "vid.mp4".to_string(),
            passed: true,
            error: None,
            timestamp: Utc::now(),
            is_meta: false,
        }])
        .unwrap();
        fs::write(proofs_path.join("results.json"), proofs_json).unwrap();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        // Should have 2 proofs: original + validation warnings
        assert_eq!(result.proofs.len(), 2);
        assert!(result.proofs[1].is_meta);
        // Warnings don't affect pass/fail of real proofs
        assert!(result.all_passed);
    }

    #[test]
    fn collect_proofs_no_results_dir_hint() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();
        // Don't create the proofs dir

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(result.proofs[0].content.contains("never created"));
    }

    #[test]
    fn collect_proofs_dir_exists_but_no_file_hint() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();
        let proofs_path = proofs_dir(&worktree, "feat-1", 1);
        fs::create_dir_all(&proofs_path).unwrap();
        // Dir exists but no results.json

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(result.proofs[0].content.contains("not written"));
    }
}
