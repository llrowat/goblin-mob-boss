use crate::models::{ExecutionMode, TaskSpec};
use serde::{Deserialize, Serialize};

/// Analysis of task dependencies and structure to recommend an execution mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModeRecommendation {
    pub recommended_mode: ExecutionMode,
    pub confidence: f32,
    pub reasoning: Vec<String>,
    pub task_graph: TaskGraph,
}

/// A visual representation of task dependencies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskGraph {
    pub nodes: Vec<TaskNode>,
    pub edges: Vec<TaskEdge>,
    pub parallelism_score: f32,
    pub max_parallel: u32,
    pub critical_path_length: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskNode {
    pub index: u32,
    pub title: String,
    pub agent: String,
    pub depth: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEdge {
    pub from: u32,
    pub to: u32,
}

/// Analyze task specs and recommend the best execution mode.
pub fn analyze_tasks(tasks: &[TaskSpec]) -> ModeRecommendation {
    if tasks.is_empty() {
        return ModeRecommendation {
            recommended_mode: ExecutionMode::Subagents,
            confidence: 0.5,
            reasoning: vec!["No tasks defined — defaulting to Subagents.".to_string()],
            task_graph: empty_graph(),
        };
    }

    let graph = build_task_graph(tasks);
    let mut reasoning = Vec::new();
    let mut teams_score: f32 = 0.0;

    // Factor 1: Number of tasks
    let task_count = tasks.len();
    if task_count >= 4 {
        teams_score += 0.25;
        reasoning.push(format!(
            "{} tasks — enough to benefit from parallelism.",
            task_count
        ));
    } else {
        teams_score -= 0.15;
        reasoning.push(format!(
            "Only {} tasks — limited parallelism benefit.",
            task_count
        ));
    }

    // Factor 2: Parallelism (independent tasks)
    let independent = tasks.iter().filter(|t| t.dependencies.is_empty()).count();
    let parallelism_ratio = independent as f32 / task_count as f32;
    if parallelism_ratio >= 0.5 {
        teams_score += 0.3;
        reasoning.push(format!(
            "{} of {} tasks are independent — good parallelism potential.",
            independent, task_count
        ));
    } else {
        teams_score -= 0.2;
        reasoning.push(format!(
            "Only {} of {} tasks are independent — heavy dependencies limit parallelism.",
            independent, task_count
        ));
    }

    // Factor 3: Agent diversity
    let unique_agents: std::collections::HashSet<&str> = tasks
        .iter()
        .filter(|t| !t.agent.is_empty())
        .map(|t| t.agent.as_str())
        .collect();
    if unique_agents.len() >= 3 {
        teams_score += 0.2;
        reasoning.push(format!(
            "{} different agents — Teams can assign specialized work.",
            unique_agents.len()
        ));
    } else if unique_agents.len() <= 1 {
        teams_score -= 0.1;
        reasoning.push("Single agent type — Subagents may be simpler.".to_string());
    }

    // Factor 4: Critical path length
    if graph.critical_path_length > 0 {
        let cpl_ratio = graph.critical_path_length as f32 / task_count as f32;
        if cpl_ratio < 0.5 {
            teams_score += 0.15;
            reasoning.push(format!(
                "Short critical path ({} of {} tasks) — parallelism effective.",
                graph.critical_path_length, task_count
            ));
        } else {
            teams_score -= 0.1;
            reasoning.push(format!(
                "Long critical path ({} of {} tasks) — limited parallelism.",
                graph.critical_path_length, task_count
            ));
        }
    }

    let recommended_mode = if teams_score > 0.2 {
        ExecutionMode::Teams
    } else {
        ExecutionMode::Subagents
    };

    let confidence = (0.5 + teams_score.abs()).clamp(0.3, 0.95);

    ModeRecommendation {
        recommended_mode,
        confidence,
        reasoning,
        task_graph: graph,
    }
}

fn build_task_graph(tasks: &[TaskSpec]) -> TaskGraph {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    // Compute depth for each task (longest path from root)
    let depths = compute_depths(tasks);

    for (i, task) in tasks.iter().enumerate() {
        nodes.push(TaskNode {
            index: i as u32,
            title: task.title.clone(),
            agent: task.agent.clone(),
            depth: depths[i],
        });

        for dep in &task.dependencies {
            if let Ok(dep_idx) = dep.parse::<u32>() {
                // Dependencies are 1-indexed in task specs
                if dep_idx > 0 && (dep_idx as usize) <= tasks.len() {
                    edges.push(TaskEdge {
                        from: dep_idx - 1,
                        to: i as u32,
                    });
                }
            }
        }
    }

    let max_depth = depths.iter().copied().max().unwrap_or(0);
    let critical_path_length = max_depth + 1;

    // Max tasks at the same depth level
    let max_parallel = if !depths.is_empty() {
        (0..=max_depth)
            .map(|d| depths.iter().filter(|&&depth| depth == d).count() as u32)
            .max()
            .unwrap_or(1)
    } else {
        0
    };

    let parallelism_score = if tasks.is_empty() {
        0.0
    } else {
        max_parallel as f32 / tasks.len() as f32
    };

    TaskGraph {
        nodes,
        edges,
        parallelism_score,
        max_parallel,
        critical_path_length,
    }
}

fn compute_depths(tasks: &[TaskSpec]) -> Vec<u32> {
    let n = tasks.len();
    let mut depths = vec![0u32; n];
    let mut resolved = vec![false; n];

    // Simple iterative depth computation (handles DAGs)
    let mut changed = true;
    let mut iterations = 0;
    while changed && iterations < n + 1 {
        changed = false;
        iterations += 1;
        for (i, task) in tasks.iter().enumerate() {
            if task.dependencies.is_empty() {
                if !resolved[i] {
                    resolved[i] = true;
                }
                continue;
            }

            let mut max_dep_depth = 0u32;
            let mut all_deps_resolved = true;
            for dep in &task.dependencies {
                if let Ok(dep_idx) = dep.parse::<usize>() {
                    let dep_idx = dep_idx.saturating_sub(1);
                    if dep_idx < n {
                        if resolved[dep_idx] {
                            max_dep_depth = max_dep_depth.max(depths[dep_idx]);
                        } else {
                            all_deps_resolved = false;
                        }
                    }
                }
            }

            if all_deps_resolved {
                let new_depth = max_dep_depth + 1;
                if new_depth != depths[i] || !resolved[i] {
                    depths[i] = new_depth;
                    resolved[i] = true;
                    changed = true;
                }
            }
        }
    }

    depths
}

fn empty_graph() -> TaskGraph {
    TaskGraph {
        nodes: vec![],
        edges: vec![],
        parallelism_score: 0.0,
        max_parallel: 0,
        critical_path_length: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_tasks(specs: Vec<(&str, &str, Vec<&str>)>) -> Vec<TaskSpec> {
        specs
            .into_iter()
            .map(|(title, agent, deps)| TaskSpec {
                title: title.to_string(),
                description: format!("Description for {}", title),
                acceptance_criteria: vec![],
                dependencies: deps.iter().map(|d| d.to_string()).collect(),
                agent: agent.to_string(),
            })
            .collect()
    }

    #[test]
    fn analyze_empty_tasks() {
        let rec = analyze_tasks(&[]);
        assert!(matches!(rec.recommended_mode, ExecutionMode::Subagents));
        assert_eq!(rec.confidence, 0.5);
    }

    #[test]
    fn analyze_highly_parallel_tasks_recommends_teams() {
        let tasks = make_tasks(vec![
            ("Backend API", "backend-dev", vec![]),
            ("Frontend UI", "frontend-dev", vec![]),
            ("Database schema", "backend-dev", vec![]),
            ("CSS styling", "frontend-dev", vec![]),
            ("Write tests", "test-engineer", vec!["1", "2", "3", "4"]),
        ]);
        let rec = analyze_tasks(&tasks);
        assert!(matches!(rec.recommended_mode, ExecutionMode::Teams));
        assert!(rec.confidence > 0.5);
    }

    #[test]
    fn analyze_sequential_tasks_recommends_subagents() {
        let tasks = make_tasks(vec![
            ("Step 1", "dev", vec![]),
            ("Step 2", "dev", vec!["1"]),
            ("Step 3", "dev", vec!["2"]),
        ]);
        let rec = analyze_tasks(&tasks);
        assert!(matches!(rec.recommended_mode, ExecutionMode::Subagents));
    }

    #[test]
    fn task_graph_structure() {
        let tasks = make_tasks(vec![
            ("A", "dev", vec![]),
            ("B", "dev", vec![]),
            ("C", "dev", vec!["1", "2"]),
        ]);
        let rec = analyze_tasks(&tasks);
        assert_eq!(rec.task_graph.nodes.len(), 3);
        assert_eq!(rec.task_graph.edges.len(), 2);
        // A and B are at depth 0, C is at depth 1
        assert_eq!(rec.task_graph.nodes[0].depth, 0);
        assert_eq!(rec.task_graph.nodes[1].depth, 0);
        assert_eq!(rec.task_graph.nodes[2].depth, 1);
        assert_eq!(rec.task_graph.max_parallel, 2);
        assert_eq!(rec.task_graph.critical_path_length, 2);
    }

    #[test]
    fn compute_depths_linear_chain() {
        let tasks = make_tasks(vec![
            ("A", "dev", vec![]),
            ("B", "dev", vec!["1"]),
            ("C", "dev", vec!["2"]),
        ]);
        let depths = compute_depths(&tasks);
        assert_eq!(depths, vec![0, 1, 2]);
    }

    #[test]
    fn compute_depths_diamond() {
        let tasks = make_tasks(vec![
            ("A", "dev", vec![]),
            ("B", "dev", vec!["1"]),
            ("C", "dev", vec!["1"]),
            ("D", "dev", vec!["2", "3"]),
        ]);
        let depths = compute_depths(&tasks);
        assert_eq!(depths, vec![0, 1, 1, 2]);
    }

    #[test]
    fn compute_depths_all_independent() {
        let tasks = make_tasks(vec![
            ("A", "dev", vec![]),
            ("B", "dev", vec![]),
            ("C", "dev", vec![]),
        ]);
        let depths = compute_depths(&tasks);
        assert_eq!(depths, vec![0, 0, 0]);
    }

    #[test]
    fn parallelism_score_all_parallel() {
        let tasks = make_tasks(vec![
            ("A", "dev-a", vec![]),
            ("B", "dev-b", vec![]),
            ("C", "dev-c", vec![]),
            ("D", "dev-d", vec![]),
        ]);
        let rec = analyze_tasks(&tasks);
        assert_eq!(rec.task_graph.max_parallel, 4);
        assert!((rec.task_graph.parallelism_score - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn reasoning_includes_agent_diversity() {
        let tasks = make_tasks(vec![
            ("A", "backend-dev", vec![]),
            ("B", "frontend-dev", vec![]),
            ("C", "test-engineer", vec![]),
            ("D", "devops-engineer", vec![]),
        ]);
        let rec = analyze_tasks(&tasks);
        let has_agent_reason = rec.reasoning.iter().any(|r| r.contains("agent"));
        assert!(has_agent_reason);
    }

    #[test]
    fn confidence_clamped() {
        // Even with very strong signals, confidence should not exceed 0.95
        let tasks = make_tasks(vec![
            ("A", "dev-a", vec![]),
            ("B", "dev-b", vec![]),
            ("C", "dev-c", vec![]),
            ("D", "dev-d", vec![]),
            ("E", "dev-e", vec![]),
            ("F", "dev-f", vec![]),
        ]);
        let rec = analyze_tasks(&tasks);
        assert!(rec.confidence <= 0.95);
        assert!(rec.confidence >= 0.3);
    }
}
