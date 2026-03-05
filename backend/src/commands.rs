use crate::claude_md::generate_task_claude_md;
use crate::context::generate_context_pack;
use crate::git;
use crate::models::*;
use crate::prompts;
use crate::store::AppState;
use crate::validators::run_validators;
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
    repo_id: String,
    name: String,
    description: String,
) -> Result<Feature, String> {
    let repos = state.repositories.lock().unwrap();
    let repo = repos.get(&repo_id).ok_or("Repository not found")?.clone();
    drop(repos);

    // Create feature branch
    let feature_slug = slug::slugify(&name);
    let short_id = &uuid::Uuid::new_v4().to_string()[..4];
    let branch = format!("feature/{}-{}", feature_slug, short_id);

    git::create_branch(&repo.path, &branch, &repo.base_branch).map_err(|e| e.to_string())?;

    let feature = Feature::new(repo_id, name, description, branch);

    // Create ideation directory
    let ideation_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id);
    let tasks_dir = ideation_dir.join("tasks");
    std::fs::create_dir_all(&tasks_dir)
        .map_err(|e| format!("Failed to create feature dir: {}", e))?;

    // Generate system prompt for ideation
    let repo_map = generate_context_pack_string(&repo.path);
    let agents = state.agents.lock().unwrap();
    let agent_list = agents
        .values()
        .map(|a| format!("- **{}** ({}): {}", a.name, a.role, a.system_prompt))
        .collect::<Vec<_>>()
        .join("\n");
    drop(agents);

    let system_prompt =
        prompts::ideation_system_prompt(&tasks_dir.to_string_lossy(), &repo_map, &agent_list);
    std::fs::write(ideation_dir.join("system-prompt.md"), &system_prompt)
        .map_err(|e| format!("Failed to write system prompt: {}", e))?;

    let mut features = state.features.lock().unwrap();
    features.insert(feature.id.clone(), feature.clone());
    drop(features);
    state.save_features();

    Ok(feature)
}

#[tauri::command]
pub fn list_features(state: State<AppState>, repo_id: String) -> Vec<Feature> {
    state
        .features
        .lock()
        .unwrap()
        .values()
        .filter(|f| f.repo_id == repo_id)
        .cloned()
        .collect()
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

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&feature.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let path = Path::new(&repo.path)
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

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&feature.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let prefs = state.preferences.lock().unwrap().clone();

    let system_prompt_path = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("system-prompt.md");

    let escaped_desc = feature.description.replace('\'', "'\\''");
    let escaped_path = system_prompt_path.to_string_lossy().replace('\'', "'\\''");

    launch_terminal_claude_interactive(&prefs.shell, &repo.path, &escaped_path, &escaped_desc)
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

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&feature.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let system_prompt_path = Path::new(&repo.path)
        .join(".gmb")
        .join("features")
        .join(&feature.id)
        .join("system-prompt.md");

    let escaped_desc = feature.description.replace('\'', "'\\''");

    Ok(format!(
        "cd {} && claude --permission-mode plan --append-system-prompt-file '{}' '{}'",
        repo.path,
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

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&feature.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let tasks_dir = Path::new(&repo.path)
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

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&feature.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    // Resolve agent names to IDs
    let agents = state.agents.lock().unwrap();
    let resolve_agent = |name: &str| -> String {
        if name.is_empty() {
            return "builtin-fullstack".to_string();
        }
        // Try exact ID match first
        if agents.contains_key(name) {
            return name.to_string();
        }
        // Try name match (case-insensitive)
        agents
            .values()
            .find(|a| a.name.to_lowercase() == name.to_lowercase())
            .map(|a| a.id.clone())
            .unwrap_or_else(|| "builtin-fullstack".to_string())
    };

    let now = Utc::now();
    let mut created_tasks = Vec::new();

    for spec in specs {
        let task_slug = slug::slugify(&spec.title);
        let short_id = &uuid::Uuid::new_v4().to_string()[..4];
        let branch = format!("{}/{}-{}", feature.branch, task_slug, short_id);
        let worktree_path = format!("{}/.gmb/worktrees/{}-{}", repo.path, task_slug, short_id);

        let agent_id = resolve_agent(&spec.agent);
        let subagent_ids: Vec<String> = spec.subagents.iter().map(|s| resolve_agent(s)).collect();

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

// ── Verification Commands ──

#[tauri::command]
pub fn run_verification(state: State<AppState>, task_id: String) -> Result<VerifyResult, String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&task.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    if repo.validators.is_empty() {
        return Err("No validators configured".to_string());
    }

    let results_dir = format!("{}/.gmb/results/verify", task.worktree_path);
    let attempt = if Path::new(&results_dir).exists() {
        std::fs::read_dir(&results_dir)
            .map(|entries| entries.count() as u32 + 1)
            .unwrap_or(1)
    } else {
        1
    };

    let result = run_validators(&task.worktree_path, &repo.validators, attempt)?;

    let mut tasks = state.tasks.lock().unwrap();
    if let Some(t) = tasks.get_mut(&task_id) {
        if result.all_passed {
            t.status = TaskStatus::Completed;
        } else {
            t.status = TaskStatus::Failed;
        }
        t.updated_at = Utc::now();
    }
    drop(tasks);
    state.save_tasks();

    Ok(result)
}

/// Start final verification on the feature branch after all tasks are merged.
#[tauri::command]
pub fn start_feature_verification(
    state: State<AppState>,
    feature_id: String,
) -> Result<Feature, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&feature.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    // Create a worktree for verification on the feature branch
    let verify_slug = format!("verify-{}", &feature.id[..4]);
    let worktree_path = format!("{}/.gmb/worktrees/{}", repo.path, verify_slug);

    if !Path::new(&worktree_path).exists() {
        // Checkout feature branch in a worktree (no new branch needed)
        let verify_branch = format!("{}/verify", feature.branch);
        git::create_worktree(&repo.path, &verify_branch, &worktree_path, &feature.branch)
            .map_err(|e| e.to_string())?;
    }

    // Write verification prompt
    let prompt = prompts::verification_prompt(&feature.name, &repo.validators);
    let gmb_dir = Path::new(&worktree_path).join(".gmb").join("prompts");
    std::fs::create_dir_all(&gmb_dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    std::fs::write(gmb_dir.join("verify.md"), &prompt)
        .map_err(|e| format!("Failed to write verify prompt: {}", e))?;

    // Update feature status
    let mut features = state.features.lock().unwrap();
    if let Some(f) = features.get_mut(&feature_id) {
        f.status = FeatureStatus::Verifying;
        f.updated_at = Utc::now();
    }
    let updated = features.get(&feature_id).cloned().unwrap();
    drop(features);
    state.save_features();

    Ok(updated)
}

#[tauri::command]
pub fn get_verification_terminal_command(
    state: State<AppState>,
    feature_id: String,
) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&feature.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let verify_slug = format!("verify-{}", &feature.id[..4]);
    let worktree_path = format!("{}/.gmb/worktrees/{}", repo.path, verify_slug);
    let prompt_path = format!("{}/.gmb/prompts/verify.md", worktree_path);

    Ok(format!(
        "cd {} && claude \"$(cat '{}')\"",
        worktree_path, prompt_path
    ))
}

#[tauri::command]
pub fn launch_verification(state: State<AppState>, feature_id: String) -> Result<(), String> {
    let cmd = get_verification_terminal_command(state.clone(), feature_id)?;
    let prefs = state.preferences.lock().unwrap().clone();
    // Parse the cd target from the command
    let parts: Vec<&str> = cmd.splitn(2, " && ").collect();
    let cwd = parts[0].strip_prefix("cd ").unwrap_or(".");
    let claude_cmd = parts.get(1).unwrap_or(&"");
    launch_terminal_cmd(&prefs.shell, cwd, claude_cmd)
}

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

#[tauri::command]
pub fn push_feature(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&feature.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    git::push_branch(&repo.path, &feature.branch).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_pr_command(state: State<AppState>, feature_id: String) -> Result<String, String> {
    let features = state.features.lock().unwrap();
    let feature = features
        .get(&feature_id)
        .ok_or("Feature not found")?
        .clone();
    drop(features);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&feature.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    if let Some(pr_cmd) = &repo.pr_command {
        Ok(pr_cmd.replace("{branch}", &feature.branch))
    } else {
        Ok(format!(
            "gh pr create --head {} --title '{}' --body '{}'",
            feature.branch, feature.name, feature.description
        ))
    }
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

// ── Helpers ──

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
