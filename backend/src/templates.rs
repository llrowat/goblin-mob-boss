use crate::models::{AgentFile, SkillFile, SkillSource};
use serde::{Deserialize, Serialize};

// ── Built-in Agents ──
// Default agent definitions seeded into ~/.claude/agents/ on first run.
// Existing user-edited files are never overwritten (smart merge).

/// Return the built-in agent definitions.
/// Used by `store::seed_global_agents()` to populate `~/.claude/agents/`.
pub fn built_in_agents() -> Vec<AgentFile> {
    vec![
        AgentFile {
            filename: "developer.md".to_string(),
            name: "Developer".to_string(),
            description: "General-purpose coding agent — frontend, backend, full-stack".to_string(),
            tools: Some("Read, Edit, Write, Bash, Glob, Grep".to_string()),
            model: None,
            system_prompt: r#"You are a software developer. You write, test, and debug code across the full stack.

When working on tasks:
- Read existing code first — follow the project's patterns, naming, and conventions
- Write unit tests alongside your implementation
- Keep changes focused — only modify what the task requires
- Validate inputs at system boundaries, handle errors with clear messages
- Use TypeScript strictly (no `any`), write semantic HTML, follow existing CSS patterns
- Keep functions small with clear responsibility boundaries"#
                .to_string(),
            is_global: true,
            color: "#5b8abd".to_string(),
            role: "developer".to_string(),
            enabled: true,
        },
        AgentFile {
            filename: "architect.md".to_string(),
            name: "Architect".to_string(),
            description: "System design, planning, and code review specialist".to_string(),
            tools: Some("Read, Glob, Grep, Bash".to_string()),
            model: None,
            system_prompt: r#"You are a software architect. You design systems, review code, and plan implementations.

Your responsibilities:
- Evaluate technical approaches and recommend the best path forward
- Review code for correctness, security (OWASP top 10), and maintainability
- Identify coupling, missing error handling, race conditions, and edge cases
- Propose task breakdowns with clear dependencies and acceptance criteria
- Assess whether work should be parallelized (teams) or sequential (subagents)

When reviewing or planning:
- Be specific — reference file paths, line numbers, and concrete examples
- Focus on correctness and security first, style second
- Consider the project's existing architecture before proposing changes
- Flag risks and trade-offs explicitly"#
                .to_string(),
            is_global: true,
            color: "#9b6b9e".to_string(),
            role: "architect".to_string(),
            enabled: true,
        },
        AgentFile {
            filename: "repo-explorer.md".to_string(),
            name: "Repo Explorer".to_string(),
            description: "Architecture scout — discovers services, APIs, data flows, and connections".to_string(),
            tools: Some("Read, Glob, Grep, Bash".to_string()),
            model: None,
            system_prompt: r#"You are an architecture discovery specialist. Your job is to explore a repository and map its structure, services, APIs, and data flows. You produce structured JSON output describing what you find.

## What to Look For

### Services & Components
- Entry points (main files, server startup, app bootstrap)
- Service definitions (microservices, workers, cron jobs, lambda handlers)
- Frontend applications (React, Vue, Angular entry points)
- Background workers and job processors

### APIs & Endpoints
- REST endpoints (route definitions, controllers, handlers)
- GraphQL schemas and resolvers
- gRPC proto definitions and service implementations
- WebSocket handlers and event definitions

### Data & Storage
- Database connections (connection strings, ORM configs, migration files)
- Cache usage (Redis, Memcached configurations)
- Message queues (RabbitMQ, Kafka, SQS producers/consumers)
- File storage (S3, local filesystem writes)

### Inter-Service Communication
- HTTP client calls to other services (fetch, axios, reqwest)
- Event publishing and subscribing patterns
- Shared database access across services
- IPC mechanisms (Unix sockets, named pipes)
- Service discovery or registry usage

### Data Ownership
- Which tables/collections does this service own?
- What data does it read from other services?
- What data does it produce for others to consume?

## How to Explore
1. Start with package.json, Cargo.toml, go.mod, requirements.txt to understand the tech stack
2. Look at entry points (main.*, index.*, app.*, server.*)
3. Scan route/handler directories for API surface area
4. Check config files for database, cache, and queue connections
5. Search for HTTP client usage to find outbound service calls
6. Look at Docker/docker-compose files for service topology hints
7. Check CI/CD configs for deployment topology clues

## Output Format
Produce a single JSON object with the exact schema requested. Be thorough but precise — only report what you can confirm from the code, not speculation."#.to_string(),
            is_global: true,
            color: "#d4aa5a".to_string(),
            role: "explorer".to_string(),
            enabled: true,
        },
        AgentFile {
            filename: "qa-tester.md".to_string(),
            name: "QA Tester".to_string(),
            description: "Functional testing specialist — exercises running apps via browser, API, or CLI".to_string(),
            tools: Some("Read, Edit, Write, Bash, Glob, Grep".to_string()),
            model: None,
            system_prompt: r#"You are a QA testing specialist who functionally tests applications by actually running and using them. Your expertise includes:

- Browser automation (Playwright, Puppeteer, Selenium)
- API testing (curl, httpie, REST client libraries)
- CLI testing (running commands and verifying output)
- Screenshot capture for visual verification
- Network request inspection and response validation
- Error detection (console errors, HTTP error codes, crash reports)

When testing:
- Start the application using the provided harness commands
- Wait for the app to be ready before testing
- Exercise each test step methodically
- Capture proof artifacts (screenshots, API responses, console output) for every step
- Document failures clearly with error messages and context
- Write structured results to the specified output file
- Stop the application when done
- Be pragmatic — if a step requires tools you don't have, skip it and note why
- Focus on "does the core feature work?" not exhaustive edge cases

You are best-effort QA. Your goal is to catch obvious functional regressions and provide visual/structured proof that the feature works. You are not expected to find every bug."#.to_string(),
            is_global: true,
            color: "#e6a856".to_string(),
            role: "quality".to_string(),
            enabled: true,
        },
    ]
}

// ── Built-in Hook Templates ──
// Pre-built hooks for common Claude Code workflows, grouped by category.

/// Return the built-in hook templates.
pub fn built_in_hook_templates() -> Vec<crate::models::HookTemplate> {
    use crate::models::HookTemplate;
    vec![
        // ── Quality ──
        HookTemplate {
            id: "lint-on-write".into(),
            name: "Lint on file change".into(),
            description: "Run your linter after Claude edits or creates a file".into(),
            event: "PostToolUse".into(),
            matcher: "Edit|Write".into(),
            command: "npm run lint --fix".into(),
            category: "quality".into(),
        },
        HookTemplate {
            id: "format-on-write".into(),
            name: "Format on file change".into(),
            description: "Auto-format files after Claude edits or creates them".into(),
            event: "PostToolUse".into(),
            matcher: "Edit|Write".into(),
            command: "npx prettier --write".into(),
            category: "quality".into(),
        },
        HookTemplate {
            id: "typecheck-on-write".into(),
            name: "Type-check on file change".into(),
            description: "Run the TypeScript compiler after file edits to catch type errors early"
                .into(),
            event: "PostToolUse".into(),
            matcher: "Edit|Write".into(),
            command: "npx tsc --noEmit".into(),
            category: "quality".into(),
        },
        HookTemplate {
            id: "test-after-bash".into(),
            name: "Run tests after shell commands".into(),
            description: "Automatically run your test suite after Claude executes shell commands"
                .into(),
            event: "PostToolUse".into(),
            matcher: "Bash".into(),
            command: "npm test".into(),
            category: "quality".into(),
        },
        HookTemplate {
            id: "clippy-on-write".into(),
            name: "Run Clippy on file change".into(),
            description: "Run cargo clippy after Rust file edits to catch lint warnings".into(),
            event: "PostToolUse".into(),
            matcher: "Edit|Write".into(),
            command: "cargo clippy --quiet 2>&1 | head -20".into(),
            category: "quality".into(),
        },
        // ── Safety ──
        HookTemplate {
            id: "block-force-push".into(),
            name: "Block force push".into(),
            description: "Prevent Claude from running git push --force".into(),
            event: "PreToolUse".into(),
            matcher: "Bash".into(),
            command: "if echo \"$CLAUDE_TOOL_INPUT\" | grep -q 'push.*--force\\|push.*-f'; then echo 'Force push blocked' >&2; exit 2; fi".into(),
            category: "safety".into(),
        },
        HookTemplate {
            id: "block-main-commit".into(),
            name: "Block commits to main".into(),
            description: "Prevent Claude from committing directly to main or master".into(),
            event: "PreToolUse".into(),
            matcher: "Bash".into(),
            command: "if echo \"$CLAUDE_TOOL_INPUT\" | grep -q 'git commit'; then branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null); if [ \"$branch\" = \"main\" ] || [ \"$branch\" = \"master\" ]; then echo \"Cannot commit to $branch\" >&2; exit 2; fi; fi".into(),
            category: "safety".into(),
        },
        HookTemplate {
            id: "block-env-read".into(),
            name: "Block .env file reads".into(),
            description: "Prevent Claude from reading .env files that may contain secrets".into(),
            event: "PreToolUse".into(),
            matcher: "Read".into(),
            command: "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE '\\.env($|\\.)'; then echo 'Reading .env files is blocked' >&2; exit 2; fi".into(),
            category: "safety".into(),
        },
        HookTemplate {
            id: "block-rm-rf".into(),
            name: "Block recursive deletes".into(),
            description: "Prevent Claude from running rm -rf or similar destructive commands".into(),
            event: "PreToolUse".into(),
            matcher: "Bash".into(),
            command: "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'rm\\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)'; then echo 'Recursive delete blocked' >&2; exit 2; fi".into(),
            category: "safety".into(),
        },
        // ── Workflow ──
        HookTemplate {
            id: "env-setup".into(),
            name: "Load environment on start".into(),
            description: "Source a .env file or set up environment variables when a session starts"
                .into(),
            event: "SessionStart".into(),
            matcher: "startup".into(),
            command: "if [ -f .env ]; then export $(cat .env | grep -v '^#' | xargs); fi".into(),
            category: "workflow".into(),
        },
        HookTemplate {
            id: "git-status-on-stop".into(),
            name: "Show git status when done".into(),
            description: "Print a git status summary when Claude finishes, so you can see what changed".into(),
            event: "Stop".into(),
            matcher: "".into(),
            command: "echo '--- Changes ---' && git diff --stat 2>/dev/null || true".into(),
            category: "workflow".into(),
        },
        HookTemplate {
            id: "auto-stage".into(),
            name: "Auto-stage edited files".into(),
            description: "Automatically git-add files after Claude edits them".into(),
            event: "PostToolUse".into(),
            matcher: "Edit|Write".into(),
            command: "git add -N . 2>/dev/null || true".into(),
            category: "workflow".into(),
        },
        // ── Notifications ──
        HookTemplate {
            id: "notify-on-stop".into(),
            name: "Notify when done".into(),
            description: "Send a desktop notification when Claude finishes its response".into(),
            event: "Stop".into(),
            matcher: "".into(),
            command: "osascript -e 'display notification \"Claude is done\" with title \"Goblin Mob Boss\"'".into(),
            category: "notifications".into(),
        },
        HookTemplate {
            id: "notify-linux".into(),
            name: "Notify when done (Linux)".into(),
            description: "Send a desktop notification on Linux when Claude finishes".into(),
            event: "Stop".into(),
            matcher: "".into(),
            command: "notify-send 'Goblin Mob Boss' 'Claude is done' 2>/dev/null || true".into(),
            category: "notifications".into(),
        },
        HookTemplate {
            id: "log-tool-usage".into(),
            name: "Log tool usage".into(),
            description: "Append a line to a log file every time Claude uses a tool".into(),
            event: "PostToolUse".into(),
            matcher: "".into(),
            command: "echo \"$(date +%H:%M:%S) $CLAUDE_TOOL_NAME\" >> .claude-tool-log.txt".into(),
            category: "notifications".into(),
        },
    ]
}

// ── Built-in Skills ──
// Default skill definitions that users can add to their ~/.claude/skills/.

/// Return the built-in skill definitions.
pub fn built_in_skills() -> Vec<SkillFile> {
    vec![
        SkillFile {
            dir_name: "review-plan".to_string(),
            name: "review-plan".to_string(),
            description: "Review an ideation plan and suggest improvements before execution"
                .to_string(),
            prompt_template: r#"Review the ideation plan for the current feature. Evaluate:

1. **Task breakdown** — Are tasks well-scoped? Are there missing steps or unnecessary ones?
2. **Dependencies** — Are task dependencies correct? Could more tasks run in parallel?
3. **Agent assignments** — Are the right agents assigned to each task based on their strengths?
4. **Acceptance criteria** — Are criteria specific and testable?
5. **Execution mode** — Is the recommended mode (teams vs subagents) appropriate for this task graph?
6. **Risk areas** — What could go wrong? Are there ambiguous requirements that need clarification?

Output a concise review with specific suggestions. Flag anything that should be changed before launching execution."#
                .to_string(),
            source: SkillSource::User,
            plugin_name: None,
        },
        SkillFile {
            dir_name: "validate-and-fix".to_string(),
            name: "validate-and-fix".to_string(),
            description: "Run validators and auto-fix failures in a loop".to_string(),
            prompt_template: r#"Run the project's validators (tests, linters, type checks) and fix any failures. Follow this loop:

1. Run the test/lint/build commands for this project
2. If everything passes, report success and stop
3. If something fails, read the error output carefully
4. Fix the root cause — don't suppress errors or skip tests
5. Re-run validators to confirm the fix
6. Repeat until all validators pass or you've attempted 3 fix cycles

If you cannot fix a failure after 3 attempts, report what's still broken and why, so the user can decide how to proceed."#
                .to_string(),
            source: SkillSource::User,
            plugin_name: None,
        },
        SkillFile {
            dir_name: "summarize-diff".to_string(),
            name: "summarize-diff".to_string(),
            description: "Generate a human-readable summary of branch changes".to_string(),
            prompt_template: r#"Summarize all changes on the current feature branch compared to the base branch. Produce a structured summary:

1. **Overview** — One sentence describing what changed and why
2. **Files changed** — Group by category (new files, modified, deleted) with a brief note on each
3. **Key changes** — The most important behavioral changes, in plain language
4. **Testing** — What tests were added or modified
5. **Potential concerns** — Anything that looks risky, incomplete, or worth a second look

Keep it concise. This summary should help a reviewer understand the branch in under 2 minutes."#
                .to_string(),
            source: SkillSource::User,
            plugin_name: None,
        },
        SkillFile {
            dir_name: "write-pr-description".to_string(),
            name: "write-pr-description".to_string(),
            description: "Draft a PR title and description from the branch diff".to_string(),
            prompt_template: r#"Draft a pull request title and description for the current feature branch. Use `git diff` against the base branch and the feature context to write:

1. **Title** — Short (under 70 chars), describes the change clearly
2. **Summary** — 2-4 bullet points covering what changed and why
3. **Test plan** — How to verify the changes work (manual steps or test commands)
4. **Breaking changes** — Note any, or state "None"

Format the output as markdown ready to paste into a PR form. Keep it factual — describe what the code does, not what you hope it does."#
                .to_string(),
            source: SkillSource::User,
            plugin_name: None,
        },
        SkillFile {
            dir_name: "check-coverage".to_string(),
            name: "check-coverage".to_string(),
            description: "Find untested code in changed files and suggest tests".to_string(),
            prompt_template: r#"Analyze the files changed on the current feature branch and identify untested code paths. For each gap:

1. Read the changed/new source files
2. Read the corresponding test files (if they exist)
3. Identify functions, branches, or edge cases that lack test coverage
4. Suggest specific test cases to add — include the test name and what it should verify

Focus on behavioral gaps (missing error cases, untested branches, new functions without tests), not line-by-line coverage metrics. Prioritize tests that would catch real bugs."#
                .to_string(),
            source: SkillSource::User,
            plugin_name: None,
        },
    ]
}

// ── Feature Recipes ──
// Pre-built task breakdowns for common feature patterns.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureRecipe {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub suggested_mode: String,
    pub task_templates: Vec<RecipeTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeTask {
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
    pub dependencies: Vec<String>,
    pub suggested_agent: String,
}

/// Return the built-in feature recipes.
pub fn list_feature_recipes() -> Vec<FeatureRecipe> {
    vec![
        FeatureRecipe {
            id: "crud-endpoint".to_string(),
            name: "CRUD API Endpoint".to_string(),
            description: "Add a complete Create/Read/Update/Delete endpoint with data model, validation, and tests.".to_string(),
            category: "backend".to_string(),
            suggested_mode: "subagents".to_string(),
            task_templates: vec![
                RecipeTask {
                    title: "Define data model".to_string(),
                    description: "Create the data model/schema with all fields, types, and validation rules. Include serialization/deserialization.".to_string(),
                    acceptance_criteria: vec![
                        "Model struct/class with all fields defined".to_string(),
                        "Validation rules for required fields".to_string(),
                        "Serialization to/from JSON works correctly".to_string(),
                    ],
                    dependencies: vec![],
                    suggested_agent: "developer".to_string(),
                },
                RecipeTask {
                    title: "Implement CRUD handlers".to_string(),
                    description: "Create endpoint handlers for Create, Read (single + list), Update, and Delete operations.".to_string(),
                    acceptance_criteria: vec![
                        "POST endpoint creates new records".to_string(),
                        "GET endpoint returns single record by ID".to_string(),
                        "GET list endpoint with pagination".to_string(),
                        "PUT/PATCH endpoint updates existing records".to_string(),
                        "DELETE endpoint removes records".to_string(),
                        "Proper error responses for not-found and validation errors".to_string(),
                    ],
                    dependencies: vec!["1".to_string()],
                    suggested_agent: "developer".to_string(),
                },
                RecipeTask {
                    title: "Write tests".to_string(),
                    description: "Write unit tests for model validation and integration tests for each endpoint.".to_string(),
                    acceptance_criteria: vec![
                        "Unit tests for model creation and validation".to_string(),
                        "Integration tests for each CRUD operation".to_string(),
                        "Error case coverage (invalid input, not found)".to_string(),
                    ],
                    dependencies: vec!["2".to_string()],
                    suggested_agent: "developer".to_string(),
                },
            ],
        },
        FeatureRecipe {
            id: "new-ui-page".to_string(),
            name: "New UI Page".to_string(),
            description: "Add a new page/view with routing, components, and data fetching.".to_string(),
            category: "frontend".to_string(),
            suggested_mode: "subagents".to_string(),
            task_templates: vec![
                RecipeTask {
                    title: "Create page component and routing".to_string(),
                    description: "Create the main page component with proper routing setup and navigation integration.".to_string(),
                    acceptance_criteria: vec![
                        "Page component renders correctly".to_string(),
                        "Route is configured and accessible".to_string(),
                        "Navigation link added to sidebar/menu".to_string(),
                    ],
                    dependencies: vec![],
                    suggested_agent: "developer".to_string(),
                },
                RecipeTask {
                    title: "Build UI components".to_string(),
                    description: "Create the page-specific UI components with proper styling, state management, and data display.".to_string(),
                    acceptance_criteria: vec![
                        "All UI components render correctly".to_string(),
                        "Responsive layout works at common breakpoints".to_string(),
                        "Loading and error states handled".to_string(),
                    ],
                    dependencies: vec!["1".to_string()],
                    suggested_agent: "developer".to_string(),
                },
                RecipeTask {
                    title: "Integrate data fetching".to_string(),
                    description: "Connect the page to the backend API/data source with proper loading states and error handling.".to_string(),
                    acceptance_criteria: vec![
                        "Data loads correctly from API/backend".to_string(),
                        "Loading spinner shown while fetching".to_string(),
                        "Error messages displayed on failure".to_string(),
                    ],
                    dependencies: vec!["2".to_string()],
                    suggested_agent: "developer".to_string(),
                },
                RecipeTask {
                    title: "Write component tests".to_string(),
                    description: "Write unit tests for each component and integration tests for the full page.".to_string(),
                    acceptance_criteria: vec![
                        "Unit tests for each component".to_string(),
                        "Mock API calls in tests".to_string(),
                        "Test user interactions and state changes".to_string(),
                    ],
                    dependencies: vec!["3".to_string()],
                    suggested_agent: "developer".to_string(),
                },
            ],
        },
        FeatureRecipe {
            id: "full-stack-feature".to_string(),
            name: "Full-Stack Feature".to_string(),
            description: "End-to-end feature spanning backend API, frontend UI, and tests. Ideal for teams mode.".to_string(),
            category: "full-stack".to_string(),
            suggested_mode: "teams".to_string(),
            task_templates: vec![
                RecipeTask {
                    title: "Backend: data model and API".to_string(),
                    description: "Define the data model and implement the API endpoints with validation and error handling.".to_string(),
                    acceptance_criteria: vec![
                        "Data model defined with all fields".to_string(),
                        "API endpoints implemented and tested".to_string(),
                        "Input validation and error handling".to_string(),
                    ],
                    dependencies: vec![],
                    suggested_agent: "developer".to_string(),
                },
                RecipeTask {
                    title: "Frontend: UI components and page".to_string(),
                    description: "Build the frontend components, page layout, and wire up to the API.".to_string(),
                    acceptance_criteria: vec![
                        "Page and components render correctly".to_string(),
                        "Connected to backend API".to_string(),
                        "Loading and error states handled".to_string(),
                    ],
                    dependencies: vec![],
                    suggested_agent: "developer".to_string(),
                },
                RecipeTask {
                    title: "Write comprehensive tests".to_string(),
                    description: "Write backend unit tests, frontend component tests, and integration tests for the full feature.".to_string(),
                    acceptance_criteria: vec![
                        "Backend unit and integration tests".to_string(),
                        "Frontend component tests".to_string(),
                        "All tests pass".to_string(),
                    ],
                    dependencies: vec!["1".to_string(), "2".to_string()],
                    suggested_agent: "developer".to_string(),
                },
            ],
        },
        FeatureRecipe {
            id: "refactor-module".to_string(),
            name: "Refactor Module".to_string(),
            description: "Restructure an existing module: extract components, improve naming, reduce coupling.".to_string(),
            category: "maintenance".to_string(),
            suggested_mode: "subagents".to_string(),
            task_templates: vec![
                RecipeTask {
                    title: "Analyze current structure".to_string(),
                    description: "Read through the module and document current architecture, dependencies, and pain points.".to_string(),
                    acceptance_criteria: vec![
                        "Current architecture documented".to_string(),
                        "Problem areas identified".to_string(),
                        "Refactoring approach proposed".to_string(),
                    ],
                    dependencies: vec![],
                    suggested_agent: "architect".to_string(),
                },
                RecipeTask {
                    title: "Extract and restructure".to_string(),
                    description: "Perform the refactoring: extract components, rename for clarity, reduce coupling between modules.".to_string(),
                    acceptance_criteria: vec![
                        "Code restructured according to plan".to_string(),
                        "No functional changes (behavior preserved)".to_string(),
                        "Improved naming and organization".to_string(),
                    ],
                    dependencies: vec!["1".to_string()],
                    suggested_agent: "developer".to_string(),
                },
                RecipeTask {
                    title: "Verify and update tests".to_string(),
                    description: "Run existing tests to ensure behavior is preserved. Update test imports/references as needed.".to_string(),
                    acceptance_criteria: vec![
                        "All existing tests pass".to_string(),
                        "Test imports updated for new structure".to_string(),
                        "No regression in functionality".to_string(),
                    ],
                    dependencies: vec!["2".to_string()],
                    suggested_agent: "developer".to_string(),
                },
            ],
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_agents_returns_all_agents() {
        let agents = built_in_agents();
        assert_eq!(agents.len(), 4);
        let filenames: Vec<&str> = agents.iter().map(|a| a.filename.as_str()).collect();
        assert!(filenames.contains(&"developer.md"));
        assert!(filenames.contains(&"architect.md"));
        assert!(filenames.contains(&"repo-explorer.md"));
        assert!(filenames.contains(&"qa-tester.md"));
    }

    #[test]
    fn built_in_agents_have_valid_fields() {
        let agents = built_in_agents();
        for a in &agents {
            assert!(!a.filename.is_empty());
            assert!(a.filename.ends_with(".md"));
            assert!(!a.name.is_empty());
            assert!(!a.system_prompt.is_empty());
            assert!(!a.color.is_empty());
            assert!(a.is_global);
        }
    }

    #[test]
    fn built_in_agents_have_unique_filenames() {
        let agents = built_in_agents();
        let mut filenames: Vec<&str> = agents.iter().map(|a| a.filename.as_str()).collect();
        let count = filenames.len();
        filenames.sort();
        filenames.dedup();
        assert_eq!(filenames.len(), count, "Duplicate filenames found");
    }

    #[test]
    fn built_in_skills_returns_all_skills() {
        let skills = built_in_skills();
        assert_eq!(skills.len(), 5);
        let names: Vec<&str> = skills.iter().map(|s| s.dir_name.as_str()).collect();
        assert!(names.contains(&"review-plan"));
        assert!(names.contains(&"validate-and-fix"));
        assert!(names.contains(&"summarize-diff"));
        assert!(names.contains(&"write-pr-description"));
        assert!(names.contains(&"check-coverage"));
    }

    #[test]
    fn built_in_skills_have_valid_fields() {
        let skills = built_in_skills();
        for s in &skills {
            assert!(!s.dir_name.is_empty());
            assert!(!s.name.is_empty());
            assert!(!s.description.is_empty());
            assert!(!s.prompt_template.is_empty());
        }
    }

    #[test]
    fn built_in_skills_have_unique_names() {
        let skills = built_in_skills();
        let mut names: Vec<&str> = skills.iter().map(|s| s.dir_name.as_str()).collect();
        let count = names.len();
        names.sort();
        names.dedup();
        assert_eq!(names.len(), count, "Duplicate skill names found");
    }

    #[test]
    fn list_feature_recipes_returns_all_recipes() {
        let recipes = list_feature_recipes();
        assert!(recipes.len() >= 4);
        let ids: Vec<&str> = recipes.iter().map(|r| r.id.as_str()).collect();
        assert!(ids.contains(&"crud-endpoint"));
        assert!(ids.contains(&"new-ui-page"));
        assert!(ids.contains(&"full-stack-feature"));
        assert!(ids.contains(&"refactor-module"));
    }

    #[test]
    fn feature_recipes_have_valid_tasks() {
        let recipes = list_feature_recipes();
        for r in &recipes {
            assert!(!r.task_templates.is_empty());
            for task in &r.task_templates {
                assert!(!task.title.is_empty());
                assert!(!task.description.is_empty());
                assert!(!task.acceptance_criteria.is_empty());
                assert!(!task.suggested_agent.is_empty());
            }
        }
    }

    #[test]
    fn feature_recipes_have_valid_suggested_mode() {
        let recipes = list_feature_recipes();
        for r in &recipes {
            assert!(
                r.suggested_mode == "teams" || r.suggested_mode == "subagents",
                "Invalid suggested_mode: {}",
                r.suggested_mode
            );
        }
    }

    #[test]
    fn full_stack_recipe_suggests_teams_mode() {
        let recipes = list_feature_recipes();
        let full_stack = recipes
            .iter()
            .find(|r| r.id == "full-stack-feature")
            .unwrap();
        assert_eq!(full_stack.suggested_mode, "teams");
        // Should have independent tasks (backend and frontend have no deps on each other)
        let backend_task = &full_stack.task_templates[0];
        let frontend_task = &full_stack.task_templates[1];
        assert!(backend_task.dependencies.is_empty());
        assert!(frontend_task.dependencies.is_empty());
    }

    #[test]
    fn built_in_hook_templates_returns_templates() {
        let templates = built_in_hook_templates();
        assert!(templates.len() >= 15);
    }

    #[test]
    fn built_in_hook_templates_have_valid_fields() {
        let templates = built_in_hook_templates();
        for t in &templates {
            assert!(!t.id.is_empty(), "Template has empty id");
            assert!(!t.name.is_empty(), "Template has empty name");
            assert!(!t.description.is_empty(), "Template has empty description");
            assert!(!t.event.is_empty(), "Template has empty event");
            assert!(!t.command.is_empty(), "Template has empty command");
            assert!(!t.category.is_empty(), "Template has empty category");
        }
    }

    #[test]
    fn built_in_hook_templates_have_valid_events() {
        let valid_events = [
            "PreToolUse",
            "PostToolUse",
            "UserPromptSubmit",
            "SessionStart",
            "Stop",
            "Notification",
            "SubagentStop",
        ];
        let templates = built_in_hook_templates();
        for t in &templates {
            assert!(
                valid_events.contains(&t.event.as_str()),
                "Invalid event '{}' in template '{}'",
                t.event,
                t.id
            );
        }
    }

    #[test]
    fn built_in_hook_templates_have_unique_ids() {
        let templates = built_in_hook_templates();
        let mut ids: Vec<&str> = templates.iter().map(|t| t.id.as_str()).collect();
        let count = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), count, "Duplicate template IDs found");
    }

    #[test]
    fn built_in_hook_templates_cover_all_categories() {
        let templates = built_in_hook_templates();
        let categories: std::collections::HashSet<&str> =
            templates.iter().map(|t| t.category.as_str()).collect();
        assert!(categories.contains("quality"));
        assert!(categories.contains("safety"));
        assert!(categories.contains("workflow"));
        assert!(categories.contains("notifications"));
    }
}
