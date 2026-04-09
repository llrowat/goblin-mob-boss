use crate::guidance;
use crate::models::{DocumentAttachment, ExecutionMode, Feature, TaskSpec};
use std::process::Command;

/// Check whether tmux is installed and available on PATH.
/// Teams mode requires tmux for `--teammate-mode tmux`.
pub fn is_tmux_available() -> bool {
    Command::new("tmux")
        .arg("-V")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Build the launch command and environment for executing a feature.
/// Returns (command_args, env_vars, initial_prompt_content).
/// `system_prompt_content` is the system prompt text to append (passed inline via --append-system-prompt).
/// `repo_path` is optional — when provided, the guidance file path is included in the prompt.
pub fn build_launch(
    feature: &Feature,
    system_prompt_content: &str,
) -> (Vec<String>, Vec<(String, String)>, String) {
    build_launch_with_repo(feature, system_prompt_content, None, None, "claude")
}

pub fn build_launch_with_repo(
    feature: &Feature,
    system_prompt_content: &str,
    repo_path: Option<&str>,
    commit_pattern: Option<&str>,
    claude_exe: &str,
) -> (Vec<String>, Vec<(String, String)>, String) {
    let mode = feature
        .execution_mode
        .as_ref()
        .unwrap_or(&ExecutionMode::Subagents);

    let prompt = build_prompt(feature, mode, repo_path, commit_pattern);
    let mut env = Vec::new();
    let mut args = vec![claude_exe.to_string()];

    match mode {
        ExecutionMode::Teams => {
            env.push((
                "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS".to_string(),
                "1".to_string(),
            ));
            args.extend([
                "--permission-mode".to_string(),
                "auto".to_string(),
                "--append-system-prompt".to_string(),
                system_prompt_content.to_string(),
                prompt.clone(),
            ]);
        }
        ExecutionMode::Subagents => {
            args.extend([
                "--permission-mode".to_string(),
                "auto".to_string(),
                "--append-system-prompt".to_string(),
                system_prompt_content.to_string(),
                prompt.clone(),
            ]);
        }
    }

    (args, env, prompt)
}

fn build_prompt(
    feature: &Feature,
    mode: &ExecutionMode,
    repo_path: Option<&str>,
    commit_pattern: Option<&str>,
) -> String {
    let tasks_section = build_tasks_section(&feature.task_specs);
    let agents_section = build_agents_section(&feature.selected_agents);
    let attachments_section = build_attachments_section(&feature.attachments);
    let progress_section = build_progress_section(repo_path, &feature.id, &feature.task_specs);

    let guidance_note = repo_path
        .map(|rp| {
            let gf = guidance::guidance_file_path(rp, &feature.id);
            format!(
                "\n- Check `{}` periodically for guidance notes from the user\n",
                gf
            )
        })
        .unwrap_or_default();

    let commit_note = commit_pattern
        .map(|pat| {
            format!(
                "\n- All commit messages MUST match this regex pattern: `{}`\n",
                pat
            )
        })
        .unwrap_or_default();

    match mode {
        ExecutionMode::Teams => {
            format!(
                r#"You MUST use Claude Code's agent teams feature to implement this feature. Create an agent team and spawn a teammate for each agent listed below. Each teammate runs as an independent Claude Code instance with its own context window, coordinating through the shared task list.

## Feature: {name}

{description}
{attachments_section}
{tasks_section}

{agents_section}

## Instructions

- Create an agent team — spawn one teammate per agent listed above, assigning each their tasks
- Each teammate works independently in parallel on their assigned tasks
- Work on the feature branch: {branch}
- Use the shared task list for coordination between teammates
- Avoid file conflicts — ensure teammates own different files where possible
- If any tasks are assigned to quality/review agents, spawn those teammates after implementation teammates finish, so they can verify all changes
- When all teammates have completed their tasks, signal completion
{progress_section}{guidance_note}{commit_note}"#,
                name = feature.name,
                description = feature.description,
                attachments_section = attachments_section,
                tasks_section = tasks_section,
                agents_section = agents_section,
                branch = feature.branch,
                progress_section = progress_section,
                guidance_note = guidance_note,
                commit_note = commit_note,
            )
        }
        ExecutionMode::Subagents => {
            format!(
                r#"Implement this feature. You are the lead agent — delegate subtasks to subagents as you see fit.

## Feature: {name}

{description}
{attachments_section}
{tasks_section}

{agents_section}

## Instructions

- Work on the feature branch: {branch}
- Use the Agent tool to delegate work to subagents when beneficial
- The task list above is a suggestion — you may reorganize as needed
- If any tasks are assigned to quality/review agents, ensure they run after implementation tasks and verify all changes
- When all tasks are complete, ensure everything works together
{progress_section}{guidance_note}{commit_note}"#,
                name = feature.name,
                description = feature.description,
                attachments_section = attachments_section,
                tasks_section = tasks_section,
                agents_section = agents_section,
                branch = feature.branch,
                progress_section = progress_section,
                guidance_note = guidance_note,
                commit_note = commit_note,
            )
        }
    }
}

fn build_attachments_section(attachments: &[DocumentAttachment]) -> String {
    if attachments.is_empty() {
        return String::new();
    }
    let mut section = String::from("## Attached Documents\n\n");
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
}

fn build_progress_section(repo_path: Option<&str>, feature_id: &str, specs: &[TaskSpec]) -> String {
    let Some(rp) = repo_path else {
        return String::new();
    };
    let progress_path = std::path::Path::new(rp)
        .join(".gmb")
        .join("features")
        .join(feature_id)
        .join("tasks")
        .join("progress.json");

    // Build the initial progress JSON inline so Claude knows the exact format
    let mut tasks_json = Vec::new();
    for (i, spec) in specs.iter().enumerate() {
        let criteria: Vec<String> = spec
            .acceptance_criteria
            .iter()
            .map(|c| {
                format!(
                    r#"        {{"criterion": "{}", "done": false}}"#,
                    c.replace('"', "\\\"")
                )
            })
            .collect();
        let criteria_str = if criteria.is_empty() {
            "[]".to_string()
        } else {
            format!("[\n{}\n      ]", criteria.join(",\n"))
        };
        tasks_json.push(format!(
            r#"    {{
      "task": {},
      "title": "{}",
      "status": "pending",
      "acceptance_criteria": {}
    }}"#,
            i + 1,
            spec.title.replace('"', "\\\""),
            criteria_str,
        ));
    }

    let completion_path = std::path::Path::new(rp)
        .join(".gmb")
        .join("features")
        .join(feature_id)
        .join("execution-complete");

    format!(
        r#"## Progress Tracking

CRITICAL — YOU MUST DO THIS: A progress file already exists at `{path}`. Update it as you work. The user is watching live updates in a dashboard. If you do not update this file, the user will think you are stuck.

The file is pre-seeded with your task list in this format:
```json
{{
  "tasks": [
{tasks}
  ]
}}
```

### Rules (follow exactly):
1. **Before starting a task**: Read the file, set that task's `status` to `"in_progress"`, write the file back
2. **When a criterion is met**: Set its `"done"` to `true` and write the file
3. **When a task is complete**: Set its `status` to `"done"` and write the file
4. **Update frequency**: Write the file after EVERY significant action — do not batch updates
5. **Keep valid JSON**: Always write the complete file, not partial updates

### When all work is done:
After all tasks are complete and verified, you MUST do two things:
1. Ensure every task in `{path}` has `"status": "done"`
2. Create a completion signal file: `echo "done" > {completion_path}`

This signals the dashboard that execution is finished. If you skip this step, the feature will appear stuck."#,
        path = progress_path.to_string_lossy().replace('\\', "/"),
        tasks = tasks_json.join(",\n"),
        completion_path = completion_path.to_string_lossy().replace('\\', "/"),
    )
}

fn build_tasks_section(specs: &[TaskSpec]) -> String {
    if specs.is_empty() {
        return "## Tasks\n\nNo specific tasks defined — implement the feature as you see fit."
            .to_string();
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
            section.push_str(&format!("Dependencies: {}\n", spec.dependencies.join(", ")));
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
    format!(
        "## Available Agents\n\nUse the following project agents: {}",
        names.join(", ")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_feature(mode: ExecutionMode) -> Feature {
        let mut f = Feature::new(
            vec!["repo-1".to_string()],
            "Dark Mode".to_string(),
            "Add dark mode toggle to the app".to_string(),
            "feature/dark-mode-ab12".to_string(),
            vec![],
        );
        f.execution_mode = Some(mode);
        f.selected_agents = vec!["frontend-dev.md".to_string(), "test-writer.md".to_string()];
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
        let (args, env, prompt) = build_launch(&feature, "System prompt content here");

        assert!(env
            .iter()
            .any(|(k, _)| k == "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"));
        assert!(!args.contains(&"--teammate-mode".to_string()));
        assert!(args.contains(&"--permission-mode".to_string()));
        assert!(args.contains(&"auto".to_string()));
        assert!(prompt.contains("MUST use Claude Code's agent teams feature"));
        assert!(prompt.contains("Add theme context"));
        assert!(prompt.contains("frontend-dev"));
    }

    #[test]
    fn build_launch_subagents_mode() {
        let feature = make_feature(ExecutionMode::Subagents);
        let (args, env, prompt) = build_launch(&feature, "System prompt content here");

        assert!(env.is_empty());
        assert!(!args.contains(&"--teammate-mode".to_string()));
        assert!(args.contains(&"--permission-mode".to_string()));
        assert!(args.contains(&"auto".to_string()));
        assert!(prompt.contains("lead agent"));
        assert!(prompt.contains("delegate subtasks"));
        assert!(prompt.contains("Write tests"));
    }

    #[test]
    fn build_launch_defaults_to_subagents() {
        let mut feature = make_feature(ExecutionMode::Subagents);
        feature.execution_mode = None;
        let (_, env, prompt) = build_launch(&feature, "System prompt content here");

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
        let agents = vec!["frontend-dev.md".to_string(), "test-writer.md".to_string()];
        let section = build_agents_section(&agents);
        assert!(section.contains("frontend-dev, test-writer"));
        assert!(!section.contains(".md"));
    }

    #[test]
    fn is_tmux_available_returns_bool() {
        // This test just verifies the function runs without panicking
        // and returns a boolean. The actual result depends on the environment.
        let result = is_tmux_available();
        // It's either true or false — we can't assert a specific value
        // since CI environments may or may not have tmux installed.
        assert!(result || !result);
    }

    #[test]
    fn progress_section_includes_completion_signal_path() {
        let specs = vec![TaskSpec {
            title: "Task A".to_string(),
            description: "Do A".to_string(),
            acceptance_criteria: vec!["A works".to_string()],
            dependencies: vec![],
            agent: "dev".to_string(),
        }];
        let section = build_progress_section(Some("/tmp/repo"), "feat-123", &specs);
        assert!(section.contains("CRITICAL"));
        assert!(section.contains("execution-complete"));
        assert!(section.contains("progress file already exists"));
        assert!(section.contains("feat-123"));
    }

    #[test]
    fn progress_section_empty_without_repo_path() {
        let specs = vec![TaskSpec {
            title: "Task A".to_string(),
            description: "Do A".to_string(),
            acceptance_criteria: vec![],
            dependencies: vec![],
            agent: "dev".to_string(),
        }];
        let section = build_progress_section(None, "feat-123", &specs);
        assert!(section.is_empty());
    }

    #[test]
    fn prompt_includes_progress_tracking_with_repo() {
        let feature = make_feature(ExecutionMode::Subagents);
        let (_, _, prompt) =
            build_launch_with_repo(&feature, "System prompt", Some("/tmp/repo"), None, "claude");
        assert!(prompt.contains("CRITICAL"));
        assert!(prompt.contains("execution-complete"));
    }

    #[test]
    fn prompt_includes_commit_pattern_when_provided() {
        let feature = make_feature(ExecutionMode::Subagents);
        let (_, _, prompt) = build_launch_with_repo(
            &feature,
            "System prompt",
            Some("/tmp/repo"),
            Some(r"^(feat|fix): .+"),
            "claude",
        );
        assert!(prompt.contains("commit messages MUST match"));
        assert!(prompt.contains("^(feat|fix): .+"));
    }

    #[test]
    fn prompt_omits_commit_pattern_when_none() {
        let feature = make_feature(ExecutionMode::Subagents);
        let (_, _, prompt) =
            build_launch_with_repo(&feature, "System prompt", Some("/tmp/repo"), None, "claude");
        assert!(!prompt.contains("commit messages MUST match"));
    }

    #[test]
    fn prompt_includes_attachments_in_teams_mode() {
        let mut feature = make_feature(ExecutionMode::Teams);
        feature.attachments = vec![DocumentAttachment {
            name: "design.md".to_string(),
            content: "Widget must be blue".to_string(),
            file_path: None,
        }];
        let (_, _, prompt) = build_launch(&feature, "System prompt");
        assert!(prompt.contains("Attached Documents"));
        assert!(prompt.contains("### design.md"));
        assert!(prompt.contains("Widget must be blue"));
    }

    #[test]
    fn prompt_includes_attachments_in_subagents_mode() {
        let mut feature = make_feature(ExecutionMode::Subagents);
        feature.attachments = vec![DocumentAttachment {
            name: "api-spec.json".to_string(),
            content: r#"{"endpoint": "/widgets"}"#.to_string(),
            file_path: None,
        }];
        let (_, _, prompt) = build_launch(&feature, "System prompt");
        assert!(prompt.contains("Attached Documents"));
        assert!(prompt.contains("### api-spec.json"));
        assert!(prompt.contains("/widgets"));
    }

    #[test]
    fn prompt_includes_image_attachment_as_path() {
        let mut feature = make_feature(ExecutionMode::Subagents);
        feature.attachments = vec![DocumentAttachment {
            name: "mockup.png".to_string(),
            content: String::new(),
            file_path: Some("/Users/me/mockup.png".to_string()),
        }];
        let (_, _, prompt) = build_launch(&feature, "System prompt");
        assert!(prompt.contains("Attached Documents"));
        assert!(prompt.contains("mockup.png (image)"));
        assert!(prompt.contains("/Users/me/mockup.png"));
        assert!(prompt.contains("Read tool"));
    }

    #[test]
    fn prompt_omits_attachments_section_when_empty() {
        let feature = make_feature(ExecutionMode::Subagents);
        let (_, _, prompt) = build_launch(&feature, "System prompt");
        assert!(!prompt.contains("Attached Documents"));
    }
}
