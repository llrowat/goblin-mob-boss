use crate::models::{ValidatorResult, VerifyResult};
use chrono::Utc;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use wait_timeout::ChildExt;

/// Default timeout for each validator command (10 minutes).
const VALIDATOR_TIMEOUT: Duration = Duration::from_secs(600);

pub fn run_validators(
    worktree_path: &str,
    validators: &[String],
    attempt: u32,
) -> Result<VerifyResult, String> {
    run_validators_with_timeout(worktree_path, validators, attempt, VALIDATOR_TIMEOUT)
}

pub fn run_validators_with_timeout(
    worktree_path: &str,
    validators: &[String],
    attempt: u32,
    timeout: Duration,
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
        let child = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .args(["/C", cmd])
                .current_dir(worktree_path)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
        } else {
            Command::new("sh")
                .args(["-l", "-c", cmd])
                .current_dir(worktree_path)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
        };

        let result = match child {
            Ok(mut child) => {
                match child.wait_timeout(timeout) {
                    Ok(Some(status)) => {
                        let stdout = child.stdout.take().map(|mut s| {
                            let mut buf = Vec::new();
                            std::io::Read::read_to_end(&mut s, &mut buf).ok();
                            String::from_utf8_lossy(&buf).to_string()
                        }).unwrap_or_default();
                        let stderr = child.stderr.take().map(|mut s| {
                            let mut buf = Vec::new();
                            std::io::Read::read_to_end(&mut s, &mut buf).ok();
                            String::from_utf8_lossy(&buf).to_string()
                        }).unwrap_or_default();

                        ValidatorResult {
                            command: cmd.clone(),
                            exit_code: status.code().unwrap_or(-1),
                            stdout,
                            stderr,
                            success: status.success(),
                        }
                    }
                    Ok(None) => {
                        // Timed out — kill the process
                        let _ = child.kill();
                        let _ = child.wait();
                        ValidatorResult {
                            command: cmd.clone(),
                            exit_code: -1,
                            stdout: String::new(),
                            stderr: format!("Timed out after {}s", timeout.as_secs()),
                            success: false,
                        }
                    }
                    Err(e) => ValidatorResult {
                        command: cmd.clone(),
                        exit_code: -1,
                        stdout: String::new(),
                        stderr: format!("Failed to wait: {}", e),
                        success: false,
                    },
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
        if let Err(e) = fs::write(
            results_dir.join(format!("{}_stdout.txt", prefix)),
            &result.stdout,
        ) {
            log::warn!("Failed to write validator stdout: {}", e);
        }
        if let Err(e) = fs::write(
            results_dir.join(format!("{}_stderr.txt", prefix)),
            &result.stderr,
        ) {
            log::warn!("Failed to write validator stderr: {}", e);
        }
        if let Err(e) = fs::write(
            results_dir.join(format!("{}_exit_code.json", prefix)),
            serde_json::to_string(&serde_json::json!({
                "command": result.command,
                "exit_code": result.exit_code
            }))
            .unwrap_or_default(),
        ) {
            log::warn!("Failed to write validator exit code: {}", e);
        }

        results.push(result);
    }

    // Write summary
    let verify_result = VerifyResult {
        attempt,
        all_passed,
        results,
        timestamp: Utc::now(),
    };

    if let Err(e) = fs::write(
        results_dir.join("summary.json"),
        serde_json::to_string_pretty(&verify_result).unwrap_or_default(),
    ) {
        log::warn!("Failed to write validator summary: {}", e);
    }

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

    #[test]
    fn run_validators_login_shell_has_profile_path() {
        // Verify that the login shell flag (-l) gives us access to
        // profile-defined environment variables.  HOME is always set
        // in a login shell, so we use it as a smoke-test.
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let result = run_validators(
            &worktree,
            &["echo $HOME".to_string()],
            1,
        )
        .unwrap();

        assert!(result.all_passed);
        // HOME should be a non-empty path (e.g. /root, /home/user)
        let home = result.results[0].stdout.trim();
        assert!(!home.is_empty(), "HOME should be set in a login shell");
        assert!(home.starts_with('/'), "HOME should be an absolute path, got: {}", home);
    }

    #[test]
    fn run_validators_timeout_kills_process() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        // Use a very short timeout with a long-running command
        let result = run_validators_with_timeout(
            &worktree,
            &["sleep 60".to_string()],
            1,
            Duration::from_secs(1),
        )
        .unwrap();

        assert!(!result.all_passed);
        assert!(result.results[0].stderr.contains("Timed out"));
        assert_eq!(result.results[0].exit_code, -1);
    }
}
