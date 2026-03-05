use crate::claude_md::generate_task_claude_md;
use crate::context::generate_context_pack;
use crate::git;
use crate::models::*;
use crate::prompts;
use crate::store::AppState;
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
    max_parallel_agents: Option<u32>,
) -> Result<Repository, String> {
    let mut repos = state.repositories.lock().unwrap();
    let repo = repos.get_mut(&id).ok_or("Repository not found")?;
    repo.name = name;
    repo.base_branch = base_branch;
    repo.validators = validators;
    repo.pr_command = pr_command;
    if let Some(max) = max_parallel_agents {
        repo.max_parallel_agents = max;
    }
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

// ── Agent Commands ──

#[tauri::command]
pub fn list_agents(state: State<AppState>) -> Vec<Agent> {
    state.agents.lock().unwrap().values().cloned().collect()
}

#[tauri::command]
pub fn add_agent(
    state: State<AppState>,
    name: String,
    role: String,
    system_prompt: String,
) -> Agent {
    let agent = Agent::new(name, role, system_prompt);
    let mut agents = state.agents.lock().unwrap();
    agents.insert(agent.id.clone(), agent.clone());
    drop(agents);
    state.save_agents();
    agent
}

#[tauri::command]
pub fn update_agent(
    state: State<AppState>,
    id: String,
    name: String,
    role: String,
    system_prompt: String,
) -> Result<Agent, String> {
    let mut agents = state.agents.lock().unwrap();
    let agent = agents.get_mut(&id).ok_or("Agent not found")?;
    agent.name = name;
    agent.role = role;
    agent.system_prompt = system_prompt;
    let updated = agent.clone();
    drop(agents);
    state.save_agents();
    Ok(updated)
}

#[tauri::command]
pub fn remove_agent(state: State<AppState>, id: String) -> Result<(), String> {
    let mut agents = state.agents.lock().unwrap();
    let agent = agents.get(&id).ok_or("Agent not found")?;
    if agent.is_builtin {
        return Err("Cannot remove built-in agents".to_string());
    }
    agents.remove(&id);
    drop(agents);
    state.save_agents();
    Ok(())
}

// ── Feature Commands ──

#[tauri::command]
pub fn start_feature(
    state: State<AppState>,
    repo_ids: Vec<String>,
    name: String,
    description: String,
) -> Result<Feature, String> {
    if repo_ids.is_empty() {
        return Err("At least one repository is required".to_string());
    }

    let repos = state.repositories.lock().unwrap();

    // Validate all repos exist
    let mut repo_list = Vec::new();
    for rid in &repo_ids {
        let repo = repos.get(rid).ok_or(format!("Repository not found: {}", rid))?.clone();
        repo_list.push(repo);
    }
    drop(repos);

    // Create feature branch in each repo
    let feature_slug = slug::slugify(&name);
    let short_id = &uuid::Uuid::new_v4().to_string()[..4];
    let branch_name = format!("feature/{}-{}", feature_slug, short_id);

    let mut feature_repos = Vec::new();
    for repo in &repo_list {
        git::create_branch(&repo.path, &branch_name, &repo.base_branch)
            .map_err(|e| format!("Failed to create branch in {}: {}", repo.name, e))?;
        feature_repos.push(FeatureRepo {
            repo_id: repo.id.clone(),
            branch: branch_name.clone(),
        });
    }

    let feature = Feature::new(feature_repos, name, description);

    // Create ideation directory in the primary repo
    let primary_repo = &repo_list[0];
    let ideation_dir = Path::new(&primary_repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let tasks_dir = ideation_dir.join("tasks");
    std::fs::create_dir_all(&tasks_dir)
        .map_err(|e| format!("Failed to create feature dir: {}", e))?;

    // Generate system prompt for ideation with all repo contexts
    let repo_map = repo_list
        .iter()
        .map(|r| format!("### {}\n\n{}", r.name, generate_context_pack_string(&r.path)))
        .collect::<Vec<_>>()
        .join("\n\n");

    let prefs = state.preferences.lock().unwrap().clone();
    let agents = state.agents.lock().unwrap();
    let agent_list = agents
        .values()
        .filter(|a| {
            prefs.planning_agent_ids.is_empty()
                || prefs.planning_agent_ids.contains(&a.id)
        })
        .map(|a| format!("- **{}** ({}): {}", a.name, a.role, a.system_prompt))
        .collect::<Vec<_>>()
        .join("\n");
    drop(agents);

    // Build repo names list for the prompt
    let repo_names: Vec<&str> = repo_list.iter().map(|r| r.name.as_str()).collect();

    let system_prompt = prompts::ideation_system_prompt(
        &tasks_dir.to_string_lossy(),
        &repo_map,
        &agent_list,
        &repo_names,
    );
    std::fs::write(ideation_dir.join("system-prompt.md"), &system_prompt)
        .map_err(|e| format!("Failed to write system prompt: {}", e))?;

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
            .filter(|f| f.repo_ids().contains(&rid.as_str()))
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

// ── Ideation Commands ──

#[tauri::command]
pub fn get_ideation_prompt(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let primary_repo = get_primary_repo(&state, &feature)?;

    let path = Path::new(&primary_repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("system-prompt.md");
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read prompt: {}", e))
}

#[tauri::command]
pub fn launch_ideation(state: State<AppState>, feature_id: String) -> Result<(), String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let primary_repo = get_primary_repo(&state, &feature)?;
    let prefs = state.preferences.lock().unwrap().clone();

    let system_prompt_path = Path::new(&primary_repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("system-prompt.md");

    let escaped_desc = feature.description.replace('\'', "'\\''");
    let escaped_path = system_prompt_path.to_string_lossy().replace('\'', "'\\''");

    launch_terminal_claude_interactive(&prefs.shell, &primary_repo.path, &escaped_path, &escaped_desc)
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

    let primary_repo = get_primary_repo(&state, &feature)?;

    let system_prompt_path = Path::new(&primary_repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("system-prompt.md");

    let escaped_desc = feature.description.replace('\'', "'\\''");

    Ok(format!(
        "cd {} && claude --permission-mode plan --append-system-prompt-file '{}' '{}'",
        primary_repo.path,
        system_prompt_path.display(),
        escaped_desc
    ))
}

#[tauri::command]
pub fn poll_ideation_tasks(
    state: State<AppState>,
    feature_id: String,
) -> Result<Vec<TaskSpec>, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let primary_repo = get_primary_repo(&state, &feature)?;

    let tasks_dir = Path::new(&primary_repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("tasks");

    if !tasks_dir.exists() {
        return Ok(vec![]);
    }

    let mut specs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&tasks_dir) {
        let mut files: Vec<_> = entries
            .flatten()
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "json")
                    .unwrap_or(false)
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

    Ok(specs)
}

// ── Task Commands ──

#[tauri::command]
pub fn import_tasks(
    state: State<AppState>,
    feature_id: String,
    specs: Vec<TaskSpec>,
) -> Result<Vec<Task>, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    // Build a map of all repos for this feature
    let repos = state.repositories.lock().unwrap();
    let feature_repo_ids = feature.repo_ids();
    let mut repo_map: Vec<Repository> = Vec::new();
    for rid in &feature_repo_ids {
        let repo = repos.get(*rid).ok_or(format!("Repository not found: {}", rid))?.clone();
        repo_map.push(repo);
    }
    drop(repos);

    // Resolve agent names to IDs
    let agents = state.agents.lock().unwrap();
    let resolve_agent = |name: &str| -> String {
        if name.is_empty() {
            return "builtin-fullstack".to_string();
        }
        if agents.contains_key(name) {
            return name.to_string();
        }
        agents
            .values()
            .find(|a| a.name.to_lowercase() == name.to_lowercase())
            .map(|a| a.id.clone())
            .unwrap_or_else(|| "builtin-fullstack".to_string())
    };

    // Helper to resolve a repo spec string to a repo
    let resolve_repo = |repo_spec: &str| -> &Repository {
        if repo_spec.is_empty() {
            return &repo_map[0]; // default to primary repo
        }
        // Try ID match
        if let Some(r) = repo_map.iter().find(|r| r.id == repo_spec) {
            return r;
        }
        // Try name match (case-insensitive)
        if let Some(r) = repo_map.iter().find(|r| r.name.to_lowercase() == repo_spec.to_lowercase()) {
            return r;
        }
        &repo_map[0] // fallback to primary
    };

    let now = Utc::now();
    let mut created_tasks = Vec::new();

    for spec in specs {
        let repo = resolve_repo(&spec.repo);
        let feature_branch = feature
            .branch_for_repo(&repo.id)
            .unwrap_or(&feature.branch);

        let task_slug = slug::slugify(&spec.title);
        let short_id = &uuid::Uuid::new_v4().to_string()[..4];
        let branch = format!("{}/{}-{}", feature_branch, task_slug, short_id);
        let worktree_path = format!("{}/.gmb/worktrees/{}-{}", repo.path, task_slug, short_id);

        let agent_id = resolve_agent(&spec.agent);
        let subagent_ids: Vec<String> = spec.subagents.iter().map(|s| resolve_agent(s)).collect();
        let verification_agent_ids: Vec<String> = spec.verification_agents.iter().map(|s| resolve_agent(s)).collect();

        let task = Task {
            task_id: uuid::Uuid::new_v4().to_string(),
            feature_id: feature_id.clone(),
            repo_id: repo.id.clone(),
            title: spec.title,
            description: spec.description,
            acceptance_criteria: spec.acceptance_criteria,
            dependencies: spec.dependencies,
            agent_id,
            subagent_ids,
            verification_agent_ids,
            status: TaskStatus::Pending,
            branch,
            worktree_path,
            created_at: now,
            updated_at: now,
        };

        let mut tasks = state.tasks.lock().unwrap();
        tasks.insert(task.task_id.clone(), task.clone());
        drop(tasks);
        created_tasks.push(task);
    }
    drop(agents);

    // Move feature to in_progress
    let mut features = state.features.lock().unwrap();
    if let Some(f) = features.get_mut(&feature_id) {
        f.status = FeatureStatus::InProgress;
        f.updated_at = Utc::now();
    }
    drop(features);
    state.save_features();
    state.save_tasks();

    Ok(created_tasks)
}

#[tauri::command]
pub fn list_tasks(state: State<AppState>, feature_id: String) -> Vec<Task> {
    let tasks = state.tasks.lock().unwrap();
    tasks
        .values()
        .filter(|t| t.feature_id == feature_id)
        .cloned()
        .collect()
}

#[tauri::command]
pub fn get_task(state: State<AppState>, task_id: String) -> Result<Task, String> {
    state
        .tasks
        .lock()
        .unwrap()
        .get(&task_id)
        .cloned()
        .ok_or("Task not found".to_string())
}

#[tauri::command]
pub fn start_task(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let tasks = state.tasks.lock().unwrap();
    let mut task = tasks.get(&task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&task.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let features = state.features.lock().unwrap();
    let feature = features
        .get(&task.feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    // Create worktree branching from the feature branch
    if !Path::new(&task.worktree_path).exists() {
        git::create_worktree(
            &repo.path,
            &task.branch,
            &task.worktree_path,
            &feature.branch,
        )
        .map_err(|e| e.to_string())?;

        let gmb_dir = format!("{}/.gmb", task.worktree_path);
        std::fs::create_dir_all(&gmb_dir)
            .map_err(|e| format!("Failed to create .gmb dir: {}", e))?;
    }

    // Generate context
    let keywords: Vec<&str> = task.title.split_whitespace().collect();
    let _ = generate_context_pack(&task.worktree_path, &repo.path, &keywords);

    // Generate CLAUDE.md
    let _ = generate_task_claude_md(
        &task.worktree_path,
        &task.title,
        &task.description,
        &task.acceptance_criteria,
        &repo.validators,
    );

    // Write agent system prompt
    let agents = state.agents.lock().unwrap();
    let agent = agents.get(&task.agent_id);
    let agent_prompt = agent.map(|a| a.system_prompt.clone()).unwrap_or_default();
    let subagent_prompts: String = task
        .subagent_ids
        .iter()
        .filter_map(|id| agents.get(id))
        .map(|a| format!("- **{}** ({}): {}", a.name, a.role, a.system_prompt))
        .collect::<Vec<_>>()
        .join("\n");

    // Build verification agent context
    let verification_context: String = task
        .verification_agent_ids
        .iter()
        .filter_map(|id| agents.get(id))
        .map(|a| format!("- **{}** ({}): {}", a.name, a.role, a.system_prompt))
        .collect::<Vec<_>>()
        .join("\n");
    drop(agents);

    let system_prompt = prompts::agent_system_prompt(&agent_prompt, &subagent_prompts);

    let prompts_dir = Path::new(&task.worktree_path).join(".gmb").join("prompts");
    std::fs::create_dir_all(&prompts_dir)
        .map_err(|e| format!("Failed to create prompts dir: {}", e))?;
    std::fs::write(prompts_dir.join("system-prompt.md"), &system_prompt)
        .map_err(|e| format!("Failed to write system prompt: {}", e))?;

    // Write task prompt (initial message)
    let task_prompt = prompts::agent_task_prompt(
        &task.title,
        &task.description,
        &task.acceptance_criteria,
        &repo.validators,
        &verification_context,
    );
    std::fs::write(prompts_dir.join("task.md"), &task_prompt)
        .map_err(|e| format!("Failed to write task prompt: {}", e))?;

    task.status = TaskStatus::Running;
    task.updated_at = Utc::now();

    let mut tasks = state.tasks.lock().unwrap();
    tasks.insert(task.task_id.clone(), task.clone());
    drop(tasks);
    state.save_tasks();

    Ok(task)
}

#[tauri::command]
pub fn get_task_terminal_command(
    state: State<AppState>,
    task_id: String,
) -> Result<String, String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?;

    let system_prompt_path = format!("{}/.gmb/prompts/system-prompt.md", task.worktree_path);
    let task_prompt_path = format!("{}/.gmb/prompts/task.md", task.worktree_path);

    Ok(format!(
        "cd {} && claude --append-system-prompt-file '{}' \"$(cat '{}')\"",
        task.worktree_path, system_prompt_path, task_prompt_path
    ))
}

#[tauri::command]
pub fn launch_task(state: State<AppState>, task_id: String) -> Result<(), String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    let prefs = state.preferences.lock().unwrap().clone();

    let system_prompt_path = format!("{}/.gmb/prompts/system-prompt.md", task.worktree_path);
    let task_prompt_path = format!("{}/.gmb/prompts/task.md", task.worktree_path);

    let task_prompt = std::fs::read_to_string(&task_prompt_path)
        .map_err(|e| format!("Failed to read task prompt: {}", e))?;
    let escaped_prompt = task_prompt.replace('\'', "'\\''");
    let escaped_path = system_prompt_path.replace('\'', "'\\''");

    let cmd = format!(
        "claude --append-system-prompt-file '{}' '{}'",
        escaped_path, escaped_prompt
    );
    launch_terminal_cmd(&prefs.shell, &task.worktree_path, &cmd)
}

#[tauri::command]
pub fn complete_task(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let mut tasks = state.tasks.lock().unwrap();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    task.status = TaskStatus::Completed;
    task.updated_at = Utc::now();
    let updated = task.clone();
    drop(tasks);
    state.save_tasks();
    Ok(updated)
}

#[tauri::command]
pub fn merge_task(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    if task.status != TaskStatus::Completed {
        return Err("Task must be completed before merging".to_string());
    }

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&task.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let features = state.features.lock().unwrap();
    let feature = features
        .get(&task.feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    // Merge task branch into feature branch
    git::merge_branch(&repo.path, &feature.branch, &task.branch).map_err(|e| e.to_string())?;

    // Clean up worktree
    if Path::new(&task.worktree_path).exists() {
        let _ = git::remove_worktree(&repo.path, &task.worktree_path);
    }

    let mut tasks = state.tasks.lock().unwrap();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    task.status = TaskStatus::Merged;
    task.updated_at = Utc::now();
    let updated = task.clone();
    drop(tasks);
    state.save_tasks();

    Ok(updated)
}

#[tauri::command]
pub fn update_task_status(
    state: State<AppState>,
    task_id: String,
    status: TaskStatus,
) -> Result<Task, String> {
    let mut tasks = state.tasks.lock().unwrap();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    task.status = status;
    task.updated_at = Utc::now();
    let updated = task.clone();
    drop(tasks);
    state.save_tasks();
    Ok(updated)
}

#[tauri::command]
pub fn delete_task(state: State<AppState>, task_id: String) -> Result<(), String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&task.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    if Path::new(&task.worktree_path).exists() {
        let _ = git::remove_worktree(&repo.path, &task.worktree_path);
    }

    let mut tasks = state.tasks.lock().unwrap();
    tasks.remove(&task_id);
    drop(tasks);
    state.save_tasks();
    Ok(())
}

// ── Status Polling & Auto-Merge ──

/// Poll `.gmb/status.json` in each running task's worktree.
/// Updates task status accordingly and auto-merges completed tasks.
#[tauri::command]
pub fn poll_task_statuses(
    state: State<AppState>,
    feature_id: String,
) -> Result<Vec<Task>, String> {
    let tasks = state.tasks.lock().unwrap();
    let running: Vec<Task> = tasks
        .values()
        .filter(|t| {
            t.feature_id == feature_id
                && (t.status == TaskStatus::Running || t.status == TaskStatus::Verifying)
        })
        .cloned()
        .collect();
    drop(tasks);

    let mut updated_tasks = Vec::new();

    for task in running {
        let status_path = format!("{}/.gmb/status.json", task.worktree_path);
        let dot_status = match std::fs::read_to_string(&status_path) {
            Ok(contents) => match serde_json::from_str::<TaskDotStatus>(&contents) {
                Ok(s) => s,
                Err(_) => continue,
            },
            Err(_) => continue,
        };

        let new_status = match dot_status.phase.as_str() {
            "implementing" => Some(TaskStatus::Running),
            "verifying" => Some(TaskStatus::Verifying),
            "done" => Some(TaskStatus::Completed),
            "failed" => Some(TaskStatus::Failed),
            _ => None,
        };

        if let Some(status) = new_status {
            if status == task.status {
                continue;
            }

            let mut tasks = state.tasks.lock().unwrap();
            if let Some(t) = tasks.get_mut(&task.task_id) {
                t.status = status.clone();
                t.updated_at = Utc::now();
                updated_tasks.push(t.clone());
            }
            drop(tasks);
            state.save_tasks();

            // Auto-merge completed tasks
            if status == TaskStatus::Completed {
                let _ = auto_merge_task(&state, &task.task_id);
            }
        }
    }

    // Check if all tasks are merged → mark feature ready
    let tasks = state.tasks.lock().unwrap();
    let feature_tasks: Vec<&Task> = tasks
        .values()
        .filter(|t| t.feature_id == feature_id)
        .collect();
    let all_merged = !feature_tasks.is_empty()
        && feature_tasks.iter().all(|t| t.status == TaskStatus::Merged);
    drop(tasks);

    if all_merged {
        let mut features = state.features.lock().unwrap();
        if let Some(f) = features.get_mut(&feature_id) {
            if f.status == FeatureStatus::InProgress {
                f.status = FeatureStatus::Ready;
                f.updated_at = Utc::now();
            }
        }
        drop(features);
        state.save_features();
    }

    Ok(updated_tasks)
}

/// Auto-merge a completed task back to the feature branch.
fn auto_merge_task(state: &State<AppState>, task_id: &str) -> Result<(), String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&task.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let features = state.features.lock().unwrap();
    let feature = features
        .get(&task.feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    // Merge task branch into feature branch
    git::merge_branch(&repo.path, &feature.branch, &task.branch).map_err(|e| e.to_string())?;

    // Clean up worktree
    if Path::new(&task.worktree_path).exists() {
        let _ = git::remove_worktree(&repo.path, &task.worktree_path);
    }

    let mut tasks = state.tasks.lock().unwrap();
    if let Some(t) = tasks.get_mut(task_id) {
        t.status = TaskStatus::Merged;
        t.updated_at = Utc::now();
    }
    drop(tasks);
    state.save_tasks();

    Ok(())
}

// ── Diff Commands ──

#[tauri::command]
pub fn get_task_diff(state: State<AppState>, task_id: String) -> Result<DiffSummary, String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&task.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let features = state.features.lock().unwrap();
    let feature = features
        .get(&task.feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let feature_branch = feature
        .branch_for_repo(&task.repo_id)
        .unwrap_or(&feature.branch);

    // Run diff from the worktree if it exists, otherwise from the main repo
    let diff_path = if std::path::Path::new(&task.worktree_path).exists() {
        &task.worktree_path
    } else {
        &repo.path
    };

    let file_diffs = git::diff_stat(diff_path, feature_branch, &task.branch)
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

#[tauri::command]
pub fn push_feature(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let feature_repos = get_feature_repos(&state, &feature)?;
    let mut results = Vec::new();

    for (repo, branch) in &feature_repos {
        git::push_branch(&repo.path, branch)
            .map_err(|e| format!("Failed to push in {}: {}", repo.name, e))?;
        results.push(format!("{}: pushed {}", repo.name, branch));
    }

    Ok(results.join("\n"))
}

#[tauri::command]
pub fn get_pr_command(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let feature_repos = get_feature_repos(&state, &feature)?;
    let mut commands = Vec::new();

    for (repo, branch) in &feature_repos {
        let cmd = if let Some(pr_cmd) = &repo.pr_command {
            pr_cmd.replace("{branch}", branch)
        } else {
            format!(
                "cd {} && gh pr create --head {} --title '{}' --body '{}'",
                repo.path, branch, feature.name, feature.description
            )
        };
        commands.push(format!("# {}\n{}", repo.name, cmd));
    }

    Ok(commands.join("\n\n"))
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
    verification_agent_ids: Vec<String>,
    planning_agent_ids: Vec<String>,
) -> Preferences {
    let mut prefs = state.preferences.lock().unwrap();
    prefs.shell = shell;
    prefs.verification_agent_ids = verification_agent_ids;
    prefs.planning_agent_ids = planning_agent_ids;
    let updated = prefs.clone();
    drop(prefs);
    state.save_preferences();
    updated
}

// ── Helpers ──

/// Get the primary (first) repo for a feature.
fn get_primary_repo(state: &State<AppState>, feature: &Feature) -> Result<Repository, String> {
    let primary_id = feature.repos.first()
        .map(|r| r.repo_id.as_str())
        .unwrap_or(&feature.repo_id);
    let repos = state.repositories.lock().unwrap();
    repos.get(primary_id).cloned().ok_or("Primary repository not found".to_string())
}

/// Get all (repo, branch) pairs for a feature.
fn get_feature_repos(state: &State<AppState>, feature: &Feature) -> Result<Vec<(Repository, String)>, String> {
    let repos = state.repositories.lock().unwrap();
    if feature.repos.is_empty() {
        // Backwards compat: single repo
        let repo = repos.get(&feature.repo_id).ok_or("Repository not found")?.clone();
        Ok(vec![(repo, feature.branch.clone())])
    } else {
        let mut result = Vec::new();
        for fr in &feature.repos {
            let repo = repos.get(&fr.repo_id)
                .ok_or(format!("Repository not found: {}", fr.repo_id))?
                .clone();
            result.push((repo, fr.branch.clone()));
        }
        Ok(result)
    }
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

fn launch_terminal_claude_interactive(
    shell: &str,
    cwd: &str,
    system_prompt_file: &str,
    initial_message: &str,
) -> Result<(), String> {
    let cmd = format!(
        "claude --permission-mode plan --append-system-prompt-file '{}' '{}'",
        system_prompt_file, initial_message
    );
    launch_terminal_cmd(shell, cwd, &cmd)
}

fn launch_terminal_cmd(shell: &str, cwd: &str, cmd: &str) -> Result<(), String> {
    use std::process::Command;

    let result = if cfg!(target_os = "windows") {
        match shell {
            "powershell" => Command::new("cmd")
                .args([
                    "/c",
                    "start",
                    "powershell",
                    "-NoExit",
                    "-Command",
                    &format!("cd '{}'; {}", cwd, cmd),
                ])
                .spawn(),
            "cmd" => Command::new("cmd")
                .args([
                    "/c",
                    "start",
                    "cmd",
                    "/k",
                    &format!("cd /d \"{}\" && {}", cwd, cmd),
                ])
                .spawn(),
            _ => Command::new("cmd")
                .args([
                    "/c",
                    "start",
                    shell,
                    "-NoExit",
                    "-Command",
                    &format!("cd '{}'; {}", cwd, cmd),
                ])
                .spawn(),
        }
    } else if cfg!(target_os = "macos") {
        let script = format!("cd '{}' && {}\n", cwd, cmd);
        let tmp = format!("/tmp/gmb-launch-{}.sh", uuid::Uuid::new_v4());
        std::fs::write(&tmp, &script)
            .map_err(|e| format!("Failed to write launch script: {}", e))?;
        let _ = Command::new("chmod").args(["+x", &tmp]).output();
        Command::new("open").args(["-a", "Terminal", &tmp]).spawn()
    } else {
        let terminal = match shell {
            "bash" | "zsh" | "fish" => "x-terminal-emulator",
            other => other,
        };
        Command::new(terminal)
            .args(["-e", &format!("cd '{}' && {}; exec {}", cwd, cmd, shell)])
            .spawn()
    };

    result
        .map(|_| ())
        .map_err(|e| format!("Failed to launch terminal: {}", e))
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
