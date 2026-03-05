use crate::models::{Preferences, Repository, Task};
use std::collections::HashMap;
use std::sync::Mutex;

pub struct AppState {
    pub repositories: Mutex<HashMap<String, Repository>>,
    pub tasks: Mutex<HashMap<String, Task>>,
    pub preferences: Mutex<Preferences>,
    pub config_path: String,
}

impl AppState {
    pub fn new(config_path: String) -> Self {
        let state = Self {
            repositories: Mutex::new(HashMap::new()),
            tasks: Mutex::new(HashMap::new()),
            preferences: Mutex::new(Preferences::default()),
            config_path,
        };
        state.load_repos();
        state.load_preferences();
        state
    }

    fn repos_file(&self) -> std::path::PathBuf {
        std::path::PathBuf::from(&self.config_path).join("repositories.json")
    }

    fn load_repos(&self) {
        let path = self.repos_file();
        if path.exists() {
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(repos) = serde_json::from_str::<Vec<Repository>>(&data) {
                    let mut map = self.repositories.lock().unwrap();
                    for repo in repos {
                        map.insert(repo.id.clone(), repo);
                    }
                }
            }
        }
    }

    pub fn save_repos(&self) {
        let repos = self.repositories.lock().unwrap();
        let list: Vec<&Repository> = repos.values().collect();
        let path = self.repos_file();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(data) = serde_json::to_string_pretty(&list) {
            let _ = std::fs::write(&path, data);
        }
    }

    fn prefs_file(&self) -> std::path::PathBuf {
        std::path::PathBuf::from(&self.config_path).join("preferences.json")
    }

    fn load_preferences(&self) {
        let path = self.prefs_file();
        if path.exists() {
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(prefs) = serde_json::from_str::<Preferences>(&data) {
                    let mut current = self.preferences.lock().unwrap();
                    *current = prefs;
                }
            }
        }
    }

    pub fn save_preferences(&self) {
        let prefs = self.preferences.lock().unwrap();
        let path = self.prefs_file();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(data) = serde_json::to_string_pretty(&*prefs) {
            let _ = std::fs::write(&path, data);
        }
    }

    pub fn load_tasks_for_repo(&self, repo: &Repository) {
        let repo_path = std::path::PathBuf::from(&repo.path);
        let gmb_dir = repo_path.join(".gmb").join("worktrees");

        // Clear existing in-memory tasks for this repo before reloading from disk
        {
            let mut tasks = self.tasks.lock().unwrap();
            tasks.retain(|_, t| t.repo_id != repo.id);
        }

        if !gmb_dir.exists() {
            return;
        }
        if let Ok(entries) = std::fs::read_dir(&gmb_dir) {
            for entry in entries.flatten() {
                let task_file = entry.path().join(".gmb").join("task.json");
                if task_file.exists() {
                    if let Ok(data) = std::fs::read_to_string(&task_file) {
                        if let Ok(task) = serde_json::from_str::<Task>(&data) {
                            let mut tasks = self.tasks.lock().unwrap();
                            tasks.insert(task.task_id.clone(), task);
                        }
                    }
                }
            }
        }
    }
}
