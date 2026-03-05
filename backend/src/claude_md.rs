use std::fs;
use std::path::Path;

/// Write task context to `.gmb/CLAUDE.md`.
///
/// This file lives inside the `.gmb/` directory — we never touch the
/// repo's own CLAUDE.md. The prompt passed to Claude Code tells it
/// to read this file for context.
pub fn generate_claude_md(
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
        "No validators configured. Use your best judgement.".to_string()
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

These commands must pass before the task is considered done:

{validators_text}

## Working Directory

This is a git worktree managed by Goblin Mob Boss.
Commit your changes here. Do not modify files outside this worktree.

## Instructions

1. Read the task description and acceptance criteria carefully.
2. Explore the codebase as needed to understand the relevant code.
3. Implement the change with minimal, focused edits.
4. Follow existing code style and patterns.
5. Ensure all validators pass before considering the task done.
6. Commit your changes with a clear message describing what you did.
"#,
        title = title,
        description = description,
        criteria_text = criteria_text,
        validators_text = validators_text,
    );

    let gmb_claude_md = Path::new(worktree_path).join(".gmb").join("CLAUDE.md");
    fs::write(&gmb_claude_md, content)
        .map_err(|e| format!("Failed to write .gmb/CLAUDE.md: {}", e))
}
