use std::fs;
use std::path::Path;

/// Write a CLAUDE.md into a task worktree so Claude Code picks it up automatically.
pub fn generate_task_claude_md(
    worktree_path: &str,
    title: &str,
    description: &str,
    acceptance_criteria: &[String],
    validators: &[String],
) -> Result<(), String> {
    let criteria_text = if acceptance_criteria.is_empty() {
        "- Complete the task as described above".to_string()
    } else {
        acceptance_criteria
            .iter()
            .map(|c| format!("- {}", c))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let validators_text = if validators.is_empty() {
        "No validators configured.".to_string()
    } else {
        validators
            .iter()
            .map(|v| format!("- `{}`", v))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let content = format!(
        r#"# Current Task: {title}

{description}

## Acceptance Criteria

{criteria_text}

## Validators

{validators_text}

## Working Directory

This is a git worktree managed by Goblin Mob Boss.
Commit your changes here. Do not modify files outside this worktree.
"#,
        title = title,
        description = description,
        criteria_text = criteria_text,
        validators_text = validators_text,
    );

    // Write to .gmb/CLAUDE.md
    let gmb_dir = Path::new(worktree_path).join(".gmb");
    let _ = fs::create_dir_all(&gmb_dir);
    fs::write(gmb_dir.join("CLAUDE.md"), content)
        .map_err(|e| format!("Failed to write .gmb/CLAUDE.md: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn generates_claude_md_with_criteria_and_validators() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        let result = generate_task_claude_md(
            &worktree,
            "Add login page",
            "Create a login page with form validation",
            &["Form validates email".to_string(), "Shows error on failure".to_string()],
            &["npm test".to_string(), "npm run lint".to_string()],
        );
        assert!(result.is_ok());

        let content = fs::read_to_string(dir.path().join(".gmb").join("CLAUDE.md")).unwrap();
        assert!(content.contains("# Current Task: Add login page"));
        assert!(content.contains("Create a login page with form validation"));
        assert!(content.contains("- Form validates email"));
        assert!(content.contains("- Shows error on failure"));
        assert!(content.contains("- `npm test`"));
        assert!(content.contains("- `npm run lint`"));
        assert!(content.contains("git worktree managed by Goblin Mob Boss"));
    }

    #[test]
    fn generates_default_criteria_when_empty() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        generate_task_claude_md(&worktree, "Task", "Do something", &[], &[]).unwrap();

        let content = fs::read_to_string(dir.path().join(".gmb").join("CLAUDE.md")).unwrap();
        assert!(content.contains("- Complete the task as described above"));
        assert!(content.contains("No validators configured."));
    }

    #[test]
    fn creates_gmb_directory_if_missing() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().to_string_lossy().to_string();

        assert!(!dir.path().join(".gmb").exists());
        generate_task_claude_md(&worktree, "T", "D", &[], &[]).unwrap();
        assert!(dir.path().join(".gmb").join("CLAUDE.md").exists());
    }
}
