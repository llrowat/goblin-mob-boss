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
  "verification_agents": ["agent-name-or-id"],
{repo_field_doc}}}}}
```

Rules:
- Each task is worked by a separate agent in its own git worktree
- Use `dependencies` for task numbers (e.g. `["01"]`) that must complete first
- Assign the best-fit agent from the available list
- Use `subagents` for helpers (e.g. a test writer alongside a developer)
- Use `verification_agents` to assign agents that verify the task after implementation (e.g. security reviewer, integration tester). Their expertise is applied as a self-review step before the task is marked complete.
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
    verification_context: &str,
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

    let verification_section = if verification_context.is_empty() {
        String::new()
    } else {
        format!(
            r#"
## Verification

After implementing and committing, apply the following verification lenses to self-review your changes. Fix any issues found, then re-run validators.

{verification_context}
"#,
            verification_context = verification_context
        )
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

1. Update status: write `{{"phase":"implementing"}}` to `.gmb/status.json`
2. Read and understand the relevant parts of the codebase.
3. Implement the change with minimal, focused edits.
4. Follow existing code style and patterns.
5. Run the validators to confirm everything passes.
6. Commit your changes with a clear message.
7. Keep changes scoped to this task only.
{verification_section}
## Completion

When all validators pass and verification is complete:
1. Write `{{"phase":"done"}}` to `.gmb/status.json`

If you encounter a blocker you cannot resolve:
1. Write `{{"phase":"failed","message":"description of the issue"}}` to `.gmb/status.json`
"#,
        title = title,
        description = description,
        criteria_text = criteria_text,
        validators_text = validators_text,
        verification_section = verification_section,
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

    #[test]
    fn ideation_prompt_includes_verification_agents_field() {
        let prompt = ideation_system_prompt("/tasks", "repo map", "agents", &["my-app"]);
        assert!(prompt.contains("\"verification_agents\""));
        assert!(prompt.contains("verification_agents"));
    }

    #[test]
    fn task_prompt_includes_status_dot_file_instructions() {
        let prompt = agent_task_prompt("Test", "Do thing", &[], &[], "");
        assert!(prompt.contains(".gmb/status.json"));
        assert!(prompt.contains("\"phase\":\"implementing\""));
        assert!(prompt.contains("\"phase\":\"done\""));
        assert!(prompt.contains("\"phase\":\"failed\""));
    }

    #[test]
    fn task_prompt_includes_verification_context() {
        let prompt = agent_task_prompt(
            "Test",
            "Do thing",
            &[],
            &[],
            "- **Security Reviewer**: Check for XSS",
        );
        assert!(prompt.contains("## Verification"));
        assert!(prompt.contains("Security Reviewer"));
    }

    #[test]
    fn task_prompt_omits_verification_section_when_empty() {
        let prompt = agent_task_prompt("Test", "Do thing", &[], &[], "");
        assert!(!prompt.contains("## Verification"));
    }
}
