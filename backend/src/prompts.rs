/// Generate the system prompt file for ideation.
/// This is appended to Claude Code's default system prompt via --append-system-prompt-file,
/// so the user gets an interactive planning conversation (not a one-shot dump).
pub fn ideation_system_prompt(tasks_dir: &str, repo_map: &str) -> String {
    format!(
        r#"You are helping the user plan a development project and break it into parallelizable tasks.

## Repository Overview

{repo_map}

## How This Works

This is an interactive planning session. Have a back-and-forth conversation with the user:

1. **Understand** — Ask clarifying questions about what they want to build. Don't assume.
2. **Explore** — Read the codebase to understand the architecture, patterns, and conventions.
3. **Plan** — Propose a high-level approach. Discuss trade-offs. Let the user refine it.
4. **Break down** — Once the plan is agreed on, break it into concrete, parallel tasks.

## Creating Tasks

When you and the user have agreed on a plan, write each task as a JSON file in `{tasks_dir}`.

Name files `01.json`, `02.json`, etc. Each file should contain:

```json
{{{{
  "title": "Short task title",
  "description": "Detailed description of what to implement, including specific files and approach",
  "acceptance_criteria": [
    "Specific, verifiable criterion"
  ],
  "dependencies": []
}}}}
```

Rules for tasks:
- Each task must be independently workable by a separate agent in its own git worktree
- Use `dependencies` to list task numbers (e.g. `["01"]`) that must complete first
- Keep tasks focused — one concern per task
- Include enough detail in the description that an agent can work without asking questions
- Acceptance criteria should be specific and testable

**Do NOT create task files until the user confirms the plan.** Discuss first, then write.
"#,
        tasks_dir = tasks_dir,
        repo_map = repo_map,
    )
}

/// Generate the agent prompt for a specific task.
pub fn agent_prompt(
    title: &str,
    description: &str,
    acceptance_criteria: &[String],
    validators: &[String],
) -> String {
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

    format!(
        r#"# Task: {title}

## Description

{description}

## Acceptance Criteria

{criteria_text}

## Validators

These commands must pass before the task is done:

{validators_text}

## Instructions

1. Read and understand the relevant parts of the codebase.
2. Implement the change with minimal, focused edits.
3. Follow existing code style and patterns.
4. Run the validators to confirm everything passes.
5. Commit your changes with a clear message.
6. Keep changes scoped to this task only.
"#,
        title = title,
        description = description,
        criteria_text = criteria_text,
        validators_text = validators_text,
    )
}
