mod analytics;
mod commands;
mod git;
mod guidance;
mod heuristics;
mod launch;
mod models;
mod observer;
mod prompts;
mod pty;
mod store;
mod templates;
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
        .manage(pty::PtySessions::new())
        .invoke_handler(tauri::generate_handler![
            // Repository
            commands::list_repositories,
            commands::add_repository,
            commands::update_repository,
            commands::remove_repository,
            commands::detect_repo_info,
            // Agents (file-based)
            commands::list_agents,
            commands::save_agent,
            commands::delete_agent,
            // Features
            commands::start_feature,
            commands::list_features,
            commands::get_feature,
            commands::delete_feature,
            // Ideation
            commands::get_ideation_prompt,
            commands::get_ideation_user_prompt,
            commands::get_ideation_terminal_command,
            commands::poll_ideation_result,
            // Launch Configuration
            commands::configure_launch,
            commands::get_launch_command,
            commands::mark_feature_executing,
            commands::mark_feature_ready,
            // Validation
            commands::run_feature_validators,
            // Diff
            commands::get_feature_diff,
            // Feature PR
            commands::push_feature,
            commands::get_pr_command,
            // Ideation (background)
            commands::run_ideation,
            commands::revise_ideation,
            // PTY
            commands::write_pty,
            commands::resize_pty,
            commands::kill_pty,
            // Preferences
            commands::get_preferences,
            commands::set_preferences,
            // Built-in Agents & Recipes
            commands::list_built_in_agents,
            commands::add_built_in_agent,
            commands::list_feature_recipes,
            // Execution Observability
            commands::poll_execution_status,
            // Analytics
            commands::analyze_feature_execution,
            // Guidance
            commands::add_guidance_note,
            commands::list_guidance_notes,
            // Heuristics
            commands::analyze_task_graph,
            // System Map
            commands::list_system_maps,
            commands::get_system_map,
            commands::create_system_map,
            commands::update_system_map,
            commands::delete_system_map,
            commands::start_map_discovery,
            commands::poll_map_discovery,
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
