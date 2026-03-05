/// System prompt for ideation — appended to Claude Code via --append-system-prompt-file.
/// The user gets an interactive conversation to plan and create tasks.
/// Now also asks Claude to recommend an execution mode (teams vs subagents).
pub fn ideation_system_prompt(
    tasks_dir: &str,
    repo_map: &str,
    available_agents: &str,
) -> String {
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

When the plan is agreed, write a single JSON file to `{tasks_dir}/plan.json` with this structure:

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
- Assign the best-fit agent from the available list
- Include enough detail that an agent can work without asking questions

## Execution Mode Analysis

After defining tasks, recommend an execution mode:

**Choose "teams"** when:
- 4+ tasks can run in parallel
- Tasks touch different files/directories with minimal overlap
- Multiple distinct agent roles are needed (e.g., frontend + backend + testing)
- Dependencies between tasks are few and well-defined

**Choose "subagents"** when:
- Fewer than 4 tasks, or tasks are mostly sequential
- Tasks modify the same files or tightly coupled modules
- Heavy coordination is needed (shared APIs, database schemas, etc.)
- A single lead agent can effectively orchestrate the work

Include a rationale explaining your reasoning and a confidence score (0.0-1.0).
Low confidence means the feature could go either way — the user should review.

**Do NOT create the plan file until the user confirms the plan.**
"#,
        tasks_dir = tasks_dir,
        repo_map = repo_map,
        available_agents = available_agents,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ideation_prompt_includes_execution_mode_guidance() {
        let prompt = ideation_system_prompt("/tasks", "repo map", "agents");
        assert!(prompt.contains("execution_mode"));
        assert!(prompt.contains("\"teams\""));
        assert!(prompt.contains("\"subagents\""));
        assert!(prompt.contains("confidence"));
    }

    #[test]
    fn ideation_prompt_includes_plan_json_format() {
        let prompt = ideation_system_prompt("/tasks", "repo map", "agents");
        assert!(prompt.contains("plan.json"));
        assert!(prompt.contains("\"tasks\""));
        assert!(prompt.contains("\"recommended\""));
    }

    #[test]
    fn ideation_prompt_includes_repo_map_and_agents() {
        let prompt = ideation_system_prompt("/tasks", "my repo map content", "my agents list");
        assert!(prompt.contains("my repo map content"));
        assert!(prompt.contains("my agents list"));
    }

    #[test]
    fn ideation_prompt_includes_decision_heuristics() {
        let prompt = ideation_system_prompt("/tasks", "", "");
        assert!(prompt.contains("Choose \"teams\""));
        assert!(prompt.contains("Choose \"subagents\""));
        assert!(prompt.contains("4+ tasks"));
        assert!(prompt.contains("tightly coupled"));
    }
}
