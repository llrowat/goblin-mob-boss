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
    let repos = state.repositories.lock().unwrap();
    repos.values().cloned().collect()
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

    Ok(serde_json::json!({
        "name": name,
        "base_branch": base_branch,
    }))
}

// ── Ideation Commands ──

#[tauri::command]
pub fn start_ideation(
    state: State<AppState>,
    repo_id: String,
    description: String,
) -> Result<Ideation, String> {
    let repos = state.repositories.lock().unwrap();
    let repo = repos.get(&repo_id).ok_or("Repository not found")?.clone();
    drop(repos);

    let ideation = Ideation::new(repo_id.clone(), description.clone());

    // Create .gmb/tasks directory in the repo for this ideation
    let tasks_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("ideations")
        .join(&ideation.id)
        .join("tasks");
    std::fs::create_dir_all(&tasks_dir)
        .map_err(|e| format!("Failed to create tasks dir: {}", e))?;

    // Generate repo map for context
    let repo_map = generate_context_pack_string(&repo.path);

    // Generate the ideation prompt
    let prompt = prompts::ideation_prompt(&description, &repo_map);

    // Write prompt to file so the user can see it
    let ideation_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("ideations")
        .join(&ideation.id);
    std::fs::write(ideation_dir.join("prompt.md"), &prompt)
        .map_err(|e| format!("Failed to write prompt: {}", e))?;

    // Store ideation
    let mut ideations = state.ideations.lock().unwrap();
    ideations.insert(ideation.id.clone(), ideation.clone());
    drop(ideations);
    state.save_ideations();

    Ok(ideation)
}

#[tauri::command]
pub fn get_ideation_prompt(state: State<AppState>, ideation_id: String) -> Result<String, String> {
    let ideations = state.ideations.lock().unwrap();
    let ideation = ideations
        .get(&ideation_id)
        .ok_or("Ideation not found")?
        .clone();
    drop(ideations);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&ideation.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let prompt_path = Path::new(&repo.path)
        .join(".gmb")
        .join("ideations")
        .join(&ideation.id)
        .join("prompt.md");

    std::fs::read_to_string(&prompt_path).map_err(|e| format!("Failed to read prompt: {}", e))
}

#[tauri::command]
pub fn launch_ideation(state: State<AppState>, ideation_id: String) -> Result<(), String> {
    let ideations = state.ideations.lock().unwrap();
    let ideation = ideations
        .get(&ideation_id)
        .ok_or("Ideation not found")?
        .clone();
    drop(ideations);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&ideation.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let prefs = state.preferences.lock().unwrap().clone();

    let prompt_path = Path::new(&repo.path)
        .join(".gmb")
        .join("ideations")
        .join(&ideation.id)
        .join("prompt.md");

    let prompt_content = std::fs::read_to_string(&prompt_path)
        .map_err(|e| format!("Failed to read prompt: {}", e))?;

    let escaped = prompt_content.replace('\'', "'\\''");
    launch_terminal(&prefs.shell, &repo.path, &escaped)
}

#[tauri::command]
pub fn get_ideation_terminal_command(
    state: State<AppState>,
    ideation_id: String,
) -> Result<String, String> {
    let ideations = state.ideations.lock().unwrap();
    let ideation = ideations
        .get(&ideation_id)
        .ok_or("Ideation not found")?
        .clone();
    drop(ideations);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&ideation.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let prompt_path = Path::new(&repo.path)
        .join(".gmb")
        .join("ideations")
        .join(&ideation.id)
        .join("prompt.md");

    Ok(format!(
        "cd {} && claude \"$(cat {})\"",
        repo.path,
        prompt_path.display()
    ))
}

#[tauri::command]
pub fn poll_ideation_tasks(
    state: State<AppState>,
    ideation_id: String,
) -> Result<Vec<TaskSpec>, String> {
    let ideations = state.ideations.lock().unwrap();
    let ideation = ideations
        .get(&ideation_id)
        .ok_or("Ideation not found")?
        .clone();
    drop(ideations);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&ideation.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let tasks_dir = Path::new(&repo.path)
        .join(".gmb")
        .join("ideations")
        .join(&ideation.id)
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

#[tauri::command]
pub fn complete_ideation(state: State<AppState>, ideation_id: String) -> Result<Ideation, String> {
    let mut ideations = state.ideations.lock().unwrap();
    let ideation = ideations
        .get_mut(&ideation_id)
        .ok_or("Ideation not found")?;
    ideation.status = IdeationStatus::Completed;
    let updated = ideation.clone();
    drop(ideations);
    state.save_ideations();
    Ok(updated)
}

#[tauri::command]
pub fn list_ideations(state: State<AppState>, repo_id: String) -> Vec<Ideation> {
    state.load_ideations();
    let ideations = state.ideations.lock().unwrap();
    ideations
        .values()
        .filter(|i| i.repo_id == repo_id)
        .cloned()
        .collect()
}

// ── Task Commands ──

#[tauri::command]
pub fn import_tasks(
    state: State<AppState>,
    ideation_id: String,
    specs: Vec<TaskSpec>,
) -> Result<Vec<Task>, String> {
    let ideations = state.ideations.lock().unwrap();
    let ideation = ideations
        .get(&ideation_id)
        .ok_or("Ideation not found")?
        .clone();
    drop(ideations);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&ideation.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    let now = Utc::now();
    let mut created_tasks = Vec::new();

    for spec in specs {
        let task_slug = slug::slugify(&spec.title);
        let short_id = &uuid::Uuid::new_v4().to_string()[..4];
        let branch = format!("gmb/{}-{}", task_slug, short_id);
        let worktree_path = format!("{}/.gmb/worktrees/{}-{}", repo.path, task_slug, short_id);

        let task = Task {
            task_id: uuid::Uuid::new_v4().to_string(),
            ideation_id: ideation_id.clone(),
            repo_id: repo.id.clone(),
            title: spec.title,
            description: spec.description,
            acceptance_criteria: spec.acceptance_criteria,
            dependencies: spec.dependencies,
            status: TaskStatus::Pending,
            branch,
            worktree_path,
            agent_pid: None,
            created_at: now,
            updated_at: now,
        };

        let mut tasks = state.tasks.lock().unwrap();
        tasks.insert(task.task_id.clone(), task.clone());
        drop(tasks);

        created_tasks.push(task);
    }

    state.save_tasks();
    Ok(created_tasks)
}

#[tauri::command]
pub fn list_tasks(state: State<AppState>, repo_id: String) -> Vec<Task> {
    let repos = state.repositories.lock().unwrap();
    if let Some(repo) = repos.get(&repo_id) {
        state.load_tasks_for_repo(repo);
    }
    drop(repos);

    let tasks = state.tasks.lock().unwrap();
    tasks
        .values()
        .filter(|t| t.repo_id == repo_id)
        .cloned()
        .collect()
}

#[tauri::command]
pub fn get_task(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let tasks = state.tasks.lock().unwrap();
    tasks
        .get(&task_id)
        .cloned()
        .ok_or("Task not found".to_string())
}

#[tauri::command]
pub fn start_agent(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let mut tasks = state.tasks.lock().unwrap();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    let mut task = task.clone();
    drop(tasks);

    let repos = state.repositories.lock().unwrap();
    let repo = repos
        .get(&task.repo_id)
        .ok_or("Repository not found")?
        .clone();
    drop(repos);

    // Create worktree if it doesn't exist
    if !Path::new(&task.worktree_path).exists() {
        git::create_worktree(
            &repo.path,
            &task.branch,
            &task.worktree_path,
            &repo.base_branch,
        )
        .map_err(|e| e.to_string())?;

        // Create .gmb directory in worktree
        let gmb_dir = format!("{}/.gmb", task.worktree_path);
        std::fs::create_dir_all(&gmb_dir)
            .map_err(|e| format!("Failed to create .gmb dir: {}", e))?;
    }

    // Generate context
    let keywords: Vec<&str> = task.title.split_whitespace().collect();
    let _ = generate_context_pack(&task.worktree_path, &repo.path, &keywords);

    // Generate CLAUDE.md for automatic pickup
    let _ = generate_task_claude_md(
        &task.worktree_path,
        &task.title,
        &task.description,
        &task.acceptance_criteria,
        &repo.validators,
    );

    // Generate agent prompt
    let prompt = prompts::agent_prompt(
        &task.title,
        &task.description,
        &task.acceptance_criteria,
        &repo.validators,
    );

    // Write prompt to file
    let prompts_dir = Path::new(&task.worktree_path).join(".gmb").join("prompts");
    std::fs::create_dir_all(&prompts_dir)
        .map_err(|e| format!("Failed to create prompts dir: {}", e))?;
    std::fs::write(prompts_dir.join("agent.md"), &prompt)
        .map_err(|e| format!("Failed to write agent prompt: {}", e))?;

    // Update task status
    task.status = TaskStatus::Running;
    task.updated_at = Utc::now();

    let mut tasks = state.tasks.lock().unwrap();
    tasks.insert(task.task_id.clone(), task.clone());
    drop(tasks);
    state.save_tasks();

    Ok(task)
}

#[tauri::command]
pub fn get_agent_terminal_command(
    state: State<AppState>,
    task_id: String,
) -> Result<String, String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?;

    let prompt_path = format!("{}/.gmb/prompts/agent.md", task.worktree_path);

    Ok(format!(
        "cd {} && claude \"$(cat {})\"",
        task.worktree_path, prompt_path
    ))
}

#[tauri::command]
pub fn launch_agent(state: State<AppState>, task_id: String) -> Result<(), String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    let prefs = state.preferences.lock().unwrap().clone();

    let prompt_path = format!("{}/.gmb/prompts/agent.md", task.worktree_path);
    let prompt_content = std::fs::read_to_string(&prompt_path)
        .map_err(|e| format!("Failed to read prompt: {}", e))?;

    let escaped = prompt_content.replace('\'', "'\\''");
    launch_terminal(&prefs.shell, &task.worktree_path, &escaped)
}

#[tauri::command]
pub fn poll_task_status(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let mut tasks = state.tasks.lock().unwrap();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;

    // Only poll running tasks
    if task.status != TaskStatus::Running {
        return Ok(task.clone());
    }

    // Check if worktree exists (agent may not have started yet)
    if !Path::new(&task.worktree_path).exists() {
        return Ok(task.clone());
    }

    // Check for verify results
    let verify_dir = Path::new(&task.worktree_path)
        .join(".gmb")
        .join("results")
        .join("verify");
    if verify_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&verify_dir) {
            let latest = entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .max_by_key(|e| e.file_name());
            if let Some(dir) = latest {
                let summary = dir.path().join("summary.json");
                if let Ok(content) = std::fs::read_to_string(summary) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                        if v.get("all_passed").and_then(|v| v.as_bool()) == Some(true) {
                            task.status = TaskStatus::Completed;
                            task.updated_at = Utc::now();
                        }
                    }
                }
            }
        }
    }

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
        return Err("No validators configured for this repository".to_string());
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

    // Update task status based on result
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

// ── Cleanup Commands ──

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

    // Remove worktree
    if Path::new(&task.worktree_path).exists() {
        let _ = git::remove_worktree(&repo.path, &task.worktree_path);
    }

    // Remove from memory and save
    let mut tasks = state.tasks.lock().unwrap();
    tasks.remove(&task_id);
    drop(tasks);
    state.save_tasks();

    Ok(())
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
    // Generate a simple repo map string for the ideation prompt
    let mut map = String::new();

    // Detect languages
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

fn launch_terminal(shell: &str, cwd: &str, prompt: &str) -> Result<(), String> {
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
                    &format!("cd '{}'; claude '{}'", cwd, prompt),
                ])
                .spawn(),
            "cmd" => Command::new("cmd")
                .args([
                    "/c",
                    "start",
                    "cmd",
                    "/k",
                    &format!("cd /d \"{}\" && claude \"{}\"", cwd, prompt),
                ])
                .spawn(),
            _ => Command::new("cmd")
                .args([
                    "/c",
                    "start",
                    shell,
                    "-NoExit",
                    "-Command",
                    &format!("cd '{}'; claude '{}'", cwd, prompt),
                ])
                .spawn(),
        }
    } else if cfg!(target_os = "macos") {
        let script = format!("cd '{}' && claude '{}'\n", cwd, prompt);
        let tmp = format!("/tmp/gmb-launch-{}.sh", uuid::Uuid::new_v4());
        std::fs::write(&tmp, &script)
            .map_err(|e| format!("Failed to write launch script: {}", e))?;
        let _ = Command::new("chmod").args(["+x", &tmp]).output();
        Command::new("open").args(["-a", "Terminal", &tmp]).spawn()
    } else {
        // Linux
        let terminal = match shell {
            "bash" | "zsh" | "fish" => "x-terminal-emulator",
            other => other,
        };
        Command::new(terminal)
            .args([
                "-e",
                &format!("cd '{}' && claude '{}'; exec {}", cwd, prompt, shell),
            ])
            .spawn()
    };

    result
        .map(|_| ())
        .map_err(|e| format!("Failed to launch terminal: {}", e))
}
