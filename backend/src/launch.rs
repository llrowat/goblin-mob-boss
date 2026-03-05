use crate::models::{ExecutionMode, Feature, TaskSpec};

/// Build the launch command and environment for executing a feature.
/// Returns (command_args, env_vars, initial_prompt_content).
pub fn build_launch(
    feature: &Feature,
    system_prompt_path: &str,
) -> (Vec<String>, Vec<(String, String)>, String) {
    let mode = feature
        .execution_mode
        .as_ref()
        .unwrap_or(&ExecutionMode::Subagents);

    let prompt = build_prompt(feature, mode);
    let mut env = Vec::new();
    let mut args = vec!["claude".to_string()];

    match mode {
        ExecutionMode::Teams => {
            env.push((
                "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS".to_string(),
                "1".to_string(),
            ));
            args.extend([
                "--teammate-mode".to_string(),
                "tmux".to_string(),
                "--append-system-prompt-file".to_string(),
                system_prompt_path.to_string(),
                prompt.clone(),
            ]);
        }
        ExecutionMode::Subagents => {
            args.extend([
                "--append-system-prompt-file".to_string(),
                system_prompt_path.to_string(),
                prompt.clone(),
            ]);
        }
    }

    (args, env, prompt)
}

fn build_prompt(feature: &Feature, mode: &ExecutionMode) -> String {
    let tasks_section = build_tasks_section(&feature.task_specs);
    let agents_section = build_agents_section(&feature.selected_agents);
    let _validators_note = String::new(); // Validators are in the repo config, injected separately

    match mode {
        ExecutionMode::Teams => {
            format!(
                r#"Implement this feature using your team of agents:

## Feature: {name}

{description}

{tasks_section}

{agents_section}

## Instructions

- Work on the feature branch: {branch}
- Coordinate via the shared task list
- Each teammate should work on their assigned tasks
- When all tasks pass, signal completion"#,
                name = feature.name,
                description = feature.description,
                tasks_section = tasks_section,
                agents_section = agents_section,
                branch = feature.branch,
            )
        }
        ExecutionMode::Subagents => {
            format!(
                r#"Implement this feature. You are the lead agent — delegate subtasks to subagents as you see fit.

## Feature: {name}

{description}

{tasks_section}

{agents_section}

## Instructions

- Work on the feature branch: {branch}
- Use the Agent tool to delegate work to subagents when beneficial
- The task list above is a suggestion — you may reorganize as needed
- When all tasks are complete, ensure everything works together"#,
                name = feature.name,
                description = feature.description,
                tasks_section = tasks_section,
                agents_section = agents_section,
                branch = feature.branch,
            )
        }
    }
}

fn build_tasks_section(specs: &[TaskSpec]) -> String {
    if specs.is_empty() {
        return "## Tasks\n\nNo specific tasks defined — implement the feature as you see fit.".to_string();
    }

    let mut section = String::from("## Tasks\n");
    for (i, spec) in specs.iter().enumerate() {
        section.push_str(&format!("\n### {}. {}\n", i + 1, spec.title));
        section.push_str(&format!("{}\n", spec.description));
        if !spec.agent.is_empty() {
            section.push_str(&format!("Agent: {}\n", spec.agent));
        }
        if !spec.acceptance_criteria.is_empty() {
            section.push_str("Acceptance criteria:\n");
            for c in &spec.acceptance_criteria {
                section.push_str(&format!("- {}\n", c));
            }
        }
        if !spec.dependencies.is_empty() {
            section.push_str(&format!(
                "Dependencies: {}\n",
                spec.dependencies.join(", ")
            ));
        }
    }
    section
}

fn build_agents_section(agent_filenames: &[String]) -> String {
    if agent_filenames.is_empty() {
        return String::new();
    }
    let names: Vec<&str> = agent_filenames
        .iter()
        .map(|f| f.strip_suffix(".md").unwrap_or(f))
        .collect();
    format!("## Available Agents\n\nUse the following project agents: {}", names.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_feature(mode: ExecutionMode) -> Feature {
        let mut f = Feature::new(
            "repo-1".to_string(),
            "Dark Mode".to_string(),
            "Add dark mode toggle to the app".to_string(),
            "feature/dark-mode-ab12".to_string(),
        );
        f.execution_mode = Some(mode);
        f.selected_agents = vec![
            "frontend-dev.md".to_string(),
            "test-writer.md".to_string(),
        ];
        f.task_specs = vec![
            TaskSpec {
                title: "Add theme context".to_string(),
                description: "Create React context for theme state".to_string(),
                acceptance_criteria: vec!["Context toggles between light/dark".to_string()],
                dependencies: vec![],
                agent: "frontend-dev".to_string(),
            },
            TaskSpec {
                title: "Write tests".to_string(),
                description: "Test the theme toggle".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec!["1".to_string()],
                agent: "test-writer".to_string(),
            },
        ];
        f
    }

    #[test]
    fn build_launch_teams_mode() {
        let feature = make_feature(ExecutionMode::Teams);
        let (args, env, prompt) = build_launch(&feature, "/tmp/prompt.md");

        assert!(env.iter().any(|(k, _)| k == "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"));
        assert!(args.contains(&"--teammate-mode".to_string()));
        assert!(args.contains(&"tmux".to_string()));
        assert!(prompt.contains("using your team of agents"));
        assert!(prompt.contains("Add theme context"));
        assert!(prompt.contains("frontend-dev"));
    }

    #[test]
    fn build_launch_subagents_mode() {
        let feature = make_feature(ExecutionMode::Subagents);
        let (args, env, prompt) = build_launch(&feature, "/tmp/prompt.md");

        assert!(env.is_empty());
        assert!(!args.contains(&"--teammate-mode".to_string()));
        assert!(prompt.contains("lead agent"));
        assert!(prompt.contains("delegate subtasks"));
        assert!(prompt.contains("Write tests"));
    }

    #[test]
    fn build_launch_defaults_to_subagents() {
        let mut feature = make_feature(ExecutionMode::Subagents);
        feature.execution_mode = None;
        let (_, env, prompt) = build_launch(&feature, "/tmp/prompt.md");

        assert!(env.is_empty());
        assert!(prompt.contains("lead agent"));
    }

    #[test]
    fn build_tasks_section_empty() {
        let section = build_tasks_section(&[]);
        assert!(section.contains("No specific tasks"));
    }

    #[test]
    fn build_tasks_section_with_deps() {
        let specs = vec![TaskSpec {
            title: "Task A".to_string(),
            description: "Do A".to_string(),
            acceptance_criteria: vec!["A works".to_string()],
            dependencies: vec!["01".to_string()],
            agent: "dev".to_string(),
        }];
        let section = build_tasks_section(&specs);
        assert!(section.contains("Task A"));
        assert!(section.contains("Agent: dev"));
        assert!(section.contains("A works"));
        assert!(section.contains("Dependencies: 01"));
    }

    #[test]
    fn build_agents_section_empty() {
        assert_eq!(build_agents_section(&[]), "");
    }

    #[test]
    fn build_agents_section_strips_md_extension() {
        let agents = vec![
            "frontend-dev.md".to_string(),
            "test-writer.md".to_string(),
        ];
        let section = build_agents_section(&agents);
        assert!(section.contains("frontend-dev, test-writer"));
        assert!(!section.contains(".md"));
    }
}
