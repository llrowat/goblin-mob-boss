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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_state(dir: &TempDir) -> AppState {
        let config_path = dir.path().to_string_lossy().to_string();
        // Create a fresh state without loading (no files exist yet)
        AppState {
            repositories: Mutex::new(HashMap::new()),
            agents: Mutex::new(HashMap::new()),
            features: Mutex::new(HashMap::new()),
            tasks: Mutex::new(HashMap::new()),
            preferences: Mutex::new(Preferences::default()),
            config_path,
        }
    }

    #[test]
    fn json_path_joins_correctly() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);
        let path = state.json_path("repositories.json");
        assert!(path.ends_with("repositories.json"));
        assert!(path.starts_with(dir.path()));
    }

    #[test]
    fn load_json_list_returns_empty_for_missing_file() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);
        let repos: Vec<Repository> = state.load_json_list("nonexistent.json");
        assert!(repos.is_empty());
    }

    #[test]
    fn load_json_list_returns_empty_for_invalid_json() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("bad.json"), "not valid json").unwrap();
        let state = make_state(&dir);
        let repos: Vec<Repository> = state.load_json_list("bad.json");
        assert!(repos.is_empty());
    }

    #[test]
    fn save_and_load_repos_roundtrip() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        let repo = Repository::new(
            "test-repo".to_string(),
            "/tmp/test".to_string(),
            "main".to_string(),
            vec!["cargo test".to_string()],
            None,
        );
        let repo_id = repo.id.clone();

        {
            let mut repos = state.repositories.lock().unwrap();
            repos.insert(repo.id.clone(), repo);
        }
        state.save_repos();

        // Verify file was created
        assert!(dir.path().join("repositories.json").exists());

        // Load into a new state and verify
        let state2 = make_state(&dir);
        state2.load_repos();
        let repos = state2.repositories.lock().unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos.get(&repo_id).unwrap().name, "test-repo");
    }

    #[test]
    fn save_agents_only_persists_non_builtin() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        let builtin = Agent {
            id: "builtin-test".to_string(),
            name: "Built-in".to_string(),
            role: "developer".to_string(),
            system_prompt: "test".to_string(),
            is_builtin: true,
        };
        let custom = Agent::new(
            "Custom Agent".to_string(),
            "testing".to_string(),
            "You are custom".to_string(),
        );
        let custom_id = custom.id.clone();

        {
            let mut agents = state.agents.lock().unwrap();
            agents.insert(builtin.id.clone(), builtin);
            agents.insert(custom.id.clone(), custom);
        }
        state.save_agents();

        // Read the saved file — should only contain the custom agent
        let data = std::fs::read_to_string(dir.path().join("agents.json")).unwrap();
        let saved: Vec<Agent> = serde_json::from_str(&data).unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].id, custom_id);
        assert!(!saved[0].is_builtin);
    }

    #[test]
    fn save_and_load_features_roundtrip() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        let feature = Feature::new(
            vec![crate::models::FeatureRepo {
                repo_id: "r1".to_string(),
                branch: "feature/test-1234".to_string(),
            }],
            "Test Feature".to_string(),
            "A test feature".to_string(),
        );
        let feature_id = feature.id.clone();

        {
            let mut features = state.features.lock().unwrap();
            features.insert(feature.id.clone(), feature);
        }
        state.save_features();

        let state2 = make_state(&dir);
        state2.load_features();
        let features = state2.features.lock().unwrap();
        assert_eq!(features.len(), 1);
        assert_eq!(features.get(&feature_id).unwrap().name, "Test Feature");
    }

    #[test]
    fn save_and_load_preferences_roundtrip() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        {
            let mut prefs = state.preferences.lock().unwrap();
            prefs.shell = "zsh".to_string();
            prefs.verification_agent_ids = vec!["agent-1".to_string()];
        }
        state.save_preferences();

        let state2 = make_state(&dir);
        state2.load_preferences();
        let prefs = state2.preferences.lock().unwrap();
        assert_eq!(prefs.shell, "zsh");
        assert_eq!(prefs.verification_agent_ids, vec!["agent-1"]);
    }

    #[test]
    fn save_and_load_tasks_for_repo() {
        let dir = TempDir::new().unwrap();
        // Create a temp "repo" directory for tasks
        let repo_dir = dir.path().join("fake-repo");
        std::fs::create_dir_all(&repo_dir).unwrap();

        let state = make_state(&dir);
        let repo = Repository::new(
            "test".to_string(),
            repo_dir.to_string_lossy().to_string(),
            "main".to_string(),
            vec![],
            None,
        );

        {
            let mut repos = state.repositories.lock().unwrap();
            repos.insert(repo.id.clone(), repo.clone());
        }

        let now = chrono::Utc::now();
        let task = Task {
            task_id: "task-1".to_string(),
            feature_id: "feat-1".to_string(),
            repo_id: repo.id.clone(),
            title: "Test task".to_string(),
            description: "A task".to_string(),
            acceptance_criteria: vec![],
            dependencies: vec![],
            agent_id: "builtin-fullstack".to_string(),
            subagent_ids: vec![],
            status: crate::models::TaskStatus::Pending,
            branch: "feature/test/task-1".to_string(),
            worktree_path: "/tmp/wt".to_string(),
            created_at: now,
            updated_at: now,
        };

        {
            let mut tasks = state.tasks.lock().unwrap();
            tasks.insert(task.task_id.clone(), task);
        }
        state.save_tasks();

        // Verify .gmb/tasks.json was created in the repo dir
        assert!(repo_dir.join(".gmb").join("tasks.json").exists());

        // Load tasks for this repo into a fresh state
        let state2 = make_state(&dir);
        state2.load_tasks_for_repo(&repo);
        let tasks = state2.tasks.lock().unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks.get("task-1").unwrap().title, "Test task");
    }
}
