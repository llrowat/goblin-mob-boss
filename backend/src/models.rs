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

/// Per-repo branch info for a multi-repo feature.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureRepo {
    pub repo_id: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub id: String,
    /// Primary repo (first in the list). Kept for backwards compatibility.
    #[serde(default)]
    pub repo_id: String,
    /// All repos this feature spans, with per-repo branch info.
    #[serde(default)]
    pub repos: Vec<FeatureRepo>,
    pub name: String,
    pub description: String,
    /// Primary branch name (matches first repo). Kept for backwards compat.
    #[serde(default)]
    pub branch: String,
    pub status: FeatureStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Feature {
    pub fn new(repos: Vec<FeatureRepo>, name: String, description: String) -> Self {
        let now = Utc::now();
        let repo_id = repos.first().map(|r| r.repo_id.clone()).unwrap_or_default();
        let branch = repos.first().map(|r| r.branch.clone()).unwrap_or_default();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            repo_id,
            repos,
            name,
            description,
            branch,
            status: FeatureStatus::Ideation,
            created_at: now,
            updated_at: now,
        }
    }

    /// Get the branch for a specific repo, or None.
    pub fn branch_for_repo(&self, repo_id: &str) -> Option<&str> {
        self.repos
            .iter()
            .find(|r| r.repo_id == repo_id)
            .map(|r| r.branch.as_str())
    }

    /// Get all repo IDs this feature spans.
    pub fn repo_ids(&self) -> Vec<&str> {
        if self.repos.is_empty() {
            // Backwards compat: old features only have repo_id
            if self.repo_id.is_empty() {
                vec![]
            } else {
                vec![self.repo_id.as_str()]
            }
        } else {
            self.repos.iter().map(|r| r.repo_id.as_str()).collect()
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
    /// Target repo name or ID (for multi-repo features). Empty = first/primary repo.
    #[serde(default)]
    pub repo: String,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_new_single_repo() {
        let repos = vec![FeatureRepo {
            repo_id: "repo-1".to_string(),
            branch: "feature/auth-ab12".to_string(),
        }];
        let feature = Feature::new(repos, "Auth".to_string(), "Add auth".to_string());

        assert_eq!(feature.repo_id, "repo-1");
        assert_eq!(feature.branch, "feature/auth-ab12");
        assert_eq!(feature.repos.len(), 1);
        assert_eq!(feature.status, FeatureStatus::Ideation);
        assert_eq!(feature.repo_ids(), vec!["repo-1"]);
        assert_eq!(feature.branch_for_repo("repo-1"), Some("feature/auth-ab12"));
    }

    #[test]
    fn feature_new_multi_repo() {
        let repos = vec![
            FeatureRepo {
                repo_id: "repo-1".to_string(),
                branch: "feature/auth-ab12".to_string(),
            },
            FeatureRepo {
                repo_id: "repo-2".to_string(),
                branch: "feature/auth-ab12".to_string(),
            },
        ];
        let feature = Feature::new(repos, "Auth".to_string(), "Add auth".to_string());

        assert_eq!(feature.repo_id, "repo-1"); // primary = first
        assert_eq!(feature.repos.len(), 2);
        assert_eq!(feature.repo_ids(), vec!["repo-1", "repo-2"]);
        assert_eq!(feature.branch_for_repo("repo-2"), Some("feature/auth-ab12"));
        assert_eq!(feature.branch_for_repo("repo-3"), None);
    }

    #[test]
    fn feature_backwards_compat_deserialize() {
        // Old features only had repo_id and branch, no repos vec
        let json = r#"{
            "id": "feat-1",
            "repo_id": "repo-old",
            "name": "Legacy",
            "description": "Old feature",
            "branch": "feature/legacy-1234",
            "status": "in_progress",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z"
        }"#;
        let feature: Feature = serde_json::from_str(json).unwrap();

        assert_eq!(feature.repo_id, "repo-old");
        assert!(feature.repos.is_empty());
        // repo_ids() falls back to repo_id for backwards compat
        assert_eq!(feature.repo_ids(), vec!["repo-old"]);
    }

    #[test]
    fn taskspec_with_repo_field() {
        let json = r#"{
            "title": "Add API endpoint",
            "description": "Backend work",
            "acceptance_criteria": ["tests pass"],
            "repo": "backend-service"
        }"#;
        let spec: TaskSpec = serde_json::from_str(json).unwrap();
        assert_eq!(spec.repo, "backend-service");
        assert_eq!(spec.agent, ""); // default
    }

    #[test]
    fn taskspec_without_repo_field() {
        let json = r#"{
            "title": "Add button",
            "description": "Frontend work",
            "acceptance_criteria": []
        }"#;
        let spec: TaskSpec = serde_json::from_str(json).unwrap();
        assert_eq!(spec.repo, ""); // default empty
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
        assert_eq!(parsed.total_deletions, 2);
        assert_eq!(parsed.files.len(), 2);
        assert_eq!(parsed.files[0].path, "src/main.rs");
    }

    #[test]
    fn feature_serializes_with_repos() {
        let repos = vec![
            FeatureRepo {
                repo_id: "r1".to_string(),
                branch: "feature/x-1234".to_string(),
            },
            FeatureRepo {
                repo_id: "r2".to_string(),
                branch: "feature/x-1234".to_string(),
            },
        ];
        let feature = Feature::new(repos, "X".to_string(), "desc".to_string());
        let json = serde_json::to_string(&feature).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert!(parsed["repos"].is_array());
        assert_eq!(parsed["repos"].as_array().unwrap().len(), 2);
        assert_eq!(parsed["repo_id"], "r1");
    }
}
