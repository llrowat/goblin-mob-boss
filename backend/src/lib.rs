mod analytics;
mod commands;
mod functional_testing;
mod git;
mod guidance;
mod harness;
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
    let gmb_dir = gmb_home_path();
    let state = AppState::new(config_dir, gmb_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
        .manage(pty::PtyBuffers::new())
        .manage(harness::HarnessManager::new())
        .invoke_handler(tauri::generate_handler![
            // Repository
            commands::list_repositories,
            commands::add_repository,
            commands::update_repository,
            commands::remove_repository,
            commands::detect_repo_info,
            commands::check_claude_md,
            commands::generate_claude_md,
            commands::get_claude_md_command,
            // Agents (file-based)
            commands::list_agents,
            commands::save_agent,
            commands::delete_agent,
            commands::list_global_agents,
            commands::save_global_agent,
            commands::delete_global_agent,
            // Skills (file-based)
            commands::list_global_skills,
            commands::save_global_skill,
            commands::delete_global_skill,
            commands::generate_skill,
            commands::check_skill_generation,
            // Features
            commands::start_feature,
            commands::list_features,
            commands::get_feature,
            commands::get_plan_history,
            commands::delete_feature,
            // Ideation
            commands::get_ideation_prompt,
            commands::get_ideation_user_prompt,
            commands::get_ideation_terminal_command,
            commands::poll_ideation_result,
            // Launch Configuration
            commands::check_tmux_installed,
            commands::detect_available_shells,
            commands::configure_launch,
            commands::get_launch_command,
            commands::mark_feature_executing,
            commands::mark_feature_ready,
            commands::cancel_execution,
            commands::complete_feature,
            // Task Progress
            commands::poll_task_progress,
            // Validation
            commands::run_feature_validators,
            // Functional Testing
            commands::start_functional_testing,
            commands::skip_functional_testing,
            commands::complete_functional_testing,
            commands::get_functional_test_results,
            commands::mark_feature_testing,
            commands::poll_testing_status,
            commands::start_test_harness,
            commands::stop_test_harness,
            commands::relaunch_with_fix_context,
            // Diff
            commands::get_feature_diff,
            // Feature PR
            commands::push_feature,
            commands::push_feature_repo,
            commands::get_pr_command,
            commands::generate_commit_message,
            commands::generate_pr_description,
            // Ideation (background)
            commands::run_ideation,
            commands::poll_ideation_error,
            commands::revise_ideation,
            commands::submit_planning_answers,
            // PTY
            commands::start_launch_pty,
            commands::write_pty,
            commands::resize_pty,
            commands::kill_pty,
            commands::pty_session_exists,
            commands::poll_pty_output,
            // Preferences
            commands::get_preferences,
            commands::set_preferences,
            // Built-in Agents, Skills & Recipes
            commands::list_built_in_agents,
            commands::add_built_in_agent,
            commands::list_built_in_skills,
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
            commands::start_discovery_pty,
            commands::poll_map_discovery,
            // Hooks
            commands::get_repo_hooks,
            commands::save_repo_hooks,
            commands::list_hook_templates,
            // Process Log Transparency
            commands::read_process_log,
            commands::generate_hook,
            commands::check_hook_generation,
            // Agent History
            commands::get_agent_summaries,
            commands::get_agent_history,
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

fn gmb_home_path() -> String {
    if let Ok(home) = std::env::var("HOME") {
        let gmb_dir = std::path::PathBuf::from(&home).join(".gmb");
        let _ = std::fs::create_dir_all(&gmb_dir);
        return gmb_dir.to_string_lossy().to_string();
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let gmb_dir = std::path::PathBuf::from(&profile).join(".gmb");
        let _ = std::fs::create_dir_all(&gmb_dir);
        return gmb_dir.to_string_lossy().to_string();
    }
    ".gmb".to_string()
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
