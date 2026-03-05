use std::path::Path;
use std::process::Command;

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

pub fn create_worktree(
    repo_path: &str,
    branch: &str,
    worktree_path: &str,
    base_branch: &str,
) -> GitResult<()> {
    if let Some(parent) = Path::new(worktree_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| GitError(format!("Failed to create worktree dir: {}", e)))?;
    }
    run_git(
        repo_path,
        &["worktree", "add", "-b", branch, worktree_path, base_branch],
    )?;
    Ok(())
}

pub fn remove_worktree(repo_path: &str, worktree_path: &str) -> GitResult<()> {
    let _ = run_git(repo_path, &["worktree", "remove", worktree_path, "--force"]);
    let _ = run_git(repo_path, &["worktree", "prune"]);
    Ok(())
}

/// Create a branch (not a worktree) from a base.
pub fn create_branch(repo_path: &str, branch: &str, base: &str) -> GitResult<()> {
    run_git(repo_path, &["branch", branch, base])?;
    Ok(())
}

/// Merge a source branch into a target branch.
pub fn merge_branch(repo_path: &str, target: &str, source: &str) -> GitResult<String> {
    // Checkout target
    run_git(repo_path, &["checkout", target])?;
    // Merge source
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
            // Abort merge on conflict
            let _ = run_git(repo_path, &["merge", "--abort"]);
            Err(e)
        }
    }
}

/// Push a branch to origin.
pub fn push_branch(repo_path: &str, branch: &str) -> GitResult<String> {
    run_git(repo_path, &["push", "-u", "origin", branch])
}

pub fn get_current_branch(repo_path: &str) -> GitResult<String> {
    run_git(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
}

pub fn grep_files(repo_path: &str, keywords: &[&str]) -> GitResult<Vec<String>> {
    let mut all_files = Vec::new();
    for keyword in keywords {
        if let Ok(output) = run_git(repo_path, &["grep", "-l", keyword]) {
            for line in output.lines() {
                let file = line.to_string();
                if !all_files.contains(&file) {
                    all_files.push(file);
                }
            }
        }
    }
    Ok(all_files)
}

pub fn is_git_repo(path: &str) -> bool {
    run_git(path, &["rev-parse", "--git-dir"]).is_ok()
}

pub fn has_commits_beyond_base(worktree_path: &str, base_branch: &str) -> bool {
    run_git(
        worktree_path,
        &["log", &format!("{}..HEAD", base_branch), "--oneline"],
    )
    .map(|output| !output.is_empty())
    .unwrap_or(false)
}

pub fn get_default_branch(repo_path: &str) -> GitResult<String> {
    for branch in &["main", "master"] {
        if run_git(repo_path, &["rev-parse", "--verify", branch]).is_ok() {
            return Ok(branch.to_string());
        }
    }
    get_current_branch(repo_path)
}
