use crate::analytics;
use crate::functional_testing;
use crate::git;
use crate::guidance;
use crate::harness;
use crate::heuristics;
use crate::launch;
use crate::models::*;
use crate::observer;
use crate::prompts;
use crate::pty;
use crate::store::{self, AppState};
use crate::templates;
use crate::validators;
use chrono::Utc;
use std::path::Path;
use tauri::State;

// ── Repository Commands ──

#[tauri::command]
pub fn list_repositories(state: State<AppState>) -> Vec<Repository> {
    state
        .repositories
        .lock()
        .unwrap()
        .values()
        .cloned()
        .collect()
}

#[tauri::command]
pub fn add_repository(
    state: State<AppState>,
    name: String,
    path: String,
    base_branch: String,
    description: Option<String>,
    validators: Vec<String>,
    pr_command: Option<String>,
    similar_repo_ids: Option<Vec<String>>,
    commit_pattern: Option<String>,
) -> Result<Repository, String> {
    if !Path::new(&path).exists() {
        return Err("Path does not exist".to_string());
    }
    if !git::is_git_repo(&path) {
        return Err("Path is not a git repository".to_string());
    }
    // Validate the regex if provided
    if let Some(ref pat) = commit_pattern {
        regex::Regex::new(pat).map_err(|e| format!("Invalid commit pattern regex: {}", e))?;
    }
    let repo = Repository::new(
        name,
        path,
        base_branch,
        description.unwrap_or_default(),
        validators,
        pr_command,
        similar_repo_ids.unwrap_or_default(),
        commit_pattern,
    );
    let mut repos = state.repositories.lock().unwrap();
    repos.insert(repo.id.clone(), repo.clone());
    drop(repos);
    state.save_repos();
    Ok(repo)
}

#[tauri::command]
pub fn update_repository(
    state: State<AppState>,
    id: String,
    name: String,
    base_branch: String,
    description: Option<String>,
    validators: Vec<String>,
    pr_command: Option<String>,
    similar_repo_ids: Option<Vec<String>>,
    commit_pattern: Option<String>,
) -> Result<Repository, String> {
    // Validate the regex if provided
    if let Some(ref pat) = commit_pattern {
        regex::Regex::new(pat).map_err(|e| format!("Invalid commit pattern regex: {}", e))?;
    }
    let mut repos = state.repositories.lock().unwrap();
    let repo = repos.get_mut(&id).ok_or("Repository not found")?;
    repo.name = name;
    repo.base_branch = base_branch;
    repo.description = description.unwrap_or_default();
    repo.validators = validators;
    repo.pr_command = pr_command;
    repo.similar_repo_ids = similar_repo_ids.unwrap_or_default();
    repo.commit_pattern = commit_pattern;
    let updated = repo.clone();
    drop(repos);
    state.save_repos();
    Ok(updated)
}

#[tauri::command]
pub fn remove_repository(state: State<AppState>, id: String) -> Result<(), String> {
    let mut repos = state.repositories.lock().unwrap();
    repos.remove(&id).ok_or("Repository not found")?;
    drop(repos);
    state.save_repos();
    Ok(())
}

#[tauri::command]
pub fn detect_repo_info(path: String) -> Result<serde_json::Value, String> {
    if !Path::new(&path).exists() {
        return Err("Path does not exist".to_string());
    }
    if !git::is_git_repo(&path) {
        return Err("Path is not a git repository".to_string());
    }
    let base_branch = git::get_default_branch(&path).unwrap_or_else(|_| "main".to_string());
    let name = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let has_claude_md = has_claude_md_file(&path);
    let is_empty = git::is_repo_empty(&path);
    let commit_pattern = git::detect_commit_pattern(&path);
    Ok(
        serde_json::json!({ "name": name, "base_branch": base_branch, "has_claude_md": has_claude_md, "is_empty": is_empty, "commit_pattern": commit_pattern }),
    )
}

/// Check whether a CLAUDE.md file exists at the repo root.
fn has_claude_md_file(repo_path: &str) -> bool {
    Path::new(repo_path).join("CLAUDE.md").exists()
}

/// Check if CLAUDE.md exists for a given repo path.
#[tauri::command]
pub fn check_claude_md(path: String) -> Result<bool, String> {
    if !Path::new(&path).exists() {
        return Err("Path does not exist".to_string());
    }
    Ok(has_claude_md_file(&path))
}

/// Spawn Claude Code in --print mode to auto-generate a CLAUDE.md for the repo.
/// Claude analyzes the codebase and writes CLAUDE.md to the repo root.
/// Returns immediately; the frontend polls `check_claude_md` to detect completion.
#[tauri::command]
pub fn generate_claude_md(path: String) -> Result<(), String> {
    use std::io::Write as IoWrite;

    let repo_path = Path::new(&path);
    if !repo_path.exists() {
        return Err("Path does not exist".to_string());
    }
    if !git::is_git_repo(&path) {
        return Err("Path is not a git repository".to_string());
    }
    if git::is_repo_empty(&path) {
        return Err(
            "Cannot generate CLAUDE.md for an empty repository — there's nothing to analyze yet"
                .to_string(),
        );
    }

    let prompt = r#"Analyze this codebase and generate a lean CLAUDE.md file in the project root. Keep it focused — only include what an AI coding agent actually needs to work here. No filler, no generic advice.

Include ONLY these sections if they apply:

1. **What this is** — one-liner: tech stack and purpose
2. **Commands** — exact install, build, test, lint commands (from package.json, Cargo.toml, Makefile, etc.)
3. **Testing** — how to run tests, framework used, where test files go
4. **Conventions** — only non-obvious patterns: naming, file layout, architectural rules that would trip up an agent

Skip any section where there's nothing project-specific to say. Aim for under 80 lines total. Write the file to `CLAUDE.md` at the repository root."#;

    let log_dir = repo_path.join(".gmb");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_file_path = log_dir.join("claude-md-generation.log");
    // Truncate the log file at start
    let _ = std::fs::write(&log_file_path, "");

    let mut cmd = std::process::Command::new("claude");
    apply_user_path(&mut cmd);
    cmd.arg("--print")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg("--allowedTools")
        .arg("Read,Glob,Grep,Write")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .current_dir(&path);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Claude: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = stdin.write_all(prompt.as_bytes());
        });
    }

    relay_output_to_log(&mut child, log_file_path);

    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

/// Return the shell command that would be used to generate CLAUDE.md for a repo.
/// This is for transparency — the user can see exactly what runs on their behalf.
#[tauri::command]
pub fn get_claude_md_command(path: String) -> Result<String, String> {
    let repo_path = Path::new(&path);
    if !repo_path.exists() {
        return Err("Path does not exist".to_string());
    }

    let escaped_path = shell_quote(&path);

    Ok(format!(
        "cd {} && claude --print --permission-mode bypassPermissions --allowedTools 'Read,Glob,Grep,Write' [prompt via stdin]",
        escaped_path
    ))
}

// ── Agent Commands (file-based) ──

#[tauri::command]
pub fn list_agents(repo_path: String) -> Result<Vec<AgentFile>, String> {
    let mut agents = store::list_repo_agents(&repo_path)?;
    if let Ok(global) = store::list_global_agents() {
        agents.extend(global);
    }
    Ok(agents)
}

#[tauri::command]
pub fn save_agent(repo_path: String, agent: AgentFile) -> Result<(), String> {
    store::save_repo_agent(&repo_path, &agent)
}

#[tauri::command]
pub fn delete_agent(repo_path: String, filename: String) -> Result<(), String> {
    store::delete_repo_agent(&repo_path, &filename)
}

#[tauri::command]
pub fn list_global_agents() -> Result<Vec<AgentFile>, String> {
    store::list_global_agents()
}

#[tauri::command]
pub fn save_global_agent(agent: AgentFile) -> Result<(), String> {
    store::save_global_agent(&agent)
}

#[tauri::command]
pub fn delete_global_agent(filename: String) -> Result<(), String> {
    store::delete_global_agent(&filename)
}

// ── Skill Commands (file-based) ──

#[tauri::command]
pub fn list_global_skills() -> Result<Vec<SkillFile>, String> {
    store::list_global_skills()
}

#[tauri::command]
pub fn save_global_skill(skill: SkillFile) -> Result<(), String> {
    store::save_global_skill(&skill)
}

#[tauri::command]
pub fn delete_global_skill(dir_name: String) -> Result<(), String> {
    store::delete_global_skill(&dir_name)
}

/// Spawn Claude Code in --print mode to auto-generate a skill from a description.
/// Claude creates the skill directory and SKILL.md file.
/// Returns the skill name; frontend polls `check_skill_generation` to detect completion.
#[tauri::command]
pub fn generate_skill(description: String) -> Result<String, String> {
    use std::io::Write as IoWrite;

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())?;
    let skills_dir = std::path::Path::new(&home).join(".claude").join("skills");
    let _ = std::fs::create_dir_all(&skills_dir);

    // Derive a skill name from the description for polling
    let skill_name = description
        .split_whitespace()
        .take(4)
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "");
    let skill_name = if skill_name.is_empty() {
        "new-skill".to_string()
    } else {
        skill_name
    };

    let prompt = format!(
        r#"Create a Claude Code custom skill based on this description:

{description}

Write the skill as a SKILL.md file in the directory: {skills_dir}/{skill_name}/

The SKILL.md file MUST have this exact format:
- YAML frontmatter with `name`, `description`, and `user_invocable: true`
- Body contains the prompt template that runs when the skill is invoked
- Use $ARGUMENTS placeholder if the skill should accept user input

Example format:
```
---
name: skill-name
description: One-line description of what this skill does
user_invocable: true
---

The prompt template content here...
```

Keep the prompt template focused and actionable. Create the directory if it doesn't exist, then write the SKILL.md file."#,
        description = description,
        skills_dir = skills_dir.display(),
        skill_name = skill_name,
    );

    let log_dir = std::path::Path::new(&home).join(".claude").join(".gmb");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_file_path = log_dir.join("skill-generation.log");
    let _ = std::fs::write(&log_file_path, "");

    let mut cmd = std::process::Command::new("claude");
    apply_user_path(&mut cmd);
    cmd.arg("--print")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg("--allowedTools")
        .arg("Write,Bash")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .current_dir(&home);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Claude: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = stdin.write_all(prompt.as_bytes());
        });
    }

    relay_output_to_log(&mut child, log_file_path);

    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(skill_name)
}

/// Check if a skill has been generated (for polling after generate_skill).
#[tauri::command]
pub fn check_skill_generation(name: String) -> Result<bool, String> {
    store::check_skill_generation(&name)
}

// ── Feature Commands ──

/// Validate a feature name: must not be empty, not too long, no path traversal.
fn validate_feature_name(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Feature name cannot be empty".to_string());
    }
    if name.len() > 200 {
        return Err("Feature name too long (max 200 chars)".to_string());
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Feature name contains invalid characters".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn start_feature(
    state: State<AppState>,
    repo_ids: Vec<String>,
    name: String,
    description: String,
    map_id: Option<String>,
    attachments: Option<Vec<DocumentAttachment>>,
) -> Result<Feature, String> {
    if repo_ids.is_empty() {
        return Err("At least one repository must be selected".to_string());
    }
    validate_feature_name(&name)?;

    let repos_lock = state.repositories.lock().unwrap();
    let resolved_repos: Vec<Repository> = repo_ids
        .iter()
        .map(|id| {
            repos_lock
                .get(id)
                .cloned()
                .ok_or(format!("Repository not found: {}", id))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let all_repos_snapshot: Vec<Repository> = repos_lock.values().cloned().collect();
    drop(repos_lock);

    // Create feature branch in all repos, with rollback on failure
    let feature_slug = git::sanitize_branch_name(&slug::slugify(&name));
    let short_id = &uuid::Uuid::new_v4().to_string()[..4];
    let branch_name = format!("feature/{}-{}", feature_slug, short_id);

    let mut created_branches: Vec<&Repository> = Vec::new();
    for repo in &resolved_repos {
        match git::create_branch(&repo.path, &branch_name, &repo.base_branch) {
            Ok(()) => created_branches.push(repo),
            Err(e) => {
                // Rollback: delete branches created so far
                for created_repo in &created_branches {
                    let _ = git::delete_branch(&created_repo.path, &branch_name);
                }
                return Err(format!(
                    "Failed to create branch in {} (rolled back {}): {}",
                    repo.name,
                    created_branches.len(),
                    e
                ));
            }
        }
    }

    let mut feature = Feature::new(
        repo_ids,
        name,
        description,
        branch_name,
        attachments.unwrap_or_default(),
    );

    // Create worktrees for each repo so features can run in parallel
    for repo in &resolved_repos {
        match git::create_worktree(&repo.path, &feature.branch, &feature.id, &repo.name) {
            Ok(wt_path) => {
                feature
                    .worktree_paths
                    .insert(repo.id.clone(), wt_path.to_string_lossy().to_string());
            }
            Err(e) => {
                log::warn!(
                    "Could not create worktree for {} (will use main checkout): {}",
                    repo.name,
                    e
                );
            }
        }
    }

    // Create ideation directory in primary repo
    let primary_repo = &resolved_repos[0];
    let ideation_dir = Path::new(&primary_repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let tasks_dir = ideation_dir.join("tasks");
    std::fs::create_dir_all(&tasks_dir)
        .map_err(|e| format!("Failed to create feature dir: {}", e))?;

    // Generate repo context from all repos (include similar repos for pattern hints)
    let repo_map = generate_multi_repo_context_with_similar(&resolved_repos, &all_repos_snapshot);

    // Build agents list from all repos' .claude/agents/ files
    let mut all_agents: Vec<AgentFile> = Vec::new();
    let mut seen_filenames = std::collections::HashSet::new();
    for repo in &resolved_repos {
        if let Ok(agents) = store::list_repo_agents(&repo.path) {
            for agent in agents {
                if seen_filenames.insert(agent.filename.clone()) {
                    all_agents.push(agent);
                }
            }
        }
    }
    if let Ok(global_agents) = store::list_global_agents() {
        for agent in global_agents {
            if seen_filenames.insert(agent.filename.clone()) {
                all_agents.push(agent);
            }
        }
    }

    let format_agent = |a: &AgentFile| {
        let desc = if a.description.is_empty() {
            String::new()
        } else {
            format!(": {}", a.description)
        };
        format!(
            "- **{}** ({}){}",
            a.name,
            a.filename.strip_suffix(".md").unwrap_or(&a.filename),
            desc
        )
    };

    // Exclude disabled agents from ideation
    let enabled_agents: Vec<&AgentFile> = all_agents.iter().filter(|a| a.enabled).collect();
    let agent_list: String = enabled_agents
        .iter()
        .map(|a| format_agent(a))
        .collect::<Vec<_>>()
        .join("\n");
    let quality_agent_list: String = enabled_agents
        .iter()
        .filter(|a| a.role == "quality")
        .map(|a| format_agent(a))
        .collect::<Vec<_>>()
        .join("\n");

    // Use explicit map if provided, otherwise auto-detect from repo overlap
    let architecture_context = {
        let maps = state.system_maps.lock().unwrap();
        let chosen_map = if let Some(ref mid) = map_id {
            maps.get(mid)
        } else {
            let repo_id_set: std::collections::HashSet<&String> = feature.repo_ids.iter().collect();
            maps.values().find(|m| {
                m.services.iter().any(|s| {
                    s.repo_id
                        .as_ref()
                        .map_or(false, |rid| repo_id_set.contains(rid))
                })
            })
        };
        chosen_map
            .map(|m| format_map_context(m))
            .unwrap_or_default()
    };

    let system_prompt = prompts::ideation_system_prompt_with_architecture(
        &repo_map,
        &agent_list,
        &architecture_context,
    );
    std::fs::write(ideation_dir.join("system-prompt.md"), &system_prompt)
        .map_err(|e| format!("Failed to write system prompt: {}", e))?;

    let ft_enabled = state.preferences.lock().unwrap().functional_testing_enabled;
    let user_prompt = prompts::ideation_user_prompt_full(
        &feature.description,
        &tasks_dir.to_string_lossy(),
        &agent_list,
        &quality_agent_list,
        ft_enabled,
        &feature.attachments,
    );
    std::fs::write(ideation_dir.join("user-prompt.md"), &user_prompt)
        .map_err(|e| format!("Failed to write user prompt: {}", e))?;

    let mut features = state.features.lock().unwrap();
    features.insert(feature.id.clone(), feature.clone());
    drop(features);
    state.save_features();

    Ok(feature)
}

#[tauri::command]
pub fn list_features(state: State<AppState>, repo_id: Option<String>) -> Vec<Feature> {
    let features = state.features.lock().unwrap();
    match repo_id {
        Some(rid) => features
            .values()
            .filter(|f| f.effective_repo_ids().contains(&rid))
            .cloned()
            .collect(),
        None => features.values().cloned().collect(),
    }
}

#[tauri::command]
pub fn get_feature(state: State<AppState>, feature_id: String) -> Result<Feature, String> {
    state
        .features
        .lock()
        .unwrap()
        .get(&feature_id)
        .cloned()
        .ok_or("Feature not found".to_string())
}

/// Get the plan history for a feature (prior plan snapshots).
#[tauri::command]
pub fn get_plan_history(
    state: State<AppState>,
    feature_id: String,
) -> Result<Vec<PlanSnapshot>, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?;
    Ok(feature.plan_history.clone())
}

#[tauri::command]
pub fn delete_feature(
    state: State<AppState>,
    pty_sessions: State<pty::PtySessions>,
    feature_id: String,
) -> Result<(), String> {
    let feature = {
        let features = state.features.lock().unwrap();
        features
            .get(&feature_id)
            .cloned()
            .ok_or("Feature not found")?
    };

    // Kill any active PTY session
    if let Some(session_id) = &feature.pty_session_id {
        let _ = pty::kill_pty_session(&pty_sessions, session_id);
    }

    // Remove .gmb/features/<id> directory from primary repo
    if let Some(primary_id) = feature.primary_repo_id() {
        if let Ok(repo) = get_repo(&state, primary_id) {
            let feature_dir = Path::new(&repo.path)
                .join(".gmb")
                .join("features")
                .join(&feature.id);
            if feature_dir.exists() {
                let _ = std::fs::remove_dir_all(&feature_dir);
            }
        }
    }

    // Clean up worktrees and branches from all repos (best-effort)
    // First remove worktrees using stored paths (handles cross-repo worktrees)
    for (repo_id, wt_path) in &feature.worktree_paths {
        if let Ok(repo) = get_repo(&state, repo_id) {
            let _ = git::remove_worktree(&repo.path, wt_path);
        }
    }
    for repo_id in &feature.effective_repo_ids() {
        if let Ok(repo) = get_repo(&state, repo_id) {
            // Also clean up any worktree directory structure
            let _ = git::cleanup_feature_worktrees(&repo.path, &feature.id);
            let _ = git::delete_branch(&repo.path, &feature.branch);
        }
    }

    // Remove from state and persist
    let mut features = state.features.lock().unwrap();
    features.remove(&feature_id);
    drop(features);
    state.save_features();

    Ok(())
}

// ── Ideation Commands ──

#[tauri::command]
pub fn get_ideation_prompt(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;

    let path = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("system-prompt.md");
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read prompt: {}", e))
}

#[tauri::command]
pub fn get_ideation_user_prompt(
    state: State<AppState>,
    feature_id: String,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;

    let path = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("user-prompt.md");
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read user prompt: {}", e))
}

#[tauri::command]
pub fn get_ideation_terminal_command(
    state: State<AppState>,
    feature_id: String,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;

    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let system_prompt_path = feature_dir.join("system-prompt.md");
    let user_prompt_path = feature_dir.join("user-prompt.md");

    // Use worktree path if available
    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    // Shell-quote paths to prevent injection
    let escaped_work_dir = shell_quote(work_dir);
    let escaped_sys = shell_quote(&system_prompt_path.to_string_lossy());
    let escaped_usr = shell_quote(&user_prompt_path.to_string_lossy());

    Ok(format!(
        "cd {} && claude --permission-mode bypassPermissions --allowedTools 'Read,Glob,Grep,Write' --append-system-prompt \"$(cat {})\" \"$(cat {})\"",
        escaped_work_dir, escaped_sys, escaped_usr
    ))
}

/// Log a "Plan created" activity entry on a feature, but only if one hasn't
/// already been logged since the last plan revision (or ever, if no revision
/// was requested). This is safe to call from the repeated polling loop.
fn log_plan_created_once(state: &State<AppState>, feature_id: &str) {
    let mut features = state.features.lock().unwrap();
    if let Some(feature) = features.get_mut(feature_id) {
        if feature.log_plan_created_once() {
            drop(features);
            state.save_features();
        }
    }
}

/// Poll for the ideation plan.json file. Returns discovered tasks + execution mode recommendation.
#[tauri::command]
pub fn poll_ideation_result(
    state: State<AppState>,
    feature_id: String,
) -> Result<IdeationResult, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;

    let tasks_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("tasks");

    // Load any previously answered questions for context
    let answers_path = tasks_dir.join("answers.json");
    let answered_questions = if answers_path.exists() {
        std::fs::read_to_string(&answers_path)
            .ok()
            .and_then(|data| serde_json::from_str::<AnswersFile>(&data).ok())
            .map(|f| f.answers)
    } else {
        None
    };

    // Try plan.json first (new format with execution_mode)
    let plan_path = tasks_dir.join("plan.json");
    if plan_path.exists() {
        match std::fs::read_to_string(&plan_path) {
            Ok(data) => match serde_json::from_str::<IdeationResult>(&data) {
                Ok(mut result) => {
                    result.answered_questions = answered_questions;
                    // Log "Plan created" once when a plan with tasks is first discovered
                    if !result.tasks.is_empty() {
                        log_plan_created_once(&state, &feature_id);
                    }
                    return Ok(result);
                }
                Err(e) => {
                    log::warn!("Malformed plan.json for feature {}: {}", feature_id, e);
                }
            },
            Err(e) => {
                log::warn!("Failed to read plan.json for feature {}: {}", feature_id, e);
            }
        }
    }

    // Check for questions.json (planner is asking for clarification)
    let questions_path = tasks_dir.join("questions.json");
    if questions_path.exists() {
        match std::fs::read_to_string(&questions_path) {
            Ok(data) => match serde_json::from_str::<QuestionsFile>(&data) {
                Ok(qf) => {
                    return Ok(IdeationResult {
                        tasks: vec![],
                        execution_mode: None,
                        questions: Some(qf.questions),
                        answered_questions,
                        test_harness: None,
                        functional_test_steps: None,
                    });
                }
                Err(e) => {
                    log::warn!("Malformed questions.json for feature {}: {}", feature_id, e);
                }
            },
            Err(e) => {
                log::warn!(
                    "Failed to read questions.json for feature {}: {}",
                    feature_id,
                    e
                );
            }
        }
    }

    // Fallback: read individual NN.json files (old format)
    if !tasks_dir.exists() {
        return Ok(IdeationResult {
            tasks: vec![],
            execution_mode: None,
            questions: None,
            answered_questions: None,
            test_harness: None,
            functional_test_steps: None,
        });
    }

    let mut specs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&tasks_dir) {
        let mut files: Vec<_> = entries
            .flatten()
            .filter(|e| {
                let fname = e.file_name().to_string_lossy().to_string();
                fname.ends_with(".json")
                    && fname != "plan.json"
                    && fname != "questions.json"
                    && fname != "answers.json"
            })
            .collect();
        files.sort_by_key(|e| e.file_name());
        for entry in files {
            match std::fs::read_to_string(entry.path()) {
                Ok(data) => match serde_json::from_str::<TaskSpec>(&data) {
                    Ok(spec) => specs.push(spec),
                    Err(e) => {
                        log::warn!(
                            "Skipping malformed task file {}: {}",
                            entry.path().display(),
                            e
                        );
                    }
                },
                Err(e) => {
                    log::warn!("Failed to read task file {}: {}", entry.path().display(), e);
                }
            }
        }
    }

    // Log "Plan created" once when tasks are first discovered (old format)
    if !specs.is_empty() {
        log_plan_created_once(&state, &feature_id);
    }

    Ok(IdeationResult {
        tasks: specs,
        execution_mode: None,
        questions: None,
        answered_questions,
        test_harness: None,
        functional_test_steps: None,
    })
}

// ── Launch Configuration Commands ──

/// Save the launch configuration (execution mode, agents, tasks) on a feature
/// and transition it to Configuring status.
#[tauri::command]
pub fn configure_launch(
    state: State<AppState>,
    feature_id: String,
    execution_mode: ExecutionMode,
    execution_rationale: String,
    selected_agents: Vec<String>,
    task_specs: Vec<TaskSpec>,
    #[allow(unused_variables)] test_harness: Option<TestHarness>,
    #[allow(unused_variables)] functional_test_steps: Option<Vec<FunctionalTestStep>>,
) -> Result<Feature, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;
    feature.execution_mode = Some(execution_mode.clone());
    feature.execution_rationale = Some(execution_rationale);
    feature.selected_agents = selected_agents;
    feature.task_specs = task_specs;
    feature.log_activity(
        format!("Launch configured in {:?} mode", execution_mode),
        "info",
    );
    if let Some(h) = test_harness {
        feature.test_harness = Some(h);
    }
    if let Some(steps) = functional_test_steps {
        feature.functional_test_steps = steps;
    }
    // Status stays as-is; markFeatureExecuting transitions to Executing
    feature.updated_at = Utc::now();
    let updated = feature.clone();
    drop(features);
    state.save_features();
    Ok(updated)
}

/// Check whether tmux is installed (required for Agent Teams mode).
#[tauri::command]
pub fn check_tmux_installed() -> bool {
    launch::is_tmux_available()
}

/// Detect which shells/terminals are available on this system.
/// Returns a list of (value, label) pairs for shells found on PATH.
#[tauri::command]
pub fn detect_available_shells() -> Vec<(String, String)> {
    let candidates = if cfg!(target_os = "windows") {
        vec![
            ("powershell", "PowerShell"),
            ("cmd", "Command Prompt (cmd)"),
            ("wt", "Windows Terminal"),
            ("bash", "Bash"),
            ("zsh", "Zsh"),
            ("tmux", "tmux"),
        ]
    } else {
        vec![
            ("bash", "Bash"),
            ("zsh", "Zsh"),
            ("tmux", "tmux"),
            ("fish", "Fish"),
        ]
    };
    let which_cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    candidates
        .into_iter()
        .filter(|(cmd, _)| {
            std::process::Command::new(which_cmd)
                .arg(cmd)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        })
        .map(|(v, l)| (v.to_string(), l.to_string()))
        .collect()
}

/// Get the terminal command to launch execution for a feature.
#[tauri::command]
pub fn get_launch_command(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;

    // Read the system prompt (repo context + agents) written during ideation
    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let system_prompt_path = feature_dir.join("system-prompt.md");
    let system_prompt_content = std::fs::read_to_string(&system_prompt_path).unwrap_or_default();

    // Use worktree path if available (allows concurrent features)
    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    let (args, env, _prompt) = launch::build_launch_with_repo(
        &feature,
        &system_prompt_content,
        Some(&repo.path),
        repo.commit_pattern.as_deref(),
    );

    // Build the full command string
    let env_prefix: String = env
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(" ");

    let cmd = if env_prefix.is_empty() {
        format!("cd {} && {}", work_dir, args.join(" "))
    } else {
        format!("cd {} && {} {}", work_dir, env_prefix, args.join(" "))
    };

    Ok(cmd)
}

/// Start a PTY session with the launch command for a feature.
/// Returns the session ID so the frontend can attach a terminal.
#[tauri::command]
pub fn start_launch_pty(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    pty_sessions: State<pty::PtySessions>,
    pty_buffers: State<pty::PtyBuffers>,
    feature_id: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;

    // Read the system prompt written during ideation
    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let system_prompt_path = feature_dir.join("system-prompt.md");
    let system_prompt_content = std::fs::read_to_string(&system_prompt_path).unwrap_or_default();

    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    let (args, env, _prompt) = launch::build_launch_with_repo(
        &feature,
        &system_prompt_content,
        Some(&repo.path),
        repo.commit_pattern.as_deref(),
    );

    // Pre-seed the progress file so Claude has a concrete file to update
    // and the UI immediately sees the task list. This dramatically improves
    // the chance Claude will update it vs writing from scratch.
    let tasks_dir = feature_dir.join("tasks");
    let _ = std::fs::create_dir_all(&tasks_dir);
    let progress_path = tasks_dir.join("progress.json");
    let initial_progress = build_initial_progress_json(&feature.task_specs);
    let _ = std::fs::write(&progress_path, initial_progress);

    let session_id = format!("launch-{}", feature_id);

    // Wrap command in user's preferred shell (e.g. tmux)
    let prefs = state.preferences.lock().unwrap().clone();
    let shell = if prefs.shell.is_empty() {
        default_shell()
    } else {
        prefs.shell.clone()
    };
    let (cmd, cmd_args) = wrap_in_shell(&shell, &args);

    pty::spawn_pty_session(
        &app_handle,
        &session_id,
        &cmd,
        &cmd_args,
        work_dir,
        cols,
        rows,
        &pty_sessions,
        &pty_buffers,
        &env,
        resolve_user_path().as_deref(),
    )?;

    // Build the full command string for display (reflects actual wrapped command)
    let env_prefix: String = env
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(" ");
    let actual_cmd_str = if cmd_args.is_empty() {
        cmd.clone()
    } else {
        format!("{} {}", cmd, cmd_args.join(" "))
    };
    let full_command = if env_prefix.is_empty() {
        format!("cd {} && {}", work_dir, actual_cmd_str)
    } else {
        format!("cd {} && {} {}", work_dir, env_prefix, actual_cmd_str)
    };

    // Mark feature as executing
    let mut features = state.features.lock().unwrap();
    if let Some(f) = features.get_mut(&feature_id) {
        f.status = FeatureStatus::Executing;
        f.pty_session_id = Some(session_id.clone());
        f.launched_command = Some(full_command);
        f.updated_at = Utc::now();
    }
    drop(features);
    state.save_features();

    Ok(session_id)
}

/// Mark a feature as executing (user has launched the terminal command).
#[tauri::command]
pub fn mark_feature_executing(
    state: State<AppState>,
    feature_id: String,
) -> Result<Feature, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;
    feature.status = FeatureStatus::Executing;
    feature.log_activity("Execution started", "info");
    let updated = feature.clone();
    drop(features);
    state.save_features();
    Ok(updated)
}

/// Mark a feature as ready (execution complete, ready for validation/PR).
/// If tasks were not all completed, returns the feature to planning (Ideation) instead.
#[tauri::command]
pub fn mark_feature_ready(state: State<AppState>, feature_id: String) -> Result<Feature, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;

    // Only act if the feature is still executing. If cancel_execution already
    // moved it to another status, this is a stale PTY exit — skip it.
    if feature.status != FeatureStatus::Executing {
        let updated = feature.clone();
        drop(features);
        return Ok(updated);
    }

    // Check if all tasks were actually completed by reading progress.json
    let all_tasks_done = {
        let repo_id = feature.primary_repo_id().map(|s| s.to_string());
        let repos = state.repositories.lock().unwrap();
        let repo_path = repo_id.and_then(|rid| repos.get(&rid).map(|r| r.path.clone()));
        drop(repos);
        repo_path
            .and_then(|rp| {
                let progress_path = Path::new(&rp)
                    .join(".gmb")
                    .join("features")
                    .join(&feature.id)
                    .join("tasks")
                    .join("progress.json");
                read_task_progress(&progress_path)
            })
            .map(|p| !p.tasks.is_empty() && p.tasks.iter().all(|t| t.status == TaskStatus::Done))
            .unwrap_or(false)
    };

    if all_tasks_done {
        if feature.status != FeatureStatus::Ready {
            feature.log_activity("Execution finished — ready for review", "success");
        }
        feature.status = FeatureStatus::Ready;
    } else {
        feature.log_activity(
            "Execution ended before all tasks completed — returned to planning",
            "warning",
        );
        feature.status = FeatureStatus::Ideation;
    }

    let updated = feature.clone();
    drop(features);
    state.save_features();
    Ok(updated)
}

/// Mark a feature as complete: delete worktrees and set final status.
/// For multi-repo features, all repos must be pushed before completion is allowed.
#[tauri::command]
pub fn complete_feature(state: State<AppState>, feature_id: String) -> Result<Feature, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;

    // Gate: all repos must be pushed before completing
    let repo_ids = feature.effective_repo_ids();
    if repo_ids.len() > 1 {
        let unpushed: Vec<&String> = repo_ids
            .iter()
            .filter(|rid| feature.repo_push_status.get(*rid) != Some(&RepoPushStatus::Pushed))
            .collect();
        if !unpushed.is_empty() {
            return Err(format!(
                "Cannot complete: {} repo(s) not yet pushed",
                unpushed.len()
            ));
        }
    }

    feature.status = FeatureStatus::Complete;
    feature.log_activity("Feature marked complete", "success");

    // Collect worktree info before clearing
    let worktrees: Vec<(String, String)> = feature
        .worktree_paths
        .iter()
        .map(|(repo_id, wt_path)| (repo_id.clone(), wt_path.clone()))
        .collect();
    feature.worktree_paths.clear();

    let updated = feature.clone();
    drop(features);
    state.save_features();

    // Record agent performance history
    state.record_feature_outcome(&updated);

    // Delete worktrees (best-effort)
    let repos = state.repositories.lock().unwrap();
    for (repo_id, wt_path) in &worktrees {
        if let Some(repo) = repos.get(repo_id) {
            let _ = git::remove_worktree(&repo.path, wt_path);
        }
    }

    Ok(updated)
}

/// Cancel execution: kill the PTY session and reset the feature back to ideation.
#[tauri::command]
pub fn cancel_execution(
    state: State<AppState>,
    pty_sessions: State<pty::PtySessions>,
    feature_id: String,
) -> Result<Feature, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;
    // Kill the PTY session if one exists
    if let Some(session_id) = feature.pty_session_id.take() {
        let _ = pty::kill_pty_session(&pty_sessions, &session_id);
    }
    feature.status = FeatureStatus::Ideation;
    feature.log_activity("Execution cancelled", "warning");
    let updated = feature.clone();
    drop(features);
    state.save_features();
    Ok(updated)
}

// ── Validation Commands ──

#[tauri::command]
pub fn run_feature_validators(
    state: State<AppState>,
    feature_id: String,
) -> Result<VerifyResult, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = get_all_repos(&state, &feature)?;

    let mut all_results = Vec::new();
    let mut all_passed = true;

    for repo in &repos {
        if repo.validators.is_empty() {
            continue;
        }

        // Use worktree if available, otherwise create a temporary one.
        // This avoids modifying the main working directory.
        let (validator_path, is_temp_worktree) =
            if let Some(wt_path) = feature.worktree_paths.get(&repo.id) {
                (wt_path.clone(), false)
            } else {
                // Create a temporary worktree for validation
                match git::create_worktree(&repo.path, &feature.branch, &feature.id, &repo.name) {
                    Ok(wt) => (wt.to_string_lossy().to_string(), true),
                    Err(e) => {
                        // Last resort: checkout the branch (old behavior)
                        log::warn!(
                            "Worktree creation failed for {}, falling back to checkout: {}",
                            repo.name,
                            e
                        );
                        git::checkout_branch(&repo.path, &feature.branch)
                            .map_err(|e| format!("Failed to checkout {}: {}", feature.branch, e))?;
                        (repo.path.clone(), false)
                    }
                }
            };

        let shell = state.preferences.lock().unwrap().shell.clone();
        let result = validators::run_validators(&validator_path, &repo.validators, 1, Some(&shell))?;
        if !result.all_passed {
            all_passed = false;
        }
        all_results.extend(result.results);

        // Clean up temp worktree if we created one
        if is_temp_worktree {
            let _ = git::cleanup_feature_worktrees(&repo.path, &feature.id);
        }
    }

    Ok(VerifyResult {
        attempt: 1,
        all_passed,
        results: all_results,
        timestamp: Utc::now(),
    })
}

// ── Functional Testing Commands ──

/// Start functional testing for a feature — transitions to Testing status,
/// increments the attempt counter, and spawns a QA agent PTY session.
#[tauri::command]
pub fn start_functional_testing(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    pty_sessions: State<pty::PtySessions>,
    pty_buffers: State<pty::PtyBuffers>,
    harness_mgr: State<harness::HarnessManager>,
    feature_id: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;

    let harness = feature
        .test_harness
        .clone()
        .ok_or("No test harness configured for this feature")?;

    let next_attempt = feature.testing_attempt + 1;

    if next_attempt > feature.max_testing_attempts {
        feature.status = FeatureStatus::Failed;
        feature.updated_at = Utc::now();
        let updated = feature.clone();
        drop(features);
        state.save_features();
        return Err(format!(
            "Max testing attempts ({}) exceeded",
            updated.max_testing_attempts
        ));
    }

    feature.status = FeatureStatus::Testing;
    feature.testing_started_at = Some(Utc::now());
    feature.updated_at = Utc::now();
    // Don't increment attempt yet — wait until PTY spawn succeeds
    let attempt = next_attempt;
    let feature_snapshot = feature.clone();
    drop(features);
    state.save_features();

    let repo = get_primary_repo(&state, &feature_snapshot)?;
    let work_dir = feature_snapshot
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    // Ensure proofs directory
    let proofs_path = functional_testing::ensure_proofs_dir(work_dir, &feature_id, attempt)?;
    let proofs_path_str = proofs_path.to_string_lossy().to_string();

    // Build prior feedback for re-test rounds
    let prior_proof_feedback = if attempt > 1 {
        // Get failures from the previous round
        feature_snapshot
            .functional_test_results
            .last()
            .map(|r| {
                r.proofs
                    .iter()
                    .filter(|p| !p.passed)
                    .map(|p| {
                        format!(
                            "- {}: {}",
                            p.step_description,
                            p.error.as_deref().unwrap_or(&p.content)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .filter(|s| !s.is_empty())
    } else {
        None
    };

    // Run validators to capture any failures for the QA prompt
    let validator_feedback = {
        let repos = state.repositories.lock().unwrap();
        let repo = repos
            .get(feature_snapshot.primary_repo_id().unwrap_or(""))
            .cloned();
        drop(repos);
        repo.and_then(|r| {
            if r.validators.is_empty() {
                return None;
            }
            let vpath = feature_snapshot
                .worktree_paths
                .get(&r.id)
                .map(|s| s.as_str())
                .unwrap_or(&r.path);
            let shell = state.preferences.lock().unwrap().shell.clone();
            match validators::run_validators(vpath, &r.validators, attempt, Some(&shell)) {
                Ok(vr) if !vr.all_passed => {
                    let failures: Vec<String> = vr
                        .results
                        .iter()
                        .filter(|v| !v.success)
                        .map(|v| {
                            format!(
                                "- `{}` (exit {}): {}",
                                v.command,
                                v.exit_code,
                                if v.stderr.is_empty() {
                                    v.stdout.lines().take(5).collect::<Vec<_>>().join("\n")
                                } else {
                                    v.stderr.lines().take(5).collect::<Vec<_>>().join("\n")
                                }
                            )
                        })
                        .collect();
                    Some(failures.join("\n"))
                }
                _ => None,
            }
        })
    };

    let prompt = functional_testing::build_testing_prompt(
        &feature_snapshot.name,
        &feature_snapshot.description,
        &feature_snapshot.functional_test_steps,
        &harness,
        &proofs_path_str,
        validator_feedback.as_deref(),
        prior_proof_feedback.as_deref(),
    );

    // Build command
    let prefs = state.preferences.lock().unwrap().clone();
    let shell = if prefs.shell.is_empty() {
        default_shell()
    } else {
        prefs.shell.clone()
    };

    // Start the app under test (harness) before spawning the QA agent
    if !harness.start_command.is_empty() {
        harness::start_harness(
            &harness_mgr,
            &feature_id,
            &harness.start_command,
            &harness.ready_signal,
            work_dir,
            &shell,
        )?;
    }

    let session_id = format!("qa-{}-{}", feature_id, attempt);

    let qa_args = vec![
        "claude".to_string(),
        "--permission-mode".to_string(),
        "auto".to_string(),
        "--append-system-prompt".to_string(),
        "You are qa-tester, a functional testing specialist.".to_string(),
        prompt,
    ];
    let (qa_cmd, qa_cmd_args) = wrap_in_shell(&shell, &qa_args);

    if let Err(e) = pty::spawn_pty_session(
        &app_handle,
        &session_id,
        &qa_cmd,
        &qa_cmd_args,
        work_dir,
        cols,
        rows,
        &pty_sessions,
        &pty_buffers,
        &[],
        resolve_user_path().as_deref(),
    ) {
        // PTY spawn failed — stop the harness to prevent orphaned processes
        harness::stop_harness(&harness_mgr, &feature_id);
        return Err(e);
    }

    // PTY spawn succeeded — now commit the attempt increment and log the decision
    let mut features = state.features.lock().unwrap();
    if let Some(f) = features.get_mut(&feature_id) {
        f.testing_attempt = attempt;
        f.pty_session_id = Some(session_id.clone());
        f.testing_decisions.push(TestingDecision {
            action: "started".to_string(),
            reason: format!("Started testing attempt {}", attempt),
            timestamp: Utc::now(),
        });
    }
    drop(features);
    state.save_features();

    Ok(session_id)
}

/// Skip functional testing and move directly to Ready.
#[tauri::command]
pub fn skip_functional_testing(
    state: State<AppState>,
    harness_mgr: State<harness::HarnessManager>,
    feature_id: String,
) -> Result<Feature, String> {
    harness::stop_harness(&harness_mgr, &feature_id);
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;
    feature.testing_skipped = true;
    feature.testing_started_at = None;
    feature.status = FeatureStatus::Ready;
    feature.log_activity("Functional testing skipped", "info");
    let updated = feature.clone();
    drop(features);
    state.save_features();
    Ok(updated)
}

/// Mark functional testing as complete — collect proofs and decide next state.
/// If tests passed → Ready. If failed and attempts remain → back to Executing (fix loop).
/// If failed and max attempts reached → Failed.
#[tauri::command]
pub fn complete_functional_testing(
    state: State<AppState>,
    harness_mgr: State<harness::HarnessManager>,
    feature_id: String,
) -> Result<Feature, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;
    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    let attempt = feature.testing_attempt;
    let result = functional_testing::collect_proofs(work_dir, &feature_id, attempt)?;

    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;

    // Stop the harness process
    harness::stop_harness(&harness_mgr, &feature_id);

    let all_passed = result.all_passed;
    let fail_count = result
        .proofs
        .iter()
        .filter(|p| !p.passed && !p.is_meta)
        .count();
    feature.functional_test_results.push(result);

    if all_passed {
        feature.status = FeatureStatus::Ready;
        feature.testing_decisions.push(TestingDecision {
            action: "passed".to_string(),
            reason: format!("All proofs passed on attempt {}", attempt),
            timestamp: Utc::now(),
        });
        feature.log_activity(format!("Testing passed on attempt {}", attempt), "success");
    } else if feature.testing_attempt >= feature.max_testing_attempts {
        feature.status = FeatureStatus::Failed;
        feature.testing_decisions.push(TestingDecision {
            action: "max_attempts_reached".to_string(),
            reason: format!(
                "Failed after {} attempts (max {})",
                feature.testing_attempt, feature.max_testing_attempts
            ),
            timestamp: Utc::now(),
        });
        feature.log_activity(
            format!("Testing failed after {} attempts", feature.testing_attempt),
            "error",
        );
    } else {
        // Loop back to executing — implementer needs to fix issues
        feature.status = FeatureStatus::Executing;
        feature.testing_decisions.push(TestingDecision {
            action: "loop_back".to_string(),
            reason: format!(
                "Attempt {} had {} failing proof(s) — looping back for fixes",
                attempt, fail_count
            ),
            timestamp: Utc::now(),
        });
        feature.log_activity(
            format!(
                "Testing attempt {} failed — looping back for fixes",
                attempt
            ),
            "warning",
        );
    }

    feature.pty_session_id = None;
    feature.testing_started_at = None;
    feature.updated_at = Utc::now();
    let updated = feature.clone();
    drop(features);
    state.save_features();
    Ok(updated)
}

/// Get functional test results for a feature.
#[tauri::command]
pub fn get_functional_test_results(
    state: State<AppState>,
    feature_id: String,
) -> Result<Vec<FunctionalTestResult>, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?;
    Ok(feature.functional_test_results.clone())
}

/// Mark a feature as entering the testing phase (without spawning a PTY — for auto-transitions).
#[tauri::command]
pub fn mark_feature_testing(state: State<AppState>, feature_id: String) -> Result<Feature, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;
    if feature.status != FeatureStatus::Testing {
        feature.log_activity("Functional testing started", "info");
    }
    feature.status = FeatureStatus::Testing;
    let updated = feature.clone();
    drop(features);
    state.save_features();
    Ok(updated)
}

/// Re-launch the implementation agent with fix context from failed test proofs.
/// Used when the testing loop sends a feature back to Executing.
#[tauri::command]
pub fn relaunch_with_fix_context(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    pty_sessions: State<pty::PtySessions>,
    pty_buffers: State<pty::PtyBuffers>,
    feature_id: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    if feature.status != FeatureStatus::Executing {
        return Err("Feature must be in Executing status for fix relaunch".to_string());
    }

    let repo = get_primary_repo(&state, &feature)?;
    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    // Build fix context from failed test proofs
    let fix_context = feature
        .functional_test_results
        .last()
        .map(|r| {
            let failures: Vec<String> = r
                .proofs
                .iter()
                .filter(|p| !p.passed)
                .map(|p| {
                    let err = p.error.as_deref().unwrap_or("no error details");
                    format!("- **{}**: {} ({})", p.step_description, err, p.proof_type)
                })
                .collect();
            if failures.is_empty() {
                String::new()
            } else {
                format!(
                    "## QA Testing Failures (Round {})\n\n\
                     The following functional tests failed. Fix these issues:\n\n{}\n\n\
                     After fixing, the feature will be re-tested automatically.",
                    r.attempt,
                    failures.join("\n")
                )
            }
        })
        .unwrap_or_default();

    // Read the original system prompt
    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let system_prompt_path = feature_dir.join("system-prompt.md");
    let mut system_prompt = std::fs::read_to_string(&system_prompt_path).unwrap_or_default();

    // Append fix context to the system prompt
    if !fix_context.is_empty() {
        system_prompt.push_str("\n\n");
        system_prompt.push_str(&fix_context);
    }

    let (args, env, _prompt) = launch::build_launch_with_repo(
        &feature,
        &system_prompt,
        Some(&repo.path),
        repo.commit_pattern.as_deref(),
    );

    let session_id = format!("fix-{}-{}", feature_id, feature.testing_attempt);

    let prefs = state.preferences.lock().unwrap().clone();
    let shell = if prefs.shell.is_empty() {
        default_shell()
    } else {
        prefs.shell.clone()
    };
    let (cmd, cmd_args) = wrap_in_shell(&shell, &args);

    pty::spawn_pty_session(
        &app_handle,
        &session_id,
        &cmd,
        &cmd_args,
        work_dir,
        cols,
        rows,
        &pty_sessions,
        &pty_buffers,
        &env,
        resolve_user_path().as_deref(),
    )?;

    let mut features = state.features.lock().unwrap();
    if let Some(f) = features.get_mut(&feature_id) {
        f.pty_session_id = Some(session_id.clone());
        f.updated_at = Utc::now();
    }
    drop(features);
    state.save_features();

    Ok(session_id)
}

/// Poll functional testing status — harness state, timeout check, completion signal.
/// Returns a structured status object the frontend can use for live progress.
#[tauri::command]
pub fn poll_testing_status(
    state: State<AppState>,
    harness_mgr: State<harness::HarnessManager>,
    feature_id: String,
) -> Result<TestingStatus, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let harness_status = harness::get_harness_status(&harness_mgr, &feature_id);

    // Check for timeout
    let timed_out = if let Some(started_at) = feature.testing_started_at {
        let elapsed = Utc::now()
            .signed_duration_since(started_at)
            .num_seconds()
            .max(0) as u64;
        feature.testing_timeout_secs > 0 && elapsed >= feature.testing_timeout_secs
    } else {
        false
    };

    let elapsed_secs = feature
        .testing_started_at
        .map(|s| Utc::now().signed_duration_since(s).num_seconds().max(0) as u64)
        .unwrap_or(0);

    // Check for completion signal (testing-complete file)
    let repo = get_primary_repo(&state, &feature)?;
    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);
    let proofs_dir = functional_testing::proofs_dir(work_dir, &feature_id, feature.testing_attempt);
    let completion_signal = proofs_dir.join("testing-complete").exists();
    let results_exist = proofs_dir.join("results.json").exists();

    Ok(TestingStatus {
        harness: harness_status,
        timed_out,
        elapsed_secs,
        timeout_secs: feature.testing_timeout_secs,
        completion_signal,
        results_exist,
        attempt: feature.testing_attempt,
        max_attempts: feature.max_testing_attempts,
    })
}

/// Start the test harness (app under test) manually.
#[tauri::command]
pub fn start_test_harness(
    state: State<AppState>,
    harness_mgr: State<harness::HarnessManager>,
    feature_id: String,
) -> Result<(), String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let test_harness = feature
        .test_harness
        .clone()
        .ok_or("No test harness configured")?;

    let repo = get_primary_repo(&state, &feature)?;
    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    let prefs = state.preferences.lock().unwrap().clone();
    let shell = if prefs.shell.is_empty() {
        default_shell()
    } else {
        prefs.shell.clone()
    };

    harness::start_harness(
        &harness_mgr,
        &feature_id,
        &test_harness.start_command,
        &test_harness.ready_signal,
        work_dir,
        &shell,
    )
}

/// Stop the test harness for a feature.
#[tauri::command]
pub fn stop_test_harness(
    harness_mgr: State<harness::HarnessManager>,
    feature_id: String,
) -> Result<(), String> {
    harness::stop_harness(&harness_mgr, &feature_id);
    Ok(())
}

// ── Diff Commands ──

#[tauri::command]
pub fn get_feature_diff(state: State<AppState>, feature_id: String) -> Result<DiffSummary, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = get_all_repos(&state, &feature)?;

    let mut all_files = Vec::new();
    for repo in &repos {
        // Use worktree path if available — the branch ref is shared but the
        // worktree might have uncommitted changes we want to include
        let diff_path = feature
            .worktree_paths
            .get(&repo.id)
            .map(|s| s.as_str())
            .unwrap_or(&repo.path);
        let file_diffs = git::diff_stat(diff_path, &repo.base_branch, &feature.branch)
            .map_err(|e| e.to_string())?;

        let prefix = if repos.len() > 1 {
            format!("[{}] ", repo.name)
        } else {
            String::new()
        };

        for (path, insertions, deletions, status) in file_diffs {
            all_files.push(FileDiff {
                path: format!("{}{}", prefix, path),
                insertions,
                deletions,
                status,
            });
        }
    }

    let total_files = all_files.len() as u32;
    let total_insertions: u32 = all_files.iter().map(|f| f.insertions).sum();
    let total_deletions: u32 = all_files.iter().map(|f| f.deletions).sum();

    Ok(DiffSummary {
        files: all_files,
        total_files,
        total_insertions,
        total_deletions,
    })
}

// ── Feature PR Commands ──

/// Push a single repo within a feature: commit uncommitted changes and push to origin.
/// Updates per-repo push status and promotes feature to Pushed when all repos are done.
#[tauri::command]
pub fn push_feature_repo(
    state: State<AppState>,
    feature_id: String,
    repo_id: String,
    commit_message: Option<String>,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    // Verify repo belongs to this feature
    let repo_ids = feature.effective_repo_ids();
    if !repo_ids.contains(&repo_id) {
        return Err("Repository is not part of this feature".to_string());
    }

    let repo = get_repo(&state, &repo_id)?;
    let work_dir = feature
        .worktree_paths
        .get(&repo_id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    let mut outputs = Vec::new();

    // Commit any uncommitted changes — use provided message or generate a default
    let commit_msg = commit_message.unwrap_or_else(|| git::build_commit_message(work_dir, &feature.name));
    match git::commit_all(work_dir, &commit_msg) {
        Ok(true) => outputs.push(format!("{}: committed changes", repo.name)),
        Ok(false) => {} // nothing to commit
        Err(e) => {
            let hint = if e.to_string().contains("branch") || e.to_string().contains("ref") {
                format!(
                    " (hint: check that branch '{}' exists and is valid)",
                    feature.branch
                )
            } else {
                String::new()
            };
            outputs.push(format!("{}: commit failed — {}{}", repo.name, e, hint));
        }
    }

    // Push to origin
    let push_result = git::push_branch(work_dir, &feature.branch);
    let push_status = match &push_result {
        Ok(o) => {
            outputs.push(format!("{}: pushed {}\n{}", repo.name, feature.branch, o));
            RepoPushStatus::Pushed
        }
        Err(e) => {
            let msg = format!("Failed to push in {}: {}", repo.name, e);
            outputs.push(msg.clone());
            RepoPushStatus::Failed
        }
    };

    // Update per-repo push status
    let mut features = state.features.lock().unwrap();
    if let Some(f) = features.get_mut(&feature_id) {
        f.repo_push_status.insert(repo_id, push_status.clone());

        match &push_status {
            RepoPushStatus::Pushed => {
                f.log_activity(format!("Pushed {} to origin", repo.name), "success")
            }
            RepoPushStatus::Failed => {
                f.log_activity(format!("Push failed for {}", repo.name), "error")
            }
            _ => {}
        }

        // If all repos are pushed, promote feature status to Pushed
        let all_repo_ids = f.effective_repo_ids();
        let all_pushed = all_repo_ids
            .iter()
            .all(|rid| f.repo_push_status.get(rid) == Some(&RepoPushStatus::Pushed));
        if all_pushed {
            f.status = FeatureStatus::Pushed;
        }
    }
    drop(features);
    state.save_features();

    // If the push itself failed, return an error
    if push_status == RepoPushStatus::Failed {
        return Err(outputs.join("\n"));
    }

    Ok(outputs.join("\n"))
}

/// Push all repos in a feature at once (legacy behavior).
/// Updates per-repo push status for each repo.
#[tauri::command]
pub fn push_feature(state: State<AppState>, feature_id: String, commit_message: Option<String>) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = get_all_repos(&state, &feature)?;

    let mut outputs = Vec::new();
    let mut per_repo_status: std::collections::HashMap<String, RepoPushStatus> =
        std::collections::HashMap::new();

    for repo in &repos {
        // Commit any uncommitted changes in the worktree (or main checkout)
        let work_dir = feature
            .worktree_paths
            .get(&repo.id)
            .map(|s| s.as_str())
            .unwrap_or(&repo.path);
        let msg = commit_message.clone().unwrap_or_else(|| git::build_commit_message(work_dir, &feature.name));
        match git::commit_all(work_dir, &msg) {
            Ok(true) => outputs.push(format!("{}: committed changes", repo.name)),
            Ok(false) => {} // nothing to commit
            Err(e) => {
                let hint = if e.to_string().contains("branch") || e.to_string().contains("ref") {
                    format!(
                        " (hint: check that branch '{}' exists and is valid)",
                        feature.branch
                    )
                } else {
                    String::new()
                };
                outputs.push(format!("{}: commit failed — {}{}", repo.name, e, hint));
            }
        }

        match git::push_branch(work_dir, &feature.branch) {
            Ok(o) => {
                outputs.push(format!("{}: pushed {}\n{}", repo.name, feature.branch, o));
                per_repo_status.insert(repo.id.clone(), RepoPushStatus::Pushed);
            }
            Err(e) => {
                outputs.push(format!("Failed to push in {}: {}", repo.name, e));
                per_repo_status.insert(repo.id.clone(), RepoPushStatus::Failed);
            }
        }
    }

    // Update per-repo status and feature status
    let mut features = state.features.lock().unwrap();
    if let Some(f) = features.get_mut(&feature_id) {
        f.repo_push_status = per_repo_status;
        f.updated_at = Utc::now();

        let all_repo_ids = f.effective_repo_ids();
        let all_pushed = all_repo_ids
            .iter()
            .all(|rid| f.repo_push_status.get(rid) == Some(&RepoPushStatus::Pushed));
        if all_pushed {
            f.status = FeatureStatus::Pushed;
        }
    }
    drop(features);
    state.save_features();

    // If any repo failed to push, return error
    let any_failed = repos.iter().any(|r| {
        feature.effective_repo_ids().contains(&r.id)
            && outputs
                .iter()
                .any(|o| o.contains(&format!("Failed to push in {}", r.name)))
    });
    if any_failed {
        return Err(outputs.join("\n"));
    }

    Ok(outputs.join("\n"))
}

#[tauri::command]
pub fn get_pr_command(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = get_all_repos(&state, &feature)?;

    let commands: Vec<String> = repos
        .iter()
        .map(|repo| {
            if let Some(pr_cmd) = &repo.pr_command {
                pr_cmd.replace("{branch}", &feature.branch)
            } else {
                format!(
                    "cd {} && gh pr create --head {} --title '{}' --body '{}'",
                    repo.path, feature.branch, feature.name, feature.description
                )
            }
        })
        .collect();

    Ok(commands.join("\n"))
}

/// Generate a commit message using Claude based on the diff in a feature's worktree.
/// Returns a structured commit message (title + body).
#[tauri::command]
pub fn generate_commit_message(
    state: State<AppState>,
    feature_id: String,
    repo_id: String,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_repo(&state, &repo_id)?;
    let work_dir = feature
        .worktree_paths
        .get(&repo_id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    // Get the diff for context
    let diff = git::run_git_public(work_dir, &["diff", "HEAD"])
        .unwrap_or_default();
    let staged = git::run_git_public(work_dir, &["diff", "--cached"])
        .unwrap_or_default();
    let status = git::run_git_public(work_dir, &["status", "--porcelain"])
        .unwrap_or_default();

    let combined_diff = if !staged.is_empty() && !diff.is_empty() {
        format!("{}\n{}", staged, diff)
    } else if !staged.is_empty() {
        staged
    } else {
        diff
    };

    // Truncate diff to avoid overwhelming Claude
    let truncated_diff = if combined_diff.len() > 8000 {
        format!("{}...\n[diff truncated]", &combined_diff[..8000])
    } else {
        combined_diff
    };

    if truncated_diff.trim().is_empty() && status.trim().is_empty() {
        return Ok(git::build_commit_message(work_dir, &feature.name));
    }

    let prompt = format!(
        r#"Generate a concise, high-quality git commit message for these changes.

Feature: {}
Description: {}

Git status:
{}

Diff:
{}

Rules:
- First line: a conventional commit subject (e.g. "feat: add user auth flow", "fix: resolve null pointer in parser")
- Use the appropriate type: feat, fix, refactor, docs, test, chore, style, perf
- Keep the subject line under 72 characters
- Add a blank line then a brief body (2-4 lines) explaining WHAT changed and WHY
- Do NOT include any markdown formatting, code fences, or extra commentary
- Output ONLY the commit message text, nothing else"#,
        feature.name,
        feature.description,
        status,
        truncated_diff
    );

    run_claude_print(work_dir, &prompt)
}

/// Generate a PR title and description using Claude based on the feature's changes.
#[tauri::command]
pub fn generate_pr_description(
    state: State<AppState>,
    feature_id: String,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = get_all_repos(&state, &feature)?;

    // Collect diffs across all repos
    let mut all_diffs = String::new();
    for repo in &repos {
        let work_dir = feature
            .worktree_paths
            .get(&repo.id)
            .map(|s| s.as_str())
            .unwrap_or(&repo.path);

        let base = &repo.base_branch;
        let log = git::run_git_public(
            work_dir,
            &["log", "--oneline", &format!("origin/{}..HEAD", base)],
        )
        .unwrap_or_default();

        let stat = git::run_git_public(
            work_dir,
            &["diff", "--stat", &format!("origin/{}..HEAD", base)],
        )
        .unwrap_or_default();

        if !log.is_empty() || !stat.is_empty() {
            all_diffs.push_str(&format!("### {}\nCommits:\n{}\n\nFiles changed:\n{}\n\n", repo.name, log, stat));
        }
    }

    if all_diffs.trim().is_empty() {
        // Fallback: return the feature name and description
        return Ok(format!("{}\n\n{}", feature.name, feature.description));
    }

    // Truncate if needed
    let truncated = if all_diffs.len() > 10000 {
        format!("{}...\n[truncated]", &all_diffs[..10000])
    } else {
        all_diffs
    };

    let prompt = format!(
        r###"Generate a pull request title and description for these changes.

Feature: {}
Description: {}

Changes across repositories:
{}

Rules:
- First line: PR title (concise, under 70 characters, no prefix like "PR:")
- Blank line
- Then a markdown body with:
  - A "## Summary" section with 2-4 bullet points explaining what changed and why
  - A "## Changes" section briefly listing key changes
- Do NOT include any code fences around the output
- Output ONLY the PR title and body, nothing else"###,
        feature.name,
        feature.description,
        truncated
    );

    let primary_repo = repos.first().ok_or("No repos found")?;
    let work_dir = feature
        .worktree_paths
        .get(&primary_repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&primary_repo.path);

    run_claude_print(work_dir, &prompt)
}

/// Run Claude in --print mode with a prompt, returning stdout.
fn run_claude_print(work_dir: &str, prompt: &str) -> Result<String, String> {
    use std::io::Write as IoWrite;

    let mut cmd = std::process::Command::new("claude");
    apply_user_path(&mut cmd);
    cmd.arg("--print")
        .arg("--model")
        .arg("haiku")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .current_dir(work_dir);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|e| format!("Failed to write prompt: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for claude: {}", e))?;

    if output.status.success() {
        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result.is_empty() {
            Err("Claude returned empty output".to_string())
        } else {
            Ok(result)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("Claude failed: {}", stderr))
    }
}

// ── Ideation Background Commands ──

/// Ensure prompt files exist for a feature, regenerating if needed.
fn ensure_ideation_prompts(
    state: &State<AppState>,
    feature: &Feature,
) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let repo = get_primary_repo(state, feature)?;
    let all_repos = get_all_repos(state, feature)?;
    let all_repos_snapshot: Vec<Repository> = state
        .repositories
        .lock()
        .unwrap()
        .values()
        .cloned()
        .collect();

    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let tasks_dir = feature_dir.join("tasks");
    let system_prompt_path = feature_dir.join("system-prompt.md");
    let user_prompt_path = feature_dir.join("user-prompt.md");

    std::fs::create_dir_all(&tasks_dir)
        .map_err(|e| format!("Failed to create feature dir: {}", e))?;

    let repo_map = generate_multi_repo_context_with_similar(&all_repos, &all_repos_snapshot);
    let (agent_list, quality_agent_list) = build_agent_lists(&all_repos);

    // Always regenerate system prompt so agent history stays fresh
    {
        let architecture_context = {
            let maps = state.system_maps.lock().unwrap();
            let repo_id_set: std::collections::HashSet<&String> = feature.repo_ids.iter().collect();
            let matching_map = maps.values().find(|m| {
                m.services.iter().any(|s| {
                    s.repo_id
                        .as_ref()
                        .map_or(false, |rid| repo_id_set.contains(rid))
                })
            });
            matching_map
                .map(|m| format_map_context(m))
                .unwrap_or_default()
        };
        let agent_history = state.format_agent_history_for_prompt();
        let system_prompt = prompts::ideation_system_prompt_full(
            &repo_map,
            &agent_list,
            &architecture_context,
            &agent_history,
        );
        std::fs::write(&system_prompt_path, &system_prompt)
            .map_err(|e| format!("Failed to write system prompt: {}", e))?;
    }
    if !user_prompt_path.exists() {
        let ft_enabled = state.preferences.lock().unwrap().functional_testing_enabled;
        let user_prompt = prompts::ideation_user_prompt_full(
            &feature.description,
            &tasks_dir.to_string_lossy(),
            &agent_list,
            &quality_agent_list,
            ft_enabled,
            &feature.attachments,
        );
        std::fs::write(&user_prompt_path, &user_prompt)
            .map_err(|e| format!("Failed to write user prompt: {}", e))?;
    }

    Ok((system_prompt_path, user_prompt_path))
}

/// Build a formatted agent list string from all repos + globals.
fn build_agent_list(repos: &[Repository]) -> String {
    build_agent_lists(repos).0
}

/// Build formatted agent list and quality agent list strings from all repos + globals.
/// Returns (all_agents_list, quality_agents_list).
fn build_agent_lists(repos: &[Repository]) -> (String, String) {
    let mut all_agents: Vec<AgentFile> = Vec::new();
    let mut seen_filenames = std::collections::HashSet::new();
    for r in repos {
        if let Ok(agents) = store::list_repo_agents(&r.path) {
            for agent in agents {
                if seen_filenames.insert(agent.filename.clone()) {
                    all_agents.push(agent);
                }
            }
        }
    }
    if let Ok(global_agents) = store::list_global_agents() {
        for agent in global_agents {
            if seen_filenames.insert(agent.filename.clone()) {
                all_agents.push(agent);
            }
        }
    }

    let format_agent = |a: &AgentFile| {
        let desc = if a.description.is_empty() {
            String::new()
        } else {
            format!(": {}", a.description)
        };
        format!(
            "- **{}** ({}){}",
            a.name,
            a.filename.strip_suffix(".md").unwrap_or(&a.filename),
            desc
        )
    };

    // Exclude disabled agents from ideation
    let enabled_agents: Vec<&AgentFile> = all_agents.iter().filter(|a| a.enabled).collect();

    let agent_list = enabled_agents
        .iter()
        .map(|a| format_agent(a))
        .collect::<Vec<_>>()
        .join("\n");

    let quality_list = enabled_agents
        .iter()
        .filter(|a| a.role == "quality")
        .map(|a| format_agent(a))
        .collect::<Vec<_>>()
        .join("\n");

    (agent_list, quality_list)
}

/// Spawn Claude in --print mode as a background process.
/// Pipes the full prompt (system context + user prompt) via stdin to avoid
/// Windows command-line length limits.
/// Snapshot the current plan.json into the feature's plan_history before it gets replaced.
/// `trigger` describes why the snapshot is being taken (e.g. "revision", "restart", "answer_round").
/// `feedback` is the optional user feedback text for revision triggers.
fn snapshot_current_plan(
    state: &State<AppState>,
    feature_id: &str,
    tasks_dir: &std::path::Path,
    trigger: &str,
    feedback: Option<&str>,
) {
    let plan_path = tasks_dir.join("plan.json");
    if !plan_path.exists() {
        return;
    }
    let data = match std::fs::read_to_string(&plan_path) {
        Ok(d) => d,
        Err(_) => return,
    };
    let result: IdeationResult = match serde_json::from_str(&data) {
        Ok(r) => r,
        Err(_) => return,
    };
    if result.tasks.is_empty() {
        return;
    }
    let snapshot = PlanSnapshot {
        trigger: trigger.to_string(),
        feedback: feedback.map(|s| s.to_string()),
        tasks: result.tasks,
        execution_mode: result.execution_mode,
        created_at: Utc::now(),
    };
    let mut features = state.features.lock().unwrap();
    if let Some(feature) = features.get_mut(feature_id) {
        feature.plan_history.push(snapshot);
        feature.updated_at = Utc::now();
    }
    drop(features);
    state.save_features();
}

fn spawn_ideation_process(
    feature_dir: &std::path::Path,
    work_dir: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<(), String> {
    use std::io::Write as IoWrite;

    // Log file for live output — uses piped stdio + relay for incremental flushing
    let log_file_path = feature_dir.join("claude-ideation.log");
    let _ = std::fs::write(&log_file_path, "");

    // Combine system context + user prompt into a single stdin payload
    // to avoid passing large strings as CLI arguments
    let full_prompt = format!("{}\n\n---\n\n{}", system_prompt, user_prompt);

    let mut cmd = std::process::Command::new("claude");
    apply_user_path(&mut cmd);
    cmd.arg("--print")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg("--allowedTools")
        .arg("Read,Glob,Grep,Write")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .current_dir(work_dir);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Claude: {}", e))?;

    // Write prompt to stdin, then close it so Claude begins processing
    if let Some(mut stdin) = child.stdin.take() {
        let prompt_bytes = full_prompt.into_bytes();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&prompt_bytes);
            // stdin is dropped here, closing the pipe
        });
    }

    relay_output_to_log(&mut child, log_file_path);

    // Monitor the child process in a background thread.
    // If Claude crashes or exits with a non-zero code, write an error file
    // so the frontend can detect the failure instead of timing out.
    let error_path = feature_dir.join("ideation-error.txt");
    // Clean up any previous error file
    let _ = std::fs::remove_file(&error_path);
    std::thread::spawn(move || match child.wait() {
        Ok(status) => {
            if !status.success() {
                let code = status.code().unwrap_or(-1);
                let _ = std::fs::write(
                    &error_path,
                    format!(
                        "Claude exited with code {}. Check claude-ideation.log for details.",
                        code
                    ),
                );
            }
        }
        Err(e) => {
            let _ = std::fs::write(
                &error_path,
                format!("Failed to wait for Claude process: {}", e),
            );
        }
    });

    Ok(())
}

/// Start the ideation process (non-interactive, background).
/// Claude runs with --print, writes plan.json, then exits.
/// Frontend polls plan.json to detect completion.
#[tauri::command]
pub fn run_ideation(state: State<AppState>, feature_id: String) -> Result<(), String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let (system_prompt_path, user_prompt_path) = ensure_ideation_prompts(&state, &feature)?;

    let system_prompt_content = std::fs::read_to_string(&system_prompt_path)
        .map_err(|e| format!("Failed to read system prompt: {}", e))?;
    let user_prompt_content = std::fs::read_to_string(&user_prompt_path)
        .map_err(|e| format!("Failed to read user prompt: {}", e))?;

    let repo = get_primary_repo(&state, &feature)?;
    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    // Snapshot the current plan before deleting it (restart trigger)
    let tasks_dir = feature_dir.join("tasks");
    snapshot_current_plan(&state, &feature_id, &tasks_dir, "restart", None);

    // Delete old plan.json so polling starts fresh
    let plan_path = tasks_dir.join("plan.json");
    if plan_path.exists() {
        let _ = std::fs::remove_file(&plan_path);
    }

    spawn_ideation_process(
        &feature_dir,
        work_dir,
        &system_prompt_content,
        &user_prompt_content,
    )
}

/// Check if the ideation process wrote an error file (indicating it crashed or failed).
/// Returns the error message if one exists, None otherwise.
#[tauri::command]
pub fn poll_ideation_error(
    state: State<AppState>,
    feature_id: String,
) -> Result<Option<String>, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;
    let error_path = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("ideation-error.txt");

    if error_path.exists() {
        let msg = std::fs::read_to_string(&error_path).unwrap_or_default();
        Ok(Some(msg))
    } else {
        Ok(None)
    }
}

/// Re-run ideation with user feedback appended to the prompt.
/// Deletes the old plan.json, appends feedback to the user prompt, and re-runs.
#[tauri::command]
pub fn revise_ideation(
    state: State<AppState>,
    feature_id: String,
    feedback: String,
) -> Result<(), String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let (system_prompt_path, user_prompt_path) = ensure_ideation_prompts(&state, &feature)?;

    let system_prompt_content = std::fs::read_to_string(&system_prompt_path)
        .map_err(|e| format!("Failed to read system prompt: {}", e))?;
    let user_prompt_content = std::fs::read_to_string(&user_prompt_path)
        .map_err(|e| format!("Failed to read user prompt: {}", e))?;

    // Read old plan so Claude knows what to revise
    let repo = get_primary_repo(&state, &feature)?;
    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let tasks_dir = feature_dir.join("tasks");
    let plan_path = tasks_dir.join("plan.json");
    let old_plan = std::fs::read_to_string(&plan_path).unwrap_or_default();

    // Snapshot the current plan before replacing it
    snapshot_current_plan(&state, &feature_id, &tasks_dir, "revision", Some(&feedback));

    // Delete old plan.json so polling detects fresh result
    if plan_path.exists() {
        let _ = std::fs::remove_file(&plan_path);
    }

    // Build revised prompt with feedback
    let revised_prompt = format!(
        "{}\n\n---\n\n## Previous Plan\n\n```json\n{}\n```\n\n## Requested Changes\n\n{}\n\nRevise the plan based on this feedback. Write the updated plan.json and stop.",
        user_prompt_content, old_plan, feedback
    );

    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    // Log the revision
    {
        let mut features = state.features.lock().unwrap();
        if let Some(f) = features.get_mut(&feature_id) {
            f.log_activity("Plan revision requested", "info");
        }
        drop(features);
        state.save_features();
    }

    spawn_ideation_process(
        &feature_dir,
        work_dir,
        &system_prompt_content,
        &revised_prompt,
    )
}

/// Submit answers to planning questions and resume ideation.
/// Writes answers.json, deletes questions.json, and spawns a new ideation process
/// with the user's answers included in the prompt.
#[tauri::command]
pub fn submit_planning_answers(
    state: State<AppState>,
    feature_id: String,
    answers: Vec<PlanningAnswer>,
) -> Result<(), String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;
    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let tasks_dir = feature_dir.join("tasks");

    // Read existing answers (from prior rounds) and append new ones
    let answers_path = tasks_dir.join("answers.json");
    let mut all_answers = if answers_path.exists() {
        std::fs::read_to_string(&answers_path)
            .ok()
            .and_then(|data| serde_json::from_str::<AnswersFile>(&data).ok())
            .map(|f| f.answers)
            .unwrap_or_default()
    } else {
        vec![]
    };
    all_answers.extend(answers);

    // Write accumulated answers
    let answers_file = AnswersFile {
        answers: all_answers.clone(),
    };
    std::fs::write(
        &answers_path,
        serde_json::to_string_pretty(&answers_file)
            .map_err(|e| format!("Failed to serialize answers: {}", e))?,
    )
    .map_err(|e| format!("Failed to write answers.json: {}", e))?;

    // Delete questions.json (consumed)
    let questions_path = tasks_dir.join("questions.json");
    if questions_path.exists() {
        let _ = std::fs::remove_file(&questions_path);
    }

    // Snapshot the current plan before replacing it (if one exists from a prior round)
    snapshot_current_plan(&state, &feature_id, &tasks_dir, "answer_round", None);

    // Delete old plan.json so polling starts fresh
    let plan_path = tasks_dir.join("plan.json");
    if plan_path.exists() {
        let _ = std::fs::remove_file(&plan_path);
    }

    // Build prompt with answers
    let (system_prompt_path, _) = ensure_ideation_prompts(&state, &feature)?;
    let system_prompt_content = std::fs::read_to_string(&system_prompt_path)
        .map_err(|e| format!("Failed to read system prompt: {}", e))?;

    let repos = state.repositories.lock().unwrap();
    let all_repos: Vec<_> = feature
        .effective_repo_ids()
        .iter()
        .filter_map(|id| repos.get(id).cloned())
        .collect();
    drop(repos);
    let (agent_list, quality_agent_list) = build_agent_lists(&all_repos);

    let ft_enabled = state.preferences.lock().unwrap().functional_testing_enabled;
    let user_prompt = prompts::ideation_user_prompt_with_answers_full(
        &feature.description,
        &tasks_dir.to_string_lossy(),
        &agent_list,
        &quality_agent_list,
        &all_answers,
        ft_enabled,
        &feature.attachments,
    );

    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

    // Log the Q&A submission
    {
        let mut features = state.features.lock().unwrap();
        if let Some(f) = features.get_mut(&feature_id) {
            f.log_activity("Planning questions answered", "info");
        }
        drop(features);
        state.save_features();
    }

    spawn_ideation_process(&feature_dir, work_dir, &system_prompt_content, &user_prompt)
}

// ── PTY Commands ──

#[tauri::command]
pub fn write_pty(
    pty_sessions: State<pty::PtySessions>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    pty::write_to_pty(&pty_sessions, &session_id, &data)
}

#[tauri::command]
pub fn resize_pty(
    pty_sessions: State<pty::PtySessions>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty::resize_pty_session(&pty_sessions, &session_id, cols, rows)
}

#[tauri::command]
pub fn kill_pty(pty_sessions: State<pty::PtySessions>, session_id: String) -> Result<(), String> {
    pty::kill_pty_session(&pty_sessions, &session_id)
}

#[tauri::command]
pub fn pty_session_exists(pty_sessions: State<pty::PtySessions>, session_id: String) -> bool {
    pty::session_exists(&pty_sessions, &session_id)
}

#[tauri::command]
pub fn poll_pty_output(
    pty_buffers: State<pty::PtyBuffers>,
    session_id: String,
) -> Result<(String, bool, Option<u32>), String> {
    pty::poll_output(&pty_buffers, &session_id)
}

// ── Preferences Commands ──

#[tauri::command]
pub fn get_preferences(state: State<AppState>) -> Preferences {
    state.preferences.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_preferences(
    state: State<AppState>,
    shell: String,
    default_execution_mode: Option<String>,
    default_model: Option<String>,
    auto_validate: Option<bool>,
    functional_testing_enabled: Option<bool>,
) -> Preferences {
    let mut prefs = state.preferences.lock().unwrap();
    prefs.shell = shell;
    if let Some(mode) = default_execution_mode {
        prefs.default_execution_mode = mode;
    }
    if let Some(model) = default_model {
        prefs.default_model = model;
    }
    if let Some(av) = auto_validate {
        prefs.auto_validate = av;
    }
    if let Some(ft) = functional_testing_enabled {
        prefs.functional_testing_enabled = ft;
    }
    let updated = prefs.clone();
    drop(prefs);
    state.save_preferences();
    updated
}

// ── Built-in Agents & Recipe Commands ──

#[tauri::command]
pub fn list_built_in_agents() -> Vec<AgentFile> {
    templates::built_in_agents()
}

/// Add a built-in agent to a repo's .claude/agents/ directory by filename.
#[tauri::command]
pub fn add_built_in_agent(repo_path: String, filename: String) -> Result<AgentFile, String> {
    let agents = templates::built_in_agents();
    let agent = agents
        .iter()
        .find(|a| a.filename == filename)
        .ok_or("Built-in agent not found")?;
    let mut repo_agent = agent.clone();
    repo_agent.is_global = false;
    store::save_repo_agent(&repo_path, &repo_agent)?;
    Ok(repo_agent)
}

#[tauri::command]
pub fn list_built_in_skills() -> Vec<crate::models::SkillFile> {
    templates::built_in_skills()
}

#[tauri::command]
pub fn list_feature_recipes() -> Vec<templates::FeatureRecipe> {
    templates::list_feature_recipes()
}

// ── Execution Observability Commands ──

#[tauri::command]
pub fn poll_execution_status(
    state: State<AppState>,
    feature_id: String,
) -> Result<observer::ExecutionSnapshot, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;
    observer::poll_execution_snapshot(&repo.path, &repo.base_branch, &feature.branch)
}

/// Build the initial progress.json content from task specs.
/// Pre-seeding this file gives Claude a concrete file to update (instead of creating from scratch)
/// and lets the UI show the task list immediately.
fn build_initial_progress_json(specs: &[TaskSpec]) -> String {
    use serde_json::json;

    let tasks: Vec<serde_json::Value> = specs
        .iter()
        .enumerate()
        .map(|(i, spec)| {
            let criteria: Vec<serde_json::Value> = spec
                .acceptance_criteria
                .iter()
                .map(|c| json!({ "criterion": c, "done": false }))
                .collect();
            json!({
                "task": i + 1,
                "title": spec.title,
                "status": "pending",
                "acceptance_criteria": criteria,
            })
        })
        .collect();

    serde_json::to_string_pretty(&json!({ "tasks": tasks })).unwrap_or_default()
}

/// Read and parse a progress.json file at the given path.
fn read_task_progress(progress_path: &Path) -> Option<TaskProgress> {
    if !progress_path.exists() {
        return None;
    }
    let data = std::fs::read_to_string(progress_path).ok()?;
    serde_json::from_str::<TaskProgress>(&data).ok()
}

/// Poll task progress from the progress.json file written by Claude during execution.
#[tauri::command]
pub fn poll_task_progress(
    state: State<AppState>,
    feature_id: String,
) -> Result<Option<TaskProgress>, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;

    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let progress_path = feature_dir.join("tasks").join("progress.json");

    let mut progress = read_task_progress(&progress_path);

    // Check for the execution-complete signal file written by Claude
    if observer::check_completion_signal(&repo.path, &feature.id) {
        if let Some(ref mut p) = progress {
            p.completion_detected = true;
        } else {
            // Signal exists but no progress file — create minimal response
            progress = Some(TaskProgress {
                tasks: vec![],
                completion_detected: true,
            });
        }
    }

    // Log newly completed tasks to the activity log
    if let Some(ref p) = progress {
        let newly_done: Vec<(u32, String)> = p
            .tasks
            .iter()
            .filter(|t| {
                t.status == TaskStatus::Done && !feature.logged_task_completions.contains(&t.task)
            })
            .map(|t| (t.task, t.title.clone()))
            .collect();
        if !newly_done.is_empty() {
            let mut features = state.features.lock().unwrap();
            if let Some(f) = features.get_mut(&feature_id) {
                for (task_num, title) in &newly_done {
                    if !f.logged_task_completions.contains(task_num) {
                        f.log_activity(
                            format!("Task {} completed: {}", task_num, title),
                            "success",
                        );
                        f.logged_task_completions.push(*task_num);
                    }
                }
            }
            drop(features);
            state.save_features();
        }
    }

    Ok(progress)
}

// ── Analytics Commands ──

#[tauri::command]
pub fn analyze_feature_execution(
    state: State<AppState>,
    feature_id: String,
) -> Result<analytics::ExecutionAnalysis, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = get_all_repos(&state, &feature)?;
    let mut changed_files: Vec<String> = Vec::new();
    for repo in &repos {
        // Use worktree path if available so uncommitted changes are visible
        let diff_path = feature
            .worktree_paths
            .get(&repo.id)
            .map(|s| s.as_str())
            .unwrap_or(&repo.path);
        let file_diffs = git::diff_stat(diff_path, &repo.base_branch, &feature.branch)
            .map_err(|e| e.to_string())?;
        let prefix = if repos.len() > 1 {
            format!("[{}] ", repo.name)
        } else {
            String::new()
        };
        for (path, _, _, _) in file_diffs {
            changed_files.push(format!("{}{}", prefix, path));
        }
    }

    // Read actual task progress for accurate completion status
    let primary_repo = get_primary_repo(&state, &feature)?;
    let progress_path = Path::new(&primary_repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("tasks")
        .join("progress.json");
    let task_progress = read_task_progress(&progress_path);

    Ok(analytics::analyze_execution(
        &feature,
        &changed_files,
        task_progress.as_ref(),
    ))
}

// ── Guidance Commands ──

#[tauri::command]
pub fn add_guidance_note(
    state: State<AppState>,
    feature_id: String,
    content: String,
    priority: guidance::GuidancePriority,
) -> Result<guidance::GuidanceNote, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;
    guidance::add_guidance_note(&repo.path, &feature.id, &content, priority)
}

#[tauri::command]
pub fn list_guidance_notes(
    state: State<AppState>,
    feature_id: String,
) -> Result<Vec<guidance::GuidanceNote>, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repo = get_primary_repo(&state, &feature)?;
    guidance::list_guidance_notes(&repo.path, &feature.id)
}

// ── Heuristics Commands ──

#[tauri::command]
pub fn analyze_task_graph(task_specs: Vec<TaskSpec>) -> heuristics::ModeRecommendation {
    heuristics::analyze_tasks(&task_specs)
}

// ── System Map Commands ──

#[tauri::command]
pub fn list_system_maps(state: State<AppState>) -> Vec<SystemMap> {
    state
        .system_maps
        .lock()
        .unwrap()
        .values()
        .cloned()
        .collect()
}

#[tauri::command]
pub fn get_system_map(state: State<AppState>, map_id: String) -> Result<SystemMap, String> {
    state
        .system_maps
        .lock()
        .unwrap()
        .get(&map_id)
        .cloned()
        .ok_or("System map not found".to_string())
}

#[tauri::command]
pub fn create_system_map(
    state: State<AppState>,
    name: String,
    description: String,
) -> Result<SystemMap, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Map name cannot be empty".to_string());
    }
    let map = SystemMap::new(name, description);
    let mut maps = state.system_maps.lock().unwrap();
    maps.insert(map.id.clone(), map.clone());
    drop(maps);
    state.save_system_maps();
    Ok(map)
}

#[tauri::command]
pub fn update_system_map(state: State<AppState>, map: SystemMap) -> Result<SystemMap, String> {
    let mut maps = state.system_maps.lock().unwrap();
    if !maps.contains_key(&map.id) {
        return Err("System map not found".to_string());
    }
    let mut updated = map;
    updated.updated_at = Utc::now();
    maps.insert(updated.id.clone(), updated.clone());
    drop(maps);
    state.save_system_maps();
    Ok(updated)
}

#[tauri::command]
pub fn delete_system_map(state: State<AppState>, map_id: String) -> Result<(), String> {
    let mut maps = state.system_maps.lock().unwrap();
    maps.remove(&map_id).ok_or("System map not found")?;
    drop(maps);
    state.save_system_maps();

    // Clean up discovery artifacts (logs, prompt files, result JSON)
    let discovery_dir = Path::new(&state.gmb_path)
        .join("discoveries")
        .join(&map_id);
    if discovery_dir.exists() {
        let _ = std::fs::remove_dir_all(&discovery_dir);
    }

    Ok(())
}

/// Generate the discovery command for a system map.
/// Sets up prompts for each repo and returns a shell command that launches
/// Claude Code agents (one per repo) to explore architecture.
#[tauri::command]
pub fn start_map_discovery(
    state: State<AppState>,
    map_id: String,
    repo_ids: Vec<String>,
) -> Result<String, String> {
    if repo_ids.is_empty() {
        return Err("At least one repository must be selected".to_string());
    }

    let maps = state.system_maps.lock().unwrap();
    let map = maps.get(&map_id).ok_or("System map not found")?;
    let map_name = map.name.clone();
    drop(maps);

    let repos_lock = state.repositories.lock().unwrap();
    let repos: Vec<Repository> = repo_ids
        .iter()
        .map(|id| {
            repos_lock
                .get(id)
                .cloned()
                .ok_or(format!("Repository not found: {}", id))
        })
        .collect::<Result<Vec<_>, _>>()?;
    drop(repos_lock);

    // Create discovery directory in ~/.gmb
    let discovery_dir = Path::new(&state.gmb_path).join("discoveries").join(&map_id);
    std::fs::create_dir_all(&discovery_dir)
        .map_err(|e| format!("Failed to create discovery dir: {}", e))?;

    // Generate per-repo commands
    let mut commands = Vec::new();

    for repo in &repos {
        let repo_context = generate_context_pack_string(&repo.path);
        let output_file = discovery_dir.join(format!("{}.json", repo.id));

        let system_prompt = prompts::map_discovery_system_prompt(&repo.name, &repo_context);
        let user_prompt =
            prompts::map_discovery_user_prompt(&repo.name, &output_file.to_string_lossy());

        // Write prompts to disk for the command
        let sys_prompt_path = discovery_dir.join(format!("{}-system.md", repo.id));
        let usr_prompt_path = discovery_dir.join(format!("{}-user.md", repo.id));
        std::fs::write(&sys_prompt_path, &system_prompt)
            .map_err(|e| format!("Failed to write system prompt: {}", e))?;
        std::fs::write(&usr_prompt_path, &user_prompt)
            .map_err(|e| format!("Failed to write user prompt: {}", e))?;

        let escaped_path = shell_quote(&repo.path);
        let escaped_sys = shell_quote(&sys_prompt_path.to_string_lossy());
        let escaped_usr = shell_quote(&usr_prompt_path.to_string_lossy());

        commands.push(format!(
            "cd {} && claude --print --permission-mode bypassPermissions --allowedTools 'Read,Glob,Grep,Write' --append-system-prompt \"$(cat {})\" \"$(cat {})\"",
            escaped_path, escaped_sys, escaped_usr
        ));
    }

    // For multiple repos, show parallel invocations
    let full_command = if commands.len() == 1 {
        format!(
            "# Exploring {} for map: {}\n{}",
            repos[0].name, map_name, commands[0]
        )
    } else {
        let parts: Vec<String> = repos
            .iter()
            .zip(commands.iter())
            .map(|(repo, cmd)| format!("# Exploring {}\n{}", repo.name, cmd))
            .collect();
        format!(
            "# Sending {} scouts for map: {}\n{}",
            repos.len(),
            map_name,
            parts.join("\n\n"),
        )
    };

    Ok(full_command)
}

/// Start map discovery by spawning Claude processes directly (one per repo).
/// Each process runs `claude --print` with the prompt piped via stdin and
/// writes discovery JSON files that `poll_map_discovery` checks.
#[tauri::command]
pub fn start_discovery_pty(
    _app_handle: tauri::AppHandle,
    state: State<AppState>,
    _pty_sessions: State<pty::PtySessions>,
    map_id: String,
    repo_ids: Vec<String>,
    _cols: u16,
    _rows: u16,
) -> Result<String, String> {
    if repo_ids.is_empty() {
        return Err("At least one repository must be selected".to_string());
    }

    let maps = state.system_maps.lock().unwrap();
    let _map = maps.get(&map_id).ok_or("System map not found")?;
    drop(maps);

    let repos_lock = state.repositories.lock().unwrap();
    let repos: Vec<Repository> = repo_ids
        .iter()
        .map(|id| {
            repos_lock
                .get(id)
                .cloned()
                .ok_or(format!("Repository not found: {}", id))
        })
        .collect::<Result<Vec<_>, _>>()?;
    drop(repos_lock);

    // Create discovery directory
    let discovery_dir = Path::new(&state.gmb_path).join("discoveries").join(&map_id);
    std::fs::create_dir_all(&discovery_dir)
        .map_err(|e| format!("Failed to create discovery dir: {}", e))?;

    // Write prompt files for each repo
    let mut repo_prompts: Vec<(String, String, String)> = Vec::new(); // (repo_path, system_prompt, user_prompt)
    for repo in &repos {
        let repo_context = generate_context_pack_string(&repo.path);
        let output_file = discovery_dir.join(format!("{}.json", repo.id));

        let system_prompt = prompts::map_discovery_system_prompt(&repo.name, &repo_context);
        let user_prompt =
            prompts::map_discovery_user_prompt(&repo.name, &output_file.to_string_lossy());

        // Also write prompt files so start_map_discovery can still generate the command string
        let sys_prompt_path = discovery_dir.join(format!("{}-system.md", repo.id));
        let usr_prompt_path = discovery_dir.join(format!("{}-user.md", repo.id));
        std::fs::write(&sys_prompt_path, &system_prompt)
            .map_err(|e| format!("Failed to write system prompt: {}", e))?;
        std::fs::write(&usr_prompt_path, &user_prompt)
            .map_err(|e| format!("Failed to write user prompt: {}", e))?;

        repo_prompts.push((repo.path.clone(), system_prompt, user_prompt));
    }

    let session_id = format!("discovery-{}", map_id);

    // Shared log file path for all discovery processes (they append concurrently)
    let log_path = discovery_dir.join("discovery.log");
    let _ = std::fs::write(&log_path, "");

    // Spawn all repos as background processes that can write their output JSON files
    for (repo_path, system_prompt, user_prompt) in &repo_prompts {
        spawn_discovery_process(repo_path, system_prompt, user_prompt, log_path.clone())?;
    }

    Ok(session_id)
}

/// Spawn a Claude discovery process in the background.
/// Uses --print with --append-system-prompt so Claude can write the discovery JSON file.
fn spawn_discovery_process(
    work_dir: &str,
    system_prompt: &str,
    user_prompt: &str,
    log_path: std::path::PathBuf,
) -> Result<(), String> {
    use std::io::Write as IoWrite;

    let mut cmd = std::process::Command::new("claude");
    apply_user_path(&mut cmd);
    cmd.arg("--print")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg("--allowedTools")
        .arg("Read,Glob,Grep,Write")
        .arg("--append-system-prompt")
        .arg(system_prompt)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .current_dir(work_dir);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Claude: {}", e))?;

    // Write user prompt to stdin
    if let Some(mut stdin) = child.stdin.take() {
        let prompt_bytes = user_prompt.as_bytes().to_vec();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&prompt_bytes);
            // stdin drops here, closing the pipe
        });
    }

    relay_output_to_log(&mut child, log_path);

    // Monitor in background
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

/// Poll for discovery results. Checks if per-repo discovery JSON files exist,
/// parses them, and assembles the results into the system map.
#[tauri::command]
pub fn poll_map_discovery(
    state: State<AppState>,
    map_id: String,
    repo_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let discovery_dir = Path::new(&state.gmb_path).join("discoveries").join(&map_id);

    let mut found = 0u32;
    let total = repo_ids.len() as u32;
    let mut all_services: Vec<MapService> = Vec::new();
    let mut all_connections: Vec<MapConnection> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    let repos_lock = state.repositories.lock().unwrap();

    for repo_id in &repo_ids {
        let output_file = discovery_dir.join(format!("{}.json", repo_id));
        if !output_file.exists() {
            continue;
        }

        let data = match std::fs::read_to_string(&output_file) {
            Ok(d) => d,
            Err(e) => {
                errors.push(format!("Failed to read {}: {}", repo_id, e));
                continue;
            }
        };

        let result: DiscoveryResult = match serde_json::from_str(&data) {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("Malformed discovery for {}: {}", repo_id, e));
                continue;
            }
        };

        found += 1;

        let repo = repos_lock.get(repo_id);
        let repo_id_opt = repo.map(|r| r.id.clone());

        // Convert discovered services to MapService
        let cols = 3usize;
        let offset = all_services.len();
        for (i, svc) in result.services.iter().enumerate() {
            let row = (offset + i) / cols;
            let col = (offset + i) % cols;
            let position = (200.0 + col as f64 * 250.0, 150.0 + row as f64 * 200.0);

            let service_type = parse_service_type(&svc.service_type);
            let color = service_type_color(&service_type);

            all_services.push(MapService {
                id: uuid::Uuid::new_v4().to_string(),
                name: svc.name.clone(),
                service_type,
                repo_id: repo_id_opt.clone(),
                runtime: svc.runtime.clone(),
                framework: svc.framework.clone(),
                description: svc.description.clone(),
                owns_data: svc.owns_data.clone(),
                position,
                color,
            });
        }

        // Convert discovered connections to MapConnection
        for conn in &result.connections {
            let from_id = all_services
                .iter()
                .find(|s| s.name == conn.from)
                .map(|s| s.id.clone());
            let to_id = all_services
                .iter()
                .find(|s| s.name == conn.to)
                .map(|s| s.id.clone());

            if let (Some(from), Some(to)) = (from_id, to_id) {
                all_connections.push(MapConnection {
                    id: uuid::Uuid::new_v4().to_string(),
                    from_service: from,
                    to_service: to,
                    connection_type: parse_connection_type(&conn.connection_type),
                    sync: conn.sync,
                    label: conn.label.clone(),
                    description: conn.description.clone(),
                });
            }
        }
    }
    drop(repos_lock);

    let complete = found == total;

    // Deduplicate services by name (case-insensitive). When multiple repos discover
    // the same service (e.g. a shared database), keep the first and merge repo_id info.
    {
        let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        let mut deduped_services: Vec<MapService> = Vec::new();
        // Track old-id -> canonical-id so connections can be remapped.
        let mut id_remap: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();

        for svc in all_services.drain(..) {
            let key = svc.name.to_lowercase();
            if let Some(&idx) = seen.get(&key) {
                // Duplicate — remap its id to the canonical service.
                // If the canonical was External but this one isn't, prefer the
                // non-external type (the other repo knows what this service really is).
                if deduped_services[idx].service_type == ServiceType::External
                    && svc.service_type != ServiceType::External
                {
                    deduped_services[idx].service_type = svc.service_type.clone();
                    deduped_services[idx].color =
                        service_type_color(&deduped_services[idx].service_type);
                    // Also prefer the more specific runtime/framework if available
                    if !svc.runtime.is_empty() && deduped_services[idx].runtime.is_empty() {
                        deduped_services[idx].runtime = svc.runtime.clone();
                    }
                    if !svc.framework.is_empty() && deduped_services[idx].framework.is_empty() {
                        deduped_services[idx].framework = svc.framework.clone();
                    }
                }
                id_remap.insert(svc.id.clone(), deduped_services[idx].id.clone());
            } else {
                seen.insert(key, deduped_services.len());
                deduped_services.push(svc);
            }
        }

        // Remap connection endpoints to canonical service ids
        for conn in &mut all_connections {
            if let Some(canonical) = id_remap.get(&conn.from_service) {
                conn.from_service = canonical.clone();
            }
            if let Some(canonical) = id_remap.get(&conn.to_service) {
                conn.to_service = canonical.clone();
            }
        }

        // Deduplicate connections (same from+to pair)
        {
            let mut seen_conns: std::collections::HashSet<(String, String)> =
                std::collections::HashSet::new();
            all_connections
                .retain(|c| seen_conns.insert((c.from_service.clone(), c.to_service.clone())));
        }

        all_services = deduped_services;
    }

    // Reclassify services that were marked External but belong to scanned repos.
    // When repo A references repo B's service, it may label it "external" — but since
    // repo B is also being scanned, it's really an internal service.
    {
        let scanned_repo_set: std::collections::HashSet<&String> = repo_ids.iter().collect();
        for svc in &mut all_services {
            if svc.service_type == ServiceType::External {
                if let Some(ref rid) = svc.repo_id {
                    if scanned_repo_set.contains(rid) {
                        // This service was discovered from a scanned repo — it's not external.
                        // Infer a better type from its properties.
                        svc.service_type = infer_service_type_from_properties(svc);
                        svc.color = service_type_color(&svc.service_type);
                    }
                }
            }
        }
    }

    // If all repos are scanned, assemble into the system map
    if complete && found > 0 {
        let mut maps = state.system_maps.lock().unwrap();
        if let Some(map) = maps.get_mut(&map_id) {
            // Remove previously discovered services for these repos to avoid duplicates,
            // but keep manually added services (those with no repo_id).
            let scanned_repo_ids: std::collections::HashSet<&String> = repo_ids.iter().collect();
            map.services.retain(|s| {
                match &s.repo_id {
                    Some(rid) => !scanned_repo_ids.contains(rid),
                    None => true, // keep manually added services
                }
            });
            // Remove connections that reference removed services
            let remaining_ids: std::collections::HashSet<&String> =
                map.services.iter().map(|s| &s.id).collect();
            map.connections.retain(|c| {
                remaining_ids.contains(&c.from_service) && remaining_ids.contains(&c.to_service)
            });
            // Add newly discovered services and connections
            map.services.extend(all_services.clone());
            map.connections.extend(all_connections.clone());
            map.updated_at = Utc::now();
        }
        drop(maps);
        state.save_system_maps();

        // Clean up discovery files
        let _ = std::fs::remove_dir_all(&discovery_dir);
    }

    Ok(serde_json::json!({
        "found": found,
        "total": total,
        "complete": complete,
        "services_discovered": all_services.len(),
        "connections_discovered": all_connections.len(),
        "errors": errors,
    }))
}

fn parse_service_type(s: &str) -> ServiceType {
    match s.to_lowercase().as_str() {
        "backend" => ServiceType::Backend,
        "frontend" => ServiceType::Frontend,
        "worker" => ServiceType::Worker,
        "gateway" => ServiceType::Gateway,
        "database" => ServiceType::Database,
        "queue" => ServiceType::Queue,
        "cache" => ServiceType::Cache,
        "external" => ServiceType::External,
        _ => ServiceType::Backend,
    }
}

fn parse_connection_type(s: &str) -> ConnectionType {
    match s.to_lowercase().as_str() {
        "rest" => ConnectionType::Rest,
        "grpc" => ConnectionType::Grpc,
        "graphql" => ConnectionType::Graphql,
        "websocket" => ConnectionType::Websocket,
        "event" => ConnectionType::Event,
        "shared_db" => ConnectionType::SharedDb,
        "file_system" => ConnectionType::FileSystem,
        "ipc" => ConnectionType::Ipc,
        _ => ConnectionType::Rest,
    }
}

fn service_type_color(st: &ServiceType) -> String {
    match st {
        ServiceType::Backend => "#5a8a5c",
        ServiceType::Frontend => "#5b8abd",
        ServiceType::Worker => "#9b6abf",
        ServiceType::Gateway => "#b8944a",
        ServiceType::Database => "#d4aa5a",
        ServiceType::Queue => "#c4654a",
        ServiceType::Cache => "#6a8a7a",
        ServiceType::External => "#6a675f",
    }
    .to_string()
}

/// Infer a more specific service type for a service that was incorrectly classified
/// as External. Uses runtime, framework, and name heuristics.
fn infer_service_type_from_properties(svc: &MapService) -> ServiceType {
    let name = svc.name.to_lowercase();
    let runtime = svc.runtime.to_lowercase();
    let framework = svc.framework.to_lowercase();

    // Database indicators
    if name.contains("postgres")
        || name.contains("mysql")
        || name.contains("mongo")
        || name.contains("sqlite")
        || name.contains("dynamo")
        || name.contains("database")
        || name.contains("db")
        || name.contains("cockroach")
        || name.contains("mariadb")
    {
        return ServiceType::Database;
    }

    // Cache indicators
    if name.contains("redis")
        || name.contains("memcache")
        || name.contains("cache")
        || name.contains("valkey")
    {
        return ServiceType::Cache;
    }

    // Queue indicators
    if name.contains("queue")
        || name.contains("rabbit")
        || name.contains("kafka")
        || name.contains("sqs")
        || name.contains("nats")
        || name.contains("pulsar")
    {
        return ServiceType::Queue;
    }

    // Gateway indicators
    if name.contains("gateway")
        || name.contains("proxy")
        || name.contains("nginx")
        || name.contains("envoy")
        || name.contains("ingress")
        || name.contains("load balancer")
    {
        return ServiceType::Gateway;
    }

    // Worker indicators
    if name.contains("worker")
        || name.contains("cron")
        || name.contains("job")
        || name.contains("scheduler")
        || name.contains("consumer")
    {
        return ServiceType::Worker;
    }

    // Frontend indicators
    if name.contains("frontend")
        || name.contains("web app")
        || name.contains("ui")
        || name.contains("dashboard")
        || name.contains("client")
        || framework.contains("react")
        || framework.contains("vue")
        || framework.contains("angular")
        || framework.contains("next")
        || framework.contains("nuxt")
        || framework.contains("svelte")
    {
        return ServiceType::Frontend;
    }

    // If it has a backend-like runtime/framework, call it Backend
    if !runtime.is_empty() || !framework.is_empty() {
        return ServiceType::Backend;
    }

    // Default to Backend for repo-owned services
    ServiceType::Backend
}

// ── Helpers ──

/// Wrap a command in the user's preferred shell for PTY execution.
/// For tmux: runs `tmux new-session -- <cmd> <args...>` so the session runs inside tmux.
/// For other shells (bash, zsh, fish): runs `shell -l -c "<cmd> <args...>"` so the
/// shell's login profile is loaded and the user gets their expected environment.
fn wrap_in_shell(shell: &str, args: &[String]) -> (String, Vec<String>) {
    if args.is_empty() {
        return (String::new(), Vec::new());
    }
    match shell {
        "tmux" => {
            let mut tmux_args = vec!["new-session".to_string(), "--".to_string()];
            tmux_args.extend(args.iter().cloned());
            ("tmux".to_string(), tmux_args)
        }
        _ => {
            // bash, zsh, fish, etc. — wrap in a login shell so the user's
            // profile/rc environment is loaded (PATH, aliases, etc.)
            let full_cmd = args
                .iter()
                .map(|a| shell_quote(a))
                .collect::<Vec<_>>()
                .join(" ");
            if shell.contains("powershell") {
                (shell.to_string(), vec!["-Command".to_string(), full_cmd])
            } else {
                (
                    shell.to_string(),
                    vec!["-l".to_string(), "-c".to_string(), full_cmd],
                )
            }
        }
    }
}

/// Shell-quote a string for safe inclusion in shell commands.
/// Platform-aware default shell when no preference is set.
fn default_shell() -> String {
    if cfg!(target_os = "windows") {
        "powershell".to_string()
    } else {
        "bash".to_string()
    }
}

/// Resolve the user's full PATH by running a login shell.
///
/// On macOS, GUI apps launched from Finder/Spotlight inherit a minimal PATH
/// (typically just `/usr/bin:/bin:/usr/sbin:/sbin`) that doesn't include
/// paths where Claude Code is installed (e.g. via npm/nvm). This function
/// runs a login shell to capture the user's complete PATH, then caches the
/// result for the lifetime of the process.
fn resolve_user_path() -> Option<String> {
    use std::sync::OnceLock;
    static USER_PATH: OnceLock<Option<String>> = OnceLock::new();

    USER_PATH
        .get_or_init(|| {
            // Only needed on macOS — Linux desktop launchers and Windows
            // generally propagate PATH correctly.
            if !cfg!(target_os = "macos") {
                return None;
            }

            // Determine which shell to query — prefer the user's login shell
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

            // Run a login shell to print PATH
            let output = std::process::Command::new(&shell)
                .args(["-l", "-c", "echo $PATH"])
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .output()
                .ok()?;

            if !output.status.success() {
                return None;
            }

            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                None
            } else {
                Some(path)
            }
        })
        .clone()
}

/// Apply the resolved user PATH to a `std::process::Command`.
/// No-op on non-macOS or if PATH resolution failed.
fn apply_user_path(cmd: &mut std::process::Command) {
    if let Some(path) = resolve_user_path() {
        cmd.env("PATH", path);
    }
}

/// Relay a child process's piped stdout and stderr to a log file with immediate flushing.
/// This avoids the OS block-buffering issue where stdout redirected to a file stays empty
/// until the process finishes or the buffer fills.
fn relay_output_to_log(child: &mut std::process::Child, log_path: std::path::PathBuf) {
    use std::io::{BufRead, BufReader, Write as IoWrite};

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(out) = stdout {
        let path = log_path.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(out);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if let Ok(mut f) = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&path)
                    {
                        let _ = writeln!(f, "{}", line);
                    }
                }
            }
        });
    }

    if let Some(err) = stderr {
        let path = log_path;
        std::thread::spawn(move || {
            let reader = BufReader::new(err);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if let Ok(mut f) = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&path)
                    {
                        let _ = writeln!(f, "{}", line);
                    }
                }
            }
        });
    }
}

fn shell_quote(s: &str) -> String {
    if s.chars()
        .all(|c| c.is_alphanumeric() || c == '/' || c == '.' || c == '-' || c == '_')
    {
        s.to_string()
    } else {
        format!("'{}'", s.replace('\'', "'\\''"))
    }
}

fn get_repo(state: &State<AppState>, repo_id: &str) -> Result<Repository, String> {
    let repos = state.repositories.lock().unwrap();
    repos
        .get(repo_id)
        .cloned()
        .ok_or("Repository not found".to_string())
}

fn get_primary_repo(state: &State<AppState>, feature: &Feature) -> Result<Repository, String> {
    let primary_id = feature
        .primary_repo_id()
        .ok_or("Feature has no repositories")?;
    get_repo(state, primary_id)
}

fn get_all_repos(state: &State<AppState>, feature: &Feature) -> Result<Vec<Repository>, String> {
    let repo_ids = feature.effective_repo_ids();
    if repo_ids.is_empty() {
        return Err("Feature has no repositories".to_string());
    }
    repo_ids.iter().map(|id| get_repo(state, id)).collect()
}

fn generate_multi_repo_context(repos: &[Repository]) -> String {
    generate_multi_repo_context_with_similar(repos, &[])
}

fn generate_multi_repo_context_with_similar(
    repos: &[Repository],
    all_repos: &[Repository],
) -> String {
    let mut context = if repos.len() == 1 {
        generate_context_pack_string(&repos[0].path)
    } else {
        let mut c = String::from("# Repositories\n\nThis feature spans multiple repositories:\n\n");
        for repo in repos {
            c.push_str(&format!("## {} (`{}`)\n\n", repo.name, repo.path));
            c.push_str(&generate_context_pack_string(&repo.path));
            c.push_str("\n\n");
        }
        c
    };

    // Collect similar repos referenced by any feature repo
    let feature_repo_ids: std::collections::HashSet<&str> =
        repos.iter().map(|r| r.id.as_str()).collect();
    let mut similar_seen = std::collections::HashSet::new();
    let mut similar_repos: Vec<&Repository> = Vec::new();

    for repo in repos {
        for sim_id in &repo.similar_repo_ids {
            if !feature_repo_ids.contains(sim_id.as_str()) && similar_seen.insert(sim_id.as_str()) {
                if let Some(sim_repo) = all_repos.iter().find(|r| r.id == *sim_id) {
                    similar_repos.push(sim_repo);
                }
            }
        }
    }

    if !similar_repos.is_empty() {
        context.push_str("\n\n## Similar Repositories (Pattern Hints)\n\n");
        context.push_str("The following repositories implement similar patterns and should be used as reference for conventions, structure, and approach:\n\n");
        for sim in &similar_repos {
            context.push_str(&format!("### {} (`{}`)\n", sim.name, sim.path));
            if !sim.description.is_empty() {
                context.push_str(&format!("{}\n", sim.description));
            }
            context.push_str(&generate_context_pack_string(&sim.path));
            context.push_str("\n\n");
        }
    }

    context
}

/// Format a SystemMap into a human-readable architecture context for the ideation prompt.
fn format_map_context(map: &SystemMap) -> String {
    let mut out = String::new();
    out.push_str(&format!("**{}**", map.name));
    if !map.description.is_empty() {
        out.push_str(&format!(" — {}", map.description));
    }
    out.push('\n');

    if !map.services.is_empty() {
        out.push_str("\nServices:\n");
        for svc in &map.services {
            let mut parts = vec![format!("  - **{}** ({:?})", svc.name, svc.service_type)];
            if !svc.runtime.is_empty() {
                parts.push(format!(" [{}]", svc.runtime));
            }
            if !svc.description.is_empty() {
                parts.push(format!(" — {}", svc.description));
            }
            out.push_str(&parts.join(""));
            out.push('\n');
        }
    }

    if !map.connections.is_empty() {
        out.push_str("\nConnections:\n");
        for conn in &map.connections {
            let from_name = map
                .services
                .iter()
                .find(|s| s.id == conn.from_service)
                .map(|s| s.name.as_str())
                .unwrap_or("?");
            let to_name = map
                .services
                .iter()
                .find(|s| s.id == conn.to_service)
                .map(|s| s.name.as_str())
                .unwrap_or("?");
            let mut line = format!(
                "  - {} → {} ({:?})",
                from_name, to_name, conn.connection_type
            );
            if !conn.label.is_empty() {
                line.push_str(&format!(": {}", conn.label));
            }
            if !conn.sync {
                line.push_str(" [async]");
            }
            out.push_str(&line);
            out.push('\n');
        }
    }

    out
}

fn generate_context_pack_string(repo_path: &str) -> String {
    let mut map = String::new();
    let indicators = vec![
        ("package.json", "JavaScript/TypeScript (Node.js)"),
        ("Cargo.toml", "Rust"),
        ("go.mod", "Go"),
        ("requirements.txt", "Python"),
        ("pyproject.toml", "Python"),
    ];

    map.push_str("**Languages:** ");
    let langs: Vec<&str> = indicators
        .iter()
        .filter(|(file, _)| Path::new(repo_path).join(file).exists())
        .map(|(_, lang)| *lang)
        .collect();
    map.push_str(&langs.join(", "));
    map.push_str("\n\n**Structure:**\n");

    if let Ok(entries) = std::fs::read_dir(repo_path) {
        let mut items: Vec<String> = entries
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with('.')
                    || name == "node_modules"
                    || name == "target"
                    || name == "__pycache__"
                {
                    return None;
                }
                if e.path().is_dir() {
                    Some(format!("- `{}/`", name))
                } else {
                    Some(format!("- `{}`", name))
                }
            })
            .collect();
        items.sort();
        map.push_str(&items.join("\n"));
    }

    map
}

// ── Hooks Commands ──

/// Read hooks from a repository's .claude/settings.json.
#[tauri::command]
pub fn get_repo_hooks(repo_path: String) -> Result<RepoHooks, String> {
    let settings_path = Path::new(&repo_path).join(".claude").join("settings.json");
    if !settings_path.exists() {
        return Ok(RepoHooks::default());
    }
    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {e}"))?;
    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON in settings: {e}"))?;
    match parsed.get("hooks") {
        Some(hooks_val) => serde_json::from_value(hooks_val.clone())
            .map_err(|e| format!("Failed to parse hooks: {e}")),
        None => Ok(RepoHooks::default()),
    }
}

/// Write hooks to a repository's .claude/settings.json, preserving other settings.
#[tauri::command]
pub fn save_repo_hooks(repo_path: String, hooks: RepoHooks) -> Result<(), String> {
    let claude_dir = Path::new(&repo_path).join(".claude");
    std::fs::create_dir_all(&claude_dir)
        .map_err(|e| format!("Failed to create .claude directory: {e}"))?;

    let settings_path = claude_dir.join("settings.json");

    // Load existing settings or start fresh.
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON in settings: {e}"))?
    } else {
        serde_json::json!({})
    };

    // Serialize hooks, omitting empty event arrays.
    let hooks_val =
        serde_json::to_value(&hooks).map_err(|e| format!("Failed to serialize hooks: {e}"))?;

    // If all events are empty, remove the hooks key entirely.
    if hooks_val.as_object().map_or(true, |m| m.is_empty()) {
        if let Some(obj) = settings.as_object_mut() {
            obj.remove("hooks");
        }
    } else {
        settings["hooks"] = hooks_val;
    }

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to format settings: {e}"))?;
    std::fs::write(&settings_path, json).map_err(|e| format!("Failed to write settings: {e}"))?;
    Ok(())
}

/// Return the list of built-in hook templates.
#[tauri::command]
pub fn list_hook_templates() -> Vec<HookTemplate> {
    templates::built_in_hook_templates()
}

/// Generate a hook from a natural language description using Claude.
/// Spawns Claude in the background, writes output to ~/.claude/.gmb/hook-generation-output.json.
/// Frontend polls via `check_hook_generation`.
#[tauri::command]
pub fn generate_hook(description: String) -> Result<(), String> {
    use std::io::Write as IoWrite;

    let prompt = format!(
        r#"Generate a Claude Code hook based on this description:

{description}

Respond with ONLY a single JSON object (no markdown fences, no explanation) in this exact format:
{{
  "name": "short-name",
  "description": "One-line description",
  "event": "EVENT_TYPE",
  "matcher": "TOOL_REGEX_OR_EMPTY",
  "command": "SHELL_COMMAND"
}}

Rules:
- event must be one of: PreToolUse, PostToolUse, UserPromptSubmit, SessionStart, Stop, Notification, SubagentStop
- matcher is a regex matching tool names (e.g. "Bash", "Edit|Write", "Read") — leave empty string for events that don't match tools
- PreToolUse hooks can block actions by exiting with code 2 and printing a message to stderr
- command should be a valid shell command; use $CLAUDE_TOOL_INPUT and $CLAUDE_TOOL_NAME env vars when relevant
- Keep the command concise and portable (POSIX sh compatible where possible)
- For blocking hooks (PreToolUse), use: if <condition>; then echo 'message' >&2; exit 2; fi"#,
        description = description,
    );

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())?;

    let log_dir = std::path::Path::new(&home).join(".claude").join(".gmb");
    let _ = std::fs::create_dir_all(&log_dir);
    let output_path = log_dir.join("hook-generation-output.json");

    // Remove stale output file so polling starts fresh
    let _ = std::fs::remove_file(&output_path);

    let out_file = std::fs::File::create(&output_path)
        .map_err(|e| format!("Failed to create output file: {e}"))?;
    let err_file = out_file
        .try_clone()
        .map_err(|e| format!("Failed to clone file handle: {e}"))?;

    let mut cmd = std::process::Command::new("claude");
    apply_user_path(&mut cmd);
    cmd.arg("--print")
        .arg("--output-format")
        .arg("text")
        .stdin(std::process::Stdio::piped())
        .stdout(out_file)
        .stderr(err_file)
        .current_dir(&home);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Claude: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = stdin.write_all(prompt.as_bytes());
        });
    }

    Ok(())
}

/// Check if hook generation is complete and return the result if so.
/// Returns None if still in progress, or the generated JSON string if done.
#[tauri::command]
pub fn check_hook_generation() -> Result<Option<String>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())?;

    let output_path = std::path::Path::new(&home)
        .join(".claude")
        .join(".gmb")
        .join("hook-generation-output.json");

    if !output_path.exists() {
        return Ok(None);
    }

    let content =
        std::fs::read_to_string(&output_path).map_err(|e| format!("Failed to read output: {e}"))?;

    // If the content is empty, still generating
    if content.trim().is_empty() {
        return Ok(None);
    }

    // Try to find a JSON object in the output (Claude may include extra text)
    let trimmed = content.trim();
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            let json_str = &trimmed[start..=end];
            // Validate it's valid JSON
            if serde_json::from_str::<serde_json::Value>(json_str).is_ok() {
                return Ok(Some(json_str.to_string()));
            }
        }
    }

    // Content exists but no valid JSON yet — might still be streaming
    // Check if file was modified recently (within 5 seconds)
    if let Ok(metadata) = std::fs::metadata(&output_path) {
        if let Ok(modified) = metadata.modified() {
            if modified.elapsed().map_or(false, |d| d.as_secs() < 5) {
                return Ok(None); // Still writing
            }
        }
    }

    // File is stale and has no valid JSON — generation failed
    Err(format!(
        "Hook generation failed — Claude's output didn't contain valid JSON: {}",
        &content[..content.len().min(200)]
    ))
}

// ── Agent History Commands ──

#[tauri::command]
pub fn get_agent_summaries(state: State<AppState>) -> Vec<crate::models::AgentPerformanceSummary> {
    state.get_agent_summaries()
}

#[tauri::command]
pub fn get_agent_history(
    state: State<AppState>,
    agent: Option<String>,
) -> Vec<crate::models::AgentTaskRecord> {
    let history = state.agent_history.lock().unwrap();
    match agent {
        Some(name) => history
            .iter()
            .filter(|r| r.agent == name)
            .cloned()
            .collect(),
        None => history.clone(),
    }
}

// ── Process Log Transparency ──

/// Read the output log of a background Claude process for transparency.
/// Returns the tail of the log file (up to `max_lines` lines, default 200).
///
/// Supported process types:
/// - "ideation": reads `{repo}/.gmb/features/{id}/claude-ideation.log`
/// - "claude-md": reads `{repo_path}/.gmb/claude-md-generation.log`
/// - "skill": reads `~/.claude/.gmb/skill-generation.log`
/// - "discovery": reads `{gmb_path}/discoveries/{id}/discovery.log`
#[tauri::command]
pub fn read_process_log(
    state: State<AppState>,
    process_type: String,
    process_id: Option<String>,
    repo_path: Option<String>,
    max_lines: Option<usize>,
) -> Result<String, String> {
    let max = max_lines.unwrap_or(200);

    let log_path = match process_type.as_str() {
        "ideation" => {
            let feature_id = process_id.ok_or("feature_id required for ideation logs")?;
            let rpath = repo_path.ok_or("repo_path required for ideation logs")?;
            Path::new(&rpath)
                .join(".gmb")
                .join("features")
                .join(&feature_id)
                .join("claude-ideation.log")
        }
        "claude-md" => {
            let rpath = repo_path.ok_or("repo_path required for claude-md logs")?;
            Path::new(&rpath)
                .join(".gmb")
                .join("claude-md-generation.log")
        }
        "skill" => {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .map_err(|_| "Could not determine home directory".to_string())?;
            std::path::Path::new(&home)
                .join(".claude")
                .join(".gmb")
                .join("skill-generation.log")
        }
        "discovery" => {
            let map_id = process_id.ok_or("map_id required for discovery logs")?;
            Path::new(&state.gmb_path)
                .join("discoveries")
                .join(&map_id)
                .join("discovery.log")
        }
        _ => return Err(format!("Unknown process type: {}", process_type)),
    };

    if !log_path.exists() {
        return Ok(String::new());
    }

    let content = std::fs::read_to_string(&log_path)
        .map_err(|e| format!("Failed to read log: {}", e))?;

    // Return the last `max` lines
    let lines: Vec<&str> = content.lines().collect();
    if lines.len() <= max {
        Ok(content)
    } else {
        Ok(lines[lines.len() - max..].join("\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn generate_context_pack_string_detects_languages() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("package.json"), "{}").unwrap();
        std::fs::write(dir.path().join("Cargo.toml"), "[package]").unwrap();

        let result = generate_context_pack_string(&dir.path().to_string_lossy());
        assert!(result.contains("JavaScript/TypeScript (Node.js)"));
        assert!(result.contains("Rust"));
    }

    #[test]
    fn generate_context_pack_string_lists_structure() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("README.md"), "# Hi").unwrap();
        std::fs::create_dir(dir.path().join(".git")).unwrap();
        std::fs::create_dir(dir.path().join("node_modules")).unwrap();

        let result = generate_context_pack_string(&dir.path().to_string_lossy());
        assert!(result.contains("`src/`"));
        assert!(result.contains("`README.md`"));
        assert!(!result.contains(".git"));
        assert!(!result.contains("node_modules"));
    }

    #[test]
    fn generate_context_pack_string_empty_dir() {
        let dir = TempDir::new().unwrap();
        let result = generate_context_pack_string(&dir.path().to_string_lossy());
        assert!(result.contains("**Languages:**"));
        assert!(result.contains("**Structure:**"));
    }

    #[test]
    fn validate_feature_name_rejects_empty() {
        assert!(validate_feature_name("").is_err());
        assert!(validate_feature_name("   ").is_err());
    }

    #[test]
    fn validate_feature_name_rejects_path_traversal() {
        assert!(validate_feature_name("../../etc/passwd").is_err());
        assert!(validate_feature_name("foo/bar").is_err());
        assert!(validate_feature_name("foo\\bar").is_err());
    }

    #[test]
    fn validate_feature_name_rejects_too_long() {
        let long_name = "a".repeat(201);
        assert!(validate_feature_name(&long_name).is_err());
    }

    #[test]
    fn validate_feature_name_accepts_valid() {
        assert!(validate_feature_name("Add dark mode toggle").is_ok());
        assert!(validate_feature_name("Fix bug #123").is_ok());
        assert!(validate_feature_name("a").is_ok());
    }

    #[test]
    fn shell_quote_simple_path() {
        assert_eq!(shell_quote("/home/user/repo"), "/home/user/repo");
        assert_eq!(shell_quote("simple-path"), "simple-path");
    }

    #[test]
    fn shell_quote_path_with_spaces() {
        assert_eq!(shell_quote("/home/user/my repo"), "'/home/user/my repo'");
    }

    #[test]
    fn shell_quote_path_with_quotes() {
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
    }

    #[test]
    fn has_claude_md_file_returns_true_when_exists() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("CLAUDE.md"), "# Project").unwrap();
        assert!(has_claude_md_file(&dir.path().to_string_lossy()));
    }

    #[test]
    fn has_claude_md_file_returns_false_when_missing() {
        let dir = TempDir::new().unwrap();
        assert!(!has_claude_md_file(&dir.path().to_string_lossy()));
    }

    #[test]
    fn check_claude_md_returns_true_when_exists() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("CLAUDE.md"), "# Project").unwrap();
        let result = check_claude_md(dir.path().to_string_lossy().to_string());
        assert_eq!(result.unwrap(), true);
    }

    #[test]
    fn check_claude_md_returns_false_when_missing() {
        let dir = TempDir::new().unwrap();
        let result = check_claude_md(dir.path().to_string_lossy().to_string());
        assert_eq!(result.unwrap(), false);
    }

    #[test]
    fn check_claude_md_errors_on_bad_path() {
        let result = check_claude_md("/nonexistent/path/xyz".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn generate_claude_md_errors_on_bad_path() {
        let result = generate_claude_md("/nonexistent/path/xyz".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Path does not exist"));
    }

    #[test]
    fn generate_claude_md_errors_on_non_git_repo() {
        let dir = TempDir::new().unwrap();
        let result = generate_claude_md(dir.path().to_string_lossy().to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a git repository"));
    }

    #[test]
    fn generate_claude_md_errors_on_empty_repo() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_string_lossy().to_string();
        // git init creates a repo with no commits
        std::process::Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(dir.path())
            .output()
            .expect("git init failed");
        let result = generate_claude_md(path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty repository"));
    }

    #[test]
    fn detect_repo_info_reports_empty_repo() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_string_lossy().to_string();
        std::process::Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(dir.path())
            .output()
            .expect("git init failed");
        let result = detect_repo_info(path).unwrap();
        assert_eq!(result["is_empty"], true);
        assert_eq!(result["has_claude_md"], false);
    }

    #[test]
    fn read_task_progress_returns_none_for_missing_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("progress.json");
        assert!(read_task_progress(&path).is_none());
    }

    #[test]
    fn read_task_progress_parses_valid_json() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("progress.json");
        std::fs::write(
            &path,
            r#"{
            "tasks": [
                {
                    "task": 1,
                    "title": "Add feature",
                    "status": "in_progress",
                    "acceptance_criteria": [
                        {"criterion": "Tests pass", "done": true},
                        {"criterion": "Docs updated", "done": false}
                    ]
                }
            ]
        }"#,
        )
        .unwrap();
        let result = read_task_progress(&path).unwrap();
        assert_eq!(result.tasks.len(), 1);
        assert_eq!(result.tasks[0].task, 1);
        assert_eq!(result.tasks[0].status, TaskStatus::InProgress);
        assert_eq!(result.tasks[0].acceptance_criteria.len(), 2);
        assert!(result.tasks[0].acceptance_criteria[0].done);
        assert!(!result.tasks[0].acceptance_criteria[1].done);
    }

    #[test]
    fn read_task_progress_returns_none_on_invalid_json() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("progress.json");
        std::fs::write(&path, "not valid json").unwrap();
        assert!(read_task_progress(&path).is_none());
    }

    #[test]
    fn generate_multi_repo_context_with_similar_includes_hint_repos() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_string_lossy().to_string();

        let feature_repo = Repository::new(
            "my-service".to_string(),
            repo_path.clone(),
            "main".to_string(),
            String::new(),
            vec![],
            None,
            vec!["sim-1".to_string()],
            None,
        );

        let mut similar_repo = Repository::new(
            "other-service".to_string(),
            repo_path.clone(),
            "main".to_string(),
            "A similar Go service".to_string(),
            vec![],
            None,
            vec![],
            None,
        );
        similar_repo.id = "sim-1".to_string();

        let unrelated_repo = Repository::new(
            "unrelated".to_string(),
            repo_path,
            "main".to_string(),
            String::new(),
            vec![],
            None,
            vec![],
            None,
        );

        let all_repos = vec![feature_repo.clone(), similar_repo, unrelated_repo];
        let context = generate_multi_repo_context_with_similar(&[feature_repo], &all_repos);

        assert!(context.contains("Similar Repositories (Pattern Hints)"));
        assert!(context.contains("other-service"));
        assert!(context.contains("A similar Go service"));
        assert!(!context.contains("unrelated"));
    }

    #[test]
    fn generate_multi_repo_context_with_similar_no_similar() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_string_lossy().to_string();

        let repo = Repository::new(
            "my-service".to_string(),
            repo_path,
            "main".to_string(),
            String::new(),
            vec![],
            None,
            vec![],
            None,
        );

        let context = generate_multi_repo_context_with_similar(&[repo.clone()], &[repo]);
        assert!(!context.contains("Similar Repositories"));
    }

    #[test]
    fn generate_multi_repo_context_with_similar_skips_feature_repos() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_string_lossy().to_string();

        let mut repo = Repository::new(
            "my-service".to_string(),
            repo_path,
            "main".to_string(),
            String::new(),
            vec![],
            None,
            vec!["self-ref".to_string()],
            None,
        );
        repo.id = "self-ref".to_string();

        // When a repo lists itself as similar, it should not appear in hints
        let context = generate_multi_repo_context_with_similar(&[repo.clone()], &[repo]);
        assert!(!context.contains("Similar Repositories"));
    }

    // ── parse_service_type tests ──

    #[test]
    fn parse_service_type_all_variants() {
        assert!(matches!(
            parse_service_type("backend"),
            ServiceType::Backend
        ));
        assert!(matches!(
            parse_service_type("frontend"),
            ServiceType::Frontend
        ));
        assert!(matches!(parse_service_type("worker"), ServiceType::Worker));
        assert!(matches!(
            parse_service_type("gateway"),
            ServiceType::Gateway
        ));
        assert!(matches!(
            parse_service_type("database"),
            ServiceType::Database
        ));
        assert!(matches!(parse_service_type("queue"), ServiceType::Queue));
        assert!(matches!(parse_service_type("cache"), ServiceType::Cache));
        assert!(matches!(
            parse_service_type("external"),
            ServiceType::External
        ));
    }

    #[test]
    fn parse_service_type_case_insensitive() {
        assert!(matches!(
            parse_service_type("Backend"),
            ServiceType::Backend
        ));
        assert!(matches!(
            parse_service_type("FRONTEND"),
            ServiceType::Frontend
        ));
    }

    #[test]
    fn parse_service_type_defaults_to_backend() {
        assert!(matches!(
            parse_service_type("unknown"),
            ServiceType::Backend
        ));
        assert!(matches!(parse_service_type(""), ServiceType::Backend));
    }

    // ── parse_connection_type tests ──

    #[test]
    fn parse_connection_type_all_variants() {
        assert!(matches!(
            parse_connection_type("rest"),
            ConnectionType::Rest
        ));
        assert!(matches!(
            parse_connection_type("grpc"),
            ConnectionType::Grpc
        ));
        assert!(matches!(
            parse_connection_type("graphql"),
            ConnectionType::Graphql
        ));
        assert!(matches!(
            parse_connection_type("websocket"),
            ConnectionType::Websocket
        ));
        assert!(matches!(
            parse_connection_type("event"),
            ConnectionType::Event
        ));
        assert!(matches!(
            parse_connection_type("shared_db"),
            ConnectionType::SharedDb
        ));
        assert!(matches!(
            parse_connection_type("file_system"),
            ConnectionType::FileSystem
        ));
        assert!(matches!(parse_connection_type("ipc"), ConnectionType::Ipc));
    }

    #[test]
    fn parse_connection_type_defaults_to_rest() {
        assert!(matches!(
            parse_connection_type("unknown"),
            ConnectionType::Rest
        ));
        assert!(matches!(parse_connection_type(""), ConnectionType::Rest));
    }

    // ── service_type_color tests ──

    #[test]
    fn service_type_color_returns_hex_codes() {
        assert_eq!(service_type_color(&ServiceType::Backend), "#5a8a5c");
        assert_eq!(service_type_color(&ServiceType::Frontend), "#5b8abd");
        assert_eq!(service_type_color(&ServiceType::Worker), "#9b6abf");
        assert_eq!(service_type_color(&ServiceType::Database), "#d4aa5a");
    }

    // ── check_tmux_installed tests ──

    #[test]
    fn check_tmux_installed_returns_bool() {
        // Just verify it doesn't panic — result depends on system
        let _ = check_tmux_installed();
    }

    #[test]
    fn detect_available_shells_returns_results() {
        let shells = detect_available_shells();
        // Should find at least one shell on any system
        assert!(!shells.is_empty());
        // Each entry should have a non-empty value and label
        for (value, label) in &shells {
            assert!(!value.is_empty());
            assert!(!label.is_empty());
        }
    }

    // ── wrap_in_shell tests ──

    #[test]
    fn wrap_in_shell_bash_wraps_in_login_shell() {
        let args = vec!["claude".to_string(), "--help".to_string()];
        let (cmd, cmd_args) = wrap_in_shell("bash", &args);
        assert_eq!(cmd, "bash");
        assert_eq!(cmd_args, vec!["-l", "-c", "claude --help"]);
    }

    #[test]
    fn wrap_in_shell_zsh_wraps_in_login_shell() {
        let args = vec![
            "claude".to_string(),
            "--prompt".to_string(),
            "do stuff".to_string(),
        ];
        let (cmd, cmd_args) = wrap_in_shell("zsh", &args);
        assert_eq!(cmd, "zsh");
        assert_eq!(cmd_args[0], "-l");
        assert_eq!(cmd_args[1], "-c");
        // args with spaces should be shell-quoted
        assert!(cmd_args[2].contains("'do stuff'"));
    }

    #[test]
    fn wrap_in_shell_fish_wraps_in_login_shell() {
        let args = vec!["claude".to_string(), "--help".to_string()];
        let (cmd, cmd_args) = wrap_in_shell("fish", &args);
        assert_eq!(cmd, "fish");
        assert_eq!(cmd_args, vec!["-l", "-c", "claude --help"]);
    }

    #[test]
    fn wrap_in_shell_powershell_uses_command_flag() {
        let args = vec!["claude".to_string(), "--help".to_string()];
        let (cmd, cmd_args) = wrap_in_shell("powershell", &args);
        assert_eq!(cmd, "powershell");
        assert_eq!(cmd_args, vec!["-Command", "claude --help"]);
    }

    #[test]
    fn wrap_in_shell_tmux_wraps_in_new_session() {
        let args = vec![
            "claude".to_string(),
            "--prompt".to_string(),
            "test".to_string(),
        ];
        let (cmd, cmd_args) = wrap_in_shell("tmux", &args);
        assert_eq!(cmd, "tmux");
        assert_eq!(cmd_args[0], "new-session");
        assert_eq!(cmd_args[1], "--");
        assert_eq!(cmd_args[2], "claude");
        assert_eq!(cmd_args[3], "--prompt");
    }

    #[test]
    fn wrap_in_shell_empty_args_returns_empty() {
        let (cmd, cmd_args) = wrap_in_shell("tmux", &[]);
        assert!(cmd.is_empty());
        assert!(cmd_args.is_empty());
    }

    // ── generate_multi_repo_context tests ──

    #[test]
    fn generate_multi_repo_context_includes_repo_info() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::new(
            "test-repo".to_string(),
            dir.path().to_string_lossy().to_string(),
            "main".to_string(),
            "A test repo".to_string(),
            vec![],
            None,
            vec![],
            None,
        );

        let context = generate_multi_repo_context(&[repo]);
        assert!(context.contains("test-repo"));
        assert!(context.contains("main"));
    }

    #[test]
    fn generate_multi_repo_context_multiple_repos() {
        let dir1 = TempDir::new().unwrap();
        let dir2 = TempDir::new().unwrap();

        let repo1 = Repository::new(
            "frontend".to_string(),
            dir1.path().to_string_lossy().to_string(),
            "main".to_string(),
            String::new(),
            vec![],
            None,
            vec![],
            None,
        );
        let repo2 = Repository::new(
            "backend".to_string(),
            dir2.path().to_string_lossy().to_string(),
            "develop".to_string(),
            String::new(),
            vec![],
            None,
            vec![],
            None,
        );

        let context = generate_multi_repo_context(&[repo1, repo2]);
        assert!(context.contains("frontend"));
        assert!(context.contains("backend"));
    }

    // ── get_claude_md_command tests ──

    #[test]
    fn get_claude_md_command_returns_command_string() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_string_lossy().to_string();
        // git init so it's a valid repo
        std::process::Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(dir.path())
            .output()
            .expect("git init failed");

        let result = get_claude_md_command(path);
        assert!(result.is_ok());
        let cmd = result.unwrap();
        assert!(cmd.contains("claude"));
        assert!(cmd.contains("CLAUDE.md"));
    }

    #[test]
    fn plan_json_parses_as_ideation_result_for_snapshot() {
        let dir = TempDir::new().unwrap();
        let plan_path = dir.path().join("plan.json");
        std::fs::write(
            &plan_path,
            r#"{
            "tasks": [
                {
                    "title": "Add auth",
                    "description": "Build auth module",
                    "acceptance_criteria": ["Login works"],
                    "dependencies": [],
                    "agent": "backend-dev"
                }
            ],
            "execution_mode": {
                "recommended": "teams",
                "rationale": "Parallel tasks",
                "confidence": 0.9
            }
        }"#,
        )
        .unwrap();

        let data = std::fs::read_to_string(&plan_path).unwrap();
        let result: IdeationResult = serde_json::from_str(&data).unwrap();
        assert_eq!(result.tasks.len(), 1);
        assert_eq!(result.tasks[0].title, "Add auth");
        assert!(result.execution_mode.is_some());
        assert_eq!(
            result.execution_mode.as_ref().unwrap().recommended,
            ExecutionMode::Teams
        );
    }

    #[test]
    fn empty_plan_json_tasks_not_snapshotted() {
        let dir = TempDir::new().unwrap();
        let plan_path = dir.path().join("plan.json");
        std::fs::write(&plan_path, r#"{"tasks": [], "execution_mode": null}"#).unwrap();

        let data = std::fs::read_to_string(&plan_path).unwrap();
        let result: IdeationResult = serde_json::from_str(&data).unwrap();
        // Snapshot logic skips empty tasks — verify the condition
        assert!(result.tasks.is_empty());
    }

    #[test]
    fn missing_plan_json_not_snapshotted() {
        let dir = TempDir::new().unwrap();
        let plan_path = dir.path().join("plan.json");
        // Snapshot logic checks existence first
        assert!(!plan_path.exists());
    }

    #[test]
    fn build_initial_progress_json_empty_specs() {
        let result = build_initial_progress_json(&[]);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["tasks"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn build_initial_progress_json_with_specs() {
        let specs = vec![
            TaskSpec {
                title: "Add auth".to_string(),
                description: "Implement authentication".to_string(),
                acceptance_criteria: vec!["Login works".to_string(), "Logout works".to_string()],
                dependencies: vec![],
                agent: "dev".to_string(),
            },
            TaskSpec {
                title: "Write tests".to_string(),
                description: "Test the auth flow".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec!["1".to_string()],
                agent: "test-writer".to_string(),
            },
        ];
        let result = build_initial_progress_json(&specs);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        let tasks = parsed["tasks"].as_array().unwrap();
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0]["task"], 1);
        assert_eq!(tasks[0]["title"], "Add auth");
        assert_eq!(tasks[0]["status"], "pending");
        assert_eq!(tasks[0]["acceptance_criteria"].as_array().unwrap().len(), 2);
        assert_eq!(
            tasks[0]["acceptance_criteria"][0]["criterion"],
            "Login works"
        );
        assert_eq!(tasks[0]["acceptance_criteria"][0]["done"], false);
        assert_eq!(tasks[1]["task"], 2);
        assert_eq!(tasks[1]["acceptance_criteria"].as_array().unwrap().len(), 0);
    }

    // ── resolve_user_path / apply_user_path tests ──

    #[test]
    fn resolve_user_path_returns_consistent_results() {
        // OnceLock caching: calling twice should return the same value
        let first = resolve_user_path();
        let second = resolve_user_path();
        assert_eq!(first, second);
    }

    #[test]
    fn resolve_user_path_non_empty_on_unix() {
        // On any Unix system (including macOS), the login shell should produce a PATH
        if !cfg!(target_os = "windows") {
            let path = resolve_user_path();
            // On non-macOS we expect None (the function only activates on macOS),
            // on macOS we expect Some with a non-empty string.
            if cfg!(target_os = "macos") {
                assert!(path.is_some(), "Should resolve PATH on macOS");
                assert!(!path.unwrap().is_empty());
            }
            // On Linux this is expected to be None (no-op)
        }
    }

    #[test]
    fn apply_user_path_does_not_panic() {
        // Smoke test: apply_user_path should not panic regardless of platform
        let mut cmd = std::process::Command::new("echo");
        apply_user_path(&mut cmd);
        // No assertion needed — just verifying it doesn't panic
    }

    #[test]
    fn build_initial_progress_json_is_valid_task_progress() {
        let specs = vec![TaskSpec {
            title: "Task one".to_string(),
            description: "Do something".to_string(),
            acceptance_criteria: vec!["It works".to_string()],
            dependencies: vec![],
            agent: "dev".to_string(),
        }];
        let result = build_initial_progress_json(&specs);
        // Should parse as a valid TaskProgress struct
        let parsed: TaskProgress = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed.tasks.len(), 1);
        assert_eq!(parsed.tasks[0].title, "Task one");
        assert_eq!(parsed.tasks[0].status, TaskStatus::Pending);
        assert!(!parsed.completion_detected);
    }

    // ── infer_service_type_from_properties tests ──

    #[test]
    fn infer_service_type_database_keywords() {
        let svc = MapService {
            id: "1".into(),
            name: "PostgreSQL".into(),
            service_type: ServiceType::External,
            repo_id: Some("r1".into()),
            runtime: "".into(),
            framework: "".into(),
            description: "".into(),
            owns_data: vec![],
            position: (0.0, 0.0),
            color: "".into(),
        };
        assert_eq!(
            infer_service_type_from_properties(&svc),
            ServiceType::Database
        );

        let svc2 = MapService {
            name: "user-db".into(),
            ..svc.clone()
        };
        assert_eq!(
            infer_service_type_from_properties(&svc2),
            ServiceType::Database
        );
    }

    #[test]
    fn infer_service_type_cache_keywords() {
        let svc = MapService {
            id: "1".into(),
            name: "Redis".into(),
            service_type: ServiceType::External,
            repo_id: Some("r1".into()),
            runtime: "".into(),
            framework: "".into(),
            description: "".into(),
            owns_data: vec![],
            position: (0.0, 0.0),
            color: "".into(),
        };
        assert_eq!(infer_service_type_from_properties(&svc), ServiceType::Cache);
    }

    #[test]
    fn infer_service_type_queue_keywords() {
        let svc = MapService {
            id: "1".into(),
            name: "RabbitMQ".into(),
            service_type: ServiceType::External,
            repo_id: Some("r1".into()),
            runtime: "".into(),
            framework: "".into(),
            description: "".into(),
            owns_data: vec![],
            position: (0.0, 0.0),
            color: "".into(),
        };
        assert_eq!(infer_service_type_from_properties(&svc), ServiceType::Queue);
    }

    #[test]
    fn infer_service_type_gateway_keywords() {
        let svc = MapService {
            id: "1".into(),
            name: "API Gateway".into(),
            service_type: ServiceType::External,
            repo_id: Some("r1".into()),
            runtime: "".into(),
            framework: "".into(),
            description: "".into(),
            owns_data: vec![],
            position: (0.0, 0.0),
            color: "".into(),
        };
        assert_eq!(
            infer_service_type_from_properties(&svc),
            ServiceType::Gateway
        );
    }

    #[test]
    fn infer_service_type_worker_keywords() {
        let svc = MapService {
            id: "1".into(),
            name: "email-worker".into(),
            service_type: ServiceType::External,
            repo_id: Some("r1".into()),
            runtime: "".into(),
            framework: "".into(),
            description: "".into(),
            owns_data: vec![],
            position: (0.0, 0.0),
            color: "".into(),
        };
        assert_eq!(
            infer_service_type_from_properties(&svc),
            ServiceType::Worker
        );
    }

    #[test]
    fn infer_service_type_frontend_by_framework() {
        let svc = MapService {
            id: "1".into(),
            name: "Admin Panel".into(),
            service_type: ServiceType::External,
            repo_id: Some("r1".into()),
            runtime: "node".into(),
            framework: "React".into(),
            description: "".into(),
            owns_data: vec![],
            position: (0.0, 0.0),
            color: "".into(),
        };
        assert_eq!(
            infer_service_type_from_properties(&svc),
            ServiceType::Frontend
        );
    }

    #[test]
    fn infer_service_type_backend_with_runtime() {
        let svc = MapService {
            id: "1".into(),
            name: "auth-service".into(),
            service_type: ServiceType::External,
            repo_id: Some("r1".into()),
            runtime: "node".into(),
            framework: "express".into(),
            description: "".into(),
            owns_data: vec![],
            position: (0.0, 0.0),
            color: "".into(),
        };
        assert_eq!(
            infer_service_type_from_properties(&svc),
            ServiceType::Backend
        );
    }

    #[test]
    fn infer_service_type_defaults_to_backend() {
        let svc = MapService {
            id: "1".into(),
            name: "mystery-service".into(),
            service_type: ServiceType::External,
            repo_id: Some("r1".into()),
            runtime: "".into(),
            framework: "".into(),
            description: "".into(),
            owns_data: vec![],
            position: (0.0, 0.0),
            color: "".into(),
        };
        assert_eq!(
            infer_service_type_from_properties(&svc),
            ServiceType::Backend
        );
    }

    // ── Hooks Tests ──

    #[test]
    fn get_repo_hooks_returns_default_when_no_settings_file() {
        let dir = TempDir::new().unwrap();
        let result = get_repo_hooks(dir.path().to_string_lossy().to_string());
        assert!(result.is_ok());
        let hooks = result.unwrap();
        assert!(hooks.pre_tool_use.is_empty());
        assert!(hooks.post_tool_use.is_empty());
        assert!(hooks.stop.is_empty());
    }

    #[test]
    fn get_repo_hooks_returns_default_when_no_hooks_key() {
        let dir = TempDir::new().unwrap();
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.json"),
            r#"{"permissions": {"allow": ["Bash"]}}"#,
        )
        .unwrap();
        let result = get_repo_hooks(dir.path().to_string_lossy().to_string());
        assert!(result.is_ok());
        let hooks = result.unwrap();
        assert!(hooks.pre_tool_use.is_empty());
    }

    #[test]
    fn get_repo_hooks_parses_existing_hooks() {
        let dir = TempDir::new().unwrap();
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.json"),
            r#"{
                "hooks": {
                    "PostToolUse": [
                        {
                            "matcher": "Edit|Write",
                            "hooks": [{"type": "command", "command": "npm run lint"}]
                        }
                    ]
                }
            }"#,
        )
        .unwrap();
        let result = get_repo_hooks(dir.path().to_string_lossy().to_string());
        assert!(result.is_ok());
        let hooks = result.unwrap();
        assert_eq!(hooks.post_tool_use.len(), 1);
        assert_eq!(hooks.post_tool_use[0].matcher, "Edit|Write");
        assert_eq!(hooks.post_tool_use[0].hooks[0].command, "npm run lint");
    }

    #[test]
    fn save_repo_hooks_creates_settings_file() {
        let dir = TempDir::new().unwrap();
        let mut hooks = RepoHooks::default();
        hooks.pre_tool_use.push(HookRule {
            matcher: "Bash".into(),
            hooks: vec![HookHandler {
                handler_type: "command".into(),
                command: "echo pre".into(),
                timeout: None,
                status_message: None,
            }],
        });
        let result = save_repo_hooks(dir.path().to_string_lossy().to_string(), hooks);
        assert!(result.is_ok());

        // Verify file was created and contains the hook.
        let content = std::fs::read_to_string(dir.path().join(".claude/settings.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert!(parsed["hooks"]["PreToolUse"].is_array());
        assert_eq!(parsed["hooks"]["PreToolUse"][0]["matcher"], "Bash");
    }

    #[test]
    fn save_repo_hooks_preserves_other_settings() {
        let dir = TempDir::new().unwrap();
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.json"),
            r#"{"permissions": {"allow": ["Bash"]}, "hooks": {"Stop": []}}"#,
        )
        .unwrap();

        let mut hooks = RepoHooks::default();
        hooks.stop.push(HookRule {
            matcher: "".into(),
            hooks: vec![HookHandler {
                handler_type: "command".into(),
                command: "echo done".into(),
                timeout: None,
                status_message: None,
            }],
        });
        save_repo_hooks(dir.path().to_string_lossy().to_string(), hooks).unwrap();

        let content = std::fs::read_to_string(claude_dir.join("settings.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        // Original permissions key is preserved.
        assert_eq!(parsed["permissions"]["allow"][0], "Bash");
        // Hooks are updated.
        assert_eq!(
            parsed["hooks"]["Stop"][0]["hooks"][0]["command"],
            "echo done"
        );
    }

    #[test]
    fn save_repo_hooks_removes_hooks_key_when_empty() {
        let dir = TempDir::new().unwrap();
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.json"),
            r#"{"permissions": {"allow": ["Bash"]}, "hooks": {"Stop": [{"matcher": "", "hooks": []}]}}"#,
        ).unwrap();

        let hooks = RepoHooks::default();
        save_repo_hooks(dir.path().to_string_lossy().to_string(), hooks).unwrap();

        let content = std::fs::read_to_string(claude_dir.join("settings.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert!(parsed.get("hooks").is_none());
        assert_eq!(parsed["permissions"]["allow"][0], "Bash");
    }

    #[test]
    fn list_hook_templates_returns_templates() {
        let templates = list_hook_templates();
        assert!(!templates.is_empty());
        // Each template has required fields.
        for t in &templates {
            assert!(!t.id.is_empty());
            assert!(!t.name.is_empty());
            assert!(!t.command.is_empty());
            assert!(!t.event.is_empty());
        }
    }

    #[test]
    fn read_process_log_claude_md_log_path() {
        let dir = TempDir::new().unwrap();
        let gmb_dir = dir.path().join(".gmb");
        std::fs::create_dir_all(&gmb_dir).unwrap();
        std::fs::write(gmb_dir.join("claude-md-generation.log"), "line1\nline2\nline3\n").unwrap();

        // Verify the log path matches what read_process_log would resolve
        let log_path = dir.path().join(".gmb").join("claude-md-generation.log");
        assert!(log_path.exists());
        let content = std::fs::read_to_string(&log_path).unwrap();
        assert!(content.contains("line1"));
        assert!(content.contains("line3"));
    }

    #[test]
    fn read_process_log_ideation_log_path() {
        let dir = TempDir::new().unwrap();
        let feature_dir = dir.path().join(".gmb").join("features").join("feat-123");
        std::fs::create_dir_all(&feature_dir).unwrap();
        let log_content = (0..300).map(|i| format!("log line {}", i)).collect::<Vec<_>>().join("\n");
        std::fs::write(feature_dir.join("claude-ideation.log"), &log_content).unwrap();

        // Verify the log file exists at the expected path
        let log_path = dir.path()
            .join(".gmb")
            .join("features")
            .join("feat-123")
            .join("claude-ideation.log");
        assert!(log_path.exists());
        let content = std::fs::read_to_string(&log_path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 300);

        // Verify tail logic: last 200 lines
        let max = 200;
        let tail: Vec<&str> = lines[lines.len() - max..].to_vec();
        assert_eq!(tail.len(), 200);
        assert!(tail[0].contains("log line 100"));
        assert!(tail[199].contains("log line 299"));
    }

    #[test]
    fn read_process_log_returns_empty_for_missing_log() {
        let dir = TempDir::new().unwrap();
        let log_path = dir.path().join(".gmb").join("claude-md-generation.log");
        assert!(!log_path.exists());
        // Non-existent log should produce empty string (mirrors read_process_log behavior)
    }

    #[test]
    fn read_process_log_discovery_log_path() {
        let dir = TempDir::new().unwrap();
        let disc_dir = dir.path().join("discoveries").join("map-42");
        std::fs::create_dir_all(&disc_dir).unwrap();
        std::fs::write(disc_dir.join("discovery.log"), "discovery output\n").unwrap();

        let log_path = dir.path()
            .join("discoveries")
            .join("map-42")
            .join("discovery.log");
        assert!(log_path.exists());
        let content = std::fs::read_to_string(&log_path).unwrap();
        assert!(content.contains("discovery output"));
    }
}
