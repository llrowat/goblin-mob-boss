mod claude_md;
mod commands;
mod context;
mod git;
mod models;
mod prompts;
mod store;
mod validators;

use store::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config_dir = dirs_config_path();
    let state = AppState::new(config_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            // Repository
            commands::list_repositories,
            commands::add_repository,
            commands::update_repository,
            commands::remove_repository,
            commands::detect_repo_info,
            // Agents
            commands::list_agents,
            commands::add_agent,
            commands::update_agent,
            commands::remove_agent,
            // Features
            commands::start_feature,
            commands::list_features,
            commands::get_feature,
            // Ideation
            commands::get_ideation_prompt,
            commands::launch_ideation,
            commands::get_ideation_terminal_command,
            commands::poll_ideation_tasks,
            // Tasks
            commands::import_tasks,
            commands::list_tasks,
            commands::get_task,
            commands::start_task,
            commands::get_task_terminal_command,
            commands::launch_task,
            commands::complete_task,
            commands::merge_task,
            commands::update_task_status,
            commands::delete_task,
            commands::get_task_diff,
            commands::run_verification,
            // Feature verification & PR
            commands::start_feature_verification,
            commands::get_verification_terminal_command,
            commands::launch_verification,
            commands::mark_feature_ready,
            commands::push_feature,
            commands::get_pr_command,
            // Preferences
            commands::get_preferences,
            commands::set_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn dirs_config_path() -> String {
    if let Some(config_dir) = dirs_next() {
        let gmb_dir = std::path::PathBuf::from(config_dir).join("goblin-mob-boss");
        let _ = std::fs::create_dir_all(&gmb_dir);
        return gmb_dir.to_string_lossy().to_string();
    }
    ".goblin-mob-boss".to_string()
}

fn dirs_next() -> Option<String> {
    if let Ok(home) = std::env::var("HOME") {
        return Some(format!("{}/.config", home));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return Some(appdata);
    }
    None
}
