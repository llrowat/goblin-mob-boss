/// System prompt for ideation — appended to Claude Code via --append-system-prompt-file.
/// The user gets an interactive conversation to plan and create tasks.
pub fn ideation_system_prompt(
    tasks_dir: &str,
    repo_map: &str,
    available_agents: &str,
    repo_names: &[&str],
) -> String {
    let multi_repo = repo_names.len() > 1;
    let repo_field_doc = if multi_repo {
        format!(
            r#"  "repo": "target-repo-name",  // One of: {}
"#,
            repo_names.join(", ")
        )
    } else {
        String::new()
    };

    let repo_rule = if multi_repo {
        "- Use `repo` to specify which repository the task targets (required for multi-repo features)\n"
            .to_string()
    } else {
        String::new()
    };

    let multi_repo_header = if multi_repo {
        format!(
            "\n**This feature spans {} repositories:** {}\n",
            repo_names.len(),
            repo_names.join(", ")
        )
    } else {
        String::new()
    };

    format!(
        r#"You are helping the user plan a development feature and break it into parallelizable tasks.
{multi_repo_header}
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
  "subagents": [],
{repo_field_doc}}}}}
```

Rules:
- Each task is worked by a separate agent in its own git worktree
- Use `dependencies` for task numbers (e.g. `["01"]`) that must complete first
- Assign the best-fit agent from the available list
- Use `subagents` for helpers (e.g. a test writer alongside a developer)
- Include enough detail that an agent can work without asking questions
{repo_rule}
**Do NOT create task files until the user confirms the plan.**
"#,
        tasks_dir = tasks_dir,
        repo_map = repo_map,
        available_agents = available_agents,
        multi_repo_header = multi_repo_header,
        repo_field_doc = repo_field_doc,
        repo_rule = repo_rule,
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
pub fn verification_prompt(
    feature_name: &str,
    validators: &[String],
    agent_context: &str,
) -> String {
    let validators_text = validators
        .iter()
        .map(|v| format!("- `{}`", v))
        .collect::<Vec<_>>()
        .join("\n");

    let agent_section = if agent_context.is_empty() {
        String::new()
    } else {
        format!(
            "\n## Verification Agents\n\nYou are working with these verification agent roles:\n\n{}\n\nApply each agent's expertise when reviewing and fixing the code.\n",
            agent_context
        )
    };

    format!(
        r#"# Final Verification: {feature_name}

All tasks for this feature have been merged. Your job is to verify everything works together.
{agent_section}
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
        agent_section = agent_section,
        validators_text = validators_text,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ideation_prompt_single_repo_has_no_repo_field() {
        let prompt = ideation_system_prompt("/tasks", "repo map", "agents", &["my-app"]);
        assert!(!prompt.contains("\"repo\""));
        assert!(!prompt.contains("multi-repo"));
        assert!(prompt.contains("repo map"));
    }

    #[test]
    fn ideation_prompt_multi_repo_includes_repo_field() {
        let prompt =
            ideation_system_prompt("/tasks", "repo map", "agents", &["frontend", "backend"]);
        assert!(prompt.contains("\"repo\""));
        assert!(prompt.contains("frontend, backend"));
        assert!(prompt.contains("2 repositories"));
        assert!(prompt.contains("multi-repo"));
    }
}
