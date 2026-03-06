use crate::models::{ExecutionMode, Feature, TaskSpec};
use serde::{Deserialize, Serialize};

/// Post-execution analysis comparing what was planned vs what was built.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionAnalysis {
    pub feature_id: String,
    pub planned_task_count: u32,
    pub files_changed: u32,
    pub task_file_coverage: Vec<TaskCoverage>,
    pub unplanned_files: Vec<String>,
    pub execution_mode_used: Option<ExecutionMode>,
    pub mode_assessment: ModeAssessment,
}

/// How well a planned task maps to actual file changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCoverage {
    pub task_title: String,
    pub agent: String,
    pub likely_files: Vec<String>,
    pub coverage_status: CoverageStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CoverageStatus {
    Covered,
    Partial,
    NoChangesDetected,
}

/// Assessment of whether the chosen execution mode was appropriate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModeAssessment {
    pub mode_used: Option<String>,
    pub was_appropriate: bool,
    pub reason: String,
    pub suggestion: Option<String>,
}

/// Analyze a completed feature execution by comparing planned tasks against actual file changes.
pub fn analyze_execution(
    feature: &Feature,
    changed_files: &[String],
) -> ExecutionAnalysis {
    let task_coverages: Vec<TaskCoverage> = feature
        .task_specs
        .iter()
        .map(|task| assess_task_coverage(task, changed_files))
        .collect();

    // Files that don't seem to match any task's keywords
    let task_keywords: Vec<String> = feature
        .task_specs
        .iter()
        .flat_map(|t| extract_keywords(&t.title, &t.description))
        .collect();
    let unplanned_files: Vec<String> = changed_files
        .iter()
        .filter(|f| !file_matches_any_keyword(f, &task_keywords))
        .cloned()
        .collect();

    let mode_assessment = assess_mode(feature, changed_files);

    ExecutionAnalysis {
        feature_id: feature.id.clone(),
        planned_task_count: feature.task_specs.len() as u32,
        files_changed: changed_files.len() as u32,
        task_file_coverage: task_coverages,
        unplanned_files,
        execution_mode_used: feature.execution_mode.clone(),
        mode_assessment,
    }
}

fn assess_task_coverage(task: &TaskSpec, changed_files: &[String]) -> TaskCoverage {
    let keywords = extract_keywords(&task.title, &task.description);
    let likely_files: Vec<String> = changed_files
        .iter()
        .filter(|f| file_matches_any_keyword(f, &keywords))
        .cloned()
        .collect();

    let status = if likely_files.is_empty() {
        CoverageStatus::NoChangesDetected
    } else if likely_files.len() >= 2 {
        CoverageStatus::Covered
    } else {
        CoverageStatus::Partial
    };

    TaskCoverage {
        task_title: task.title.clone(),
        agent: task.agent.clone(),
        likely_files,
        coverage_status: status,
    }
}

/// Extract relevant keywords from task title and description for file matching.
fn extract_keywords(title: &str, description: &str) -> Vec<String> {
    let combined = format!("{} {}", title, description);
    let stop_words = [
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "shall",
        "should", "may", "might", "must", "can", "could", "to", "of", "in",
        "for", "on", "with", "at", "by", "from", "as", "into", "through",
        "and", "or", "but", "not", "no", "this", "that", "these", "those",
        "it", "its", "all", "each", "every", "both", "few", "more", "most",
        "new", "add", "create", "implement", "write", "update", "fix",
    ];

    combined
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3 && !stop_words.contains(w))
        .map(|w| w.to_string())
        .collect()
}

fn file_matches_any_keyword(filepath: &str, keywords: &[String]) -> bool {
    let filepath_lower = filepath.to_lowercase();
    keywords
        .iter()
        .any(|kw| filepath_lower.contains(kw.as_str()))
}

fn assess_mode(feature: &Feature, changed_files: &[String]) -> ModeAssessment {
    let mode_str = feature.execution_mode.as_ref().map(|m| match m {
        ExecutionMode::Teams => "teams",
        ExecutionMode::Subagents => "subagents",
    });

    if feature.task_specs.is_empty() {
        return ModeAssessment {
            mode_used: mode_str.map(|s| s.to_string()),
            was_appropriate: true,
            reason: "No tasks were defined, so mode choice is irrelevant.".to_string(),
            suggestion: None,
        };
    }

    // Analyze task independence: do tasks share files?
    let task_count = feature.task_specs.len();
    let independent_tasks = count_independent_tasks(&feature.task_specs);
    let file_overlap = calculate_file_overlap(&feature.task_specs, changed_files);

    match &feature.execution_mode {
        Some(ExecutionMode::Teams) => {
            if task_count < 3 || independent_tasks < 2 {
                ModeAssessment {
                    mode_used: Some("teams".to_string()),
                    was_appropriate: false,
                    reason: format!(
                        "Teams mode was used but only {} of {} tasks were independent. Subagents may have been more efficient.",
                        independent_tasks, task_count
                    ),
                    suggestion: Some("Consider Subagents mode for features with sequential dependencies.".to_string()),
                }
            } else if file_overlap > 0.5 {
                ModeAssessment {
                    mode_used: Some("teams".to_string()),
                    was_appropriate: false,
                    reason: format!(
                        "Teams mode was used but {:.0}% of files were touched by multiple tasks. This can cause merge conflicts.",
                        file_overlap * 100.0
                    ),
                    suggestion: Some("Consider Subagents mode when tasks modify overlapping files.".to_string()),
                }
            } else {
                ModeAssessment {
                    mode_used: Some("teams".to_string()),
                    was_appropriate: true,
                    reason: format!(
                        "Good choice: {} of {} tasks were independent with low file overlap.",
                        independent_tasks, task_count
                    ),
                    suggestion: None,
                }
            }
        }
        Some(ExecutionMode::Subagents) => {
            if task_count >= 4 && independent_tasks >= 3 && file_overlap < 0.2 {
                ModeAssessment {
                    mode_used: Some("subagents".to_string()),
                    was_appropriate: false,
                    reason: format!(
                        "Subagents mode was used but {} of {} tasks were independent with little file overlap. Teams mode could have parallelized this work.",
                        independent_tasks, task_count
                    ),
                    suggestion: Some("Consider Teams mode for 4+ independent tasks touching different files.".to_string()),
                }
            } else {
                ModeAssessment {
                    mode_used: Some("subagents".to_string()),
                    was_appropriate: true,
                    reason: "Good choice: tasks had dependencies or shared files requiring coordination.".to_string(),
                    suggestion: None,
                }
            }
        }
        None => ModeAssessment {
            mode_used: None,
            was_appropriate: true,
            reason: "No execution mode was set.".to_string(),
            suggestion: None,
        },
    }
}

fn count_independent_tasks(tasks: &[TaskSpec]) -> usize {
    tasks.iter().filter(|t| t.dependencies.is_empty()).count()
}

fn calculate_file_overlap(tasks: &[TaskSpec], changed_files: &[String]) -> f64 {
    if changed_files.is_empty() || tasks.len() < 2 {
        return 0.0;
    }

    let task_files: Vec<Vec<String>> = tasks
        .iter()
        .map(|task| {
            let keywords = extract_keywords(&task.title, &task.description);
            changed_files
                .iter()
                .filter(|f| file_matches_any_keyword(f, &keywords))
                .cloned()
                .collect()
        })
        .collect();

    let mut overlap_count = 0u32;
    for file in changed_files {
        let matching_tasks = task_files
            .iter()
            .filter(|files| files.contains(file))
            .count();
        if matching_tasks > 1 {
            overlap_count += 1;
        }
    }

    overlap_count as f64 / changed_files.len() as f64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Feature;

    fn make_feature_with_tasks() -> Feature {
        let mut f = Feature::new(
            vec!["repo-1".to_string()],
            "Test Feature".to_string(),
            "Test description".to_string(),
            "feature/test-1234".to_string(),
        );
        f.execution_mode = Some(ExecutionMode::Teams);
        f.task_specs = vec![
            TaskSpec {
                title: "Add auth middleware".to_string(),
                description: "Create authentication middleware for API routes".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec![],
                agent: "backend-developer".to_string(),
            },
            TaskSpec {
                title: "Create login component".to_string(),
                description: "Build React login form with validation".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec![],
                agent: "frontend-developer".to_string(),
            },
            TaskSpec {
                title: "Write auth tests".to_string(),
                description: "Test authentication flow end to end".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec!["1".to_string(), "2".to_string()],
                agent: "test-engineer".to_string(),
            },
        ];
        f
    }

    #[test]
    fn analyze_execution_basic() {
        let feature = make_feature_with_tasks();
        let files = vec![
            "src/middleware/auth.rs".to_string(),
            "src/components/Login.tsx".to_string(),
            "tests/auth.test.ts".to_string(),
        ];
        let analysis = analyze_execution(&feature, &files);
        assert_eq!(analysis.planned_task_count, 3);
        assert_eq!(analysis.files_changed, 3);
        assert_eq!(analysis.task_file_coverage.len(), 3);
    }

    #[test]
    fn analyze_execution_detects_unplanned_files() {
        let feature = make_feature_with_tasks();
        let files = vec![
            "src/middleware/auth.rs".to_string(),
            "package.json".to_string(),
            "random-config.yaml".to_string(),
        ];
        let analysis = analyze_execution(&feature, &files);
        assert!(analysis.unplanned_files.contains(&"package.json".to_string()));
    }

    #[test]
    fn analyze_execution_no_tasks() {
        let feature = Feature::new(
            vec!["r1".to_string()],
            "Empty".to_string(),
            "desc".to_string(),
            "feature/empty-1234".to_string(),
        );
        let analysis = analyze_execution(&feature, &["file.rs".to_string()]);
        assert_eq!(analysis.planned_task_count, 0);
        assert!(analysis.mode_assessment.was_appropriate);
    }

    #[test]
    fn extract_keywords_filters_stop_words() {
        let keywords = extract_keywords("Add new auth module", "Create the authentication system");
        assert!(keywords.contains(&"auth".to_string()));
        assert!(keywords.contains(&"module".to_string()));
        assert!(!keywords.contains(&"the".to_string()));
        assert!(!keywords.contains(&"add".to_string()));
    }

    #[test]
    fn file_matches_keyword() {
        let keywords = vec!["auth".to_string(), "login".to_string()];
        assert!(file_matches_any_keyword("src/auth/handler.rs", &keywords));
        assert!(file_matches_any_keyword("components/LoginForm.tsx", &keywords));
        assert!(!file_matches_any_keyword("src/utils/format.ts", &keywords));
    }

    #[test]
    fn mode_assessment_teams_with_few_independent() {
        let mut feature = make_feature_with_tasks();
        feature.execution_mode = Some(ExecutionMode::Teams);
        // Make all tasks dependent
        feature.task_specs[0].dependencies = vec![];
        feature.task_specs[1].dependencies = vec!["1".to_string()];
        feature.task_specs[2].dependencies = vec!["2".to_string()];
        let assessment = assess_mode(&feature, &[]);
        assert!(!assessment.was_appropriate);
        assert!(assessment.suggestion.is_some());
    }

    #[test]
    fn mode_assessment_subagents_appropriate() {
        let mut feature = make_feature_with_tasks();
        feature.execution_mode = Some(ExecutionMode::Subagents);
        feature.task_specs[1].dependencies = vec!["1".to_string()];
        let assessment = assess_mode(&feature, &[]);
        assert!(assessment.was_appropriate);
    }

    #[test]
    fn count_independent_tasks_works() {
        let tasks = vec![
            TaskSpec {
                title: "A".to_string(),
                description: "a".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec![],
                agent: "dev".to_string(),
            },
            TaskSpec {
                title: "B".to_string(),
                description: "b".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec!["1".to_string()],
                agent: "dev".to_string(),
            },
            TaskSpec {
                title: "C".to_string(),
                description: "c".to_string(),
                acceptance_criteria: vec![],
                dependencies: vec![],
                agent: "dev".to_string(),
            },
        ];
        assert_eq!(count_independent_tasks(&tasks), 2);
    }

    #[test]
    fn coverage_status_no_changes() {
        let task = TaskSpec {
            title: "Obscure task".to_string(),
            description: "Something very specific".to_string(),
            acceptance_criteria: vec![],
            dependencies: vec![],
            agent: "dev".to_string(),
        };
        let coverage = assess_task_coverage(&task, &["totally_unrelated.rs".to_string()]);
        assert_eq!(coverage.coverage_status, CoverageStatus::NoChangesDetected);
    }
}
