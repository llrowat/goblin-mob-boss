use crate::models::{AgentFile, Feature, Preferences, Repository};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

pub struct AppState {
    pub repositories: Mutex<HashMap<String, Repository>>,
    pub features: Mutex<HashMap<String, Feature>>,
    pub preferences: Mutex<Preferences>,
    pub config_path: String,
}

impl AppState {
    pub fn new(config_path: String) -> Self {
        let state = Self {
            repositories: Mutex::new(HashMap::new()),
            features: Mutex::new(HashMap::new()),
            preferences: Mutex::new(Preferences::default()),
            config_path,
        };
        state.load_repos();
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
        if !path.exists() {
            return vec![];
        }
        match std::fs::read_to_string(&path) {
            Ok(data) => match serde_json::from_str::<Vec<T>>(&data) {
                Ok(items) => items,
                Err(e) => {
                    log::error!(
                        "Corrupted JSON in {}: {}. Backing up and returning empty.",
                        path.display(),
                        e
                    );
                    // Create a backup of the corrupted file
                    let backup = path.with_extension("json.bak");
                    let _ = std::fs::copy(&path, &backup);
                    vec![]
                }
            },
            Err(e) => {
                log::error!("Failed to read {}: {}", path.display(), e);
                vec![]
            }
        }
    }

    /// Atomically save JSON data using write-to-temp-then-rename.
    /// This prevents partial writes from corrupting the file.
    fn save_json_list<T: serde::Serialize>(&self, filename: &str, items: &[T]) {
        let path = self.json_path(filename);
        if let Some(parent) = path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                log::error!("Failed to create config dir {}: {}", parent.display(), e);
                return;
            }
        }
        let data = match serde_json::to_string_pretty(&items) {
            Ok(d) => d,
            Err(e) => {
                log::error!("Failed to serialize {} for {}: {}", std::any::type_name::<T>(), filename, e);
                return;
            }
        };
        // Atomic write: write to temp file, then rename
        let tmp_path = path.with_extension("json.tmp");
        if let Err(e) = std::fs::write(&tmp_path, &data) {
            log::error!("Failed to write temp file {}: {}", tmp_path.display(), e);
            return;
        }
        if let Err(e) = std::fs::rename(&tmp_path, &path) {
            log::error!("Failed to rename {} -> {}: {}", tmp_path.display(), path.display(), e);
            // Try direct write as fallback
            let _ = std::fs::write(&path, &data);
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

    // ── Preferences persistence ──

    fn load_preferences(&self) {
        let path = self.json_path("preferences.json");
        if !path.exists() {
            return;
        }
        match std::fs::read_to_string(&path) {
            Ok(data) => match serde_json::from_str::<Preferences>(&data) {
                Ok(prefs) => {
                    let mut current = self.preferences.lock().unwrap();
                    *current = prefs;
                }
                Err(e) => {
                    log::error!("Corrupted preferences.json: {}", e);
                }
            },
            Err(e) => {
                log::error!("Failed to read preferences.json: {}", e);
            }
        }
    }

    pub fn save_preferences(&self) {
        let prefs = self.preferences.lock().unwrap();
        let path = self.json_path("preferences.json");
        if let Some(parent) = path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                log::error!("Failed to create config dir: {}", e);
                return;
            }
        }
        let data = match serde_json::to_string_pretty(&*prefs) {
            Ok(d) => d,
            Err(e) => {
                log::error!("Failed to serialize preferences: {}", e);
                return;
            }
        };
        let tmp_path = path.with_extension("json.tmp");
        if let Err(e) = std::fs::write(&tmp_path, &data) {
            log::error!("Failed to write temp preferences: {}", e);
            return;
        }
        if let Err(e) = std::fs::rename(&tmp_path, &path) {
            log::error!("Failed to rename preferences: {}", e);
            let _ = std::fs::write(&path, &data);
        }
    }
}

// ── Agent File Operations ──
// Agents are now stored as `.claude/agents/*.md` files in each repo (or globally).

/// List all agent files from a repo's `.claude/agents/` directory.
pub fn list_repo_agents(repo_path: &str) -> Result<Vec<AgentFile>, String> {
    let agents_dir = Path::new(repo_path).join(".claude").join("agents");
    read_agents_from_dir(&agents_dir, false)
}

/// List all global agent files from `~/.claude/agents/`.
pub fn list_global_agents() -> Result<Vec<AgentFile>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())?;
    let agents_dir = Path::new(&home).join(".claude").join("agents");
    read_agents_from_dir(&agents_dir, true)
}

fn read_agents_from_dir(agents_dir: &Path, is_global: bool) -> Result<Vec<AgentFile>, String> {
    if !agents_dir.exists() {
        return Ok(vec![]);
    }
    let mut agents = Vec::new();
    let entries = std::fs::read_dir(agents_dir)
        .map_err(|e| format!("Failed to read agents dir: {}", e))?;

    let mut files: Vec<_> = entries.flatten().collect();
    files.sort_by_key(|e| e.file_name());

    for entry in files {
        let path = entry.path();
        if path.extension().map(|e| e == "md").unwrap_or(false) {
            let filename = path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string();
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(mut agent) = AgentFile::parse(&filename, &content) {
                    agent.is_global = is_global;
                    agents.push(agent);
                }
            }
        }
    }
    Ok(agents)
}

/// Save an agent file to a repo's `.claude/agents/` directory.
pub fn save_repo_agent(repo_path: &str, agent: &AgentFile) -> Result<(), String> {
    let agents_dir = Path::new(repo_path).join(".claude").join("agents");
    std::fs::create_dir_all(&agents_dir)
        .map_err(|e| format!("Failed to create agents dir: {}", e))?;
    let path = agents_dir.join(&agent.filename);
    let content = agent.to_markdown();
    std::fs::write(&path, content).map_err(|e| format!("Failed to write agent file: {}", e))
}

/// Delete an agent file from a repo's `.claude/agents/` directory.
pub fn delete_repo_agent(repo_path: &str, filename: &str) -> Result<(), String> {
    let path = Path::new(repo_path)
        .join(".claude")
        .join("agents")
        .join(filename);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete agent file: {}", e))
    } else {
        Err("Agent file not found".to_string())
    }
}

/// Save an agent file to the global `~/.claude/agents/` directory.
pub fn save_global_agent(agent: &AgentFile) -> Result<(), String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())?;
    let agents_dir = Path::new(&home).join(".claude").join("agents");
    std::fs::create_dir_all(&agents_dir)
        .map_err(|e| format!("Failed to create agents dir: {}", e))?;
    let path = agents_dir.join(&agent.filename);
    let content = agent.to_markdown();
    std::fs::write(&path, content).map_err(|e| format!("Failed to write agent file: {}", e))
}

/// Delete an agent file from the global `~/.claude/agents/` directory.
pub fn delete_global_agent(filename: &str) -> Result<(), String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())?;
    let path = Path::new(&home)
        .join(".claude")
        .join("agents")
        .join(filename);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete agent file: {}", e))
    } else {
        Err("Agent file not found".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_state(dir: &TempDir) -> AppState {
        let config_path = dir.path().to_string_lossy().to_string();
        AppState {
            repositories: Mutex::new(HashMap::new()),
            features: Mutex::new(HashMap::new()),
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

        assert!(dir.path().join("repositories.json").exists());

        let state2 = make_state(&dir);
        state2.load_repos();
        let repos = state2.repositories.lock().unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos.get(&repo_id).unwrap().name, "test-repo");
    }

    #[test]
    fn save_and_load_features_roundtrip() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        let feature = crate::models::Feature::new(
            vec!["r1".to_string()],
            "Test Feature".to_string(),
            "A test feature".to_string(),
            "feature/test-1234".to_string(),
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
        }
        state.save_preferences();

        let state2 = make_state(&dir);
        state2.load_preferences();
        let prefs = state2.preferences.lock().unwrap();
        assert_eq!(prefs.shell, "zsh");
    }

    #[test]
    fn list_repo_agents_empty_when_no_dir() {
        let dir = TempDir::new().unwrap();
        let agents = list_repo_agents(&dir.path().to_string_lossy()).unwrap();
        assert!(agents.is_empty());
    }

    #[test]
    fn save_and_list_repo_agents() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_string_lossy().to_string();

        let agent = AgentFile {
            filename: "frontend-dev.md".to_string(),
            name: "Frontend Developer".to_string(),
            description: "React specialist".to_string(),
            tools: Some("Read, Edit".to_string()),
            model: None,
            system_prompt: "You are a frontend dev.".to_string(),
            is_global: false,
            color: "#5b8abd".to_string(),
        };

        save_repo_agent(&repo_path, &agent).unwrap();

        let agents = list_repo_agents(&repo_path).unwrap();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].name, "Frontend Developer");
        assert_eq!(agents[0].description, "React specialist");
        assert!(!agents[0].is_global);
    }

    #[test]
    fn delete_repo_agent_removes_file() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_string_lossy().to_string();

        let agent = AgentFile {
            filename: "test.md".to_string(),
            name: "Test".to_string(),
            description: String::new(),
            tools: None,
            model: None,
            system_prompt: "test".to_string(),
            is_global: false,
            color: "#5a8a5c".to_string(),
        };

        save_repo_agent(&repo_path, &agent).unwrap();
        assert_eq!(list_repo_agents(&repo_path).unwrap().len(), 1);

        delete_repo_agent(&repo_path, "test.md").unwrap();
        assert_eq!(list_repo_agents(&repo_path).unwrap().len(), 0);
    }

    #[test]
    fn delete_repo_agent_returns_error_for_missing() {
        let dir = TempDir::new().unwrap();
        let result = delete_repo_agent(&dir.path().to_string_lossy(), "nonexistent.md");
        assert!(result.is_err());
    }

    #[test]
    fn load_json_list_creates_backup_for_corrupted() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("corrupted.json"), "{ invalid json [").unwrap();
        let state = make_state(&dir);
        let repos: Vec<Repository> = state.load_json_list("corrupted.json");
        assert!(repos.is_empty());
        // Backup should be created
        assert!(dir.path().join("corrupted.json.bak").exists());
    }

    #[test]
    fn save_json_list_no_tmp_file_left() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        let repo = Repository::new(
            "test".to_string(),
            "/tmp/t".to_string(),
            "main".to_string(),
            vec![],
            None,
        );
        {
            let mut repos = state.repositories.lock().unwrap();
            repos.insert(repo.id.clone(), repo);
        }
        state.save_repos();

        // The .tmp file should not exist after successful save
        assert!(!dir.path().join("repositories.json.tmp").exists());
        // The actual file should exist
        assert!(dir.path().join("repositories.json").exists());
    }
}
