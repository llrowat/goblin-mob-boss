use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskPhase {
    Plan,
    Code,
    Verify,
    Ready,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub schema: String,
    pub task_id: String,
    pub repo_id: String,
    pub title: String,
    pub description: String,
    pub phase: TaskPhase,
    pub status: TaskStatus,
    pub base_branch: String,
    pub branch: String,
    pub worktree_path: String,
    pub acceptance_criteria: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub timestamp: DateTime<Utc>,
    #[serde(flatten)]
    pub data: serde_json::Value,
}

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

impl Repository {
    pub fn new(name: String, path: String, base_branch: String, validators: Vec<String>, pr_command: Option<String>) -> Self {
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
