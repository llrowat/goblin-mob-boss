use crate::models::{ValidatorResult, VerifyResult};
use chrono::Utc;
use std::fs;
use std::path::Path;
use std::process::Command;

pub fn run_validators(
    worktree_path: &str,
    validators: &[String],
    attempt: u32,
) -> Result<VerifyResult, String> {
    let results_dir = Path::new(worktree_path)
        .join(".gmb")
        .join("results")
        .join("verify")
        .join(format!("{}", attempt));
    fs::create_dir_all(&results_dir).map_err(|e| format!("Failed to create results dir: {}", e))?;

    let mut results = Vec::new();
    let mut all_passed = true;

    for (i, cmd) in validators.iter().enumerate() {
        let output = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .args(["/C", cmd])
                .current_dir(worktree_path)
                .output()
        } else {
            Command::new("sh")
                .args(["-c", cmd])
                .current_dir(worktree_path)
                .output()
        };

        let result = match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let exit_code = output.status.code().unwrap_or(-1);
                let success = output.status.success();

                ValidatorResult {
                    command: cmd.clone(),
                    exit_code,
                    stdout,
                    stderr,
                    success,
                }
            }
            Err(e) => ValidatorResult {
                command: cmd.clone(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("Failed to execute: {}", e),
                success: false,
            },
        };

        if !result.success {
            all_passed = false;
        }

        // Write individual result files
        let prefix = format!("validator_{}", i);
        let _ = fs::write(
            results_dir.join(format!("{}_stdout.txt", prefix)),
            &result.stdout,
        );
        let _ = fs::write(
            results_dir.join(format!("{}_stderr.txt", prefix)),
            &result.stderr,
        );
        let _ = fs::write(
            results_dir.join(format!("{}_exit_code.json", prefix)),
            serde_json::to_string(&serde_json::json!({
                "command": result.command,
                "exit_code": result.exit_code
            }))
            .unwrap_or_default(),
        );

        results.push(result);
    }

    // Write summary
    let verify_result = VerifyResult {
        attempt,
        all_passed,
        results,
        timestamp: Utc::now(),
    };

    let _ = fs::write(
        results_dir.join("summary.json"),
        serde_json::to_string_pretty(&verify_result).unwrap_or_default(),
    );

    Ok(verify_result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn run_validators_all_pass() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let result = run_validators(&worktree, &["true".to_string()], 1).unwrap();
        assert!(result.all_passed);
        assert_eq!(result.attempt, 1);
        assert_eq!(result.results.len(), 1);
        assert!(result.results[0].success);
        assert_eq!(result.results[0].exit_code, 0);
    }

    #[test]
    fn run_validators_with_failure() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let result = run_validators(
            &worktree,
            &["true".to_string(), "false".to_string()],
            1,
        )
        .unwrap();

        assert!(!result.all_passed);
        assert_eq!(result.results.len(), 2);
        assert!(result.results[0].success);
        assert!(!result.results[1].success);
    }

    #[test]
    fn run_validators_captures_output() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let result = run_validators(&worktree, &["echo hello".to_string()], 1).unwrap();
        assert!(result.all_passed);
        assert!(result.results[0].stdout.contains("hello"));
    }

    #[test]
    fn run_validators_captures_stderr() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let result = run_validators(
            &worktree,
            &["echo error_msg >&2 && false".to_string()],
            1,
        )
        .unwrap();

        assert!(!result.all_passed);
        assert!(result.results[0].stderr.contains("error_msg"));
    }

    #[test]
    fn run_validators_writes_result_files() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        run_validators(&worktree, &["echo ok".to_string()], 2).unwrap();

        let results_dir = dir.path().join(".gmb/results/verify/2");
        assert!(results_dir.join("validator_0_stdout.txt").exists());
        assert!(results_dir.join("validator_0_stderr.txt").exists());
        assert!(results_dir.join("validator_0_exit_code.json").exists());
        assert!(results_dir.join("summary.json").exists());
    }

    #[test]
    fn run_validators_empty_list() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let result = run_validators(&worktree, &[], 1).unwrap();
        assert!(result.all_passed);
        assert!(result.results.is_empty());
    }
}
