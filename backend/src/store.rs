use crate::models::{Ideation, Preferences, Repository, Task};
use std::collections::HashMap;
use std::sync::Mutex;

pub struct AppState {
    pub repositories: Mutex<HashMap<String, Repository>>,
    pub ideations: Mutex<HashMap<String, Ideation>>,
    pub tasks: Mutex<HashMap<String, Task>>,
    pub preferences: Mutex<Preferences>,
    pub config_path: String,
}

impl AppState {
    pub fn new(config_path: String) -> Self {
        let state = Self {
            repositories: Mutex::new(HashMap::new()),
            ideations: Mutex::new(HashMap::new()),
            tasks: Mutex::new(HashMap::new()),
            preferences: Mutex::new(Preferences::default()),
            config_path,
        };
        state.load_repos();
        state.load_preferences();
        state
    }

    // ── Repository persistence ──

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

    // ── Preferences persistence ──

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

    // ── Ideation persistence ──

    fn ideations_file(&self) -> std::path::PathBuf {
        std::path::PathBuf::from(&self.config_path).join("ideations.json")
    }

    pub fn save_ideations(&self) {
        let ideations = self.ideations.lock().unwrap();
        let list: Vec<&Ideation> = ideations.values().collect();
        let path = self.ideations_file();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(data) = serde_json::to_string_pretty(&list) {
            let _ = std::fs::write(&path, data);
        }
    }

    pub fn load_ideations(&self) {
        let path = self.ideations_file();
        if path.exists() {
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(ideations) = serde_json::from_str::<Vec<Ideation>>(&data) {
                    let mut map = self.ideations.lock().unwrap();
                    for ideation in ideations {
                        map.insert(ideation.id.clone(), ideation);
                    }
                }
            }
        }
    }

    // ── Task persistence (on disk per repo in .gmb/tasks/) ──

    pub fn save_tasks(&self) {
        let tasks = self.tasks.lock().unwrap();
        let repos = self.repositories.lock().unwrap();
        // Group tasks by repo and save
        for repo in repos.values() {
            let repo_tasks: Vec<&Task> = tasks.values().filter(|t| t.repo_id == repo.id).collect();
            let tasks_file = std::path::PathBuf::from(&repo.path)
                .join(".gmb")
                .join("tasks.json");
            if let Some(parent) = tasks_file.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(data) = serde_json::to_string_pretty(&repo_tasks) {
                let _ = std::fs::write(&tasks_file, data);
            }
        }
    }

    pub fn load_tasks_for_repo(&self, repo: &Repository) {
        // Clear existing in-memory tasks for this repo
        {
            let mut tasks = self.tasks.lock().unwrap();
            tasks.retain(|_, t| t.repo_id != repo.id);
        }

        let tasks_file = std::path::PathBuf::from(&repo.path)
            .join(".gmb")
            .join("tasks.json");
        if tasks_file.exists() {
            if let Ok(data) = std::fs::read_to_string(&tasks_file) {
                if let Ok(loaded) = serde_json::from_str::<Vec<Task>>(&data) {
                    let mut tasks = self.tasks.lock().unwrap();
                    for task in loaded {
                        tasks.insert(task.task_id.clone(), task);
                    }
                }
            }
        }
    }
}
