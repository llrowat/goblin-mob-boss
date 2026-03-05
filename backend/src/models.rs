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
    pub max_parallel_agents: u32,
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
            max_parallel_agents: 4,
            created_at: Utc::now(),
        }
    }
}

// ── Ideation ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum IdeationStatus {
    Running,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ideation {
    pub id: String,
    pub repo_id: String,
    pub description: String,
    pub status: IdeationStatus,
    pub created_at: DateTime<Utc>,
}

impl Ideation {
    pub fn new(repo_id: String, description: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            repo_id,
            description,
            status: IdeationStatus::Running,
            created_at: Utc::now(),
        }
    }
}

// ── Task ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub task_id: String,
    pub ideation_id: String,
    pub repo_id: String,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
    pub dependencies: Vec<String>,
    pub status: TaskStatus,
    pub branch: String,
    pub worktree_path: String,
    pub agent_pid: Option<u32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ── Task file format (written by ideation agent, read by app) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpec {
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
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
