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
