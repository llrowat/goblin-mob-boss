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
    validators: Vec<String>,
    pr_command: Option<String>,
) -> Result<Repository, String> {
    if !Path::new(&path).exists() {
        return Err("Path does not exist".to_string());
    }
    if !git::is_git_repo(&path) {
        return Err("Path is not a git repository".to_string());
    }
    let repo = Repository::new(name, path, base_branch, validators, pr_command);
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
    validators: Vec<String>,
    pr_command: Option<String>,
) -> Result<Repository, String> {
    let mut repos = state.repositories.lock().unwrap();
    let repo = repos.get_mut(&id).ok_or("Repository not found")?;
    repo.name = name;
    repo.base_branch = base_branch;
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
    Ok(serde_json::json!({ "name": name, "base_branch": base_branch }))
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

// ── Feature Commands ──

#[tauri::command]
pub fn start_feature(
    state: State<AppState>,
    repo_id: String,
    name: String,
    description: String,
) -> Result<Feature, String> {
    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    // Create feature branch
    let feature_slug = slug::slugify(&name);
    let short_id = &uuid::Uuid::new_v4().to_string()[..4];
    let branch_name = format!("feature/{}-{}", feature_slug, short_id);

    git::create_branch(&repo.path, &branch_name, &repo.base_branch)
        .map_err(|e| format!("Failed to create branch: {}", e))?;

    let feature = Feature::new(repo_id, name, description, branch_name);

    // Create ideation directory
    let ideation_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let tasks_dir = ideation_dir.join("tasks");
    std::fs::create_dir_all(&tasks_dir)
        .map_err(|e| format!("Failed to create feature dir: {}", e))?;

    // Generate repo context
    let repo_map = generate_context_pack_string(&repo.path);

    // Build agents list from .claude/agents/ files
    let agents = store::list_repo_agents(&repo.path).unwrap_or_default();
    let global_agents = store::list_global_agents().unwrap_or_default();
    let agent_list: String = agents
        .iter()
        .chain(global_agents.iter())
        .map(|a| {
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
        })
        .collect::<Vec<_>>()
        .join("\n");

    let system_prompt = prompts::ideation_system_prompt(
        &repo_map,
        &agent_list,
    );
    std::fs::write(ideation_dir.join("system-prompt.md"), &system_prompt)
        .map_err(|e| format!("Failed to write system prompt: {}", e))?;

    let user_prompt = prompts::ideation_user_prompt(
        &feature.description,
        &tasks_dir.to_string_lossy(),
        &agent_list,
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
            .filter(|f| f.repo_id == rid)
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
        features.get(&feature_id).cloned().ok_or("Feature not found")?
    };

    // Kill any active PTY session
    if let Some(session_id) = &feature.pty_session_id {
        let _ = pty::kill_pty_session(&pty_sessions, session_id);
    }

    // Remove .gmb/features/<id> directory
    let repo = get_repo(&state, &feature.repo_id);
    if let Ok(repo) = repo {
        let feature_dir = Path::new(&repo.path)
            .join(".gmb")
            .join("features")
            .join(&feature.id);
        if feature_dir.exists() {
            let _ = std::fs::remove_dir_all(&feature_dir);
        }

        // Try to delete the feature branch (best-effort, may fail if checked out)
        let _ = git::delete_branch(&repo.path, &feature.branch);
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
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;

    let path = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("system-prompt.md");
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read prompt: {}", e))
}

#[tauri::command]
pub fn get_ideation_terminal_command(
    state: State<AppState>,
    feature_id: String,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;

    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let system_prompt_path = feature_dir.join("system-prompt.md");
    let user_prompt_path = feature_dir.join("user-prompt.md");

    Ok(format!(
        "cd {} && claude --permission-mode plan --append-system-prompt \"$(cat '{}')\" \"$(cat '{}')\"",
        repo.path,
        system_prompt_path.display(),
        user_prompt_path.display()
    ))
}

/// Poll for the ideation plan.json file. Returns discovered tasks + execution mode recommendation.
#[tauri::command]
pub fn poll_ideation_result(
    state: State<AppState>,
    feature_id: String,
) -> Result<IdeationResult, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;

    let tasks_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("tasks");

    // Try plan.json first (new format with execution_mode)
    let plan_path = tasks_dir.join("plan.json");
    if plan_path.exists() {
        if let Ok(data) = std::fs::read_to_string(&plan_path) {
            if let Ok(result) = serde_json::from_str::<IdeationResult>(&data) {
                return Ok(result);
            }
        }
    }

    // Fallback: read individual NN.json files (old format)
    if !tasks_dir.exists() {
        return Ok(IdeationResult {
            tasks: vec![],
            execution_mode: None,
        });
    }

    let mut specs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&tasks_dir) {
        let mut files: Vec<_> = entries
            .flatten()
            .filter(|e| {
                let fname = e.file_name().to_string_lossy().to_string();
                fname.ends_with(".json") && fname != "plan.json"
            })
            .collect();
        files.sort_by_key(|e| e.file_name());
        for entry in files {
            if let Ok(data) = std::fs::read_to_string(entry.path()) {
                if let Ok(spec) = serde_json::from_str::<TaskSpec>(&data) {
                    specs.push(spec);
                }
            }
        }
    }

    Ok(IdeationResult {
        tasks: specs,
        execution_mode: None,
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
    feature.status = FeatureStatus::Configuring;
    feature.updated_at = Utc::now();
    let updated = feature.clone();
    drop(features);
    state.save_features();
    Ok(updated)
}

/// Get the terminal command to launch execution for a feature.
#[tauri::command]
pub fn get_launch_command(
    state: State<AppState>,
    feature_id: String,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;

    // Read the system prompt (repo context + agents) written during ideation
    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let system_prompt_path = feature_dir.join("system-prompt.md");
    let system_prompt_content = std::fs::read_to_string(&system_prompt_path)
        .unwrap_or_default();

    let (args, env, _prompt) = launch::build_launch(&feature, &system_prompt_content);

    // Build the full command string
    let env_prefix: String = env
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(" ");

    let cmd = if env_prefix.is_empty() {
        format!("cd {} && {}", repo.path, args.join(" "))
    } else {
        format!("cd {} && {} {}", repo.path, env_prefix, args.join(" "))
    };

    Ok(cmd)
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
pub fn mark_feature_ready(
    state: State<AppState>,
    feature_id: String,
) -> Result<Feature, String> {
    let mut features = state.features.lock().unwrap();
    let feature = features.get_mut(&feature_id).ok_or("Feature not found")?;
    feature.status = FeatureStatus::Ready;
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
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;

    if repo.validators.is_empty() {
        return Ok(VerifyResult {
            attempt: 1,
            all_passed: true,
            results: vec![],
            timestamp: Utc::now(),
        });
    }

    // Run validators on the feature branch
    git::checkout_branch(&repo.path, &feature.branch).map_err(|e| e.to_string())?;

    validators::run_validators(&repo.path, &repo.validators, 1)
}

// ── Diff Commands ──

#[tauri::command]
pub fn get_feature_diff(
    state: State<AppState>,
    feature_id: String,
) -> Result<DiffSummary, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;

    let file_diffs = git::diff_stat(&repo.path, &repo.base_branch, &feature.branch)
        .map_err(|e| e.to_string())?;

    let total_files = file_diffs.len() as u32;
    let total_insertions: u32 = file_diffs.iter().map(|(_, ins, _)| ins).sum();
    let total_deletions: u32 = file_diffs.iter().map(|(_, _, del)| del).sum();

    let files = file_diffs
        .into_iter()
        .map(|(path, insertions, deletions)| FileDiff {
            path,
            insertions,
            deletions,
        })
        .collect();

    Ok(DiffSummary {
        files,
        total_files,
        total_insertions,
        total_deletions,
    })
}

// ── Feature PR Commands ──

#[tauri::command]
pub fn push_feature(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;

    git::push_branch(&repo.path, &feature.branch)
        .map(|output| format!("{}: pushed {}\n{}", repo.name, feature.branch, output))
        .map_err(|e| format!("Failed to push: {}", e))
}

#[tauri::command]
pub fn get_pr_command(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;

    let cmd = if let Some(pr_cmd) = &repo.pr_command {
        pr_cmd.replace("{branch}", &feature.branch)
    } else {
        format!(
            "cd {} && gh pr create --head {} --title '{}' --body '{}'",
            repo.path, feature.branch, feature.name, feature.description
        )
    };

    Ok(cmd)
}

// ── PTY Commands ──

#[tauri::command]
pub fn start_ideation_pty(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    pty_sessions: State<pty::PtySessions>,
    feature_id: String,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;

    let feature_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let tasks_dir = feature_dir.join("tasks");
    let system_prompt_path = feature_dir.join("system-prompt.md");
    let user_prompt_path = feature_dir.join("user-prompt.md");

    // Regenerate prompt files if missing (e.g. feature created before prompt writing was added)
    if !system_prompt_path.exists() || !user_prompt_path.exists() {
        std::fs::create_dir_all(&tasks_dir)
            .map_err(|e| format!("Failed to create feature dir: {}", e))?;

        let repo_map = generate_context_pack_string(&repo.path);
        let agents = store::list_repo_agents(&repo.path).unwrap_or_default();
        let global_agents = store::list_global_agents().unwrap_or_default();
        let agent_list: String = agents
            .iter()
            .chain(global_agents.iter())
            .map(|a| {
                let desc = if a.description.is_empty() {
                    String::new()
                } else {
                    format!(": {}", a.description)
                };
                format!(
                    "- **{}** ({}){}", a.name,
                    a.filename.strip_suffix(".md").unwrap_or(&a.filename), desc
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

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
            );
            std::fs::write(&user_prompt_path, &user_prompt)
                .map_err(|e| format!("Failed to write user prompt: {}", e))?;
        }
    }

    let session_id = uuid::Uuid::new_v4().to_string();

    let system_prompt_content = std::fs::read_to_string(&system_prompt_path)
        .map_err(|e| format!("Failed to read system prompt: {}", e))?;
    let user_prompt_content = std::fs::read_to_string(&user_prompt_path)
        .map_err(|e| format!("Failed to read user prompt: {}", e))?;

    let mut claude_args = vec![
        "--permission-mode".to_string(),
        "plan".to_string(),
        "--append-system-prompt".to_string(),
        system_prompt_content,
        user_prompt_content,
    ];

    let (cmd, args) = if cfg!(target_os = "windows") {
        let mut full_args = vec!["/c".to_string(), "claude".to_string()];
        full_args.append(&mut claude_args);
        ("cmd.exe".to_string(), full_args)
    } else {
        ("claude".to_string(), claude_args)
    };

    pty::spawn_pty_session(
        &app_handle,
        &session_id,
        &cmd,
        &args,
        &repo.path,
        80,
        24,
        &pty_sessions,
    )?;

    // Store session_id on the feature
    let mut features = state.features.lock().unwrap();
    if let Some(f) = features.get_mut(&feature_id) {
        f.pty_session_id = Some(session_id.clone());
    }
    drop(features);
    state.save_features();

    Ok(session_id)
}

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
pub fn kill_pty(
    pty_sessions: State<pty::PtySessions>,
    session_id: String,
) -> Result<(), String> {
    pty::kill_pty_session(&pty_sessions, &session_id)
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

// ── Template Commands ──

#[tauri::command]
pub fn list_agent_templates() -> Vec<templates::AgentTemplate> {
    templates::list_agent_templates()
}

#[tauri::command]
pub fn list_feature_recipes() -> Vec<templates::FeatureRecipe> {
    templates::list_feature_recipes()
}

#[tauri::command]
pub fn apply_agent_template(
    repo_path: String,
    template_id: String,
) -> Result<AgentFile, String> {
    let templates = templates::list_agent_templates();
    let template = templates
        .iter()
        .find(|t| t.id == template_id)
        .ok_or("Template not found")?;
    let agent = template.agent.clone();
    store::save_repo_agent(&repo_path, &agent)?;
    Ok(agent)
}

// ── Execution Observability Commands ──

#[tauri::command]
pub fn poll_execution_status(
    state: State<AppState>,
    feature_id: String,
) -> Result<observer::ExecutionSnapshot, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;
    observer::poll_execution_snapshot(&repo.path, &repo.base_branch, &feature.branch)
}

// ── Analytics Commands ──

#[tauri::command]
pub fn analyze_feature_execution(
    state: State<AppState>,
    feature_id: String,
) -> Result<analytics::ExecutionAnalysis, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;
    let file_diffs = git::diff_stat(&repo.path, &repo.base_branch, &feature.branch)
        .map_err(|e| e.to_string())?;
    let changed_files: Vec<String> = file_diffs.into_iter().map(|(path, _, _)| path).collect();

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
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;
    guidance::add_guidance_note(&repo.path, &feature.id, &content, priority)
}

#[tauri::command]
pub fn list_guidance_notes(
    state: State<AppState>,
    feature_id: String,
) -> Result<Vec<guidance::GuidanceNote>, String> {
    let features = state.features.lock().unwrap();
    let feature = features.get(&feature_id).ok_or("Feature not found")?.clone();
    drop(features);

    let repo = get_repo(&state, &feature.repo_id)?;
    guidance::list_guidance_notes(&repo.path, &feature.id)
}

// ── Heuristics Commands ──

#[tauri::command]
pub fn analyze_task_graph(
    task_specs: Vec<TaskSpec>,
) -> heuristics::ModeRecommendation {
    heuristics::analyze_tasks(&task_specs)
}

// ── Helpers ──

fn get_repo(state: &State<AppState>, repo_id: &str) -> Result<Repository, String> {
    let repos = state.repositories.lock().unwrap();
    repos
        .get(repo_id)
        .cloned()
        .ok_or("Repository not found".to_string())
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
}
