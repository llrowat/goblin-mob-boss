use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Repository ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub path: String,
    pub base_branch: String,
    #[serde(default)]
    pub description: String,
    pub validators: Vec<String>,
    pub pr_command: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl Repository {
    pub fn new(
        name: String,
        path: String,
        base_branch: String,
        description: String,
        validators: Vec<String>,
        pr_command: Option<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            path,
            base_branch,
            description,
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
    /// Agent role: "developer", "quality", "infrastructure", "documentation", "explorer".
    /// Quality agents are automatically included as verification steps in planning.
    #[serde(default = "default_agent_role")]
    pub role: String,
}

fn default_agent_color() -> String {
    "#5a8a5c".to_string()
}

fn default_agent_role() -> String {
    "developer".to_string()
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
                role: default_agent_role(),
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
        let mut role = default_agent_role();

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
                    "role" => role = value.to_string(),
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
            role,
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
        if self.role != default_agent_role() {
            fm.push_str(&format!("role: \"{}\"\n", self.role));
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
    /// The shell command that was executed when launching Claude Code.
    #[serde(default)]
    pub launched_command: Option<String>,
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
            launched_command: None,
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

// ── Task Progress ──
// Written by Claude during execution to track task and acceptance criteria completion.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProgress {
    pub tasks: Vec<TaskProgressEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProgressEntry {
    /// 1-based task number matching the plan
    pub task: u32,
    pub title: String,
    #[serde(default)]
    pub status: TaskStatus,
    #[serde(default)]
    pub acceptance_criteria: Vec<CriterionProgress>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Done,
}

impl Default for TaskStatus {
    fn default() -> Self {
        TaskStatus::Pending
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CriterionProgress {
    pub criterion: String,
    #[serde(default)]
    pub done: bool,
}

// ── Planning Questions ──
// When the planner encounters ambiguity, it writes questions.json instead of plan.json.
// The user answers in the UI, then ideation resumes with answers as context.

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    SingleChoice,
    FreeText,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanningQuestion {
    pub id: String,
    pub question: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    #[serde(rename = "type")]
    pub question_type: QuestionType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanningAnswer {
    pub id: String,
    pub question: String,
    pub answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionsFile {
    pub questions: Vec<PlanningQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnswersFile {
    pub answers: Vec<PlanningAnswer>,
}

// ── Ideation Discovery Result ──
// What the ideation prompt outputs (tasks + execution mode recommendation).

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdeationResult {
    #[serde(default)]
    pub tasks: Vec<TaskSpec>,
    #[serde(default)]
    pub execution_mode: Option<ExecutionRecommendation>,
    #[serde(default)]
    pub questions: Option<Vec<PlanningQuestion>>,
    /// Previously answered questions for display in the UI.
    #[serde(default)]
    pub answered_questions: Option<Vec<PlanningAnswer>>,
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

// ── System Map ──
// Structural model of how services/components communicate across a system.

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceType {
    Backend,
    Frontend,
    Worker,
    Gateway,
    Database,
    Queue,
    Cache,
    External,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionType {
    Rest,
    Grpc,
    Graphql,
    Websocket,
    Event,
    SharedDb,
    FileSystem,
    Ipc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceEndpoint {
    #[serde(rename = "type")]
    pub endpoint_type: ConnectionType,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceDependency {
    #[serde(rename = "type")]
    pub dep_type: ConnectionType,
    pub target: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_sync")]
    pub sync: bool,
}

fn default_sync() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapService {
    pub id: String,
    pub name: String,
    pub service_type: ServiceType,
    #[serde(default)]
    pub repo_id: Option<String>,
    #[serde(default)]
    pub runtime: String,
    #[serde(default)]
    pub framework: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub exposes: Vec<ServiceEndpoint>,
    #[serde(default)]
    pub consumes: Vec<ServiceDependency>,
    #[serde(default)]
    pub owns_data: Vec<String>,
    /// Position on the map canvas (x, y)
    #[serde(default)]
    pub position: (f64, f64),
    /// Hex color for the service node
    #[serde(default = "default_service_color")]
    pub color: String,
}

fn default_service_color() -> String {
    "#5a8a5c".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapConnection {
    pub id: String,
    pub from_service: String,
    pub to_service: String,
    pub connection_type: ConnectionType,
    #[serde(default = "default_sync")]
    pub sync: bool,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMap {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub services: Vec<MapService>,
    pub connections: Vec<MapConnection>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Raw discovery result from a single repo scan — parsed from the agent's JSON output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryResult {
    #[serde(default)]
    pub repo_name: String,
    #[serde(default)]
    pub services: Vec<DiscoveredService>,
    #[serde(default)]
    pub connections: Vec<DiscoveredConnection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredService {
    pub name: String,
    #[serde(default = "default_backend_type")]
    pub service_type: String,
    #[serde(default)]
    pub runtime: String,
    #[serde(default)]
    pub framework: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub owns_data: Vec<String>,
    #[serde(default)]
    pub exposes: Vec<ServiceEndpoint>,
    #[serde(default)]
    pub consumes: Vec<ServiceDependency>,
}

fn default_backend_type() -> String {
    "backend".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredConnection {
    pub from: String,
    pub to: String,
    #[serde(default = "default_rest_type")]
    pub connection_type: String,
    #[serde(default = "default_sync")]
    pub sync: bool,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub description: String,
}

fn default_rest_type() -> String {
    "rest".to_string()
}

impl SystemMap {
    pub fn new(name: String, description: String) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            description,
            services: vec![],
            connections: vec![],
            created_at: now,
            updated_at: now,
        }
    }
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
    fn feature_launched_command_defaults_none() {
        let json = r#"{
            "id": "feat-1",
            "repo_ids": ["r1"],
            "name": "Test",
            "description": "desc",
            "branch": "feature/test-1234",
            "status": "ideation",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z"
        }"#;
        let feature: Feature = serde_json::from_str(json).unwrap();
        assert!(feature.launched_command.is_none());
    }

    #[test]
    fn feature_launched_command_serializes() {
        let mut feature = Feature::new(
            vec!["r1".to_string()],
            "X".to_string(),
            "desc".to_string(),
            "feature/x-1234".to_string(),
        );
        feature.launched_command = Some("cd /tmp && claude --append-system-prompt 'hello'".to_string());
        let json = serde_json::to_string(&feature).unwrap();
        assert!(json.contains("launched_command"));
        let parsed: Feature = serde_json::from_str(&json).unwrap();
        assert_eq!(
            parsed.launched_command.as_deref(),
            Some("cd /tmp && claude --append-system-prompt 'hello'")
        );
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
        assert_eq!(agent.model, Some("claude-sonnet-4-5-20250514".to_string()));
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
            role: default_agent_role(),
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
            role: default_agent_role(),
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
            role: default_agent_role(),
        };
        let md = agent.to_markdown();
        assert!(!md.contains("color:"));
    }

    // ── Role Tests ──

    #[test]
    fn agent_file_parse_with_role() {
        let content = r#"---
name: "Code Reviewer"
description: "Quality specialist"
role: "quality"
---

You review code."#;
        let agent = AgentFile::parse("code-reviewer.md", content).unwrap();
        assert_eq!(agent.role, "quality");
    }

    #[test]
    fn agent_file_parse_without_role_gets_default() {
        let content = r#"---
name: "Dev"
---

You develop."#;
        let agent = AgentFile::parse("dev.md", content).unwrap();
        assert_eq!(agent.role, "developer");
    }

    #[test]
    fn agent_file_no_frontmatter_gets_default_role() {
        let agent = AgentFile::parse("test.md", "Just a prompt.").unwrap();
        assert_eq!(agent.role, "developer");
    }

    #[test]
    fn agent_file_roundtrip_with_role() {
        let agent = AgentFile {
            filename: "reviewer.md".to_string(),
            name: "Reviewer".to_string(),
            description: String::new(),
            tools: None,
            model: None,
            system_prompt: "You review.".to_string(),
            is_global: false,
            color: default_agent_color(),
            role: "quality".to_string(),
        };
        let md = agent.to_markdown();
        assert!(md.contains("role: \"quality\""));
        let parsed = AgentFile::parse("reviewer.md", &md).unwrap();
        assert_eq!(parsed.role, "quality");
    }

    #[test]
    fn agent_file_default_role_not_written_to_markdown() {
        let agent = AgentFile {
            filename: "default.md".to_string(),
            name: "Default".to_string(),
            description: String::new(),
            tools: None,
            model: None,
            system_prompt: "prompt".to_string(),
            is_global: false,
            color: default_agent_color(),
            role: default_agent_role(),
        };
        let md = agent.to_markdown();
        assert!(!md.contains("role:"));
    }

    // ── System Map Tests ──

    #[test]
    fn system_map_new_creates_empty_map() {
        let map = SystemMap::new("Platform".to_string(), "Overview".to_string());
        assert_eq!(map.name, "Platform");
        assert_eq!(map.description, "Overview");
        assert!(map.services.is_empty());
        assert!(map.connections.is_empty());
        assert!(!map.id.is_empty());
    }

    #[test]
    fn service_type_serializes() {
        let json = serde_json::to_string(&ServiceType::Backend).unwrap();
        assert_eq!(json, "\"backend\"");
        let parsed: ServiceType = serde_json::from_str("\"frontend\"").unwrap();
        assert_eq!(parsed, ServiceType::Frontend);
    }

    #[test]
    fn connection_type_serializes() {
        let json = serde_json::to_string(&ConnectionType::Event).unwrap();
        assert_eq!(json, "\"event\"");
        let parsed: ConnectionType = serde_json::from_str("\"shared_db\"").unwrap();
        assert_eq!(parsed, ConnectionType::SharedDb);
    }

    #[test]
    fn map_service_serializes_roundtrip() {
        let svc = MapService {
            id: "svc-1".to_string(),
            name: "Auth Service".to_string(),
            service_type: ServiceType::Backend,
            repo_id: Some("repo-1".to_string()),
            runtime: "node".to_string(),
            framework: "express".to_string(),
            description: "Handles auth".to_string(),
            exposes: vec![ServiceEndpoint {
                endpoint_type: ConnectionType::Rest,
                path: "/api/auth".to_string(),
                description: "Auth API".to_string(),
            }],
            consumes: vec![ServiceDependency {
                dep_type: ConnectionType::SharedDb,
                target: "postgres".to_string(),
                description: "User store".to_string(),
                sync: true,
            }],
            owns_data: vec!["users".to_string(), "sessions".to_string()],
            position: (100.0, 200.0),
            color: "#5a8a5c".to_string(),
        };
        let json = serde_json::to_string(&svc).unwrap();
        let parsed: MapService = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "Auth Service");
        assert_eq!(parsed.service_type, ServiceType::Backend);
        assert_eq!(parsed.owns_data.len(), 2);
        assert_eq!(parsed.position, (100.0, 200.0));
        assert_eq!(parsed.exposes.len(), 1);
        assert_eq!(parsed.consumes.len(), 1);
    }

    #[test]
    fn map_connection_serializes_roundtrip() {
        let conn = MapConnection {
            id: "conn-1".to_string(),
            from_service: "svc-1".to_string(),
            to_service: "svc-2".to_string(),
            connection_type: ConnectionType::Event,
            sync: false,
            label: "user.created".to_string(),
            description: "New user event".to_string(),
        };
        let json = serde_json::to_string(&conn).unwrap();
        let parsed: MapConnection = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.from_service, "svc-1");
        assert_eq!(parsed.to_service, "svc-2");
        assert_eq!(parsed.connection_type, ConnectionType::Event);
        assert!(!parsed.sync);
        assert_eq!(parsed.label, "user.created");
    }

    #[test]
    fn system_map_full_roundtrip() {
        let mut map = SystemMap::new("Test".to_string(), "Test map".to_string());
        map.services.push(MapService {
            id: "s1".to_string(),
            name: "API".to_string(),
            service_type: ServiceType::Gateway,
            repo_id: None,
            runtime: String::new(),
            framework: String::new(),
            description: String::new(),
            exposes: vec![],
            consumes: vec![],
            owns_data: vec![],
            position: (0.0, 0.0),
            color: "#b8944a".to_string(),
        });
        map.services.push(MapService {
            id: "s2".to_string(),
            name: "DB".to_string(),
            service_type: ServiceType::Database,
            repo_id: None,
            runtime: String::new(),
            framework: String::new(),
            description: String::new(),
            exposes: vec![],
            consumes: vec![],
            owns_data: vec!["all".to_string()],
            position: (300.0, 200.0),
            color: "#d4aa5a".to_string(),
        });
        map.connections.push(MapConnection {
            id: "c1".to_string(),
            from_service: "s1".to_string(),
            to_service: "s2".to_string(),
            connection_type: ConnectionType::SharedDb,
            sync: true,
            label: String::new(),
            description: String::new(),
        });

        let json = serde_json::to_string_pretty(&map).unwrap();
        let parsed: SystemMap = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "Test");
        assert_eq!(parsed.services.len(), 2);
        assert_eq!(parsed.connections.len(), 1);
        assert_eq!(
            parsed.connections[0].connection_type,
            ConnectionType::SharedDb
        );
    }

    #[test]
    fn map_service_defaults_for_missing_fields() {
        let json = r#"{
            "id": "s1",
            "name": "Minimal",
            "service_type": "worker"
        }"#;
        let svc: MapService = serde_json::from_str(json).unwrap();
        assert_eq!(svc.name, "Minimal");
        assert_eq!(svc.service_type, ServiceType::Worker);
        assert!(svc.repo_id.is_none());
        assert!(svc.runtime.is_empty());
        assert!(svc.exposes.is_empty());
        assert!(svc.consumes.is_empty());
        assert!(svc.owns_data.is_empty());
        assert_eq!(svc.position, (0.0, 0.0));
        assert_eq!(svc.color, "#5a8a5c");
    }

    #[test]
    fn service_dependency_defaults_sync_true() {
        let json = r#"{
            "type": "rest",
            "target": "other-svc",
            "description": ""
        }"#;
        let dep: ServiceDependency = serde_json::from_str(json).unwrap();
        assert!(dep.sync);
    }

    // ── Planning Questions Tests ──

    #[test]
    fn planning_question_single_choice_serializes() {
        let q = PlanningQuestion {
            id: "q1".to_string(),
            question: "Which approach?".to_string(),
            context: Some("Found two patterns".to_string()),
            options: Some(vec!["Option A".to_string(), "Option B".to_string()]),
            question_type: QuestionType::SingleChoice,
        };
        let json = serde_json::to_string(&q).unwrap();
        assert!(json.contains("\"single_choice\""));
        assert!(json.contains("\"Option A\""));
        let parsed: PlanningQuestion = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "q1");
        assert_eq!(parsed.question_type, QuestionType::SingleChoice);
        assert_eq!(parsed.options.unwrap().len(), 2);
        assert_eq!(parsed.context.unwrap(), "Found two patterns");
    }

    #[test]
    fn planning_question_free_text_serializes() {
        let q = PlanningQuestion {
            id: "q2".to_string(),
            question: "Any preferences?".to_string(),
            context: None,
            options: None,
            question_type: QuestionType::FreeText,
        };
        let json = serde_json::to_string(&q).unwrap();
        assert!(json.contains("\"free_text\""));
        assert!(!json.contains("\"context\""));
        assert!(!json.contains("\"options\""));
        let parsed: PlanningQuestion = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.question_type, QuestionType::FreeText);
        assert!(parsed.context.is_none());
        assert!(parsed.options.is_none());
    }

    #[test]
    fn questions_file_roundtrip() {
        let qf = QuestionsFile {
            questions: vec![
                PlanningQuestion {
                    id: "q1".to_string(),
                    question: "Choice?".to_string(),
                    context: Some("context".to_string()),
                    options: Some(vec!["A".to_string(), "B".to_string()]),
                    question_type: QuestionType::SingleChoice,
                },
                PlanningQuestion {
                    id: "q2".to_string(),
                    question: "Details?".to_string(),
                    context: None,
                    options: None,
                    question_type: QuestionType::FreeText,
                },
            ],
        };
        let json = serde_json::to_string_pretty(&qf).unwrap();
        let parsed: QuestionsFile = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.questions.len(), 2);
        assert_eq!(parsed.questions[0].id, "q1");
        assert_eq!(parsed.questions[1].question_type, QuestionType::FreeText);
    }

    #[test]
    fn answers_file_roundtrip() {
        let af = AnswersFile {
            answers: vec![
                PlanningAnswer {
                    id: "q1".to_string(),
                    question: "Which approach?".to_string(),
                    answer: "Option A".to_string(),
                },
                PlanningAnswer {
                    id: "q2".to_string(),
                    question: "Details?".to_string(),
                    answer: "Use the existing pattern".to_string(),
                },
            ],
        };
        let json = serde_json::to_string_pretty(&af).unwrap();
        let parsed: AnswersFile = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.answers.len(), 2);
        assert_eq!(parsed.answers[0].answer, "Option A");
        assert_eq!(parsed.answers[1].id, "q2");
    }

    #[test]
    fn ideation_result_with_questions() {
        let json = r#"{
            "tasks": [],
            "questions": [
                {
                    "id": "q1",
                    "question": "Persist in localStorage or backend?",
                    "context": "Found both patterns in the codebase",
                    "options": ["localStorage", "Backend store"],
                    "type": "single_choice"
                }
            ]
        }"#;
        let result: IdeationResult = serde_json::from_str(json).unwrap();
        assert!(result.tasks.is_empty());
        let questions = result.questions.unwrap();
        assert_eq!(questions.len(), 1);
        assert_eq!(questions[0].id, "q1");
        assert_eq!(questions[0].question_type, QuestionType::SingleChoice);
    }

    #[test]
    fn ideation_result_without_questions_defaults_none() {
        let json = r#"{
            "tasks": [{"title": "Do thing", "description": "details"}]
        }"#;
        let result: IdeationResult = serde_json::from_str(json).unwrap();
        assert!(result.questions.is_none());
        assert!(result.answered_questions.is_none());
    }

    #[test]
    fn repository_new_stores_description() {
        let repo = Repository::new(
            "my-app".to_string(),
            "/tmp/my-app".to_string(),
            "main".to_string(),
            "A React + Rust desktop app".to_string(),
            vec!["cargo test".to_string()],
            None,
        );
        assert_eq!(repo.name, "my-app");
        assert_eq!(repo.description, "A React + Rust desktop app");
        assert_eq!(repo.base_branch, "main");
    }

    #[test]
    fn repository_description_defaults_on_deserialize() {
        let json = r#"{
            "id": "repo-1",
            "name": "legacy",
            "path": "/tmp/legacy",
            "base_branch": "main",
            "validators": [],
            "pr_command": null,
            "created_at": "2025-01-01T00:00:00Z"
        }"#;
        let repo: Repository = serde_json::from_str(json).unwrap();
        assert_eq!(repo.description, "");
    }

    #[test]
    fn repository_description_roundtrips() {
        let repo = Repository::new(
            "app".to_string(),
            "/tmp/app".to_string(),
            "develop".to_string(),
            "My cool project".to_string(),
            vec![],
            Some("gh pr create".to_string()),
        );
        let json = serde_json::to_string(&repo).unwrap();
        let parsed: Repository = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.description, "My cool project");
        assert_eq!(parsed.pr_command, Some("gh pr create".to_string()));
    }
}
