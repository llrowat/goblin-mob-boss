use crate::context::generate_context_pack;
use crate::git;
use crate::models::*;
use crate::prompts::generate_prompts;
use crate::store::AppState;
use crate::validators::run_validators;
use chrono::Utc;
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
    // Validate path exists and is a git repo
    if !std::path::Path::new(&path).exists() {
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
    if !std::path::Path::new(&path).exists() {
        return Err("Path does not exist".to_string());
    }
    if !git::is_git_repo(&path) {
        return Err("Path is not a git repository".to_string());
    }
    let base_branch = git::get_default_branch(&path).unwrap_or_else(|_| "main".to_string());
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    Ok(serde_json::json!({
        "name": name,
        "base_branch": base_branch,
    }))
}

// ── Task Commands ──

#[tauri::command]
pub fn create_task(
    state: State<AppState>,
    repo_id: String,
    title: String,
    description: String,
) -> Result<Task, String> {
    let repos = state.repositories.lock().unwrap();
    let repo = repos.get(&repo_id).ok_or("Repository not found")?.clone();
    drop(repos);

    // Generate branch name
    let task_slug = slug::slugify(&title);
    let short_id = &uuid::Uuid::new_v4().to_string()[..4];
    let branch = format!("gmb/{}-{}", task_slug, short_id);

    // Worktree path
    let worktree_path = format!(
        "{}/.gmb/worktrees/{}-{}",
        repo.path, task_slug, short_id
    );

    // Create worktree
    git::create_worktree(&repo.path, &branch, &worktree_path, &repo.base_branch)
        .map_err(|e| e.to_string())?;

    // Create .gmb directory in worktree
    let gmb_dir = format!("{}/.gmb", worktree_path);
    std::fs::create_dir_all(&gmb_dir)
        .map_err(|e| format!("Failed to create .gmb dir: {}", e))?;

    let now = Utc::now();
    let task = Task {
        schema: "gmb.task.v1".to_string(),
        task_id: uuid::Uuid::new_v4().to_string(),
        repo_id: repo_id.clone(),
        title: title.clone(),
        description: description.clone(),
        phase: TaskPhase::Plan,
        status: TaskStatus::Running,
        base_branch: repo.base_branch.clone(),
        branch: branch.clone(),
        worktree_path: worktree_path.clone(),
        acceptance_criteria: vec![],
        created_at: now,
        updated_at: now,
    };

    // Save task.json
    save_task_file(&task)?;

    // Initialize event log
    let event = TaskEvent {
        event_type: "task_created".to_string(),
        timestamp: now,
        data: serde_json::json!({"title": title, "branch": branch}),
    };
    append_event(&worktree_path, &event)?;

    // Generate context pack
    let keywords: Vec<&str> = title.split_whitespace().collect();
    let _ = generate_context_pack(&worktree_path, &repo.path, &keywords);

    // Generate prompts
    let _ = generate_prompts(&worktree_path, &title, &description, &task.acceptance_criteria);

    // Store in memory
    let mut tasks = state.tasks.lock().unwrap();
    tasks.insert(task.task_id.clone(), task.clone());

    Ok(task)
}

#[tauri::command]
pub fn list_tasks(state: State<AppState>, repo_id: String) -> Vec<Task> {
    // Reload tasks from disk for this repo
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
pub fn advance_phase(state: State<AppState>, task_id: String) -> Result<Task, String> {
    let mut tasks = state.tasks.lock().unwrap();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;

    let old_phase = task.phase.clone();
    task.phase = match task.phase {
        TaskPhase::Plan => TaskPhase::Code,
        TaskPhase::Code => TaskPhase::Verify,
        TaskPhase::Verify => TaskPhase::Ready,
        TaskPhase::Ready => return Err("Task is already in Ready phase".to_string()),
    };
    task.updated_at = Utc::now();

    let updated = task.clone();
    drop(tasks);

    save_task_file(&updated)?;
    append_event(
        &updated.worktree_path,
        &TaskEvent {
            event_type: "phase_changed".to_string(),
            timestamp: Utc::now(),
            data: serde_json::json!({
                "from": old_phase,
                "to": updated.phase,
            }),
        },
    )?;

    // Update in-memory state
    let mut tasks = state.tasks.lock().unwrap();
    tasks.insert(updated.task_id.clone(), updated.clone());

    Ok(updated)
}

#[tauri::command]
pub fn set_task_phase(state: State<AppState>, task_id: String, phase: TaskPhase) -> Result<Task, String> {
    let mut tasks = state.tasks.lock().unwrap();
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;

    let old_phase = task.phase.clone();
    task.phase = phase;
    task.updated_at = Utc::now();

    let updated = task.clone();
    drop(tasks);

    save_task_file(&updated)?;
    append_event(
        &updated.worktree_path,
        &TaskEvent {
            event_type: "phase_changed".to_string(),
            timestamp: Utc::now(),
            data: serde_json::json!({
                "from": old_phase,
                "to": updated.phase,
            }),
        },
    )?;

    let mut tasks = state.tasks.lock().unwrap();
    tasks.insert(updated.task_id.clone(), updated.clone());

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
    save_task_file(&updated)?;

    let mut tasks = state.tasks.lock().unwrap();
    tasks.insert(updated.task_id.clone(), updated.clone());

    Ok(updated)
}

// ── Verification Commands ──

#[tauri::command]
pub fn run_verification(
    state: State<AppState>,
    task_id: String,
) -> Result<crate::models::VerifyResult, String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    let repos = state.repositories.lock().unwrap();
    let repo = repos.get(&task.repo_id).ok_or("Repository not found")?.clone();
    drop(repos);

    if repo.validators.is_empty() {
        return Err("No validators configured for this repository".to_string());
    }

    // Count existing attempts
    let results_dir = format!("{}/.gmb/results/verify", task.worktree_path);
    let attempt = if std::path::Path::new(&results_dir).exists() {
        std::fs::read_dir(&results_dir)
            .map(|entries| entries.count() as u32 + 1)
            .unwrap_or(1)
    } else {
        1
    };

    let result = run_validators(&task.worktree_path, &repo.validators, attempt)?;

    // Log event
    append_event(
        &task.worktree_path,
        &TaskEvent {
            event_type: "validator_run".to_string(),
            timestamp: Utc::now(),
            data: serde_json::json!({
                "attempt": attempt,
                "all_passed": result.all_passed,
            }),
        },
    )?;

    // Update task phase based on result
    let mut tasks = state.tasks.lock().unwrap();
    if let Some(t) = tasks.get_mut(&task_id) {
        if result.all_passed {
            t.phase = TaskPhase::Ready;
            t.status = TaskStatus::Completed;
        } else {
            t.phase = TaskPhase::Code;
            t.status = TaskStatus::Running;
        }
        t.updated_at = Utc::now();
        let updated = t.clone();
        drop(tasks);
        save_task_file(&updated)?;
        let mut tasks = state.tasks.lock().unwrap();
        tasks.insert(updated.task_id.clone(), updated);
    }

    Ok(result)
}

// ── Prompt Commands ──

#[tauri::command]
pub fn get_prompt(task_id: String, state: State<AppState>) -> Result<String, String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?;

    let phase_file = match task.phase {
        TaskPhase::Plan => "plan.md",
        TaskPhase::Code => "code.md",
        TaskPhase::Verify => "verify.md",
        TaskPhase::Ready => return Ok("Task is ready for PR!".to_string()),
    };

    let prompt_path = format!("{}/.gmb/prompts/{}", task.worktree_path, phase_file);
    std::fs::read_to_string(&prompt_path)
        .map_err(|e| format!("Failed to read prompt: {}", e))
}

#[tauri::command]
pub fn get_terminal_command(task_id: String, state: State<AppState>) -> Result<String, String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?;

    let phase_file = match task.phase {
        TaskPhase::Plan => "plan.md",
        TaskPhase::Code => "code.md",
        TaskPhase::Verify => "verify.md",
        TaskPhase::Ready => return Ok(format!("cd {}", task.worktree_path)),
    };

    let prompt_path = format!("{}/.gmb/prompts/{}", task.worktree_path, phase_file);
    Ok(format!(
        "cd {} && claude --print \"$(cat {})\"",
        task.worktree_path, prompt_path
    ))
}

// ── Event Commands ──

#[tauri::command]
pub fn get_events(task_id: String, state: State<AppState>) -> Result<Vec<TaskEvent>, String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?;

    let events_path = format!("{}/.gmb/events.jsonl", task.worktree_path);
    if !std::path::Path::new(&events_path).exists() {
        return Ok(vec![]);
    }

    let content =
        std::fs::read_to_string(&events_path).map_err(|e| format!("Failed to read events: {}", e))?;

    let events: Vec<TaskEvent> = content
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();

    Ok(events)
}

// ── Cleanup Commands ──

#[tauri::command]
pub fn delete_task(state: State<AppState>, task_id: String) -> Result<(), String> {
    let tasks = state.tasks.lock().unwrap();
    let task = tasks.get(&task_id).ok_or("Task not found")?.clone();
    drop(tasks);

    let repos = state.repositories.lock().unwrap();
    let repo = repos.get(&task.repo_id).ok_or("Repository not found")?.clone();
    drop(repos);

    // Remove worktree
    let _ = git::remove_worktree(&repo.path, &task.worktree_path);

    // Remove from memory
    let mut tasks = state.tasks.lock().unwrap();
    tasks.remove(&task_id);

    Ok(())
}

// ── Helpers ──

fn save_task_file(task: &Task) -> Result<(), String> {
    let task_path = format!("{}/.gmb/task.json", task.worktree_path);
    let data =
        serde_json::to_string_pretty(task).map_err(|e| format!("Failed to serialize task: {}", e))?;
    std::fs::write(&task_path, data).map_err(|e| format!("Failed to write task.json: {}", e))
}

fn append_event(worktree_path: &str, event: &TaskEvent) -> Result<(), String> {
    let events_path = format!("{}/.gmb/events.jsonl", worktree_path);
    let line =
        serde_json::to_string(event).map_err(|e| format!("Failed to serialize event: {}", e))?;
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&events_path)
        .map_err(|e| format!("Failed to open events file: {}", e))?;
    writeln!(file, "{}", line).map_err(|e| format!("Failed to write event: {}", e))
}
