use crate::models::{FunctionalTestResult, TestProof};
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

/// Read proof artifacts written by the QA agent during functional testing.
/// The QA agent writes a `results.json` file containing an array of TestProof entries.
pub fn collect_proofs(
    worktree_path: &str,
    feature_id: &str,
    attempt: u32,
) -> Result<FunctionalTestResult, String> {
    let dir = proofs_dir(worktree_path, feature_id, attempt);
    let results_file = dir.join("results.json");

    if !results_file.exists() {
        return Ok(FunctionalTestResult {
            attempt,
            all_passed: false,
            proofs: vec![TestProof {
                step_description: "Functional testing".to_string(),
                proof_type: "error".to_string(),
                content: "QA agent did not produce results.json".to_string(),
                passed: false,
                error: Some("No results file found".to_string()),
                timestamp: Utc::now(),
            }],
            timestamp: Utc::now(),
        });
    }

    let content =
        fs::read_to_string(&results_file).map_err(|e| format!("Failed to read results: {}", e))?;
    let proofs: Vec<TestProof> =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse results: {}", e))?;

    let all_passed = !proofs.is_empty() && proofs.iter().all(|p| p.passed);

    Ok(FunctionalTestResult {
        attempt,
        all_passed,
        proofs,
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
    use crate::models::{FunctionalTestStep, HarnessType, TestHarness};
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
        assert_eq!(result.proofs[0].proof_type, "error");
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
                proof_type: "screenshot".to_string(),
                content: "login.png".to_string(),
                passed: true,
                error: None,
                timestamp: Utc::now(),
            },
            TestProof {
                step_description: "Dashboard renders".to_string(),
                proof_type: "screenshot".to_string(),
                content: "dashboard.png".to_string(),
                passed: true,
                error: None,
                timestamp: Utc::now(),
            },
        ])
        .unwrap();
        fs::write(proofs_path.join("results.json"), proofs_json).unwrap();

        let result = collect_proofs(&worktree, "feat-1", 1).unwrap();
        assert!(result.all_passed);
        assert_eq!(result.proofs.len(), 2);
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
                proof_type: "screenshot".to_string(),
                content: "login.png".to_string(),
                passed: true,
                error: None,
                timestamp: Utc::now(),
            },
            TestProof {
                step_description: "Dashboard crashes".to_string(),
                proof_type: "error".to_string(),
                content: "TypeError: Cannot read property 'map' of undefined".to_string(),
                passed: false,
                error: Some("Component crash on render".to_string()),
                timestamp: Utc::now(),
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
            agent: "qa-goblin".to_string(),
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
}
