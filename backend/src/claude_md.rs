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
