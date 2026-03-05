use std::fs;
use std::path::Path;

const GMB_SECTION_START: &str = "\n<!-- GMB:TASK-CONTEXT:START -->\n";
const GMB_SECTION_END: &str = "\n<!-- GMB:TASK-CONTEXT:END -->\n";

/// Add task context to the worktree's CLAUDE.md.
///
/// If a CLAUDE.md already exists (inherited from the repo), we append
/// our task section using HTML comment delimiters so it's clearly
/// separated and can be cleaned up later.
///
/// If no CLAUDE.md exists, we create one with just the task context.
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

    let task_section = format!(
        r#"
# Current Task: {title}

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

    let claude_md_path = Path::new(worktree_path).join("CLAUDE.md");
    let delimited_section = format!("{}{}{}", GMB_SECTION_START, task_section, GMB_SECTION_END);

    if claude_md_path.exists() {
        // Existing CLAUDE.md — read it, strip any old GMB section, append new one
        let existing = fs::read_to_string(&claude_md_path)
            .map_err(|e| format!("Failed to read existing CLAUDE.md: {}", e))?;

        let cleaned = strip_gmb_section(&existing);
        let updated = format!("{}{}", cleaned.trim_end(), delimited_section);

        fs::write(&claude_md_path, updated)
            .map_err(|e| format!("Failed to update CLAUDE.md: {}", e))
    } else {
        // No existing CLAUDE.md — create with just the task context
        fs::write(&claude_md_path, delimited_section)
            .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))
    }
}

/// Remove any existing GMB task section from CLAUDE.md content.
fn strip_gmb_section(content: &str) -> String {
    if let Some(start_idx) = content.find(GMB_SECTION_START) {
        if let Some(end_marker_idx) = content.find(GMB_SECTION_END) {
            let end_idx = end_marker_idx + GMB_SECTION_END.len();
            let mut result = content[..start_idx].to_string();
            result.push_str(&content[end_idx..]);
            return result;
        }
    }
    content.to_string()
}
