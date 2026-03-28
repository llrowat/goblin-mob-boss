use crate::models::{
    AgentFile, AgentPerformanceSummary, AgentTaskRecord, CategoryCount, Feature, Preferences,
    Repository, SkillFile, SkillSource, SystemMap,
};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

pub struct AppState {
    pub repositories: Mutex<HashMap<String, Repository>>,
    pub features: Mutex<HashMap<String, Feature>>,
    pub system_maps: Mutex<HashMap<String, SystemMap>>,
    pub agent_history: Mutex<Vec<AgentTaskRecord>>,
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
            agent_history: Mutex::new(Vec::new()),
            preferences: Mutex::new(Preferences::default()),
            config_path,
            gmb_path,
        };
        state.migrate_system_maps();
        state.load_repos();
        state.load_features();
        state.load_system_maps();
        state.load_agent_history();
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

    // ── Agent History persistence ──

    fn load_agent_history(&self) {
        let records = self.load_json_list::<AgentTaskRecord>("agent_history.json");
        let mut history = self.agent_history.lock().unwrap();
        *history = records;
    }

    pub fn save_agent_history(&self) {
        let history = self.agent_history.lock().unwrap();
        self.save_json_list("agent_history.json", &history.as_slice());
    }

    /// Record task outcomes for all agents involved in a completed feature.
    pub fn record_feature_outcome(&self, feature: &Feature) {
        let now = chrono::Utc::now();
        let duration_secs = {
            let created = feature.created_at;
            let elapsed = now.signed_duration_since(created);
            if elapsed.num_seconds() > 0 {
                Some(elapsed.num_seconds() as u64)
            } else {
                None
            }
        };

        let validators_passed = if feature.status == crate::models::FeatureStatus::Complete
            || feature.status == crate::models::FeatureStatus::Pushed
        {
            Some(true)
        } else if feature.status == crate::models::FeatureStatus::Failed {
            Some(false)
        } else {
            None
        };

        let mut history = self.agent_history.lock().unwrap();

        for task in &feature.task_specs {
            let category = infer_task_category(&task.title, &task.description);
            history.push(AgentTaskRecord {
                agent: task.agent.clone(),
                feature_id: feature.id.clone(),
                feature_name: feature.name.clone(),
                task_title: task.title.clone(),
                task_category: category,
                succeeded: feature.status != crate::models::FeatureStatus::Failed,
                duration_secs,
                validators_passed,
                execution_mode: feature.execution_mode.clone(),
                recorded_at: now,
            });
        }
        drop(history);
        self.save_agent_history();
    }

    /// Build a performance summary for each agent that has history.
    pub fn get_agent_summaries(&self) -> Vec<AgentPerformanceSummary> {
        let history = self.agent_history.lock().unwrap();
        let mut by_agent: HashMap<String, Vec<&AgentTaskRecord>> = HashMap::new();

        for record in history.iter() {
            by_agent
                .entry(record.agent.clone())
                .or_default()
                .push(record);
        }

        let mut summaries: Vec<AgentPerformanceSummary> = by_agent
            .into_iter()
            .map(|(agent, records)| {
                let total = records.len() as u32;
                let successful = records.iter().filter(|r| r.succeeded).count() as u32;
                let success_rate = if total > 0 {
                    successful as f32 / total as f32
                } else {
                    0.0
                };

                // Category breakdown
                let mut cat_map: HashMap<String, (u32, u32)> = HashMap::new();
                for r in &records {
                    let entry = cat_map.entry(r.task_category.clone()).or_default();
                    entry.0 += 1;
                    if r.succeeded {
                        entry.1 += 1;
                    }
                }
                let mut top_categories: Vec<CategoryCount> = cat_map
                    .into_iter()
                    .filter(|(cat, _)| !cat.is_empty())
                    .map(|(cat, (count, success))| CategoryCount {
                        category: cat,
                        count,
                        success_count: success,
                    })
                    .collect();
                top_categories.sort_by(|a, b| b.count.cmp(&a.count));
                top_categories.truncate(5);

                // Average duration
                let durations: Vec<u64> = records.iter().filter_map(|r| r.duration_secs).collect();
                let avg_duration_secs = if durations.is_empty() {
                    None
                } else {
                    Some(durations.iter().sum::<u64>() as f64 / durations.len() as f64)
                };

                let last_active = records.iter().map(|r| r.recorded_at).max();

                // Distinct feature count
                let mut feature_ids: Vec<&str> = records.iter().map(|r| r.feature_id.as_str()).collect();
                feature_ids.sort();
                feature_ids.dedup();
                let feature_count = feature_ids.len() as u32;

                AgentPerformanceSummary {
                    agent,
                    total_tasks: total,
                    successful_tasks: successful,
                    success_rate,
                    top_categories,
                    avg_duration_secs,
                    last_active,
                    feature_count,
                }
            })
            .collect();

        summaries.sort_by(|a, b| b.total_tasks.cmp(&a.total_tasks));
        summaries
    }

    /// Format agent history as context for injection into ideation prompts.
    pub fn format_agent_history_for_prompt(&self) -> String {
        let summaries = self.get_agent_summaries();
        if summaries.is_empty() {
            return String::new();
        }

        let mut out = String::from("## Agent Track Record\n\nBased on prior feature completions, here is each agent's performance history. Use this to inform agent assignments — prefer agents with strong track records for the relevant task types.\n\n");

        for s in &summaries {
            out.push_str(&format!(
                "- **{}**: {}/{} tasks succeeded ({:.0}% success rate)",
                s.agent,
                s.successful_tasks,
                s.total_tasks,
                s.success_rate * 100.0
            ));
            if !s.top_categories.is_empty() {
                let cats: Vec<String> = s
                    .top_categories
                    .iter()
                    .map(|c| format!("{} ({}/{})", c.category, c.success_count, c.count))
                    .collect();
                out.push_str(&format!(". Specialties: {}", cats.join(", ")));
            }
            out.push('\n');
        }
        out.push('\n');
        out
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

/// Infer a task category from its title and description using keyword matching.
fn infer_task_category(title: &str, description: &str) -> String {
    let combined = format!("{} {}", title, description).to_lowercase();

    let categories = [
        (
            "frontend",
            &[
                "frontend",
                "ui",
                "component",
                "react",
                "css",
                "style",
                "layout",
                "page",
                "form",
                "modal",
                "button",
                "display",
            ][..],
        ),
        (
            "backend",
            &[
                "backend",
                "api",
                "endpoint",
                "server",
                "handler",
                "route",
                "database",
                "query",
                "migration",
                "schema",
            ],
        ),
        (
            "testing",
            &[
                "test",
                "spec",
                "coverage",
                "assert",
                "mock",
                "fixture",
                "qa",
                "verify",
                "validation",
            ],
        ),
        (
            "infrastructure",
            &[
                "ci", "cd", "deploy", "docker", "config", "env", "build", "pipeline", "devops",
                "infra",
            ],
        ),
        (
            "documentation",
            &["doc", "readme", "comment", "changelog", "guide"],
        ),
        (
            "refactoring",
            &[
                "refactor",
                "cleanup",
                "restructure",
                "rename",
                "extract",
                "simplify",
            ],
        ),
    ];

    for (category, keywords) in &categories {
        if keywords.iter().any(|kw| combined.contains(kw)) {
            return category.to_string();
        }
    }
    "general".to_string()
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

// ── Skill File Operations ──
// Skills are stored as `.claude/commands/*.md` files (repo or global).

/// Return the `~/.claude/skills/` directory path.
fn global_skills_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())?;
    Ok(Path::new(&home).join(".claude").join("skills"))
}

/// List all global skill files from `~/.claude/skills/<name>/SKILL.md`
/// and plugin skills from `~/.claude/plugins/marketplaces/`.
pub fn list_global_skills() -> Result<Vec<SkillFile>, String> {
    let mut skills = Vec::new();

    // User skills: ~/.claude/skills/<name>/SKILL.md
    let user_dir = global_skills_dir()?;
    skills.extend(read_skills_from_dir(&user_dir, SkillSource::User)?);

    // Plugin skills: read from installed plugins only.
    // installed_plugins.json maps "<plugin>@<marketplace>" -> [{installPath, ...}]
    // Skills at <installPath>/skills/<name>/SKILL.md
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let installed_path = Path::new(&home)
        .join(".claude")
        .join("plugins")
        .join("installed_plugins.json");
    if installed_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&installed_path) {
            if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(plugins) = manifest.get("plugins").and_then(|p| p.as_object()) {
                    for (key, entries) in plugins {
                        // key is "plugin-name@marketplace-name"
                        let plugin_name = key.split('@').next().unwrap_or(key).to_string();
                        if let Some(installs) = entries.as_array() {
                            for install in installs {
                                if let Some(install_path) =
                                    install.get("installPath").and_then(|p| p.as_str())
                                {
                                    let skills_dir = Path::new(install_path).join("skills");
                                    if skills_dir.exists() {
                                        let mut plugin_skills =
                                            read_skills_from_dir(&skills_dir, SkillSource::Plugin)?;
                                        for s in &mut plugin_skills {
                                            s.plugin_name = Some(plugin_name.clone());
                                        }
                                        skills.extend(plugin_skills);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

/// Read skills from a directory of `<name>/SKILL.md` subdirectories.
fn read_skills_from_dir(skills_dir: &Path, source: SkillSource) -> Result<Vec<SkillFile>, String> {
    if !skills_dir.exists() {
        return Ok(vec![]);
    }
    let mut skills = Vec::new();
    let entries =
        std::fs::read_dir(skills_dir).map_err(|e| format!("Failed to read skills dir: {}", e))?;

    let mut dirs: Vec<_> = entries.flatten().collect();
    dirs.sort_by_key(|e| e.file_name());

    for entry in dirs {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_file = path.join("SKILL.md");
        if !skill_file.exists() {
            continue;
        }
        let dir_name = path.file_name().unwrap().to_string_lossy().to_string();
        if let Ok(content) = std::fs::read_to_string(&skill_file) {
            let mut skill = SkillFile::parse(&dir_name, &content);
            skill.source = source.clone();
            skills.push(skill);
        }
    }
    Ok(skills)
}

/// Save a skill to `~/.claude/skills/<dir_name>/SKILL.md`.
pub fn save_global_skill(skill: &SkillFile) -> Result<(), String> {
    let skills_dir = global_skills_dir()?;
    let skill_dir = skills_dir.join(&skill.dir_name);
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill dir: {}", e))?;
    let path = skill_dir.join("SKILL.md");
    let content = skill.to_markdown();
    std::fs::write(&path, content).map_err(|e| format!("Failed to write skill file: {}", e))
}

/// Delete a skill directory from `~/.claude/skills/<dir_name>/`.
pub fn delete_global_skill(dir_name: &str) -> Result<(), String> {
    let skills_dir = global_skills_dir()?;
    let skill_dir = skills_dir.join(dir_name);
    if skill_dir.exists() {
        std::fs::remove_dir_all(&skill_dir).map_err(|e| format!("Failed to delete skill: {}", e))
    } else {
        Err("Skill not found".to_string())
    }
}

/// Check if a skill generation output file exists (for polling).
pub fn check_skill_generation(name: &str) -> Result<bool, String> {
    let skills_dir = global_skills_dir()?;
    Ok(skills_dir.join(name).join("SKILL.md").exists())
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
            agent_history: Mutex::new(Vec::new()),
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
            vec![],
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
            vec![],
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
            role: "developer".to_string(),
            enabled: true,
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
            role: "developer".to_string(),
            enabled: true,
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

    // ── Skill Store Tests ──

    #[test]
    fn list_skills_from_empty_dir_returns_empty() {
        let dir = TempDir::new().unwrap();
        let result = read_skills_from_dir(&dir.path().join("nonexistent"), SkillSource::User);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn list_skills_reads_skill_directories() {
        let dir = TempDir::new().unwrap();
        let skills_dir = dir.path().join(".claude").join("skills");

        // Skill with frontmatter
        let review_dir = skills_dir.join("review-pr");
        std::fs::create_dir_all(&review_dir).unwrap();
        std::fs::write(
            review_dir.join("SKILL.md"),
            "---\nname: review-pr\ndescription: Reviews PRs\nuser_invocable: true\n---\n\nReview this PR.",
        )
        .unwrap();

        // Skill without frontmatter
        let test_dir = skills_dir.join("run-tests");
        std::fs::create_dir_all(&test_dir).unwrap();
        std::fs::write(
            test_dir.join("SKILL.md"),
            "Run all tests and report failures.",
        )
        .unwrap();

        // Non-directory files should be ignored
        std::fs::write(skills_dir.join("notes.txt"), "not a skill").unwrap();

        // Directory without SKILL.md should be ignored
        let empty_dir = skills_dir.join("empty-skill");
        std::fs::create_dir_all(&empty_dir).unwrap();

        let skills = read_skills_from_dir(&skills_dir, SkillSource::User).unwrap();
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "review-pr");
        assert_eq!(skills[0].source, SkillSource::User);
        assert_eq!(skills[1].name, "run-tests");
        assert_eq!(skills[1].source, SkillSource::User);
    }

    #[test]
    fn save_and_delete_global_skill_with_temp_home() {
        let dir = TempDir::new().unwrap();
        let home = dir.path().to_string_lossy().to_string();

        // Point HOME at our temp dir
        std::env::set_var("HOME", &home);

        let skill = SkillFile {
            dir_name: "test-skill".to_string(),
            name: "test-skill".to_string(),
            description: "A test".to_string(),
            prompt_template: "Do something.".to_string(),
            source: SkillSource::User,
            plugin_name: None,
        };

        save_global_skill(&skill).unwrap();

        // Verify the directory structure
        let skill_dir = dir.path().join(".claude").join("skills").join("test-skill");
        assert!(skill_dir.join("SKILL.md").exists());

        let skills = list_global_skills().unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "test-skill");
        assert_eq!(skills[0].prompt_template, "Do something.");

        delete_global_skill("test-skill").unwrap();

        let skills = list_global_skills().unwrap();
        assert!(skills.is_empty());
        assert!(!skill_dir.exists());
    }

    #[test]
    fn delete_nonexistent_skill_returns_error() {
        let dir = TempDir::new().unwrap();
        let home = dir.path().to_string_lossy().to_string();
        std::env::set_var("HOME", &home);

        let result = delete_global_skill("nonexistent");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Skill not found"));
    }

    #[test]
    fn read_skills_includes_user_and_plugin_sources() {
        let dir = TempDir::new().unwrap();

        // User skills directory
        let user_skill_dir = dir.path().join("user-skills").join("my-skill");
        std::fs::create_dir_all(&user_skill_dir).unwrap();
        std::fs::write(
            user_skill_dir.join("SKILL.md"),
            "---\nname: my-skill\ndescription: My skill\nuser_invocable: true\n---\n\nDo stuff.",
        )
        .unwrap();

        let user_skills =
            read_skills_from_dir(&dir.path().join("user-skills"), SkillSource::User).unwrap();
        assert_eq!(user_skills.len(), 1);
        assert_eq!(user_skills[0].name, "my-skill");
        assert_eq!(user_skills[0].source, SkillSource::User);

        // Plugin skills directory
        let plugin_skill_dir = dir.path().join("plugin-skills").join("plugin-skill");
        std::fs::create_dir_all(&plugin_skill_dir).unwrap();
        std::fs::write(
            plugin_skill_dir.join("SKILL.md"),
            "---\nname: plugin-skill\ndescription: From a plugin\nuser_invocable: true\n---\n\nPlugin stuff.",
        ).unwrap();

        let mut plugin_skills =
            read_skills_from_dir(&dir.path().join("plugin-skills"), SkillSource::Plugin).unwrap();
        for s in &mut plugin_skills {
            s.plugin_name = Some("cool-plugin".to_string());
        }
        assert_eq!(plugin_skills.len(), 1);
        assert_eq!(plugin_skills[0].name, "plugin-skill");
        assert_eq!(plugin_skills[0].source, SkillSource::Plugin);
        assert_eq!(plugin_skills[0].plugin_name.as_deref(), Some("cool-plugin"));
    }

    #[test]
    fn list_global_skills_reads_installed_plugin_skills() {
        let dir = TempDir::new().unwrap();
        let home = dir.path().to_string_lossy().to_string();
        std::env::set_var("HOME", &home);

        // Create a user skill
        let user_skill = dir.path().join(".claude").join("skills").join("user-skill");
        std::fs::create_dir_all(&user_skill).unwrap();
        std::fs::write(
            user_skill.join("SKILL.md"),
            "---\nname: user-skill\ndescription: User skill\nuser_invocable: true\n---\n\nUser stuff.",
        ).unwrap();

        // Create an installed plugin with skills
        let plugin_cache = dir
            .path()
            .join("plugin-cache")
            .join("cool-plugin")
            .join("1.0.0");
        let plugin_skill = plugin_cache.join("skills").join("plugin-skill");
        std::fs::create_dir_all(&plugin_skill).unwrap();
        std::fs::write(
            plugin_skill.join("SKILL.md"),
            "---\nname: plugin-skill\ndescription: Plugin skill\nuser_invocable: true\n---\n\nPlugin stuff.",
        ).unwrap();

        // Create installed_plugins.json pointing to the cache
        let plugins_dir = dir.path().join(".claude").join("plugins");
        std::fs::create_dir_all(&plugins_dir).unwrap();
        let manifest = serde_json::json!({
            "version": 2,
            "plugins": {
                "cool-plugin@marketplace": [{
                    "scope": "user",
                    "installPath": plugin_cache.to_string_lossy(),
                    "version": "1.0.0"
                }]
            }
        });
        std::fs::write(
            plugins_dir.join("installed_plugins.json"),
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let skills = list_global_skills().unwrap();
        assert_eq!(skills.len(), 2);

        let user = skills.iter().find(|s| s.name == "user-skill").unwrap();
        assert_eq!(user.source, SkillSource::User);

        let plugin = skills.iter().find(|s| s.name == "plugin-skill").unwrap();
        assert_eq!(plugin.source, SkillSource::Plugin);
        assert_eq!(plugin.plugin_name.as_deref(), Some("cool-plugin"));
    }

    #[test]
    fn check_skill_generation_uses_directory_structure() {
        let dir = TempDir::new().unwrap();
        let skills_dir = dir.path().join(".claude").join("skills");

        // Skill doesn't exist yet
        assert!(!skills_dir.join("new-skill").join("SKILL.md").exists());

        // Create the skill directory and file
        let skill_dir = skills_dir.join("new-skill");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(skill_dir.join("SKILL.md"), "test content").unwrap();

        assert!(skill_dir.join("SKILL.md").exists());
    }

    // ── Agent History Tests ──

    #[test]
    fn save_and_load_agent_history_roundtrip() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        let record = AgentTaskRecord {
            agent: "frontend-dev".to_string(),
            feature_id: "feat-1".to_string(),
            feature_name: "Auth Feature".to_string(),
            task_title: "Build login page".to_string(),
            task_category: "frontend".to_string(),
            succeeded: true,
            duration_secs: Some(3600),
            validators_passed: Some(true),
            execution_mode: Some(crate::models::ExecutionMode::Teams),
            recorded_at: chrono::Utc::now(),
        };

        {
            let mut history = state.agent_history.lock().unwrap();
            history.push(record);
        }
        state.save_agent_history();

        assert!(dir.path().join("agent_history.json").exists());

        let state2 = make_state(&dir);
        state2.load_agent_history();
        let history = state2.agent_history.lock().unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].agent, "frontend-dev");
        assert!(history[0].succeeded);
    }

    #[test]
    fn get_agent_summaries_computes_correctly() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        {
            let mut history = state.agent_history.lock().unwrap();
            let now = chrono::Utc::now();
            // frontend-dev: 3 tasks, 2 succeeded
            history.push(AgentTaskRecord {
                agent: "frontend-dev".to_string(),
                feature_id: "f1".to_string(),
                feature_name: "Feat 1".to_string(),
                task_title: "Build UI component".to_string(),
                task_category: "frontend".to_string(),
                succeeded: true,
                duration_secs: Some(100),
                validators_passed: Some(true),
                execution_mode: None,
                recorded_at: now,
            });
            history.push(AgentTaskRecord {
                agent: "frontend-dev".to_string(),
                feature_id: "f2".to_string(),
                feature_name: "Feat 2".to_string(),
                task_title: "Add API endpoint".to_string(),
                task_category: "backend".to_string(),
                succeeded: false,
                duration_secs: Some(200),
                validators_passed: Some(false),
                execution_mode: None,
                recorded_at: now,
            });
            history.push(AgentTaskRecord {
                agent: "frontend-dev".to_string(),
                feature_id: "f3".to_string(),
                feature_name: "Feat 3".to_string(),
                task_title: "Fix CSS layout".to_string(),
                task_category: "frontend".to_string(),
                succeeded: true,
                duration_secs: Some(300),
                validators_passed: Some(true),
                execution_mode: None,
                recorded_at: now,
            });
        }

        let summaries = state.get_agent_summaries();
        assert_eq!(summaries.len(), 1);

        let s = &summaries[0];
        assert_eq!(s.agent, "frontend-dev");
        assert_eq!(s.total_tasks, 3);
        assert_eq!(s.successful_tasks, 2);
        assert!((s.success_rate - 0.6667).abs() < 0.01);
        assert_eq!(s.avg_duration_secs, Some(200.0));

        // Top categories: frontend (2 tasks), backend (1 task)
        assert_eq!(s.top_categories.len(), 2);
        assert_eq!(s.top_categories[0].category, "frontend");
        assert_eq!(s.top_categories[0].count, 2);
        assert_eq!(s.top_categories[0].success_count, 2);
        assert_eq!(s.top_categories[1].category, "backend");
        assert_eq!(s.top_categories[1].count, 1);
        assert_eq!(s.top_categories[1].success_count, 0);
    }

    #[test]
    fn get_agent_summaries_empty_for_no_history() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);
        let summaries = state.get_agent_summaries();
        assert!(summaries.is_empty());
    }

    #[test]
    fn format_agent_history_for_prompt_empty_when_no_data() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);
        assert!(state.format_agent_history_for_prompt().is_empty());
    }

    #[test]
    fn format_agent_history_for_prompt_includes_data() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);
        {
            let mut history = state.agent_history.lock().unwrap();
            history.push(AgentTaskRecord {
                agent: "backend-dev".to_string(),
                feature_id: "f1".to_string(),
                feature_name: "F".to_string(),
                task_title: "Task".to_string(),
                task_category: "backend".to_string(),
                succeeded: true,
                duration_secs: None,
                validators_passed: None,
                execution_mode: None,
                recorded_at: chrono::Utc::now(),
            });
        }
        let prompt = state.format_agent_history_for_prompt();
        assert!(prompt.contains("Agent Track Record"));
        assert!(prompt.contains("backend-dev"));
        assert!(prompt.contains("1/1 tasks succeeded"));
        assert!(prompt.contains("100%"));
        assert!(prompt.contains("backend"));
    }

    #[test]
    fn infer_task_category_detects_categories() {
        assert_eq!(
            super::infer_task_category("Build login page", "React component with form"),
            "frontend"
        );
        assert_eq!(
            super::infer_task_category("Add API endpoint", "REST handler for /users"),
            "backend"
        );
        assert_eq!(
            super::infer_task_category("Write unit tests", "Cover the auth module"),
            "testing"
        );
        assert_eq!(
            super::infer_task_category("Set up CI pipeline", "GitHub Actions workflow"),
            "infrastructure"
        );
        assert_eq!(
            super::infer_task_category("Do something", "Unrelated task"),
            "general"
        );
    }

    #[test]
    fn record_feature_outcome_adds_records() {
        let dir = TempDir::new().unwrap();
        let state = make_state(&dir);

        let mut feature = crate::models::Feature::new(
            vec!["r1".to_string()],
            "Test".to_string(),
            "test desc".to_string(),
            "feature/test-1234".to_string(),
            vec![],
        );
        feature.status = crate::models::FeatureStatus::Complete;
        feature.execution_mode = Some(crate::models::ExecutionMode::Subagents);
        feature.task_specs = vec![
            crate::models::TaskSpec {
                title: "Build UI".to_string(),
                description: "React component".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec![],
                agent: "frontend-dev".to_string(),
            },
            crate::models::TaskSpec {
                title: "Add endpoint".to_string(),
                description: "API handler".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec![],
                agent: "backend-dev".to_string(),
            },
        ];

        state.record_feature_outcome(&feature);

        let history = state.agent_history.lock().unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].agent, "frontend-dev");
        assert_eq!(history[0].task_category, "frontend");
        assert!(history[0].succeeded);
        assert_eq!(history[1].agent, "backend-dev");
        assert_eq!(history[1].task_category, "backend");

        // Verify persisted to disk
        assert!(dir.path().join("agent_history.json").exists());
    }
}
