/// Generate the ideation prompt that tells Claude to analyze the codebase
/// and produce structured task specs.
pub fn ideation_prompt(description: &str, repo_map: &str) -> String {
    format!(
        r#"# Ideation: Plan and Create Tasks

## What the user wants

{description}

## Repository Overview

{repo_map}

## Your Job

Analyze this codebase and break the user's request into concrete, parallelizable tasks.

**Output format:** Write each task as a separate JSON file in `.gmb/tasks/`. Each file should be named `01.json`, `02.json`, etc. and contain:

```json
{{
  "title": "Short task title",
  "description": "Detailed description of what to implement",
  "acceptance_criteria": [
    "Criterion 1",
    "Criterion 2"
  ],
  "dependencies": []
}}
```

**Rules:**
1. Each task should be independently workable by a separate agent in its own worktree.
2. Use the `dependencies` array to list task numbers (e.g., `["01"]`) that must complete before this task can start.
3. Keep tasks focused — one concern per task.
4. Include clear acceptance criteria so an agent knows when it's done.
5. Create the `.gmb/tasks/` directory first, then write each task file.
6. After writing all task files, provide a brief summary of the plan.

**Important:** Do NOT implement any code. Only create the task files.
"#,
        description = description,
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
