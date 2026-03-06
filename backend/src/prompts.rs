/// System prompt context for ideation — appended via --append-system-prompt.
/// Contains only repository context and available agents.
pub fn ideation_system_prompt(
    repo_map: &str,
    available_agents: &str,
) -> String {
    format!(
        r#"## Repository Overview

{repo_map}

## Available Agents

The user has these agents configured:

{available_agents}
"#,
        repo_map = repo_map,
        available_agents = available_agents,
    )
}

/// User prompt for ideation — passed as the positional argument to `claude`.
/// Contains the feature description and all planning instructions.
pub fn ideation_user_prompt(
    description: &str,
    tasks_dir: &str,
    available_agents: &str,
) -> String {
    format!(
        r#"I want to build the following feature:

{description}

---

You are in PLANNING MODE. Your job is to help me plan this feature and break it into tasks. You must NOT implement anything — no code, no file edits, no file creation except plan.json. Implementation happens in a separate stage after planning.

## How This Works

Have a back-and-forth conversation with me:

1. **Understand** — Ask clarifying questions about what I want to build.
2. **Explore** — Read the codebase to understand architecture and patterns.
3. **Plan** — Propose a high-level approach. Discuss trade-offs.
4. **Break down** — Once I agree, create concrete tasks with agent assignments.
5. **Stop** — After writing plan.json, you are done.

## Creating the Plan

When we agree on the plan, write a single JSON file to `{tasks_dir}/plan.json`:

```json
{{{{
  "tasks": [
    {{{{
      "title": "Short task title",
      "description": "Detailed description including specific files and approach",
      "acceptance_criteria": ["Specific, verifiable criterion"],
      "dependencies": [],
      "agent": "agent-filename-without-extension"
    }}}}
  ],
  "execution_mode": {{{{
    "recommended": "teams" or "subagents",
    "rationale": "Explain why this mode fits the task breakdown",
    "confidence": 0.85
  }}}}
}}}}
```

Rules:
- Use `dependencies` for task indices (e.g. `["1"]`) that must complete first
- Assign the best-fit agent from these available agents: {available_agents}
- Include enough detail that an agent can work without asking questions

## Execution Mode

After defining tasks, recommend an execution mode:

**"teams"** — 4+ parallel tasks, different files/directories, multiple agent roles, few dependencies
**"subagents"** — fewer tasks, sequential work, tightly coupled modules, heavy coordination needed

## Rules

- Do NOT create plan.json until I confirm the plan.
- The ONLY file you may write is `{tasks_dir}/plan.json`.
- Do NOT write code, tests, configuration, or any other files.
- Do NOT edit any existing files.
- After writing plan.json, tell me the plan is ready and stop."#,
        description = description,
        tasks_dir = tasks_dir,
        available_agents = available_agents,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_prompt_includes_repo_map_and_agents() {
        let prompt = ideation_system_prompt("my repo map content", "my agents list");
        assert!(prompt.contains("my repo map content"));
        assert!(prompt.contains("my agents list"));
    }

    #[test]
    fn user_prompt_includes_feature_description() {
        let prompt = ideation_user_prompt("Add user auth", "/tasks", "frontend-dev");
        assert!(prompt.contains("Add user auth"));
    }

    #[test]
    fn user_prompt_includes_plan_json_format() {
        let prompt = ideation_user_prompt("desc", "/tasks", "agents");
        assert!(prompt.contains("plan.json"));
        assert!(prompt.contains("\"tasks\""));
        assert!(prompt.contains("\"recommended\""));
    }

    #[test]
    fn user_prompt_includes_execution_mode_guidance() {
        let prompt = ideation_user_prompt("desc", "/tasks", "agents");
        assert!(prompt.contains("\"teams\""));
        assert!(prompt.contains("\"subagents\""));
        assert!(prompt.contains("confidence"));
    }

    #[test]
    fn user_prompt_includes_planning_boundaries() {
        let prompt = ideation_user_prompt("desc", "/tasks", "agents");
        assert!(prompt.contains("PLANNING MODE"));
        assert!(prompt.contains("must NOT implement"));
        assert!(prompt.contains("ONLY file you may write"));
    }

    #[test]
    fn user_prompt_includes_tasks_dir() {
        let prompt = ideation_user_prompt("desc", "/my/tasks/dir", "agents");
        assert!(prompt.contains("/my/tasks/dir/plan.json"));
    }
}
