/// System prompt for ideation — appended to Claude Code via --append-system-prompt-file.
/// The user gets an interactive conversation to plan and create tasks.
pub fn ideation_system_prompt(tasks_dir: &str, repo_map: &str, available_agents: &str) -> String {
    format!(
        r#"You are helping the user plan a development feature and break it into parallelizable tasks.

## Repository Overview

{repo_map}

## Available Agents

The user has these agents configured. Assign the most appropriate agent to each task:

{available_agents}

## How This Works

This is an interactive planning session. Have a back-and-forth conversation:

1. **Understand** — Ask clarifying questions about what they want to build.
2. **Explore** — Read the codebase to understand architecture and patterns.
3. **Plan** — Propose a high-level approach. Discuss trade-offs.
4. **Break down** — Once agreed, create concrete tasks with agent assignments.

## Creating Tasks

When the plan is agreed, write each task as a JSON file in `{tasks_dir}`.

Name files `01.json`, `02.json`, etc:

```json
{{{{
  "title": "Short task title",
  "description": "Detailed description including specific files and approach",
  "acceptance_criteria": ["Specific, verifiable criterion"],
  "dependencies": [],
  "agent": "agent-name-or-id",
  "subagents": []
}}}}
```

Rules:
- Each task is worked by a separate agent in its own git worktree
- Use `dependencies` for task numbers (e.g. `["01"]`) that must complete first
- Assign the best-fit agent from the available list
- Use `subagents` for helpers (e.g. a test writer alongside a developer)
- Include enough detail that an agent can work without asking questions

**Do NOT create task files until the user confirms the plan.**
"#,
        tasks_dir = tasks_dir,
        repo_map = repo_map,
        available_agents = available_agents,
    )
}

/// Agent system prompt — appended to Claude Code when launching a task agent.
pub fn agent_system_prompt(agent_prompt: &str, subagent_prompts: &str) -> String {
    let mut prompt = agent_prompt.to_string();
    if !subagent_prompts.is_empty() {
        prompt.push_str(&format!(
            "\n\nYou have access to subagents with the following specializations. Use them as needed:\n\n{}",
            subagent_prompts
        ));
    }
    prompt
}

/// The initial message for a task agent with full task context.
pub fn agent_task_prompt(
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

/// Verification prompt — used after all tasks are merged to the feature branch.
pub fn verification_prompt(feature_name: &str, validators: &[String]) -> String {
    let validators_text = validators
        .iter()
        .map(|v| format!("- `{}`", v))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"# Final Verification: {feature_name}

All tasks for this feature have been merged. Your job is to verify everything works together.

## Steps

1. Run all validators and fix any failures:

{validators_text}

2. Check for integration issues between the merged changes.
3. Ensure the codebase builds and all tests pass.
4. Fix any issues you find — keep changes minimal.
5. Commit fixes with clear messages.

If everything passes, you're done. If there are issues, fix them and re-run validators until everything is green.
"#,
        feature_name = feature_name,
        validators_text = validators_text,
    )
}
