use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

/// A snapshot of execution progress based on git activity on the feature branch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionSnapshot {
    pub commit_count: u32,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
    pub last_commit_message: String,
    pub last_commit_time: Option<String>,
    pub recent_commits: Vec<CommitInfo>,
    pub active_files: Vec<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub message: String,
    pub time: String,
}

/// Poll the current execution state by inspecting git history on the feature branch.
/// Compares `feature_branch` against `base_branch` to see what work has been done.
pub fn poll_execution_snapshot(
    repo_path: &str,
    base_branch: &str,
    feature_branch: &str,
) -> Result<ExecutionSnapshot, String> {
    // Count commits on feature branch since base
    let commits = get_branch_commits(repo_path, base_branch, feature_branch)?;
    let commit_count = commits.len() as u32;

    let last_commit_message = commits
        .first()
        .map(|c| c.message.clone())
        .unwrap_or_default();
    let last_commit_time = commits.first().map(|c| c.time.clone());

    // Get diff stats
    let (files_changed, insertions, deletions) =
        get_diff_stats(repo_path, base_branch, feature_branch)?;

    // Get list of recently modified files
    let active_files = get_changed_files(repo_path, base_branch, feature_branch)?;

    Ok(ExecutionSnapshot {
        commit_count,
        files_changed,
        insertions,
        deletions,
        last_commit_message,
        last_commit_time,
        recent_commits: commits,
        active_files,
        timestamp: Utc::now(),
    })
}

fn get_branch_commits(
    repo_path: &str,
    base_branch: &str,
    feature_branch: &str,
) -> Result<Vec<CommitInfo>, String> {
    let range = format!("{}..{}", base_branch, feature_branch);
    let output = Command::new("git")
        .args([
            "-C",
            repo_path,
            "log",
            &range,
            "--pretty=format:%h|%s|%ci",
            "--max-count=20",
        ])
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;

    if !output.status.success() {
        // Branch may not exist yet or no commits — return empty
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits: Vec<CommitInfo> = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.len() == 3 {
                Some(CommitInfo {
                    hash: parts[0].to_string(),
                    message: parts[1].to_string(),
                    time: parts[2].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(commits)
}

fn get_diff_stats(
    repo_path: &str,
    base_branch: &str,
    feature_branch: &str,
) -> Result<(u32, u32, u32), String> {
    let range = format!("{}...{}", base_branch, feature_branch);
    let output = Command::new("git")
        .args(["-C", repo_path, "diff", "--shortstat", &range])
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_shortstat(&stdout))
}

/// Parse git diff --shortstat output like "3 files changed, 50 insertions(+), 10 deletions(-)"
pub fn parse_shortstat(output: &str) -> (u32, u32, u32) {
    let output = output.trim();
    if output.is_empty() {
        return (0, 0, 0);
    }

    let mut files = 0u32;
    let mut insertions = 0u32;
    let mut deletions = 0u32;

    for part in output.split(',') {
        let part = part.trim();
        if let Some(num_str) = part.split_whitespace().next() {
            if let Ok(num) = num_str.parse::<u32>() {
                if part.contains("file") {
                    files = num;
                } else if part.contains("insertion") {
                    insertions = num;
                } else if part.contains("deletion") {
                    deletions = num;
                }
            }
        }
    }

    (files, insertions, deletions)
}

fn get_changed_files(
    repo_path: &str,
    base_branch: &str,
    feature_branch: &str,
) -> Result<Vec<String>, String> {
    let range = format!("{}...{}", base_branch, feature_branch);
    let output = Command::new("git")
        .args(["-C", repo_path, "diff", "--name-only", &range])
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let files: Vec<String> = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect();

    Ok(files)
}

/// Check if execution might be complete by looking at the feature directory for signals.
pub fn check_completion_signal(repo_path: &str, feature_id: &str) -> bool {
    let signal_path = Path::new(repo_path)
        .join(".gmb")
        .join("features")
        .join(feature_id)
        .join("execution-complete");
    signal_path.exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_shortstat_typical() {
        let output = " 3 files changed, 50 insertions(+), 10 deletions(-)";
        let (files, ins, del) = parse_shortstat(output);
        assert_eq!(files, 3);
        assert_eq!(ins, 50);
        assert_eq!(del, 10);
    }

    #[test]
    fn parse_shortstat_insertions_only() {
        let output = " 1 file changed, 20 insertions(+)";
        let (files, ins, del) = parse_shortstat(output);
        assert_eq!(files, 1);
        assert_eq!(ins, 20);
        assert_eq!(del, 0);
    }

    #[test]
    fn parse_shortstat_deletions_only() {
        let output = " 2 files changed, 5 deletions(-)";
        let (files, ins, del) = parse_shortstat(output);
        assert_eq!(files, 2);
        assert_eq!(ins, 0);
        assert_eq!(del, 5);
    }

    #[test]
    fn parse_shortstat_empty() {
        let (files, ins, del) = parse_shortstat("");
        assert_eq!(files, 0);
        assert_eq!(ins, 0);
        assert_eq!(del, 0);
    }

    #[test]
    fn parse_shortstat_whitespace() {
        let (files, ins, del) = parse_shortstat("   \n  ");
        assert_eq!(files, 0);
        assert_eq!(ins, 0);
        assert_eq!(del, 0);
    }

    #[test]
    fn check_completion_signal_returns_false_for_missing() {
        let dir = tempfile::TempDir::new().unwrap();
        assert!(!check_completion_signal(
            &dir.path().to_string_lossy(),
            "nonexistent"
        ));
    }

    #[test]
    fn check_completion_signal_returns_true_when_exists() {
        let dir = tempfile::TempDir::new().unwrap();
        let signal_dir = dir
            .path()
            .join(".gmb")
            .join("features")
            .join("feat-1");
        std::fs::create_dir_all(&signal_dir).unwrap();
        std::fs::write(signal_dir.join("execution-complete"), "done").unwrap();
        assert!(check_completion_signal(
            &dir.path().to_string_lossy(),
            "feat-1"
        ));
    }

    #[test]
    fn commit_info_serializes() {
        let info = CommitInfo {
            hash: "abc1234".to_string(),
            message: "Add feature".to_string(),
            time: "2025-01-01 12:00:00 +0000".to_string(),
        };
        let json = serde_json::to_string(&info).unwrap();
        let parsed: CommitInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.hash, "abc1234");
        assert_eq!(parsed.message, "Add feature");
    }

    #[test]
    fn execution_snapshot_serializes() {
        let snapshot = ExecutionSnapshot {
            commit_count: 3,
            files_changed: 5,
            insertions: 100,
            deletions: 20,
            last_commit_message: "Fix tests".to_string(),
            last_commit_time: Some("2025-01-01 12:00:00 +0000".to_string()),
            recent_commits: vec![],
            active_files: vec!["src/main.rs".to_string()],
            timestamp: Utc::now(),
        };
        let json = serde_json::to_string(&snapshot).unwrap();
        let parsed: ExecutionSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.commit_count, 3);
        assert_eq!(parsed.files_changed, 5);
        assert_eq!(parsed.active_files, vec!["src/main.rs"]);
    }
}
