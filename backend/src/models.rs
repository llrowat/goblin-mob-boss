use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Repository ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub path: String,
    pub base_branch: String,
    pub validators: Vec<String>,
    pub pr_command: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl Repository {
    pub fn new(
        name: String,
        path: String,
        base_branch: String,
        validators: Vec<String>,
        pr_command: Option<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            path,
            base_branch,
            validators,
            pr_command,
            created_at: Utc::now(),
        }
    }
}

// ── Agent File ──
// Represents a `.claude/agents/*.md` file (or `~/.claude/agents/*.md` for global).

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentFile {
    pub filename: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub tools: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    pub system_prompt: String,
    /// Whether this agent comes from ~/.claude/agents/ (global) vs repo-level.
    #[serde(default)]
    pub is_global: bool,
    /// UI display color (hex string, e.g. "#5a8a5c"). Stored in frontmatter.
    #[serde(default = "default_agent_color")]
    pub color: String,
}

fn default_agent_color() -> String {
    "#5a8a5c".to_string()
}

impl AgentFile {
    /// Parse a `.claude/agents/*.md` file with YAML frontmatter.
    pub fn parse(filename: &str, content: &str) -> Result<Self, String> {
        let content = content.trim();
        if !content.starts_with("---") {
            // No frontmatter — treat entire content as system prompt
            let name = filename
                .strip_suffix(".md")
                .unwrap_or(filename)
                .replace('-', " ");
            return Ok(Self {
                filename: filename.to_string(),
                name,
                description: String::new(),
                tools: None,
                model: None,
                system_prompt: content.to_string(),
                is_global: false,
                color: default_agent_color(),
            });
        }

        // Split on second "---"
        let rest = &content[3..];
        let end = rest
            .find("\n---")
            .ok_or("Invalid frontmatter: missing closing ---")?;
        let frontmatter = &rest[..end];
        let body = rest[end + 4..].trim();

        // Parse simple YAML frontmatter (key: value pairs)
        let mut name = String::new();
        let mut description = String::new();
        let mut tools = None;
        let mut model = None;
        let mut color = default_agent_color();

        for line in frontmatter.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Some((key, value)) = line.split_once(':') {
                let key = key.trim();
                let value = value.trim().trim_matches('"').trim_matches('\'');
                match key {
                    "name" => name = value.to_string(),
                    "description" => description = value.to_string(),
                    "tools" => tools = Some(value.to_string()),
                    "model" => model = Some(value.to_string()),
                    "color" => color = value.to_string(),
                    _ => {}
                }
            }
        }

        if name.is_empty() {
            name = filename
                .strip_suffix(".md")
                .unwrap_or(filename)
                .replace('-', " ");
        }

        Ok(Self {
            filename: filename.to_string(),
            name,
            description,
            tools,
            model,
            system_prompt: body.to_string(),
            is_global: false,
            color,
        })
    }

    /// Serialize back to markdown with YAML frontmatter.
    pub fn to_markdown(&self) -> String {
        let mut fm = String::from("---\n");
        fm.push_str(&format!("name: \"{}\"\n", self.name));
        if !self.description.is_empty() {
            fm.push_str(&format!("description: \"{}\"\n", self.description));
        }
        if let Some(ref tools) = self.tools {
            fm.push_str(&format!("tools: \"{}\"\n", tools));
        }
        if let Some(ref model) = self.model {
            fm.push_str(&format!("model: \"{}\"\n", model));
        }
        if self.color != default_agent_color() {
            fm.push_str(&format!("color: \"{}\"\n", self.color));
        }
        fm.push_str("---\n\n");
        fm.push_str(&self.system_prompt);
        fm.push('\n');
        fm
    }
}

// ── Execution Mode ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionMode {
    Teams,
    Subagents,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionRecommendation {
    pub recommended: ExecutionMode,
    pub rationale: String,
    #[serde(default = "default_confidence")]
    pub confidence: f32,
}

fn default_confidence() -> f32 {
    0.5
}

// ── Feature ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FeatureStatus {
    Ideation,
    Configuring,
    Executing,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub id: String,
    /// Deprecated: use `repo_ids` instead. Kept for backward compat with old features.json.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub repo_id: String,
    /// List of repository IDs this feature spans. Cross-repo features have multiple entries.
    #[serde(default)]
    pub repo_ids: Vec<String>,
    pub name: String,
    pub description: String,
    pub branch: String,
    pub status: FeatureStatus,
    #[serde(default)]
    pub execution_mode: Option<ExecutionMode>,
    #[serde(default)]
    pub execution_rationale: Option<String>,
    #[serde(default)]
    pub selected_agents: Vec<String>,
    #[serde(default)]
    pub task_specs: Vec<TaskSpec>,
    #[serde(default)]
    pub pty_session_id: Option<String>,
    /// Per-repo worktree paths: maps repo_id -> worktree_path.
    /// When set, execution and validation use these isolated worktrees
    /// instead of the main working directory, allowing concurrent features.
    #[serde(default)]
    pub worktree_paths: std::collections::HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Feature {
    pub fn new(repo_ids: Vec<String>, name: String, description: String, branch: String) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            repo_id: String::new(),
            repo_ids,
            name,
            description,
            branch,
            status: FeatureStatus::Ideation,
            execution_mode: None,
            execution_rationale: None,
            selected_agents: vec![],
            task_specs: vec![],
            pty_session_id: None,
            worktree_paths: std::collections::HashMap::new(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Get the effective list of repo IDs, handling legacy single-repo features.
    pub fn effective_repo_ids(&self) -> Vec<String> {
        if !self.repo_ids.is_empty() {
            self.repo_ids.clone()
        } else if !self.repo_id.is_empty() {
            vec![self.repo_id.clone()]
        } else {
            vec![]
        }
    }

    /// Primary repo ID (first in the list) — used for .gmb feature directory storage and ideation.
    pub fn primary_repo_id(&self) -> Option<&str> {
        if !self.repo_ids.is_empty() {
            Some(&self.repo_ids[0])
        } else if !self.repo_id.is_empty() {
            Some(&self.repo_id)
        } else {
            None
        }
    }
}

// ── Task Spec ──
// Lightweight task description from ideation. Not a managed entity — just stored on Feature.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpec {
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub acceptance_criteria: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub agent: String,
}

// ── Ideation Discovery Result ──
// What the ideation prompt outputs (tasks + execution mode recommendation).

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdeationResult {
    #[serde(default)]
    pub tasks: Vec<TaskSpec>,
    #[serde(default)]
    pub execution_mode: Option<ExecutionRecommendation>,
}

// ── Validator Results ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidatorResult {
    pub command: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyResult {
    pub attempt: u32,
    pub all_passed: bool,
    pub results: Vec<ValidatorResult>,
    pub timestamp: DateTime<Utc>,
}

// ── Diff Summary ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffSummary {
    pub files: Vec<FileDiff>,
    pub total_files: u32,
    pub total_insertions: u32,
    pub total_deletions: u32,
}

// ── Preferences ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    pub shell: String,
}

impl Default for Preferences {
    fn default() -> Self {
        let shell = if cfg!(target_os = "windows") {
            "powershell".to_string()
        } else {
            "bash".to_string()
        };
        Self { shell }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_new_creates_with_ideation_status() {
        let feature = Feature::new(
            vec!["repo-1".to_string()],
            "Auth".to_string(),
            "Add auth".to_string(),
            "feature/auth-ab12".to_string(),
        );
        assert_eq!(feature.repo_ids, vec!["repo-1"]);
        assert_eq!(feature.effective_repo_ids(), vec!["repo-1"]);
        assert_eq!(feature.primary_repo_id(), Some("repo-1"));
        assert_eq!(feature.branch, "feature/auth-ab12");
        assert_eq!(feature.status, FeatureStatus::Ideation);
        assert!(feature.execution_mode.is_none());
        assert!(feature.selected_agents.is_empty());
        assert!(feature.task_specs.is_empty());
    }

    #[test]
    fn feature_new_multi_repo() {
        let feature = Feature::new(
            vec!["repo-1".to_string(), "repo-2".to_string()],
            "Cross-repo".to_string(),
            "Spans two repos".to_string(),
            "feature/cross-ab12".to_string(),
        );
        assert_eq!(feature.repo_ids, vec!["repo-1", "repo-2"]);
        assert_eq!(feature.effective_repo_ids(), vec!["repo-1", "repo-2"]);
        assert_eq!(feature.primary_repo_id(), Some("repo-1"));
    }

    #[test]
    fn feature_serializes_with_execution_mode() {
        let mut feature = Feature::new(
            vec!["r1".to_string()],
            "X".to_string(),
            "desc".to_string(),
            "feature/x-1234".to_string(),
        );
        feature.execution_mode = Some(ExecutionMode::Teams);
        feature.execution_rationale = Some("High parallelism".to_string());
        feature.selected_agents = vec!["frontend-dev.md".to_string()];
        feature.task_specs = vec![TaskSpec {
            title: "Task 1".to_string(),
            description: "Do thing".to_string(),
            acceptance_criteria: vec![],
            dependencies: vec![],
            agent: "frontend-dev".to_string(),
        }];

        let json = serde_json::to_string(&feature).unwrap();
        let parsed: Feature = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.execution_mode, Some(ExecutionMode::Teams));
        assert_eq!(parsed.selected_agents, vec!["frontend-dev.md"]);
        assert_eq!(parsed.task_specs.len(), 1);
        assert_eq!(parsed.repo_ids, vec!["r1"]);
    }

    #[test]
    fn feature_backwards_compat_deserialize_single_repo_id() {
        let json = r#"{
            "id": "feat-1",
            "repo_id": "repo-old",
            "name": "Legacy",
            "description": "Old feature",
            "branch": "feature/legacy-1234",
            "status": "ideation",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z"
        }"#;
        let feature: Feature = serde_json::from_str(json).unwrap();
        assert_eq!(feature.repo_id, "repo-old");
        assert!(feature.repo_ids.is_empty());
        assert_eq!(feature.effective_repo_ids(), vec!["repo-old"]);
        assert_eq!(feature.primary_repo_id(), Some("repo-old"));
        assert!(feature.execution_mode.is_none());
        assert!(feature.selected_agents.is_empty());
        assert!(feature.task_specs.is_empty());
    }

    #[test]
    fn feature_new_does_not_serialize_empty_repo_id() {
        let feature = Feature::new(
            vec!["r1".to_string()],
            "X".to_string(),
            "desc".to_string(),
            "feature/x-1234".to_string(),
        );
        let json = serde_json::to_string(&feature).unwrap();
        assert!(!json.contains("\"repo_id\""));
        assert!(json.contains("\"repo_ids\""));
    }

    #[test]
    fn agent_file_parse_with_frontmatter() {
        let content = r#"---
name: "Frontend Developer"
description: "Specializes in React and CSS"
tools: "Read, Edit, Write, Bash"
model: "claude-sonnet-4-5-20250514"
---

You are a frontend specialist. Focus on UI components, styling, and accessibility."#;

        let agent = AgentFile::parse("frontend-dev.md", content).unwrap();
        assert_eq!(agent.filename, "frontend-dev.md");
        assert_eq!(agent.name, "Frontend Developer");
        assert_eq!(agent.description, "Specializes in React and CSS");
        assert_eq!(agent.tools, Some("Read, Edit, Write, Bash".to_string()));
        assert_eq!(
            agent.model,
            Some("claude-sonnet-4-5-20250514".to_string())
        );
        assert!(agent.system_prompt.contains("frontend specialist"));
    }

    #[test]
    fn agent_file_parse_without_frontmatter() {
        let content = "You are a backend developer. Focus on APIs and data models.";
        let agent = AgentFile::parse("backend-dev.md", content).unwrap();
        assert_eq!(agent.name, "backend dev");
        assert_eq!(agent.description, "");
        assert!(agent.tools.is_none());
        assert!(agent.system_prompt.contains("backend developer"));
    }

    #[test]
    fn agent_file_roundtrip() {
        let agent = AgentFile {
            filename: "test-writer.md".to_string(),
            name: "Test Writer".to_string(),
            description: "Writes comprehensive tests".to_string(),
            tools: Some("Read, Bash".to_string()),
            model: None,
            system_prompt: "You are a testing specialist.".to_string(),
            is_global: false,
            color: default_agent_color(),
        };
        let md = agent.to_markdown();
        let parsed = AgentFile::parse("test-writer.md", &md).unwrap();
        assert_eq!(parsed.name, "Test Writer");
        assert_eq!(parsed.description, "Writes comprehensive tests");
        assert_eq!(parsed.tools, Some("Read, Bash".to_string()));
        assert!(parsed.model.is_none());
        assert_eq!(parsed.system_prompt, "You are a testing specialist.");
    }

    #[test]
    fn agent_file_parse_minimal_frontmatter() {
        let content = r#"---
name: "Reviewer"
---

Review code for issues."#;
        let agent = AgentFile::parse("reviewer.md", content).unwrap();
        assert_eq!(agent.name, "Reviewer");
        assert_eq!(agent.description, "");
        assert!(agent.tools.is_none());
        assert_eq!(agent.system_prompt, "Review code for issues.");
    }

    #[test]
    fn execution_mode_serializes() {
        let rec = ExecutionRecommendation {
            recommended: ExecutionMode::Teams,
            rationale: "4 independent tasks".to_string(),
            confidence: 0.85,
        };
        let json = serde_json::to_string(&rec).unwrap();
        assert!(json.contains("\"teams\""));
        let parsed: ExecutionRecommendation = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.recommended, ExecutionMode::Teams);
        assert_eq!(parsed.confidence, 0.85);
    }

    #[test]
    fn ideation_result_parses() {
        let json = r#"{
            "tasks": [
                {
                    "title": "Add API",
                    "description": "Backend work",
                    "acceptance_criteria": ["tests pass"]
                }
            ],
            "execution_mode": {
                "recommended": "subagents",
                "rationale": "Small focused feature",
                "confidence": 0.9
            }
        }"#;
        let result: IdeationResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.tasks.len(), 1);
        assert_eq!(result.tasks[0].title, "Add API");
        let em = result.execution_mode.unwrap();
        assert_eq!(em.recommended, ExecutionMode::Subagents);
        assert_eq!(em.confidence, 0.9);
    }

    #[test]
    fn ideation_result_parses_without_execution_mode() {
        let json = r#"{
            "tasks": [{"title": "Do thing", "description": "details"}]
        }"#;
        let result: IdeationResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.tasks.len(), 1);
        assert!(result.execution_mode.is_none());
    }

    #[test]
    fn taskspec_minimal() {
        let json = r#"{"title": "Add button", "description": "Frontend work"}"#;
        let spec: TaskSpec = serde_json::from_str(json).unwrap();
        assert_eq!(spec.title, "Add button");
        assert_eq!(spec.agent, "");
        assert!(spec.acceptance_criteria.is_empty());
    }

    #[test]
    fn diff_summary_serializes() {
        let summary = DiffSummary {
            files: vec![
                FileDiff {
                    path: "src/main.rs".to_string(),
                    insertions: 10,
                    deletions: 2,
                },
                FileDiff {
                    path: "README.md".to_string(),
                    insertions: 3,
                    deletions: 0,
                },
            ],
            total_files: 2,
            total_insertions: 13,
            total_deletions: 2,
        };
        let json = serde_json::to_string(&summary).unwrap();
        let parsed: DiffSummary = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.total_files, 2);
        assert_eq!(parsed.total_insertions, 13);
    }

    #[test]
    fn preferences_default() {
        let prefs = Preferences::default();
        assert!(!prefs.shell.is_empty());
    }

    #[test]
    fn configuring_status_serializes() {
        let json = r#""configuring""#;
        let status: FeatureStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status, FeatureStatus::Configuring);
    }

    #[test]
    fn agent_file_parse_with_color() {
        let content = r##"---
name: "Frontend Developer"
description: "React specialist"
color: "#5b8abd"
---

You are a frontend specialist."##;

        let agent = AgentFile::parse("frontend-dev.md", content).unwrap();
        assert_eq!(agent.color, "#5b8abd");
    }

    #[test]
    fn agent_file_parse_without_color_gets_default() {
        let content = r#"---
name: "Backend Dev"
---

You are a backend developer."#;

        let agent = AgentFile::parse("backend-dev.md", content).unwrap();
        assert_eq!(agent.color, "#5a8a5c");
    }

    #[test]
    fn agent_file_no_frontmatter_gets_default_color() {
        let agent = AgentFile::parse("test.md", "Just a prompt.").unwrap();
        assert_eq!(agent.color, "#5a8a5c");
    }

    #[test]
    fn agent_file_roundtrip_with_color() {
        let agent = AgentFile {
            filename: "colorful.md".to_string(),
            name: "Colorful Agent".to_string(),
            description: String::new(),
            tools: None,
            model: None,
            system_prompt: "You are colorful.".to_string(),
            is_global: false,
            color: "#c45a6a".to_string(),
        };
        let md = agent.to_markdown();
        assert!(md.contains("color: \"#c45a6a\""));
        let parsed = AgentFile::parse("colorful.md", &md).unwrap();
        assert_eq!(parsed.color, "#c45a6a");
    }

    #[test]
    fn agent_file_default_color_not_written_to_markdown() {
        let agent = AgentFile {
            filename: "default.md".to_string(),
            name: "Default".to_string(),
            description: String::new(),
            tools: None,
            model: None,
            system_prompt: "prompt".to_string(),
            is_global: false,
            color: "#5a8a5c".to_string(),
        };
        let md = agent.to_markdown();
        assert!(!md.contains("color:"));
    }
}
