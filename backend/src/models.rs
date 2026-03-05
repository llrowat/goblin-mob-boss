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

// ── Agent ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub system_prompt: String,
    pub is_builtin: bool,
}

impl Agent {
    pub fn new(name: String, role: String, system_prompt: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            role,
            system_prompt,
            is_builtin: false,
        }
    }
}

pub fn default_agents() -> Vec<Agent> {
    vec![
        Agent {
            id: "builtin-fullstack".to_string(),
            name: "Full-Stack Developer".to_string(),
            role: "developer".to_string(),
            system_prompt: "You are a senior full-stack developer. Write clean, well-structured code following existing patterns. Focus on correctness and maintainability.".to_string(),
            is_builtin: true,
        },
        Agent {
            id: "builtin-frontend".to_string(),
            name: "Frontend Developer".to_string(),
            role: "developer".to_string(),
            system_prompt: "You are a frontend specialist. Focus on UI components, styling, accessibility, and user experience. Follow the existing component patterns and design system.".to_string(),
            is_builtin: true,
        },
        Agent {
            id: "builtin-backend".to_string(),
            name: "Backend Developer".to_string(),
            role: "developer".to_string(),
            system_prompt: "You are a backend specialist. Focus on APIs, data models, business logic, and performance. Follow existing architecture patterns.".to_string(),
            is_builtin: true,
        },
        Agent {
            id: "builtin-test-writer".to_string(),
            name: "Test Writer".to_string(),
            role: "testing".to_string(),
            system_prompt: "You are a testing specialist. Write comprehensive tests — unit, integration, and edge cases. Follow the existing test patterns and framework conventions.".to_string(),
            is_builtin: true,
        },
        Agent {
            id: "builtin-reviewer".to_string(),
            name: "Code Reviewer".to_string(),
            role: "reviewer".to_string(),
            system_prompt: "You are a code reviewer. Review the changes for correctness, security, performance, and style. Fix any issues you find. Run all validators and ensure they pass.".to_string(),
            is_builtin: true,
        },
    ]
}

// ── Feature ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FeatureStatus {
    Ideation,
    InProgress,
    Verifying,
    Ready,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub id: String,
    pub repo_id: String,
    pub name: String,
    pub description: String,
    pub branch: String,
    pub status: FeatureStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Feature {
    pub fn new(repo_id: String, name: String, description: String, branch: String) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            repo_id,
            name,
            description,
            branch,
            status: FeatureStatus::Ideation,
            created_at: now,
            updated_at: now,
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
    Merged,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub task_id: String,
    pub feature_id: String,
    pub repo_id: String,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
    pub dependencies: Vec<String>,
    pub agent_id: String,
    pub subagent_ids: Vec<String>,
    pub status: TaskStatus,
    pub branch: String,
    pub worktree_path: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Task spec written by ideation agent, read by app.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSpec {
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub agent: String,
    #[serde(default)]
    pub subagents: Vec<String>,
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
    #[serde(default)]
    pub verification_agent_ids: Vec<String>,
}

impl Default for Preferences {
    fn default() -> Self {
        let shell = if cfg!(target_os = "windows") {
            "powershell".to_string()
        } else {
            "bash".to_string()
        };
        Self {
            shell,
            verification_agent_ids: vec![
                "builtin-test-writer".to_string(),
                "builtin-reviewer".to_string(),
            ],
        }
    }
}
