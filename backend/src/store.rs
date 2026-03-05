use crate::models::{Agent, Feature, Preferences, Repository, Task};
use std::collections::HashMap;
use std::sync::Mutex;

pub struct AppState {
    pub repositories: Mutex<HashMap<String, Repository>>,
    pub agents: Mutex<HashMap<String, Agent>>,
    pub features: Mutex<HashMap<String, Feature>>,
    pub tasks: Mutex<HashMap<String, Task>>,
    pub preferences: Mutex<Preferences>,
    pub config_path: String,
}

impl AppState {
    pub fn new(config_path: String) -> Self {
        let state = Self {
            repositories: Mutex::new(HashMap::new()),
            agents: Mutex::new(HashMap::new()),
            features: Mutex::new(HashMap::new()),
            tasks: Mutex::new(HashMap::new()),
            preferences: Mutex::new(Preferences::default()),
            config_path,
        };
        state.load_repos();
        state.load_agents();
        state.load_features();
        state.load_preferences();
        state
    }

    // ── Generic JSON persistence helpers ──

    fn json_path(&self, filename: &str) -> std::path::PathBuf {
        std::path::PathBuf::from(&self.config_path).join(filename)
    }

    fn load_json_list<T: serde::de::DeserializeOwned>(&self, filename: &str) -> Vec<T> {
        let path = self.json_path(filename);
        if path.exists() {
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(items) = serde_json::from_str::<Vec<T>>(&data) {
                    return items;
                }
            }
        }
        vec![]
    }

    fn save_json_list<T: serde::Serialize>(&self, filename: &str, items: &[T]) {
        let path = self.json_path(filename);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(data) = serde_json::to_string_pretty(&items) {
            let _ = std::fs::write(&path, data);
        }
    }

    // ── Repository persistence ──

    fn load_repos(&self) {
        let repos = self.load_json_list::<Repository>("repositories.json");
        let mut map = self.repositories.lock().unwrap();
        for repo in repos {
            map.insert(repo.id.clone(), repo);
        }
    }

    pub fn save_repos(&self) {
        let repos = self.repositories.lock().unwrap();
        let list: Vec<&Repository> = repos.values().collect();
        self.save_json_list("repositories.json", &list);
    }

    // ── Agent persistence ──

    fn load_agents(&self) {
        let mut map = self.agents.lock().unwrap();
        // Load built-in agents first
        for agent in crate::models::default_agents() {
            map.insert(agent.id.clone(), agent);
        }
        // Load user agents (overrides built-ins if same id)
        let agents = self.load_json_list::<Agent>("agents.json");
        for agent in agents {
            map.insert(agent.id.clone(), agent);
        }
    }

    pub fn save_agents(&self) {
        let agents = self.agents.lock().unwrap();
        // Only save non-builtin agents
        let list: Vec<&Agent> = agents.values().filter(|a| !a.is_builtin).collect();
        self.save_json_list("agents.json", &list);
    }

    // ── Feature persistence ──

    fn load_features(&self) {
        let features = self.load_json_list::<Feature>("features.json");
        let mut map = self.features.lock().unwrap();
        for feature in features {
            map.insert(feature.id.clone(), feature);
        }
    }

    pub fn save_features(&self) {
        let features = self.features.lock().unwrap();
        let list: Vec<&Feature> = features.values().collect();
        self.save_json_list("features.json", &list);
    }

    // ── Task persistence (per-repo in .gmb/tasks.json) ──

    pub fn save_tasks(&self) {
        let tasks = self.tasks.lock().unwrap();
        let repos = self.repositories.lock().unwrap();
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

    // ── Preferences persistence ──

    fn load_preferences(&self) {
        let path = self.json_path("preferences.json");
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
        self.save_json_list("preferences.json", &[&*prefs]);
        // Use direct write for single object
        let path = self.json_path("preferences.json");
        if let Ok(data) = serde_json::to_string_pretty(&*prefs) {
            let _ = std::fs::write(&path, data);
        }
    }
}
