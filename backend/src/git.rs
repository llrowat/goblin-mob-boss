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
            let stdout = child
                .stdout
                .take()
                .map(|mut s| {
                    let mut buf = Vec::new();
                    std::io::Read::read_to_end(&mut s, &mut buf).ok();
                    buf
                })
                .unwrap_or_default();
            let stderr = child
                .stderr
                .take()
                .map(|mut s| {
                    let mut buf = Vec::new();
                    std::io::Read::read_to_end(&mut s, &mut buf).ok();
                    buf
                })
                .unwrap_or_default();

            if status.success() {
                Ok(String::from_utf8_lossy(&stdout).trim().to_string())
            } else {
                let stderr_str = String::from_utf8_lossy(&stderr).trim().to_string();
                Err(GitError(format!(
                    "git {} failed: {}",
                    args.join(" "),
                    stderr_str
                )))
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

/// Sanitize a string for use as a git branch name component.
///
/// Git branch names must follow `git check-ref-format` rules:
/// - No double dots (..), ASCII control chars, space, ~, ^, :, ?, *, [, \
/// - Cannot begin or end with a dot or hyphen
/// - Cannot end with `.lock`
/// - Cannot contain `@{`
/// - Cannot be empty
pub fn sanitize_branch_name(slug: &str) -> String {
    let sanitized: String = slug
        .chars()
        .map(|c| match c {
            ' ' | '~' | '^' | ':' | '?' | '*' | '[' | '\\' | '@' => '-',
            c if c.is_ascii_control() => '-',
            c => c,
        })
        .collect();

    // Collapse consecutive dots and hyphens
    let mut result = String::with_capacity(sanitized.len());
    let mut prev = '\0';
    for c in sanitized.chars() {
        if (c == '.' && prev == '.') || (c == '-' && prev == '-') {
            continue;
        }
        result.push(c);
        prev = c;
    }

    // Trim leading/trailing dots and hyphens
    let result = result.trim_matches(|c| c == '.' || c == '-').to_string();

    // Strip `.lock` suffix
    let result = if result.ends_with(".lock") {
        result[..result.len() - 5].to_string()
    } else {
        result
    };

    if result.is_empty() {
        "unnamed".to_string()
    } else {
        result
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

/// Build a descriptive commit message from the staged changes and feature context.
///
/// Format: `chore(feature-slug): finalize <feature_name>\n\n<summary of changes>`
pub fn build_commit_message(repo_path: &str, feature_name: &str) -> String {
    let summary = match summarize_staged_changes(repo_path) {
        Some(s) => format!("\n\n{}", s),
        None => String::new(),
    };
    format!("chore: finalize {}{}", feature_name, summary)
}

/// Summarize staged/uncommitted changes for use in a commit message body.
/// Returns None if there are no changes to summarize.
fn summarize_staged_changes(repo_path: &str) -> Option<String> {
    let status = run_git(repo_path, &["status", "--porcelain"]).ok()?;
    if status.is_empty() {
        return None;
    }

    let mut added = Vec::new();
    let mut modified = Vec::new();
    let mut deleted = Vec::new();

    for line in status.lines() {
        if line.len() < 3 {
            continue;
        }
        let code = &line[..2];
        let path = line[3..].trim().to_string();
        // Strip quotes from paths with special characters
        let path = path.trim_matches('"').to_string();

        match code.trim() {
            "A" | "??" => added.push(path),
            "M" | "MM" | "AM" => modified.push(path),
            "D" => deleted.push(path),
            "R" | "RM" => {
                // Renames show as "old -> new"
                if let Some(new_path) = path.split(" -> ").last() {
                    modified.push(new_path.to_string());
                }
            }
            _ => modified.push(path),
        }
    }

    let mut parts = Vec::new();
    if !added.is_empty() {
        parts.push(format_file_list("Add", &added));
    }
    if !modified.is_empty() {
        parts.push(format_file_list("Update", &modified));
    }
    if !deleted.is_empty() {
        parts.push(format_file_list("Remove", &deleted));
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n"))
    }
}

/// Format a list of files into a commit message line, truncating if too many.
fn format_file_list(verb: &str, files: &[String]) -> String {
    const MAX_LISTED: usize = 5;
    let names: Vec<&str> = files
        .iter()
        .take(MAX_LISTED)
        .map(|p| {
            // Use just the filename for brevity
            p.rsplit('/').next().unwrap_or(p)
        })
        .collect();

    let remainder = files.len().saturating_sub(MAX_LISTED);
    if remainder > 0 {
        format!("{} {} (+{} more)", verb, names.join(", "), remainder)
    } else {
        format!("{} {}", verb, names.join(", "))
    }
}

/// Validate that a commit message matches a regex pattern.
/// Returns Ok(()) if the pattern is None or the message matches.
/// Returns Err with a descriptive message if the message doesn't match.
pub fn validate_commit_message(message: &str, pattern: Option<&str>) -> GitResult<()> {
    if let Some(pat) = pattern {
        let re = regex::Regex::new(pat)
            .map_err(|e| GitError(format!("Invalid commit pattern regex: {}", e)))?;
        // Test against just the first line (subject) of the commit message
        let subject = message.lines().next().unwrap_or(message);
        if !re.is_match(subject) {
            return Err(GitError(format!(
                "Commit message does not match required pattern `{}`:\n  {}",
                pat, subject
            )));
        }
    }
    Ok(())
}

/// Try to detect a commit message convention from a repository.
/// Checks config files first, then falls back to analyzing recent commit history.
pub fn detect_commit_pattern(repo_path: &str) -> Option<String> {
    let root = Path::new(repo_path);

    // 1. Check for commitlint config files (indicates conventional commits)
    let commitlint_files = [
        "commitlint.config.js",
        "commitlint.config.cjs",
        "commitlint.config.mjs",
        "commitlint.config.ts",
        ".commitlintrc",
        ".commitlintrc.js",
        ".commitlintrc.json",
        ".commitlintrc.yml",
        ".commitlintrc.yaml",
    ];
    for file in &commitlint_files {
        if root.join(file).exists() {
            // commitlint with conventional config is the most common setup
            return Some(
                r"^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+"
                    .to_string(),
            );
        }
    }

    // Also check package.json for commitlint in devDependencies
    let pkg_json_path = root.join("package.json");
    if pkg_json_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&pkg_json_path) {
            if content.contains("commitlint") || content.contains("@commitlint") {
                return Some(r"^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+".to_string());
            }
        }
    }

    // 2. Analyze recent commit messages to infer a pattern
    infer_commit_pattern_from_history(repo_path)
}

/// Analyze recent git log messages to detect if a conventional-style pattern is used.
fn infer_commit_pattern_from_history(repo_path: &str) -> Option<String> {
    let log_output = run_git(repo_path, &["log", "--oneline", "--no-merges", "-50"]).ok()?;
    let lines: Vec<&str> = log_output.lines().collect();
    if lines.len() < 5 {
        return None; // Not enough history to infer
    }

    // Strip the short hash prefix from each line (e.g. "abc1234 feat: do thing" -> "feat: do thing")
    let subjects: Vec<&str> = lines
        .iter()
        .filter_map(|line| line.split_once(' ').map(|(_, msg)| msg))
        .collect();

    if subjects.is_empty() {
        return None;
    }

    // Check for conventional commits pattern: type(scope)?: description
    let conventional_re = regex::Regex::new(
        r"^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+",
    )
    .ok()?;
    let conventional_matches = subjects
        .iter()
        .filter(|s| conventional_re.is_match(s))
        .count();
    let ratio = conventional_matches as f64 / subjects.len() as f64;

    if ratio >= 0.6 {
        // Majority of commits follow conventional commits
        return Some(
            r"^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+"
                .to_string(),
        );
    }

    // Check for simpler "type: description" pattern (e.g. "fix: thing", "add: thing")
    let simple_type_re = regex::Regex::new(r"^[a-z]+: .+").ok()?;
    let simple_matches = subjects
        .iter()
        .filter(|s| simple_type_re.is_match(s))
        .count();
    let simple_ratio = simple_matches as f64 / subjects.len() as f64;

    if simple_ratio >= 0.6 {
        // Collect the actual types used
        let type_re = regex::Regex::new(r"^([a-z]+): ").ok()?;
        let mut types: Vec<String> = subjects
            .iter()
            .filter_map(|s| type_re.captures(s).map(|c| c[1].to_string()))
            .collect();
        types.sort();
        types.dedup();
        if !types.is_empty() {
            let types_pattern = types.join("|");
            return Some(format!("^({}): .+", types_pattern));
        }
    }

    None
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
/// Returns `(path, insertions, deletions, status)` where status is "added", "modified", or "deleted".
pub fn diff_stat(
    repo_path: &str,
    base: &str,
    head: &str,
) -> GitResult<Vec<(String, u32, u32, String)>> {
    let diff_range = format!("{}..{}", base, head);

    // Get numstat for insertion/deletion counts
    let committed = run_git(repo_path, &["diff", "--numstat", &diff_range])?;
    let numstat = parse_numstat(&committed);

    // Get name-status for add/modify/delete classification
    let name_status_out =
        run_git(repo_path, &["diff", "--name-status", &diff_range]).unwrap_or_default();
    let statuses = parse_name_status(&name_status_out);

    // Merge: numstat provides counts, name-status provides classification
    let mut result: Vec<(String, u32, u32, String)> = numstat
        .into_iter()
        .map(|(path, ins, del)| {
            let status = statuses
                .iter()
                .find(|(p, _)| *p == path)
                .map(|(_, s)| s.clone())
                .unwrap_or_else(|| "modified".to_string());
            (path, ins, del, status)
        })
        .collect();

    // Include uncommitted changes (staged + unstaged) relative to HEAD
    let uncommitted = run_git(repo_path, &["diff", "--numstat", "HEAD"]).unwrap_or_default();
    let uncommitted_files = parse_numstat(&uncommitted);
    let uncommitted_status =
        run_git(repo_path, &["diff", "--name-status", "HEAD"]).unwrap_or_default();
    let uncommitted_statuses = parse_name_status(&uncommitted_status);

    for (path, ins, del) in uncommitted_files {
        if let Some(entry) = result.iter_mut().find(|(p, _, _, _)| *p == path) {
            entry.1 += ins;
            entry.2 += del;
        } else {
            let status = uncommitted_statuses
                .iter()
                .find(|(p, _)| *p == path)
                .map(|(_, s)| s.clone())
                .unwrap_or_else(|| "modified".to_string());
            result.push((path, ins, del, status));
        }
    }

    Ok(result)
}

/// Parse `git diff --name-status` output into `(path, status)` pairs.
fn parse_name_status(output: &str) -> Vec<(String, String)> {
    output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                let status = match parts[0].chars().next() {
                    Some('A') => "added",
                    Some('D') => "deleted",
                    Some('R') => "added", // rename — treat destination as added
                    _ => "modified",
                };
                // For renames, use the destination path (last element)
                let path = parts.last().unwrap();
                Some((path.to_string(), status.to_string()))
            } else {
                None
            }
        })
        .collect()
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

/// Check if a git repo is empty (has no commits).
pub fn is_repo_empty(repo_path: &str) -> bool {
    run_git(repo_path, &["rev-parse", "HEAD"]).is_err()
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
        &["worktree", "add", &worktree_path.to_string_lossy(), branch],
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
    fn is_repo_empty_true_for_no_commits() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_string_lossy().to_string();
        run_git_raw(&path, &["init", "-b", "main"]);
        assert!(is_repo_empty(&path));
    }

    #[test]
    fn is_repo_empty_false_after_commit() {
        let dir = TempDir::new().unwrap();
        let path = init_test_repo(&dir);
        assert!(!is_repo_empty(&path));
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
        assert!(
            !status.contains("UU"),
            "Repo should not have unmerged files"
        );
    }

    #[test]
    fn run_git_with_timeout_succeeds() {
        let dir = TempDir::new().unwrap();
        let repo_path = init_test_repo(&dir);
        let result = run_git_with_timeout(&repo_path, &["status"], Duration::from_secs(10));
        assert!(result.is_ok());
    }

    // ── sanitize_branch_name tests ──

    #[test]
    fn sanitize_branch_name_passes_clean_names_through() {
        assert_eq!(sanitize_branch_name("my-feature"), "my-feature");
        assert_eq!(sanitize_branch_name("add-login-page"), "add-login-page");
    }

    #[test]
    fn sanitize_branch_name_replaces_forbidden_chars() {
        assert_eq!(sanitize_branch_name("has space"), "has-space");
        assert_eq!(sanitize_branch_name("with~tilde"), "with-tilde");
        assert_eq!(sanitize_branch_name("with^caret"), "with-caret");
        assert_eq!(sanitize_branch_name("with:colon"), "with-colon");
        assert_eq!(sanitize_branch_name("with?mark"), "with-mark");
        assert_eq!(sanitize_branch_name("with*star"), "with-star");
        assert_eq!(sanitize_branch_name("with[bracket"), "with-bracket");
        assert_eq!(sanitize_branch_name("with\\backslash"), "with-backslash");
    }

    #[test]
    fn sanitize_branch_name_collapses_consecutive_dots_and_hyphens() {
        assert_eq!(sanitize_branch_name("a..b"), "a.b");
        assert_eq!(sanitize_branch_name("a--b"), "a-b");
        assert_eq!(sanitize_branch_name("a...b"), "a.b");
    }

    #[test]
    fn sanitize_branch_name_trims_leading_trailing_dots_and_hyphens() {
        assert_eq!(sanitize_branch_name(".leading"), "leading");
        assert_eq!(sanitize_branch_name("trailing."), "trailing");
        assert_eq!(sanitize_branch_name("-leading"), "leading");
        assert_eq!(sanitize_branch_name("trailing-"), "trailing");
        assert_eq!(sanitize_branch_name("--both--"), "both");
    }

    #[test]
    fn sanitize_branch_name_strips_lock_suffix() {
        assert_eq!(sanitize_branch_name("feature.lock"), "feature");
    }

    #[test]
    fn sanitize_branch_name_returns_unnamed_for_empty() {
        assert_eq!(sanitize_branch_name(""), "unnamed");
        assert_eq!(sanitize_branch_name("---"), "unnamed");
        assert_eq!(sanitize_branch_name("..."), "unnamed");
    }

    // ── validate_commit_message tests ──

    #[test]
    fn validate_commit_message_passes_when_no_pattern() {
        assert!(validate_commit_message("any message", None).is_ok());
    }

    #[test]
    fn validate_commit_message_passes_matching_pattern() {
        let pattern = r"^(feat|fix|chore)\(.+\): .+";
        assert!(validate_commit_message("feat(auth): add login", Some(pattern)).is_ok());
        assert!(validate_commit_message("fix(ui): button color", Some(pattern)).is_ok());
    }

    #[test]
    fn validate_commit_message_fails_non_matching_pattern() {
        let pattern = r"^(feat|fix|chore)\(.+\): .+";
        let result = validate_commit_message("random message", Some(pattern));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("does not match"));
    }

    #[test]
    fn validate_commit_message_checks_only_subject_line() {
        let pattern = r"^feat: .+";
        // Subject matches, body doesn't — should pass
        let msg = "feat: add feature\n\nThis body doesn't match the pattern";
        assert!(validate_commit_message(msg, Some(pattern)).is_ok());
    }

    #[test]
    fn validate_commit_message_rejects_invalid_regex() {
        let result = validate_commit_message("test", Some("[invalid"));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Invalid commit pattern regex"));
    }

    // ── detect_commit_pattern tests ──

    #[test]
    fn detect_commit_pattern_returns_none_for_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        // Initialize a git repo with no commits and no config files
        Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let result = detect_commit_pattern(dir.path().to_str().unwrap());
        assert!(result.is_none());
    }

    #[test]
    fn detect_commit_pattern_from_commitlint_config() {
        let dir = tempfile::tempdir().unwrap();
        Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        // Create a commitlint config file
        std::fs::write(
            dir.path().join("commitlint.config.js"),
            "module.exports = { extends: ['@commitlint/config-conventional'] };",
        )
        .unwrap();
        let result = detect_commit_pattern(dir.path().to_str().unwrap());
        assert!(result.is_some());
        let pattern = result.unwrap();
        assert!(pattern.contains("feat"));
        assert!(pattern.contains("fix"));
    }

    #[test]
    fn detect_commit_pattern_from_package_json_commitlint() {
        let dir = tempfile::tempdir().unwrap();
        Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"devDependencies": {"@commitlint/cli": "^17.0.0"}}"#,
        )
        .unwrap();
        let result = detect_commit_pattern(dir.path().to_str().unwrap());
        assert!(result.is_some());
    }

    #[test]
    fn detect_commit_pattern_from_conventional_history() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(dir.path())
            .output()
            .unwrap();

        // Create 10 conventional commits
        for i in 0..10 {
            let filename = format!("file{}.txt", i);
            std::fs::write(dir.path().join(&filename), format!("content {}", i)).unwrap();
            Command::new("git")
                .args(["add", &filename])
                .current_dir(dir.path())
                .output()
                .unwrap();
            let msg = if i % 2 == 0 {
                format!("feat: add feature {}", i)
            } else {
                format!("fix: fix bug {}", i)
            };
            Command::new("git")
                .args(["commit", "-m", &msg])
                .current_dir(dir.path())
                .output()
                .unwrap();
        }

        let result = detect_commit_pattern(path);
        assert!(result.is_some());
        let pattern = result.unwrap();
        assert!(pattern.contains("feat"));
        assert!(pattern.contains("fix"));
    }

    #[test]
    fn detect_commit_pattern_returns_none_for_random_messages() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(dir.path())
            .output()
            .unwrap();

        // Create commits with random messages (no pattern)
        let messages = [
            "Initial commit",
            "Update readme",
            "Add some stuff",
            "WIP",
            "More changes",
            "Fix typo",
            "Cleanup",
            "Final version",
            "Done",
            "Ready for review",
        ];
        for (i, msg) in messages.iter().enumerate() {
            let filename = format!("file{}.txt", i);
            std::fs::write(dir.path().join(&filename), format!("content {}", i)).unwrap();
            Command::new("git")
                .args(["add", &filename])
                .current_dir(dir.path())
                .output()
                .unwrap();
            Command::new("git")
                .args(["commit", "-m", msg])
                .current_dir(dir.path())
                .output()
                .unwrap();
        }

        let result = detect_commit_pattern(path);
        assert!(result.is_none());
    }

    // ── build_commit_message / summarize tests ──

    #[test]
    fn build_commit_message_includes_feature_name() {
        let dir = TempDir::new().unwrap();
        let repo_path = init_test_repo(&dir);
        let msg = build_commit_message(&repo_path, "dark mode toggle");
        assert!(msg.starts_with("chore: finalize dark mode toggle"));
    }

    #[test]
    fn build_commit_message_includes_file_summary_when_changes_exist() {
        let dir = TempDir::new().unwrap();
        let repo_path = init_test_repo(&dir);

        // Create a new file so there are uncommitted changes
        std::fs::write(dir.path().join("new_file.rs"), "fn main() {}").unwrap();

        let msg = build_commit_message(&repo_path, "add feature");
        assert!(msg.contains("chore: finalize add feature"));
        assert!(
            msg.contains("new_file.rs"),
            "should list changed file: {}",
            msg
        );
    }

    #[test]
    fn format_file_list_truncates_long_lists() {
        let files: Vec<String> = (0..8).map(|i| format!("src/file{}.rs", i)).collect();
        let result = format_file_list("Update", &files);
        assert!(result.contains("(+3 more)"));
        assert!(result.starts_with("Update "));
    }

    #[test]
    fn format_file_list_shows_all_when_short() {
        let files = vec!["a.rs".to_string(), "b.rs".to_string()];
        let result = format_file_list("Add", &files);
        assert_eq!(result, "Add a.rs, b.rs");
    }
}
