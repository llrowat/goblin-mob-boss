use crate::models::{AgentFile, Feature, Preferences, Repository, SystemMap};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

pub struct AppState {
    pub repositories: Mutex<HashMap<String, Repository>>,
    pub features: Mutex<HashMap<String, Feature>>,
    pub system_maps: Mutex<HashMap<String, SystemMap>>,
    pub preferences: Mutex<Preferences>,
    pub config_path: String,
    /// Dedicated path for system map storage (`~/.gmb`).
    pub gmb_path: String,
}

impl AppState {
    pub fn new(config_path: String, gmb_path: String) -> Self {
        let state = Self {
            repositories: Mutex::new(HashMap::new()),
            features: Mutex::new(HashMap::new()),
            system_maps: Mutex::new(HashMap::new()),
            preferences: Mutex::new(Preferences::default()),
            config_path,
            gmb_path,
        };
        state.migrate_system_maps();
        state.load_repos();
        state.load_features();
        state.load_system_maps();
        state.load_preferences();
        state
    }

    // ── Generic JSON persistence helpers ──

    fn json_path(&self, filename: &str) -> std::path::PathBuf {
        std::path::PathBuf::from(&self.config_path).join(filename)
    }

    fn gmb_json_path(&self, filename: &str) -> std::path::PathBuf {
        std::path::PathBuf::from(&self.gmb_path).join(filename)
    }

    /// Migrate system_maps.json from the old config_path to ~/.gmb if it exists
    /// and hasn't already been migrated.
    fn migrate_system_maps(&self) {
        let old_path = self.json_path("system_maps.json");
        let new_path = self.gmb_json_path("system_maps.json");
        if old_path.exists() && !new_path.exists() {
            if let Some(parent) = new_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match std::fs::rename(&old_path, &new_path) {
                Ok(_) => {
                    log::info!(
                        "Migrated system_maps.json from {} to {}",
                        old_path.display(),
                        new_path.display()
                    );
                }
                Err(e) => {
                    // rename can fail across filesystems; fall back to copy + delete
                    log::warn!("Rename failed ({}), trying copy", e);
                    if std::fs::copy(&old_path, &new_path).is_ok() {
                        let _ = std::fs::remove_file(&old_path);
                        log::info!("Migrated system_maps.json via copy");
                    } else {
                        log::error!("Failed to migrate system_maps.json: {}", e);
                    }
                }
            }
        }
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
                log::error!(
                    "Failed to serialize {} for {}: {}",
                    std::any::type_name::<T>(),
                    filename,
                    e
                );
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
            log::error!(
                "Failed to rename {} -> {}: {}",
                tmp_path.display(),
                path.display(),
                e
            );
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

    // ── System Map persistence (stored in ~/.gmb) ──

    fn load_system_maps(&self) {
        let path = self.gmb_json_path("system_maps.json");
        if !path.exists() {
            return;
        }
        match std::fs::read_to_string(&path) {
            Ok(data) => match serde_json::from_str::<Vec<SystemMap>>(&data) {
                Ok(items) => {
                    let mut map = self.system_maps.lock().unwrap();
                    for sm in items {
                        map.insert(sm.id.clone(), sm);
                    }
                }
                Err(e) => {
                    log::error!(
                        "Corrupted JSON in {}: {}. Backing up and returning empty.",
                        path.display(),
                        e
                    );
                    let backup = path.with_extension("json.bak");
                    let _ = std::fs::copy(&path, &backup);
                }
            },
            Err(e) => {
                log::error!("Failed to read {}: {}", path.display(), e);
            }
        }
    }

    pub fn save_system_maps(&self) {
        let path = self.gmb_json_path("system_maps.json");
        if let Some(parent) = path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                log::error!("Failed to create gmb dir {}: {}", parent.display(), e);
                return;
            }
        }
        let maps = self.system_maps.lock().unwrap();
        let list: Vec<&SystemMap> = maps.values().collect();
        let data = match serde_json::to_string_pretty(&list) {
            Ok(d) => d,
            Err(e) => {
                log::error!("Failed to serialize system maps: {}", e);
                return;
            }
        };
        drop(maps);
        let tmp_path = path.with_extension("json.tmp");
        if let Err(e) = std::fs::write(&tmp_path, &data) {
            log::error!("Failed to write temp file {}: {}", tmp_path.display(), e);
            return;
        }
        if let Err(e) = std::fs::rename(&tmp_path, &path) {
            log::error!(
                "Failed to rename {} -> {}: {}",
                tmp_path.display(),
                path.display(),
                e
            );
            let _ = std::fs::write(&path, &data);
        }
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
    let entries =
        std::fs::read_dir(agents_dir).map_err(|e| format!("Failed to read agents dir: {}", e))?;

    let mut files: Vec<_> = entries.flatten().collect();
    files.sort_by_key(|e| e.file_name());

    for entry in files {
        let path = entry.path();
        if path.extension().map(|e| e == "md").unwrap_or(false) {
            let filename = path.file_name().unwrap().to_string_lossy().to_string();
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
        let gmb_path = dir.path().join("gmb").to_string_lossy().to_string();
        AppState {
            repositories: Mutex::new(HashMap::new()),
            features: Mutex::new(HashMap::new()),
            system_maps: Mutex::new(HashMap::new()),
            preferences: Mutex::new(Preferences::default()),
            config_path,
            gmb_path,
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
            String::new(),
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
            String::new(),
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

    #[test]
    fn save_and_load_system_maps_roundtrip() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        let map = crate::models::SystemMap::new("Platform".to_string(), "Overview".to_string());
        let map_id = map.id.clone();

        {
            let mut maps = state.system_maps.lock().unwrap();
            maps.insert(map.id.clone(), map);
        }
        state.save_system_maps();

        // System maps are stored in gmb_path, not config_path
        assert!(dir.path().join("gmb").join("system_maps.json").exists());
        assert!(!dir.path().join("system_maps.json").exists());

        let state2 = make_state(&dir);
        state2.load_system_maps();
        let maps = state2.system_maps.lock().unwrap();
        assert_eq!(maps.len(), 1);
        assert_eq!(maps.get(&map_id).unwrap().name, "Platform");
    }

    #[test]
    fn save_system_maps_with_services_and_connections() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        let mut map = crate::models::SystemMap::new("Full Map".to_string(), String::new());
        map.services.push(crate::models::MapService {
            id: "s1".to_string(),
            name: "API".to_string(),
            service_type: crate::models::ServiceType::Backend,
            repo_id: None,
            runtime: "rust".to_string(),
            framework: "actix".to_string(),
            description: String::new(),
            exposes: vec![],
            consumes: vec![],
            owns_data: vec!["users".to_string()],
            position: (100.0, 200.0),
            color: "#5a8a5c".to_string(),
        });
        map.connections.push(crate::models::MapConnection {
            id: "c1".to_string(),
            from_service: "s1".to_string(),
            to_service: "s2".to_string(),
            connection_type: crate::models::ConnectionType::Rest,
            sync: true,
            label: "/api".to_string(),
            description: String::new(),
        });
        let map_id = map.id.clone();

        {
            let mut maps = state.system_maps.lock().unwrap();
            maps.insert(map.id.clone(), map);
        }
        state.save_system_maps();

        // Verify stored in gmb_path
        assert!(dir.path().join("gmb").join("system_maps.json").exists());

        let state2 = make_state(&dir);
        state2.load_system_maps();
        let maps = state2.system_maps.lock().unwrap();
        let loaded = maps.get(&map_id).unwrap();
        assert_eq!(loaded.services.len(), 1);
        assert_eq!(loaded.services[0].owns_data, vec!["users"]);
        assert_eq!(loaded.connections.len(), 1);
        assert_eq!(loaded.connections[0].label, "/api");
    }

    #[test]
    fn migrate_system_maps_from_config_to_gmb() {
        let dir = TempDir::new().unwrap();

        // Write a system_maps.json in the old config_path location
        let old_data = r#"[{
            "id": "map-old",
            "name": "Legacy Map",
            "description": "From old location",
            "services": [],
            "connections": [],
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z"
        }]"#;
        std::fs::write(dir.path().join("system_maps.json"), old_data).unwrap();

        // Construct state — migration + load should pick up the old file
        let config_path = dir.path().to_string_lossy().to_string();
        let gmb_path = dir.path().join("gmb").to_string_lossy().to_string();
        let state = AppState::new(config_path, gmb_path);

        // Old file should be gone, new file should exist
        assert!(!dir.path().join("system_maps.json").exists());
        assert!(dir.path().join("gmb").join("system_maps.json").exists());

        // Map should be loaded
        let maps = state.system_maps.lock().unwrap();
        assert_eq!(maps.len(), 1);
        assert_eq!(maps.get("map-old").unwrap().name, "Legacy Map");
    }

    #[test]
    fn no_migration_when_gmb_already_has_system_maps() {
        let dir = TempDir::new().unwrap();
        let gmb_dir = dir.path().join("gmb");
        std::fs::create_dir_all(&gmb_dir).unwrap();

        // Old location has data
        let old_data = r#"[{"id":"old","name":"Old","description":"","services":[],"connections":[],"created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z"}]"#;
        std::fs::write(dir.path().join("system_maps.json"), old_data).unwrap();

        // New location already has data
        let new_data = r#"[{"id":"new","name":"New","description":"","services":[],"connections":[],"created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z"}]"#;
        std::fs::write(gmb_dir.join("system_maps.json"), new_data).unwrap();

        let config_path = dir.path().to_string_lossy().to_string();
        let gmb_path = gmb_dir.to_string_lossy().to_string();
        let state = AppState::new(config_path, gmb_path);

        // Old file should still exist (not migrated since new already exists)
        assert!(dir.path().join("system_maps.json").exists());

        // Should load from new location
        let maps = state.system_maps.lock().unwrap();
        assert_eq!(maps.len(), 1);
        assert_eq!(maps.get("new").unwrap().name, "New");
    }
}
