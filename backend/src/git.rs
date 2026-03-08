use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use wait_timeout::ChildExt;

#[derive(Debug)]
pub struct GitError(pub String);

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

type GitResult<T> = Result<T, GitError>;

fn run_git(repo_path: &str, args: &[&str]) -> GitResult<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| GitError(format!("Failed to run git: {}", e)))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(GitError(format!(
            "git {} failed: {}",
            args.join(" "),
            stderr
        )))
    }
}

fn run_git_with_timeout(repo_path: &str, args: &[&str], timeout: Duration) -> GitResult<String> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| GitError(format!("Failed to run git: {}", e)))?;

    match child.wait_timeout(timeout) {
        Ok(Some(status)) => {
            let stdout = child.stdout.take().map(|mut s| {
                let mut buf = Vec::new();
                std::io::Read::read_to_end(&mut s, &mut buf).ok();
                buf
            }).unwrap_or_default();
            let stderr = child.stderr.take().map(|mut s| {
                let mut buf = Vec::new();
                std::io::Read::read_to_end(&mut s, &mut buf).ok();
                buf
            }).unwrap_or_default();

            if status.success() {
                Ok(String::from_utf8_lossy(&stdout).trim().to_string())
            } else {
                let stderr_str = String::from_utf8_lossy(&stderr).trim().to_string();
                Err(GitError(format!("git {} failed: {}", args.join(" "), stderr_str)))
            }
        }
        Ok(None) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(GitError(format!(
                "git {} timed out after {}s",
                args.join(" "),
                timeout.as_secs()
            )))
        }
        Err(e) => Err(GitError(format!("Failed to wait for git: {}", e))),
    }
}

/// Create a branch from a base.
pub fn create_branch(repo_path: &str, branch: &str, base: &str) -> GitResult<()> {
    run_git(repo_path, &["branch", branch, base])?;
    Ok(())
}

/// Stage all changes and commit. Returns true if a commit was created,
/// false if there was nothing to commit.
pub fn commit_all(repo_path: &str, message: &str) -> GitResult<bool> {
    run_git(repo_path, &["add", "-A"])?;
    // Check if there's anything staged
    let status = run_git(repo_path, &["status", "--porcelain"])?;
    if status.is_empty() {
        return Ok(false);
    }
    run_git(repo_path, &["commit", "-m", message])?;
    Ok(true)
}

/// Checkout an existing branch.
pub fn checkout_branch(repo_path: &str, branch: &str) -> GitResult<()> {
    run_git(repo_path, &["checkout", branch])?;
    Ok(())
}

/// Merge a source branch into a target branch.
pub fn merge_branch(repo_path: &str, target: &str, source: &str) -> GitResult<String> {
    // Record the current branch so we can restore on failure
    let original_branch = get_current_branch(repo_path).ok();

    run_git(repo_path, &["checkout", target])?;
    let result = run_git(
        repo_path,
        &[
            "merge",
            source,
            "--no-ff",
            "-m",
            &format!("Merge {} into {}", source, target),
        ],
    );
    match result {
        Ok(output) => Ok(output),
        Err(e) => {
            // Abort the failed merge
            let _ = run_git(repo_path, &["merge", "--abort"]);
            // Restore original branch if we changed it
            if let Some(ref orig) = original_branch {
                if orig != target {
                    let _ = run_git(repo_path, &["checkout", orig]);
                }
            }
            Err(e)
        }
    }
}

/// Delete a local branch.
pub fn delete_branch(repo_path: &str, branch: &str) -> GitResult<()> {
    run_git(repo_path, &["branch", "-D", branch])?;
    Ok(())
}

/// Push a branch to origin.
pub fn push_branch(repo_path: &str, branch: &str) -> GitResult<String> {
    run_git(repo_path, &["push", "-u", "origin", branch])
}

pub fn get_current_branch(repo_path: &str) -> GitResult<String> {
    run_git(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
}

pub fn is_git_repo(path: &str) -> bool {
    run_git(path, &["rev-parse", "--git-dir"]).is_ok()
}

/// Get diff stats between two branches.
/// Returns a list of `(file_path, insertions, deletions)` tuples.
pub fn diff_stat(repo_path: &str, base: &str, head: &str) -> GitResult<Vec<(String, u32, u32)>> {
    // Use two-dot diff (base..head) to show all changes between the branches.
    // Also include uncommitted working tree changes with the HEAD of the feature branch.
    let committed = run_git(repo_path, &["diff", "--numstat", &format!("{}..{}", base, head)])?;
    let mut result = parse_numstat(&committed);

    // Include uncommitted changes (staged + unstaged) relative to HEAD
    let uncommitted = run_git(repo_path, &["diff", "--numstat", "HEAD"]).unwrap_or_default();
    let uncommitted_files = parse_numstat(&uncommitted);

    // Merge uncommitted changes — add to existing entries or append new ones
    for (path, ins, del) in uncommitted_files {
        if let Some(entry) = result.iter_mut().find(|(p, _, _)| *p == path) {
            entry.1 += ins;
            entry.2 += del;
        } else {
            result.push((path, ins, del));
        }
    }

    Ok(result)
}

/// Parse `git diff --numstat` output into `(file, insertions, deletions)` tuples.
pub fn parse_numstat(output: &str) -> Vec<(String, u32, u32)> {
    let mut files = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() == 3 {
            let ins = parts[0].parse::<u32>().unwrap_or(0);
            let del = parts[1].parse::<u32>().unwrap_or(0);
            files.push((parts[2].to_string(), ins, del));
        }
    }
    files
}

pub fn get_default_branch(repo_path: &str) -> GitResult<String> {
    for branch in &["main", "master"] {
        if run_git(repo_path, &["rev-parse", "--verify", branch]).is_ok() {
            return Ok(branch.to_string());
        }
    }
    get_current_branch(repo_path)
}

// ── Worktree Operations ──

/// Create a git worktree for the given branch.
/// Returns the path to the worktree directory.
/// The worktree is placed under `.gmb/worktrees/<feature_id>/<repo_name>/` inside the repo.
pub fn create_worktree(
    repo_path: &str,
    branch: &str,
    feature_id: &str,
    repo_name: &str,
) -> GitResult<PathBuf> {
    let worktree_base = Path::new(repo_path)
        .join(".gmb")
        .join("worktrees")
        .join(feature_id);
    std::fs::create_dir_all(&worktree_base)
        .map_err(|e| GitError(format!("Failed to create worktree dir: {}", e)))?;

    let worktree_path = worktree_base.join(repo_name);

    // If the worktree path already exists, try to reuse it
    if worktree_path.exists() {
        // Verify the worktree is valid by checking if .git exists
        if worktree_path.join(".git").exists() {
            // Update to latest branch state
            let _ = run_git(&worktree_path.to_string_lossy(), &["checkout", branch]);
            return Ok(worktree_path);
        }
        // Invalid worktree — remove and recreate
        let _ = std::fs::remove_dir_all(&worktree_path);
        // Also prune stale worktree refs
        let _ = run_git(repo_path, &["worktree", "prune"]);
    }

    run_git(
        repo_path,
        &[
            "worktree",
            "add",
            &worktree_path.to_string_lossy(),
            branch,
        ],
    )?;

    Ok(worktree_path)
}

/// Remove a git worktree.
pub fn remove_worktree(repo_path: &str, worktree_path: &str) -> GitResult<()> {
    run_git(repo_path, &["worktree", "remove", worktree_path, "--force"])?;
    Ok(())
}

/// Remove all worktrees for a feature.
pub fn cleanup_feature_worktrees(repo_path: &str, feature_id: &str) -> GitResult<()> {
    let worktree_dir = Path::new(repo_path)
        .join(".gmb")
        .join("worktrees")
        .join(feature_id);
    if worktree_dir.exists() {
        // List subdirectories and remove each worktree
        if let Ok(entries) = std::fs::read_dir(&worktree_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let _ = remove_worktree(repo_path, &entry.path().to_string_lossy());
                }
            }
        }
        let _ = std::fs::remove_dir_all(&worktree_dir);
    }
    // Prune stale worktree references
    let _ = run_git(repo_path, &["worktree", "prune"]);
    Ok(())
}

/// List existing worktrees for a repo.
pub fn list_worktrees(repo_path: &str) -> GitResult<Vec<String>> {
    let output = run_git(repo_path, &["worktree", "list", "--porcelain"])?;
    let paths: Vec<String> = output
        .lines()
        .filter_map(|line| line.strip_prefix("worktree ").map(|s| s.to_string()))
        .collect();
    Ok(paths)
}

/// Get the worktree path for a feature+repo if it exists.
pub fn get_worktree_path(repo_path: &str, feature_id: &str, repo_name: &str) -> Option<PathBuf> {
    let worktree_path = Path::new(repo_path)
        .join(".gmb")
        .join("worktrees")
        .join(feature_id)
        .join(repo_name);
    if worktree_path.exists() && worktree_path.join(".git").exists() {
        Some(worktree_path)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn init_test_repo(dir: &TempDir) -> String {
        let path = dir.path().to_string_lossy().to_string();
        run_git_raw(&path, &["init", "-b", "main"]);
        run_git_raw(&path, &["config", "user.email", "test@test.com"]);
        run_git_raw(&path, &["config", "user.name", "Test"]);
        run_git_raw(&path, &["config", "commit.gpgsign", "false"]);
        // Create initial commit so branches work
        std::fs::write(dir.path().join("README.md"), "# Test").unwrap();
        run_git_raw(&path, &["add", "."]);
        run_git_raw(&path, &["commit", "-m", "init"]);
        path
    }

    fn run_git_raw(path: &str, args: &[&str]) {
        let output = Command::new("git")
            .arg("-C")
            .arg(path)
            .args(args)
            .output()
            .expect("git command failed");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("git {} failed: {}", args.join(" "), stderr);
        }
    }

    #[test]
    fn parse_numstat_basic() {
        let output = "10\t2\tsrc/main.rs\n5\t0\tsrc/lib.rs\n";
        let result = parse_numstat(output);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], ("src/main.rs".to_string(), 10, 2));
        assert_eq!(result[1], ("src/lib.rs".to_string(), 5, 0));
    }

    #[test]
    fn parse_numstat_binary_files() {
        let output = "-\t-\timage.png\n3\t1\tREADME.md\n";
        let result = parse_numstat(output);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], ("image.png".to_string(), 0, 0));
        assert_eq!(result[1], ("README.md".to_string(), 3, 1));
    }

    #[test]
    fn parse_numstat_empty() {
        let result = parse_numstat("");
        assert!(result.is_empty());
    }

    #[test]
    fn create_and_remove_worktree() {
        let dir = TempDir::new().unwrap();
        let repo_path = init_test_repo(&dir);

        // Create a feature branch
        create_branch(&repo_path, "feature/test-wt", "HEAD").unwrap();

        // Create worktree
        let wt_path = create_worktree(&repo_path, "feature/test-wt", "feat-123", "myrepo").unwrap();
        assert!(wt_path.exists());
        assert!(wt_path.join(".git").exists());
        assert!(wt_path.join("README.md").exists());

        // get_worktree_path should find it
        let found = get_worktree_path(&repo_path, "feat-123", "myrepo");
        assert!(found.is_some());
        assert_eq!(found.unwrap(), wt_path);

        // Cleanup
        cleanup_feature_worktrees(&repo_path, "feat-123").unwrap();
        assert!(!wt_path.exists());
    }

    #[test]
    fn create_worktree_reuses_existing() {
        let dir = TempDir::new().unwrap();
        let repo_path = init_test_repo(&dir);
        create_branch(&repo_path, "feature/reuse-wt", "HEAD").unwrap();

        let wt1 = create_worktree(&repo_path, "feature/reuse-wt", "feat-456", "myrepo").unwrap();
        let wt2 = create_worktree(&repo_path, "feature/reuse-wt", "feat-456", "myrepo").unwrap();
        assert_eq!(wt1, wt2);

        cleanup_feature_worktrees(&repo_path, "feat-456").unwrap();
    }

    #[test]
    fn list_worktrees_includes_main_and_added() {
        let dir = TempDir::new().unwrap();
        let repo_path = init_test_repo(&dir);
        create_branch(&repo_path, "feature/list-wt", "HEAD").unwrap();

        let wts_before = list_worktrees(&repo_path).unwrap();
        assert!(!wts_before.is_empty()); // At least the main worktree

        create_worktree(&repo_path, "feature/list-wt", "feat-789", "myrepo").unwrap();
        let wts_after = list_worktrees(&repo_path).unwrap();
        assert_eq!(wts_after.len(), wts_before.len() + 1);

        cleanup_feature_worktrees(&repo_path, "feat-789").unwrap();
    }

    #[test]
    fn get_worktree_path_returns_none_for_missing() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_string_lossy().to_string();
        assert!(get_worktree_path(&repo_path, "nonexistent", "repo").is_none());
    }

    #[test]
    fn merge_branch_restores_on_failure() {
        let dir = TempDir::new().unwrap();
        let repo_path = init_test_repo(&dir);

        // Create two branches with conflicting changes
        create_branch(&repo_path, "branch-a", "HEAD").unwrap();
        create_branch(&repo_path, "branch-b", "HEAD").unwrap();

        checkout_branch(&repo_path, "branch-a").unwrap();
        std::fs::write(dir.path().join("conflict.txt"), "content-a").unwrap();
        run_git_raw(&repo_path, &["add", "."]);
        run_git_raw(&repo_path, &["commit", "-m", "change a"]);

        checkout_branch(&repo_path, "branch-b").unwrap();
        std::fs::write(dir.path().join("conflict.txt"), "content-b").unwrap();
        run_git_raw(&repo_path, &["add", "."]);
        run_git_raw(&repo_path, &["commit", "-m", "change b"]);

        // Try to merge — should fail with conflict
        let result = merge_branch(&repo_path, "branch-a", "branch-b");
        assert!(result.is_err());

        // Repo should not be in a broken merge state
        let status = run_git(&repo_path, &["status", "--porcelain"]).unwrap();
        assert!(!status.contains("UU"), "Repo should not have unmerged files");
    }

    #[test]
    fn run_git_with_timeout_succeeds() {
        let dir = TempDir::new().unwrap();
        let repo_path = init_test_repo(&dir);
        let result = run_git_with_timeout(&repo_path, &["status"], Duration::from_secs(10));
        assert!(result.is_ok());
    }
}
