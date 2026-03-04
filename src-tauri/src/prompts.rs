use std::fs;
use std::path::Path;

pub fn generate_prompts(
    worktree_path: &str,
    title: &str,
    description: &str,
    acceptance_criteria: &[String],
) -> Result<(), String> {
    let prompts_dir = Path::new(worktree_path).join(".gmb").join("prompts");
    fs::create_dir_all(&prompts_dir).map_err(|e| format!("Failed to create prompts dir: {}", e))?;

    let criteria_text = acceptance_criteria
        .iter()
        .map(|c| format!("- {}", c))
        .collect::<Vec<_>>()
        .join("\n");

    // Plan prompt
    let plan = format!(
        r#"# Task: {}

## Description
{}

## Acceptance Criteria
{}

## Instructions
1. Read the context files in `.gmb/context/` to understand the repository.
2. Propose an implementation plan.
3. List the files you will modify or create.
4. Explain your approach step by step.
5. Do NOT implement yet — only plan.
"#,
        title, description, criteria_text
    );
    fs::write(prompts_dir.join("plan.md"), plan)
        .map_err(|e| format!("Failed to write plan.md: {}", e))?;

    // Code prompt
    let code = format!(
        r#"# Task: {}

## Description
{}

## Acceptance Criteria
{}

## Instructions
1. Read the context files in `.gmb/context/` and the plan if available.
2. Implement the change.
3. Prefer minimal edits.
4. Follow existing code style and patterns.
5. Summarize what you changed.
"#,
        title, description, criteria_text
    );
    fs::write(prompts_dir.join("code.md"), code)
        .map_err(|e| format!("Failed to write code.md: {}", e))?;

    // Verify prompt
    let verify = format!(
        r#"# Task: {}

## Verification Failed

The validators reported errors. Please review the failure output below and fix the issues.

## Acceptance Criteria
{}

## Instructions
1. Read the verification results in `.gmb/results/verify/`.
2. Identify and fix the failing tests or lint errors.
3. Keep changes minimal — only fix what is broken.
4. Summarize what you fixed.
"#,
        title, criteria_text
    );
    fs::write(prompts_dir.join("verify.md"), verify)
        .map_err(|e| format!("Failed to write verify.md: {}", e))?;

    Ok(())
}
