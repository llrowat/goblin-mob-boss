use crate::analytics;
use crate::git;
use crate::guidance;
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
) -> Result<Repository, String> {
    if !Path::new(&path).exists() {
        return Err("Path does not exist".to_string());
    }
    if !git::is_git_repo(&path) {
        return Err("Path is not a git repository".to_string());
    }
    let repo = Repository::new(name, path, base_branch, description.unwrap_or_default(), validators, pr_command);
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
) -> Result<Repository, String> {
    let mut repos = state.repositories.lock().unwrap();
    let repo = repos.get_mut(&id).ok_or("Repository not found")?;
    repo.name = name;
    repo.base_branch = base_branch;
    repo.description = description.unwrap_or_default();
    repo.validators = validators;
    repo.pr_command = pr_command;
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
    Ok(serde_json::json!({ "name": name, "base_branch": base_branch, "has_claude_md": has_claude_md }))
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

    let prompt = r#"Analyze this codebase and generate a lean CLAUDE.md file in the project root. Keep it focused — only include what an AI coding agent actually needs to work here. No filler, no generic advice.

Include ONLY these sections if they apply:

1. **What this is** — one-liner: tech stack and purpose
2. **Commands** — exact install, build, test, lint commands (from package.json, Cargo.toml, Makefile, etc.)
3. **Testing** — how to run tests, framework used, where test files go
4. **Conventions** — only non-obvious patterns: naming, file layout, architectural rules that would trip up an agent

Skip any section where there's nothing project-specific to say. Aim for under 80 lines total. Write the file to `CLAUDE.md` at the repository root."#;

    let log_path = repo_path.join(".gmb");
    let _ = std::fs::create_dir_all(&log_path);
    let log_file = std::fs::File::create(log_path.join("claude-md-generation.log"))
        .map_err(|e| format!("Failed to create log file: {}", e))?;
    let stderr_file = log_file
        .try_clone()
        .map_err(|e| format!("Failed to clone log file handle: {}", e))?;

    let mut cmd = std::process::Command::new("claude");
    cmd.arg("--print")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg("--allowedTools")
        .arg("Read,Glob,Grep,Write")
        .stdin(std::process::Stdio::piped())
        .stdout(log_file)
        .stderr(stderr_file)
        .current_dir(&path);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Claude: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = stdin.write_all(prompt.as_bytes());
        });
    }

    Ok(())
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
    drop(repos_lock);

    // Create feature branch in all repos, with rollback on failure
    let feature_slug = slug::slugify(&name);
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

    let mut feature = Feature::new(repo_ids, name, description, branch_name);

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

    // Generate repo context from all repos
    let repo_map = generate_multi_repo_context(&resolved_repos);

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
    let agent_list: String = enabled_agents.iter().map(|a| format_agent(a)).collect::<Vec<_>>().join("\n");
    let quality_agent_list: String = enabled_agents
        .iter()
        .filter(|a| a.role == "quality")
        .map(|a| format_agent(a))
        .collect::<Vec<_>>()
        .join("\n");

    let system_prompt = prompts::ideation_system_prompt(&repo_map, &agent_list);
    std::fs::write(ideation_dir.join("system-prompt.md"), &system_prompt)
        .map_err(|e| format!("Failed to write system prompt: {}", e))?;

    let user_prompt = prompts::ideation_user_prompt(
        &feature.description,
        &tasks_dir.to_string_lossy(),
        &agent_list,
        &quality_agent_list,
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
    for repo_id in &feature.effective_repo_ids() {
        if let Ok(repo) = get_repo(&state, repo_id) {
            // Remove worktrees first (they hold a reference to the branch)
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
pub fn get_ideation_user_prompt(state: State<AppState>, feature_id: String) -> Result<String, String> {
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
                    });
                }
                Err(e) => {
                    log::warn!("Malformed questions.json for feature {}: {}", feature_id, e);
                }
            },
            Err(e) => {
                log::warn!("Failed to read questions.json for feature {}: {}", feature_id, e);
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

    Ok(IdeationResult {
        tasks: specs,
        execution_mode: None,
        questions: None,
        answered_questions,
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
) -> Result<Feature, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;
    feature.execution_mode = Some(execution_mode);
    feature.execution_rationale = Some(execution_rationale);
    feature.selected_agents = selected_agents;
    feature.task_specs = task_specs;
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

    let (args, env, _prompt) =
        launch::build_launch_with_repo(&feature, &system_prompt_content, Some(&repo.path));

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

    // Teams mode requires tmux — fail early with a clear message
    if feature.execution_mode.as_ref() == Some(&ExecutionMode::Teams)
        && !launch::is_tmux_available()
    {
        return Err(
            "tmux is not installed. Agent Teams mode requires tmux for --teammate-mode tmux. \
             Install it with: brew install tmux (macOS), sudo apt install tmux (Ubuntu/Debian), \
             or sudo pacman -S tmux (Arch)."
                .to_string(),
        );
    }

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

    let (args, env, _prompt) =
        launch::build_launch_with_repo(&feature, &system_prompt_content, Some(&repo.path));

    // Clear any previous progress file so the UI starts fresh
    let progress_path = feature_dir.join("tasks").join("progress.json");
    let _ = std::fs::remove_file(&progress_path);

    let session_id = format!("launch-{}", feature_id);

    // args[0] is "claude", rest are arguments
    let cmd = &args[0];
    let cmd_args: Vec<String> = args[1..].to_vec();

    pty::spawn_pty_session(
        &app_handle,
        &session_id,
        cmd,
        &cmd_args,
        work_dir,
        cols,
        rows,
        &pty_sessions,
        &env,
    )?;

    // Build the full command string for display
    let env_prefix: String = env
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(" ");
    let full_command = if env_prefix.is_empty() {
        format!("cd {} && {}", work_dir, args.join(" "))
    } else {
        format!("cd {} && {} {}", work_dir, env_prefix, args.join(" "))
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
    feature.updated_at = Utc::now();
    let updated = feature.clone();
    drop(features);
    state.save_features();
    Ok(updated)
}

/// Mark a feature as ready (execution complete, ready for validation/PR).
#[tauri::command]
pub fn mark_feature_ready(state: State<AppState>, feature_id: String) -> Result<Feature, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;
    feature.status = FeatureStatus::Ready;
    feature.updated_at = Utc::now();
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
    feature.updated_at = Utc::now();

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
    feature.updated_at = Utc::now();
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

        let result = validators::run_validators(&validator_path, &repo.validators, 1)?;
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

        for (path, insertions, deletions) in file_diffs {
            all_files.push(FileDiff {
                path: format!("{}{}", prefix, path),
                insertions,
                deletions,
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

    // Commit any uncommitted changes
    match git::commit_all(work_dir, &format!("chore: finalize {}", feature.name)) {
        Ok(true) => outputs.push(format!("{}: committed changes", repo.name)),
        Ok(false) => {} // nothing to commit
        Err(e) => outputs.push(format!("{}: commit skipped ({})", repo.name, e)),
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
        f.updated_at = Utc::now();

        // If all repos are pushed, promote feature status to Pushed
        let all_repo_ids = f.effective_repo_ids();
        let all_pushed = all_repo_ids.iter().all(|rid| {
            f.repo_push_status.get(rid) == Some(&RepoPushStatus::Pushed)
        });
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
pub fn push_feature(state: State<AppState>, feature_id: String) -> Result<String, String> {
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
        match git::commit_all(work_dir, &format!("chore: finalize {}", feature.name)) {
            Ok(true) => outputs.push(format!("{}: committed changes", repo.name)),
            Ok(false) => {} // nothing to commit
            Err(e) => outputs.push(format!("{}: commit skipped ({})", repo.name, e)),
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
        let all_pushed = all_repo_ids.iter().all(|rid| {
            f.repo_push_status.get(rid) == Some(&RepoPushStatus::Pushed)
        });
        if all_pushed {
            f.status = FeatureStatus::Pushed;
        }
    }
    drop(features);
    state.save_features();

    // If any repo failed to push, return error
    let any_failed = repos
        .iter()
        .any(|r| feature.effective_repo_ids().contains(&r.id) && outputs.iter().any(|o| o.contains(&format!("Failed to push in {}", r.name))));
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

// ── Ideation Background Commands ──

/// Ensure prompt files exist for a feature, regenerating if needed.
fn ensure_ideation_prompts(
    state: &State<AppState>,
    feature: &Feature,
) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let repo = get_primary_repo(state, feature)?;
    let all_repos = get_all_repos(state, feature)?;

    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let tasks_dir = feature_dir.join("tasks");
    let system_prompt_path = feature_dir.join("system-prompt.md");
    let user_prompt_path = feature_dir.join("user-prompt.md");

    if !system_prompt_path.exists() || !user_prompt_path.exists() {
        std::fs::create_dir_all(&tasks_dir)
            .map_err(|e| format!("Failed to create feature dir: {}", e))?;

        let repo_map = generate_multi_repo_context(&all_repos);
        let (agent_list, quality_agent_list) = build_agent_lists(&all_repos);

        if !system_prompt_path.exists() {
            let system_prompt = prompts::ideation_system_prompt(&repo_map, &agent_list);
            std::fs::write(&system_prompt_path, &system_prompt)
                .map_err(|e| format!("Failed to write system prompt: {}", e))?;
        }
        if !user_prompt_path.exists() {
            let user_prompt = prompts::ideation_user_prompt(
                &feature.description,
                &tasks_dir.to_string_lossy(),
                &agent_list,
                &quality_agent_list,
            );
            std::fs::write(&user_prompt_path, &user_prompt)
                .map_err(|e| format!("Failed to write user prompt: {}", e))?;
        }
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
            "- **{}** ({}){}", a.name,
            a.filename.strip_suffix(".md").unwrap_or(&a.filename), desc
        )
    };

    // Exclude disabled agents from ideation
    let enabled_agents: Vec<&AgentFile> = all_agents.iter().filter(|a| a.enabled).collect();

    let agent_list = enabled_agents.iter().map(|a| format_agent(a)).collect::<Vec<_>>().join("\n");

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
fn spawn_ideation_process(
    feature_dir: &std::path::Path,
    work_dir: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<(), String> {
    use std::io::Write as IoWrite;

    // Log file for debugging — captures Claude's stdout/stderr
    let log_file_path = feature_dir.join("claude-ideation.log");
    let log_file = std::fs::File::create(&log_file_path)
        .map_err(|e| format!("Failed to create log file: {}", e))?;
    let stderr_file = log_file.try_clone()
        .map_err(|e| format!("Failed to clone log file handle: {}", e))?;

    // Combine system context + user prompt into a single stdin payload
    // to avoid passing large strings as CLI arguments
    let full_prompt = format!(
        "{}\n\n---\n\n{}",
        system_prompt, user_prompt
    );

    let mut cmd = std::process::Command::new("claude");
    cmd.arg("--print")
        .arg("--permission-mode").arg("bypassPermissions")
        .arg("--allowedTools").arg("Read,Glob,Grep,Write")
        .stdin(std::process::Stdio::piped())
        .stdout(log_file)
        .stderr(stderr_file)
        .current_dir(work_dir);

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start Claude: {}", e))?;

    // Write prompt to stdin, then close it so Claude begins processing
    if let Some(mut stdin) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = stdin.write_all(full_prompt.as_bytes());
            // stdin is dropped here, closing the pipe
        });
    }

    Ok(())
}

/// Start the ideation process (non-interactive, background).
/// Claude runs with --print, writes plan.json, then exits.
/// Frontend polls plan.json to detect completion.
#[tauri::command]
pub fn run_ideation(
    state: State<AppState>,
    feature_id: String,
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

    // Delete old plan.json so polling starts fresh
    let plan_path = feature_dir.join("tasks").join("plan.json");
    if plan_path.exists() {
        let _ = std::fs::remove_file(&plan_path);
    }

    spawn_ideation_process(&feature_dir, work_dir, &system_prompt_content, &user_prompt_content)
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
    let plan_path = feature_dir.join("tasks").join("plan.json");
    let old_plan = std::fs::read_to_string(&plan_path).unwrap_or_default();

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

    spawn_ideation_process(&feature_dir, work_dir, &system_prompt_content, &revised_prompt)
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

    let user_prompt = prompts::ideation_user_prompt_with_answers(
        &feature.description,
        &tasks_dir.to_string_lossy(),
        &agent_list,
        &quality_agent_list,
        &all_answers,
    );

    let work_dir = feature
        .worktree_paths
        .get(&repo.id)
        .map(|s| s.as_str())
        .unwrap_or(&repo.path);

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

// ── Preferences Commands ──

#[tauri::command]
pub fn get_preferences(state: State<AppState>) -> Preferences {
    state.preferences.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_preferences(state: State<AppState>, shell: String) -> Preferences {
    let mut prefs = state.preferences.lock().unwrap();
    prefs.shell = shell;
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

    let progress_path = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("tasks")
        .join("progress.json");

    Ok(read_task_progress(&progress_path))
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
        let file_diffs = git::diff_stat(&repo.path, &repo.base_branch, &feature.branch)
            .map_err(|e| e.to_string())?;
        let prefix = if repos.len() > 1 {
            format!("[{}] ", repo.name)
        } else {
            String::new()
        };
        for (path, _, _) in file_diffs {
            changed_files.push(format!("{}{}", prefix, path));
        }
    }

    Ok(analytics::analyze_execution(&feature, &changed_files))
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
    let discovery_dir = Path::new(&state.gmb_path)
        .join("discoveries")
        .join(&map_id);
    std::fs::create_dir_all(&discovery_dir)
        .map_err(|e| format!("Failed to create discovery dir: {}", e))?;

    // Generate per-repo commands
    let mut commands = Vec::new();

    for repo in &repos {
        let repo_context = generate_context_pack_string(&repo.path);
        let output_file = discovery_dir.join(format!("{}.json", repo.id));

        let system_prompt =
            prompts::map_discovery_system_prompt(&repo.name, &repo_context);
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
            "cd {} && claude --print --append-system-prompt \"$(cat {})\" \"$(cat {})\"",
            escaped_path, escaped_sys, escaped_usr
        ));
    }

    // For multiple repos, run in parallel with subshells
    let full_command = if commands.len() == 1 {
        format!("echo 'Exploring {} for map: {}...' && {}", repos[0].name, map_name, commands[0])
    } else {
        let parallel: Vec<String> = repos
            .iter()
            .zip(commands.iter())
            .map(|(repo, cmd)| {
                format!("(echo 'Exploring {}...' && {}) &", repo.name, cmd)
            })
            .collect();
        format!(
            "echo 'Sending {} scouts for map: {}...' && {} wait && echo 'All scouts returned.'",
            repos.len(),
            map_name,
            parallel.join(" "),
        )
    };

    Ok(full_command)
}

/// Start map discovery in an embedded PTY terminal.
/// Spawns the discovery command (one or more Claude agents) inside a PTY so
/// the user sees output in an embedded terminal within the app.
#[tauri::command]
pub fn start_discovery_pty(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    pty_sessions: State<pty::PtySessions>,
    map_id: String,
    repo_ids: Vec<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    // Build the discovery shell command (reuse start_map_discovery logic)
    let full_command = start_map_discovery(state.clone(), map_id.clone(), repo_ids)?;

    let session_id = format!("discovery-{}", map_id);

    let prefs = state.preferences.lock().unwrap().clone();
    let shell = if prefs.shell.is_empty() {
        "/bin/bash".to_string()
    } else {
        prefs.shell.clone()
    };

    let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());

    pty::spawn_pty_session(
        &app_handle,
        &session_id,
        &shell,
        &["-c".to_string(), full_command],
        &home_dir,
        cols,
        rows,
        &pty_sessions,
        &[],
    )?;

    Ok(session_id)
}

/// Poll for discovery results. Checks if per-repo discovery JSON files exist,
/// parses them, and assembles the results into the system map.
#[tauri::command]
pub fn poll_map_discovery(
    state: State<AppState>,
    map_id: String,
    repo_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let discovery_dir = Path::new(&state.gmb_path)
        .join("discoveries")
        .join(&map_id);

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

    // If all repos are scanned, assemble into the system map
    if complete && found > 0 {
        let mut maps = state.system_maps.lock().unwrap();
        if let Some(map) = maps.get_mut(&map_id) {
            // Merge — append discovered services/connections (don't overwrite manual ones)
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

// ── Helpers ──

/// Shell-quote a string for safe inclusion in shell commands.
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
    if repos.len() == 1 {
        return generate_context_pack_string(&repos[0].path);
    }

    let mut context =
        String::from("# Repositories\n\nThis feature spans multiple repositories:\n\n");
    for repo in repos {
        context.push_str(&format!("## {} (`{}`)\n\n", repo.name, repo.path));
        context.push_str(&generate_context_pack_string(&repo.path));
        context.push_str("\n\n");
    }
    context
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
    fn read_task_progress_returns_none_for_missing_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("progress.json");
        assert!(read_task_progress(&path).is_none());
    }

    #[test]
    fn read_task_progress_parses_valid_json() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("progress.json");
        std::fs::write(&path, r#"{
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
        }"#).unwrap();
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
}
