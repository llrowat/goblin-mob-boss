# Goblin Mob Boss

A desktop app for agent-based AI development workflows. Configure agents, plan features interactively with Claude, choose an execution mode (Agent Teams or Subagents), then launch Claude Code to execute — GMB handles setup, visibility, and git workflow.

## How It Works

1. **Configure Agents** — Agents are defined as `.claude/agents/*.md` files with YAML frontmatter (name, description, tools, model, system prompt, color). Manage them per-repo or globally via the built-in form editor. Built-in agents (Frontend Developer, Backend Developer, Test Engineer, etc.) appear as greyed-out cards and can be added to any repo with one click.
2. **Start a Feature** — Describe what you want to build and select one or more repositories. A feature branch is created from each repo's base branch, and a **git worktree** is automatically provisioned per repo so multiple features can run concurrently without interfering. Cross-repo features span multiple repositories with a shared branch name.
3. **Plan with Claude** — An interactive Claude Code session in plan mode helps you refine the approach and break it into task specs, each with assigned agents. The ideation prompt includes repo context (languages, structure, available agents).
4. **Configure Launch** — GMB analyzes your task dependency graph and recommends an execution mode with confidence scoring:
   - **Agent Teams** — Multiple Claude Code instances in parallel tmux panes, each with its own agent identity. Best for large features with 3+ independent workstreams.
   - **Subagents** — A single lead Claude Code instance that delegates subtasks. Best for focused features with dependent tasks.
   You can accept or override the recommendation, and select which agents participate. The task graph visualization shows parallel execution lanes and the critical path.
5. **Execute & Monitor** — Copy the generated launch command and run it. GMB provides live execution observability: commit tracking, file change monitoring, and active file lists updated in real-time. Send guidance notes mid-execution to steer the agent.
6. **Validate & Analyze** — Run repository validators, review diffs, and analyze execution results across all repos. The post-execution analysis compares the original plan against actual file changes, assesses whether the chosen execution mode was appropriate, and identifies unplanned modifications.
7. **PR** — Push the feature branch to all repos and create PRs.

## Features

### Core Workflow
- **Cross-repo features** — Features can span multiple repositories. Branches, validators, diffs, and pushes operate across all selected repos. Agents and context from all repos are aggregated during ideation and launch.
- **Execution mode intelligence** — Ideation analyzes planned tasks and recommends Teams or Subagents mode with confidence scoring and rationale
- **Agent management** — Agents stored as `.claude/agents/*.md` files with YAML frontmatter; form-based editor with color picker, tools, model, and system prompt configuration
- **Interactive planning** — Back-and-forth conversation with Claude in plan mode; task specs written to `plan.json` with automatic polling
- **Launch command generation** — GMB builds the appropriate Claude Code command with environment variables, agent configs, and system prompts for the chosen execution mode
- **Feature lifecycle** — Features progress through statuses: Ideation → Configuring → Executing → Ready (or Failed)

### Guide & Built-in Agents
- **Built-in agents** — Starter agents for common roles: Frontend Developer, Backend Developer, Test Engineer, Code Reviewer, DevOps Engineer, Documentation Writer. Shown as greyed-out cards in the Agents page; one-click add to any repository.
- **Feature recipes** — Pre-built task breakdowns for common patterns: CRUD API Endpoint, New UI Page, Full-Stack Feature, Refactor Module. Each recipe includes suggested execution mode and agent assignments.

### Execution Observability
- **Live progress tracking** — During execution, GMB polls git activity on the feature branch showing: commit count, files changed, insertions/deletions, recent commit messages, and active file list
- **Guidance notes** — Send mid-execution notes (info, important, critical) that are written to the feature directory where the agent can read them. Enables course correction without restarting execution.

### Post-Execution Learning
- **Execution analysis** — Compare the original plan against actual file changes to assess task coverage
- **Mode assessment** — Evaluate whether the chosen execution mode (Teams vs Subagents) was appropriate based on task independence and file overlap
- **Unplanned change detection** — Identify files modified that weren't part of any planned task

### System Map
- **Service topology** — Map your services, their types (backend, frontend, worker, gateway, database, queue, cache, external), and how they connect
- **Connection mapping** — Define connections between services with type (REST, gRPC, GraphQL, WebSocket, event, shared DB, file system, IPC), sync/async mode, and labels
- **Goblin treasure map UI** — Interactive SVG visualization with a parchment-textured, treasure-map aesthetic. Services are "lairs" with type-specific icons, connections are "routes" with distinct line styles per connection type. Includes compass rose, vignette, and map legend
- **Drag-and-drop layout** — Reposition service nodes on the map by dragging; positions are persisted automatically
- **Service detail panel** — Click a service to see its connections (incoming/outgoing), owned data ("treasure hoard"), runtime, framework, and description
- **Multiple maps** — Create and switch between multiple system maps for different environments or subsystems

### Intelligent Mode Selection
- **Task dependency graph** — Visual representation of task dependencies with parallel execution lanes, grouped by depth level
- **Heuristic analysis** — Automatic recommendation based on: task count, parallelism ratio, agent diversity, and critical path length
- **Confidence scoring** — Each recommendation includes a confidence percentage and detailed reasoning

### Validation & Git
- **Repository validators** — Configure shell commands (tests, linters) per repo; run them in the feature's worktree with per-command timeout protection (10 min default) and detailed stdout/stderr output
- **Git worktrees** — Each feature gets isolated worktrees per repo, enabling concurrent feature development without branch checkout conflicts
- **Git diff summary** — View files changed, lines added/removed before pushing
- **PR creation** — Push feature branch and generate PR command (supports custom `pr_command` templates with `{branch}` placeholder)

### Robustness
- **Atomic persistence** — JSON state files (features, repos, preferences) are saved via write-to-temp-then-rename to prevent corruption from partial writes
- **Multi-repo rollback** — If branch creation fails in one repo during feature start, branches already created in other repos are automatically rolled back
- **Worktree-based validation** — Validators run in isolated worktrees rather than modifying the main working directory, preventing branch state corruption
- **PTY lifecycle management** — PTY sessions are automatically cleaned up when the reader thread exits, preventing file descriptor and session leaks
- **Input validation** — Feature names are validated for length, path traversal, and invalid characters
- **Adaptive polling** — Ideation and execution polling use adaptive intervals with maximum retry counts to prevent infinite requests

### Infrastructure
- **Repository management** — Register local git repos, configure base branch, validators, and PR commands
- **Dark theme UI** — Full dark theme with sidebar navigation

## Project Structure

```
goblin-mob-boss/
├── backend/            # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management, plugin setup
│   │   ├── main.rs             # Binary entry point
│   │   ├── commands.rs         # Tauri IPC command handlers
│   │   ├── models.rs           # Data models (Agent, Feature, TaskSpec, Repository, Preferences, SystemMap)
│   │   ├── store.rs            # JSON file-based persistence
│   │   ├── launch.rs           # Launch command builder (Teams/Subagents mode)
│   │   ├── git.rs              # Git operations (branches, merge, push, diff)
│   │   ├── prompts.rs          # Ideation prompt templates
│   │   ├── validators.rs       # Validator execution and result aggregation
│   │   ├── templates.rs        # Built-in agent definitions and feature recipes
│   │   ├── observer.rs         # Execution observability (git activity polling)
│   │   ├── analytics.rs        # Post-execution analysis (plan vs reality)
│   │   ├── guidance.rs         # Mid-execution guidance notes
│   │   └── heuristics.rs       # Task graph analysis and mode recommendation
│   └── tauri.conf.json
├── frontend/           # React (TypeScript) frontend
│   ├── components/     # AddRepoModal, StatusBadge, Terminal
│   ├── pages/          # HomePage, IdeationPage, LaunchConfigPage, FeatureStatusPage, GuidePage, AgentsPage, ReposPage, SettingsPage, SystemMapPage
│   ├── hooks/          # useTauri (IPC wrapper)
│   ├── types/          # TypeScript type definitions
│   ├── test/           # Vitest setup
│   └── styles.css      # Global styles (dark theme)
├── Cargo.toml          # Cargo workspace root
├── package.json        # Frontend dependencies
└── vite.config.ts      # Vite + Vitest configuration
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [npm](https://www.npmjs.com/)
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri v2 system dependencies ([see Tauri docs](https://v2.tauri.app/start/prerequisites/))
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and on PATH

### Development

```bash
# Install frontend dependencies
npm install

# Run in dev mode (starts both Vite and Tauri)
npm run tauri dev

# Build for production
npm run tauri build
```

### Testing

```bash
# Run Rust backend tests
cd backend && cargo test --lib

# Run frontend tests
npm test
```

## License

MIT
