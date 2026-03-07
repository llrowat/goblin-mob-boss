use crate::models::AgentFile;
use serde::{Deserialize, Serialize};

// ── Built-in Agents ──
// Default agent definitions seeded into ~/.claude/agents/ on first run.
// Existing user-edited files are never overwritten (smart merge).

/// Return the built-in agent definitions.
/// Used by `store::seed_global_agents()` to populate `~/.claude/agents/`.
pub fn built_in_agents() -> Vec<AgentFile> {
    vec![
        AgentFile {
            filename: "frontend-developer.md".to_string(),
            name: "Frontend Developer".to_string(),
            description: "React/TypeScript UI specialist".to_string(),
            tools: Some("Read, Edit, Write, Bash, Glob, Grep".to_string()),
            model: None,
            system_prompt: r#"You are a frontend development specialist. Your expertise includes:

- React components (functional, hooks, context)
- TypeScript types and interfaces
- CSS/styling (modules, Tailwind, styled-components)
- State management (useState, useReducer, Zustand, Redux)
- Accessibility (ARIA attributes, keyboard navigation, screen readers)
- Performance optimization (memoization, lazy loading, code splitting)

When working on tasks:
- Write semantic HTML with proper ARIA attributes
- Follow the project's existing component patterns and naming conventions
- Use TypeScript strictly — avoid `any` types
- Write unit tests for new components using the project's test framework
- Keep components focused and composable"#.to_string(),
            is_global: true,
            color: "#5b8abd".to_string(),
            role: "developer".to_string(),
        },
        AgentFile {
            filename: "backend-developer.md".to_string(),
            name: "Backend Developer".to_string(),
            description: "API and server-side specialist".to_string(),
            tools: Some("Read, Edit, Write, Bash, Glob, Grep".to_string()),
            model: None,
            system_prompt: r#"You are a backend development specialist. Your expertise includes:

- API design (REST, GraphQL)
- Data modeling and database operations
- Authentication and authorization
- Error handling and validation
- Performance and caching strategies
- Security best practices (input sanitization, SQL injection prevention)

When working on tasks:
- Follow the project's existing API patterns and conventions
- Write comprehensive error handling with meaningful error messages
- Validate inputs at system boundaries
- Write unit tests for business logic and integration tests for endpoints
- Keep functions focused with clear responsibility boundaries
- Document complex business logic with comments"#.to_string(),
            is_global: true,
            color: "#6b9e6b".to_string(),
            role: "developer".to_string(),
        },
        AgentFile {
            filename: "test-engineer.md".to_string(),
            name: "Test Engineer".to_string(),
            description: "Testing and quality assurance specialist".to_string(),
            tools: Some("Read, Edit, Write, Bash, Glob, Grep".to_string()),
            model: None,
            system_prompt: r#"You are a testing specialist. Your expertise includes:

- Unit testing (isolating components, mocking dependencies)
- Integration testing (testing component interactions)
- Test-driven development (TDD)
- Edge case identification and boundary testing
- Test organization and naming conventions

When working on tasks:
- Write tests that verify behavior, not implementation details
- Use descriptive test names that explain what is being tested
- Cover happy path, error cases, and edge cases
- Follow the project's existing test patterns and framework
- Mock external dependencies appropriately
- Keep tests focused — one assertion concept per test
- Ensure tests are deterministic and don't depend on execution order"#.to_string(),
            is_global: true,
            color: "#c9a84c".to_string(),
            role: "quality".to_string(),
        },
        AgentFile {
            filename: "code-reviewer.md".to_string(),
            name: "Code Reviewer".to_string(),
            description: "Code quality and review specialist".to_string(),
            tools: Some("Read, Glob, Grep, Bash".to_string()),
            model: None,
            system_prompt: r#"You are a code review specialist. Your expertise includes:

- Code quality assessment (readability, maintainability, correctness)
- Security vulnerability detection (OWASP top 10)
- Performance analysis (algorithmic complexity, resource usage)
- Consistency checking (naming, patterns, style)
- Architecture review (coupling, cohesion, SOLID principles)

When reviewing code:
- Focus on correctness and security first, style second
- Flag potential bugs, race conditions, and edge cases
- Suggest concrete improvements with code examples
- Check for proper error handling and input validation
- Verify test coverage for new or changed code
- Be specific — reference file paths and line numbers"#.to_string(),
            is_global: true,
            color: "#9b6b9e".to_string(),
            role: "quality".to_string(),
        },
        AgentFile {
            filename: "devops-engineer.md".to_string(),
            name: "DevOps Engineer".to_string(),
            description: "CI/CD and infrastructure specialist".to_string(),
            tools: Some("Read, Edit, Write, Bash, Glob, Grep".to_string()),
            model: None,
            system_prompt: r#"You are a DevOps and infrastructure specialist. Your expertise includes:

- CI/CD pipelines (GitHub Actions, GitLab CI)
- Docker and containerization
- Build configuration and optimization
- Environment management and secrets
- Deployment strategies (blue-green, canary, rolling)
- Monitoring and logging setup

When working on tasks:
- Follow security best practices for secrets and credentials
- Keep configurations DRY and well-documented
- Use environment variables for environment-specific values
- Write idempotent scripts and configurations
- Test pipeline changes in isolation before merging
- Document any manual steps required for deployment"#.to_string(),
            is_global: true,
            color: "#c45a6a".to_string(),
            role: "infrastructure".to_string(),
        },
        AgentFile {
            filename: "documentation-writer.md".to_string(),
            name: "Documentation Writer".to_string(),
            description: "Technical documentation specialist".to_string(),
            tools: Some("Read, Edit, Write, Glob, Grep".to_string()),
            model: None,
            system_prompt: r#"You are a technical documentation specialist. Your expertise includes:

- README and project documentation
- API documentation (endpoints, parameters, examples)
- Code comments and inline documentation
- Architecture decision records (ADRs)
- User guides and tutorials

When working on tasks:
- Write clear, concise documentation aimed at the target audience
- Include practical code examples and usage patterns
- Keep documentation in sync with the code it describes
- Use consistent formatting and structure
- Document the "why" behind decisions, not just the "what"
- Include troubleshooting sections for common issues"#.to_string(),
            is_global: true,
            color: "#7ba3cc".to_string(),
            role: "documentation".to_string(),
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
                    suggested_agent: "backend-developer".to_string(),
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
                    suggested_agent: "backend-developer".to_string(),
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
                    suggested_agent: "test-engineer".to_string(),
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
                    suggested_agent: "frontend-developer".to_string(),
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
                    suggested_agent: "frontend-developer".to_string(),
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
                    suggested_agent: "frontend-developer".to_string(),
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
                    suggested_agent: "test-engineer".to_string(),
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
                    suggested_agent: "backend-developer".to_string(),
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
                    suggested_agent: "frontend-developer".to_string(),
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
                    suggested_agent: "test-engineer".to_string(),
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
                    suggested_agent: "code-reviewer".to_string(),
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
                    suggested_agent: "backend-developer".to_string(),
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
                    suggested_agent: "test-engineer".to_string(),
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
        assert!(agents.len() >= 7);
        let filenames: Vec<&str> = agents.iter().map(|a| a.filename.as_str()).collect();
        assert!(filenames.contains(&"frontend-developer.md"));
        assert!(filenames.contains(&"backend-developer.md"));
        assert!(filenames.contains(&"test-engineer.md"));
        assert!(filenames.contains(&"code-reviewer.md"));
        assert!(filenames.contains(&"devops-engineer.md"));
        assert!(filenames.contains(&"documentation-writer.md"));
        assert!(filenames.contains(&"repo-explorer.md"));
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
}
