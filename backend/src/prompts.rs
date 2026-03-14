/// System prompt context for ideation — appended via --append-system-prompt.
/// Contains repository context, system architecture, and available agents.
pub fn ideation_system_prompt(
    repo_map: &str,
    available_agents: &str,
) -> String {
    ideation_system_prompt_with_architecture(repo_map, available_agents, "")
}

/// System prompt with optional architecture context from a system map.
pub fn ideation_system_prompt_with_architecture(
    repo_map: &str,
    available_agents: &str,
    architecture_context: &str,
) -> String {
    let arch_section = if architecture_context.is_empty() {
        String::new()
    } else {
        format!(
            r#"## System Architecture

The following system map describes the deployment topology and how services communicate.
Use this to understand how the feature fits into the broader system.

{architecture_context}

"#,
            architecture_context = architecture_context,
        )
    };

    format!(
        r#"## Repository Overview

{repo_map}

{arch_section}## Available Agents

The user has these agents configured:

{available_agents}
"#,
        repo_map = repo_map,
        arch_section = arch_section,
        available_agents = available_agents,
    )
}

/// User prompt for ideation — passed as the positional argument to `claude`.
/// Contains the feature description and all planning instructions.
/// `quality_agents` is a formatted list of agents with role "quality" — when non-empty,
/// the prompt instructs the planner to always include a verification task using them.
/// `functional_testing_enabled` adds a section for functional test planning.
pub fn ideation_user_prompt(
    description: &str,
    tasks_dir: &str,
    available_agents: &str,
    quality_agents: &str,
) -> String {
    ideation_user_prompt_with_testing(description, tasks_dir, available_agents, quality_agents, false)
}

pub fn ideation_user_prompt_with_testing(
    description: &str,
    tasks_dir: &str,
    available_agents: &str,
    quality_agents: &str,
    functional_testing_enabled: bool,
) -> String {
    ideation_user_prompt_full(
        description, tasks_dir, available_agents, quality_agents, functional_testing_enabled, &[],
    )
}

pub fn ideation_user_prompt_full(
    description: &str,
    tasks_dir: &str,
    available_agents: &str,
    quality_agents: &str,
    functional_testing_enabled: bool,
    attachments: &[crate::models::DocumentAttachment],
) -> String {
    let quality_section = if quality_agents.is_empty() {
        String::new()
    } else {
        format!(
            r#"## Code Quality Verification

The following agents are designated for code quality verification:

{quality_agents}

**You MUST include a final verification task** in every plan that uses one or more of these quality agents to review all changes made by the other tasks. This task should:
- Depend on all implementation tasks (so it runs last)
- Review code for correctness, security, style consistency, and test coverage
- Run any relevant linters or tests
- Be assigned to the most appropriate quality agent listed above

This verification step is mandatory and must not be skipped.

"#,
            quality_agents = quality_agents,
        )
    };

    let functional_testing_section = if functional_testing_enabled {
        r#"## Functional Testing Plan

This project has functional testing enabled. After implementation, a QA agent will exercise the running application to verify the feature works.

In your plan.json, include these additional fields:

```json
{
  "test_harness": {
    "start_command": "npm run dev",
    "ready_signal": "Local: http://localhost:5173",
    "stop_command": "",
    "harness_type": "browser"
  },
  "functional_test_steps": [
    {
      "description": "What to test — e.g. 'Login page loads and shows email/password fields'",
      "tool": "playwright|curl|cli",
      "agent": "qa-tester"
    }
  ]
}
```

Rules for functional testing:
- `test_harness` describes how to start/stop the application for testing
  - `harness_type`: "browser" (web UI), "api" (HTTP endpoints), or "cli" (command-line)
  - `ready_signal`: stdout substring or URL that indicates the app is ready
- `functional_test_steps`: 3-8 steps that exercise the NEW feature
  - Focus on verifying the feature works, not exhaustive testing
  - Each step should be automatable (no manual browser interaction)
  - Assign steps to "qa-tester" agent
- If the feature is purely internal (no user-facing changes), you may omit these fields

"#.to_string()
    } else {
        String::new()
    };

    let attachments_section = if attachments.is_empty() {
        String::new()
    } else {
        let mut section = String::from("\n## Attached Documents\n\nThe user has attached the following documents as additional context. Read them carefully — they may contain requirements, design specs, API schemas, or other important information.\n\n");
        for attachment in attachments {
            if let Some(path) = &attachment.file_path {
                section.push_str(&format!(
                    "### {} (image)\n\nThis is an image file. Read it with your Read tool to view it: `{}`\n\n",
                    attachment.name, path
                ));
            } else {
                section.push_str(&format!(
                    "### {}\n\n{}\n\n",
                    attachment.name, attachment.content
                ));
            }
        }
        section
    };

    format!(
        r#"I want to build the following feature:

{description}
{attachments_section}
---

You are in PLANNING MODE running non-interactively. There is NO human to respond to you. You cannot wait for input.

Your job is to explore the codebase, understand the architecture, and create a concrete task breakdown for this feature. You must NOT implement anything — no code, no file edits, no file creation except plan.json or questions.json.

## Your Process

1. **Explore** — Read the codebase to understand architecture, patterns, and relevant files.
2. **Assess** — Determine if you have enough clarity to create a solid plan, or if key decisions need user input.
3. **Ask or Plan** — If there are important ambiguities that would materially change your approach, write `questions.json`. Otherwise, go straight to `plan.json`.

## Asking Questions (Optional)

If — and only if — you encounter decisions that would significantly affect the plan's direction, you may write `{tasks_dir}/questions.json` to ask the user for clarification BEFORE writing plan.json:

```json
{{{{
  "questions": [
    {{{{
      "id": "q1",
      "question": "Clear, specific question?",
      "context": "Why this matters and what you found in the codebase",
      "options": ["Option A", "Option B", "Option C"],
      "type": "single_choice"
    }}}},
    {{{{
      "id": "q2",
      "question": "Open-ended question?",
      "type": "free_text"
    }}}}
  ]
}}}}
```

Rules for questions:
- Only ask when the answer would **materially change** your approach — don't ask about things you can reasonably decide yourself.
- At most **5 questions** per round. Focus on high-impact decisions.
- Provide `options` (with a `single_choice` type) when there are clear alternatives — this helps the user decide faster.
- Provide `context` explaining what you found and why it matters.
- Use `free_text` type when the answer is open-ended with no clear options.
- After writing questions.json, say "I have some questions before planning." and stop.
- Do NOT write both questions.json and plan.json — write one or the other.

## Writing the Plan

Write a single JSON file to `{tasks_dir}/plan.json`:

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

{quality_section}{functional_testing_section}## Rules

- The ONLY files you may create are `{tasks_dir}/plan.json` or `{tasks_dir}/questions.json`.
- Do NOT write code, tests, configuration, or any other files.
- Do NOT edit any existing files.
- After writing plan.json or questions.json, stop."#,
        description = description,
        attachments_section = attachments_section,
        tasks_dir = tasks_dir,
        available_agents = available_agents,
        quality_section = quality_section,
        functional_testing_section = functional_testing_section,
    )
}

/// User prompt variant for ideation after user has answered questions.
/// Includes the original prompt plus the user's answers.
pub fn ideation_user_prompt_with_answers(
    description: &str,
    tasks_dir: &str,
    available_agents: &str,
    quality_agents: &str,
    answers: &[crate::models::PlanningAnswer],
) -> String {
    ideation_user_prompt_with_answers_and_testing(
        description, tasks_dir, available_agents, quality_agents, answers, false,
    )
}

pub fn ideation_user_prompt_with_answers_and_testing(
    description: &str,
    tasks_dir: &str,
    available_agents: &str,
    quality_agents: &str,
    answers: &[crate::models::PlanningAnswer],
    functional_testing_enabled: bool,
) -> String {
    ideation_user_prompt_with_answers_full(
        description, tasks_dir, available_agents, quality_agents, answers, functional_testing_enabled, &[],
    )
}

pub fn ideation_user_prompt_with_answers_full(
    description: &str,
    tasks_dir: &str,
    available_agents: &str,
    quality_agents: &str,
    answers: &[crate::models::PlanningAnswer],
    functional_testing_enabled: bool,
    attachments: &[crate::models::DocumentAttachment],
) -> String {
    let base = ideation_user_prompt_full(
        description, tasks_dir, available_agents, quality_agents, functional_testing_enabled, attachments,
    );

    let mut answers_section = String::from("\n\n---\n\n## User's Answers to Your Questions\n\n");
    for answer in answers {
        answers_section.push_str(&format!(
            "**Q: {}**\nA: {}\n\n",
            answer.question, answer.answer
        ));
    }
    answers_section.push_str(
        "Use these answers to inform your plan. If you still need clarification on different topics, you may write questions.json again. Otherwise, proceed to write plan.json."
    );

    format!("{}{}", base, answers_section)
}

// ── System Map Discovery Prompts ──

/// System prompt for map discovery agents — context about what repo they are scanning.
pub fn map_discovery_system_prompt(repo_name: &str, repo_context: &str) -> String {
    format!(
        r#"## Repository: {repo_name}

{repo_context}

You are a systems architect mapping infrastructure topology. Identify the deployable
services, external dependencies, and how they communicate. Think in terms of what
gets deployed and what talks to what — not how the code is organized internally."#,
        repo_name = repo_name,
        repo_context = repo_context,
    )
}

/// User prompt for map discovery — tells the agent what to find and where to write results.
pub fn map_discovery_user_prompt(repo_name: &str, output_path: &str) -> String {
    format!(
        r#"Map the deployment architecture for repository "{repo_name}".

## What to Identify

1. **Deployable Services** — What actually gets deployed and runs?
   Look at: Dockerfiles, docker-compose.yml, Kubernetes manifests, CI/CD deploy targets,
   Procfile, serverless configs, top-level README architecture sections.
   Each entry should be something that runs as its own process or container.

2. **External Dependencies** — What infrastructure does the system rely on?
   Databases, caches, queues, third-party APIs, auth providers, CDNs.
   Look at: docker-compose services, environment variables, config files, README.

3. **Communication Paths** — How do the services talk to each other and to external systems?
   Look at: docker-compose networks, environment variables referencing other services,
   infrastructure configs, README architecture sections.

## Important

- Map **deployment topology**, not code organization. A monorepo with one Dockerfile
  is one service, not one service per directory.
- Only include things that run independently. Internal libraries, shared modules,
  and helper packages are NOT separate services.
- Keep descriptions focused on *what the service does for users or the system* —
  not implementation details.

## Output

Write a single JSON file to `{output_path}`:

```json
{{{{
  "repo_name": "{repo_name}",
  "services": [
    {{{{
      "name": "Human-readable service name",
      "service_type": "backend|frontend|worker|gateway|database|queue|cache|external",
      "runtime": "node|python|rust|go|java|etc",
      "framework": "express|fastapi|actix|etc or empty",
      "description": "What this service does (one sentence)",
      "owns_data": ["database or storage names if applicable"]
    }}}}
  ],
  "connections": [
    {{{{
      "from": "service name",
      "to": "service name",
      "connection_type": "rest|grpc|graphql|websocket|event|shared_db|file_system|ipc",
      "sync": true,
      "label": "short label",
      "description": "What flows through this connection"
    }}}}
  ]
}}}}
```

## Rules

- The ONLY file you may write is `{output_path}`.
- Do NOT modify any source files.
- Skim READMEs, config files, and infrastructure manifests. Do not read source code.
- If the repo produces one deployable artifact, output one service — not one per internal module.
- Write the JSON file and stop."#,
        repo_name = repo_name,
        output_path = output_path,
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
        let prompt = ideation_user_prompt("Add user auth", "/tasks", "frontend-dev", "");
        assert!(prompt.contains("Add user auth"));
    }

    #[test]
    fn user_prompt_includes_plan_json_format() {
        let prompt = ideation_user_prompt("desc", "/tasks", "agents", "");
        assert!(prompt.contains("plan.json"));
        assert!(prompt.contains("\"tasks\""));
        assert!(prompt.contains("\"recommended\""));
    }

    #[test]
    fn user_prompt_includes_execution_mode_guidance() {
        let prompt = ideation_user_prompt("desc", "/tasks", "agents", "");
        assert!(prompt.contains("\"teams\""));
        assert!(prompt.contains("\"subagents\""));
        assert!(prompt.contains("confidence"));
    }

    #[test]
    fn user_prompt_includes_planning_boundaries() {
        let prompt = ideation_user_prompt("desc", "/tasks", "agents", "");
        assert!(prompt.contains("PLANNING MODE"));
        assert!(prompt.contains("must NOT implement"));
        assert!(prompt.contains("ONLY files you may create"));
    }

    #[test]
    fn user_prompt_includes_tasks_dir() {
        let prompt = ideation_user_prompt("desc", "/my/tasks/dir", "agents", "");
        assert!(prompt.contains("/my/tasks/dir/plan.json"));
    }

    // ── Map Discovery Prompt Tests ──

    #[test]
    fn map_discovery_system_prompt_includes_repo_info() {
        let prompt = map_discovery_system_prompt("my-service", "Rust backend context");
        assert!(prompt.contains("my-service"));
        assert!(prompt.contains("Rust backend context"));
        assert!(prompt.contains("systems architect"));
    }

    #[test]
    fn map_discovery_user_prompt_includes_repo_name() {
        let prompt = map_discovery_user_prompt("auth-service", "/tmp/discovery.json");
        assert!(prompt.contains("auth-service"));
    }

    #[test]
    fn map_discovery_user_prompt_includes_output_path() {
        let prompt = map_discovery_user_prompt("api", "/my/output/discovery.json");
        assert!(prompt.contains("/my/output/discovery.json"));
    }

    #[test]
    fn map_discovery_user_prompt_includes_json_schema() {
        let prompt = map_discovery_user_prompt("api", "/tmp/out.json");
        assert!(prompt.contains("\"services\""));
        assert!(prompt.contains("\"connections\""));
        assert!(prompt.contains("\"service_type\""));
        assert!(prompt.contains("\"connection_type\""));
    }

    #[test]
    fn map_discovery_user_prompt_includes_exploration_guidance() {
        let prompt = map_discovery_user_prompt("api", "/tmp/out.json");
        assert!(prompt.contains("Dockerfiles"));
        assert!(prompt.contains("docker-compose"));
        assert!(prompt.contains("Do NOT modify any source files"));
    }

    #[test]
    fn user_prompt_includes_questions_json_instructions() {
        let prompt = ideation_user_prompt("desc", "/tasks", "agents", "");
        assert!(prompt.contains("questions.json"));
        assert!(prompt.contains("single_choice"));
        assert!(prompt.contains("free_text"));
        assert!(prompt.contains("materially change"));
    }

    #[test]
    fn user_prompt_with_answers_includes_answers() {
        let answers = vec![
            crate::models::PlanningAnswer {
                id: "q1".to_string(),
                question: "Which approach?".to_string(),
                answer: "Option A".to_string(),
            },
            crate::models::PlanningAnswer {
                id: "q2".to_string(),
                question: "Color palette?".to_string(),
                answer: "Use brand colors".to_string(),
            },
        ];
        let prompt = ideation_user_prompt_with_answers("desc", "/tasks", "agents", "", &answers);
        assert!(prompt.contains("User's Answers to Your Questions"));
        assert!(prompt.contains("Q: Which approach?"));
        assert!(prompt.contains("A: Option A"));
        assert!(prompt.contains("Q: Color palette?"));
        assert!(prompt.contains("A: Use brand colors"));
    }

    #[test]
    fn user_prompt_with_answers_includes_base_prompt() {
        let answers = vec![crate::models::PlanningAnswer {
            id: "q1".to_string(),
            question: "Q?".to_string(),
            answer: "A".to_string(),
        }];
        let prompt = ideation_user_prompt_with_answers("my feature", "/tasks", "agents", "", &answers);
        assert!(prompt.contains("my feature"));
        assert!(prompt.contains("PLANNING MODE"));
        assert!(prompt.contains("questions.json"));
    }

    #[test]
    fn user_prompt_includes_quality_section_when_agents_present() {
        let quality = "- **Code Reviewer** (code-reviewer): Code quality and review specialist\n- **Test Engineer** (test-engineer): Testing and quality assurance specialist";
        let prompt = ideation_user_prompt("desc", "/tasks", "agents", quality);
        assert!(prompt.contains("Code Quality Verification"));
        assert!(prompt.contains("Code Reviewer"));
        assert!(prompt.contains("Test Engineer"));
        assert!(prompt.contains("MUST include a final verification task"));
    }

    #[test]
    fn user_prompt_omits_quality_section_when_no_agents() {
        let prompt = ideation_user_prompt("desc", "/tasks", "agents", "");
        assert!(!prompt.contains("Code Quality Verification"));
        assert!(!prompt.contains("MUST include a final verification task"));
    }

    #[test]
    fn user_prompt_with_answers_includes_quality_section() {
        let quality = "- **Code Reviewer** (code-reviewer)";
        let answers = vec![crate::models::PlanningAnswer {
            id: "q1".to_string(),
            question: "Q?".to_string(),
            answer: "A".to_string(),
        }];
        let prompt = ideation_user_prompt_with_answers("desc", "/tasks", "agents", quality, &answers);
        assert!(prompt.contains("Code Quality Verification"));
        assert!(prompt.contains("User's Answers to Your Questions"));
    }

    // ── Attachment Tests ──

    #[test]
    fn user_prompt_includes_attachments_when_present() {
        let attachments = vec![
            crate::models::DocumentAttachment {
                name: "design-spec.md".to_string(),
                content: "# Design Spec\n\nThe widget should be blue.".to_string(),
                file_path: None,
            },
            crate::models::DocumentAttachment {
                name: "api-schema.json".to_string(),
                content: r#"{"endpoint": "/api/v1/widgets"}"#.to_string(),
                file_path: None,
            },
        ];
        let prompt = ideation_user_prompt_full("desc", "/tasks", "agents", "", false, &attachments);
        assert!(prompt.contains("Attached Documents"));
        assert!(prompt.contains("### design-spec.md"));
        assert!(prompt.contains("The widget should be blue."));
        assert!(prompt.contains("### api-schema.json"));
        assert!(prompt.contains("/api/v1/widgets"));
    }

    #[test]
    fn user_prompt_omits_attachments_section_when_empty() {
        let prompt = ideation_user_prompt_full("desc", "/tasks", "agents", "", false, &[]);
        assert!(!prompt.contains("Attached Documents"));
    }

    #[test]
    fn user_prompt_with_answers_includes_attachments() {
        let attachments = vec![crate::models::DocumentAttachment {
            name: "spec.md".to_string(),
            content: "Important spec content".to_string(),
            file_path: None,
        }];
        let answers = vec![crate::models::PlanningAnswer {
            id: "q1".to_string(),
            question: "Q?".to_string(),
            answer: "A".to_string(),
        }];
        let prompt = ideation_user_prompt_with_answers_full(
            "desc", "/tasks", "agents", "", &answers, false, &attachments,
        );
        assert!(prompt.contains("Attached Documents"));
        assert!(prompt.contains("Important spec content"));
        assert!(prompt.contains("User's Answers to Your Questions"));
    }
}
