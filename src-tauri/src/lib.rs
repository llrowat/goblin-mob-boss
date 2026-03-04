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
            commands::list_repositories,
            commands::add_repository,
            commands::update_repository,
            commands::remove_repository,
            commands::detect_repo_info,
            commands::create_task,
            commands::list_tasks,
            commands::get_task,
            commands::advance_phase,
            commands::set_task_phase,
            commands::update_task_status,
            commands::run_verification,
            commands::get_prompt,
            commands::get_terminal_command,
            commands::get_events,
            commands::delete_task,
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
    // Simple cross-platform config dir detection
    if let Ok(home) = std::env::var("HOME") {
        return Some(format!("{}/.config", home));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return Some(appdata);
    }
    None
}
