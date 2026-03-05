# Goblin Mob Boss

A desktop app for agent-based AI development workflows. Configure agents, plan features interactively with Claude, choose an execution mode (Agent Teams or Subagents), then launch Claude Code to execute — GMB handles setup, visibility, and git workflow.

## How It Works

1. **Configure Agents** — Agents are defined as `.claude/agents/*.md` files with YAML frontmatter (name, description, tools, model, system prompt, color). Manage them per-repo or globally via the built-in form editor.
2. **Start a Feature** — Describe what you want to build and select a repository. A feature branch is created from the repo's base branch.
3. **Plan with Claude** — An interactive Claude Code session in plan mode helps you refine the approach and break it into task specs, each with assigned agents. The ideation prompt includes repo context (languages, structure, available agents).
4. **Configure Launch** — Claude recommends an execution mode based on task analysis:
   - **Agent Teams** — Multiple Claude Code instances in parallel tmux panes, each with its own agent identity. Best for large features with 3+ independent workstreams.
   - **Subagents** — A single lead Claude Code instance that delegates subtasks. Best for focused features with dependent tasks.
   You can accept or override the recommendation, and select which agents participate.
5. **Execute** — Copy the generated launch command and run it. GMB tracks feature status and provides a dashboard with diff summaries and validator results.
6. **Validate & PR** — Run repository validators against the feature branch, review diffs, then push and create a PR.

## Features

- **Execution mode intelligence** — Ideation analyzes planned tasks and recommends Teams or Subagents mode with confidence scoring and rationale
- **Agent management** — Agents stored as `.claude/agents/*.md` files with YAML frontmatter; form-based editor with color picker, tools, model, and system prompt configuration
- **Interactive planning** — Back-and-forth conversation with Claude in plan mode; task specs written to `plan.json` with automatic polling
- **Launch command generation** — GMB builds the appropriate Claude Code command with environment variables, agent configs, and system prompts for the chosen execution mode
- **Repository validators** — Configure shell commands (tests, linters) per repo; run them against the feature branch with detailed stdout/stderr output
- **Feature lifecycle** — Features progress through statuses: Ideation → Configuring → Executing → Ready (or Failed)
- **Git diff summary** — View files changed, lines added/removed before pushing
- **PR creation** — Push feature branch and generate PR command (supports custom `pr_command` templates with `{branch}` placeholder)
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
│   │   ├── models.rs           # Data models (Agent, Feature, TaskSpec, Repository, Preferences)
│   │   ├── store.rs            # JSON file-based persistence (repos, features, agents, preferences)
│   │   ├── launch.rs           # Launch command builder (Teams/Subagents mode)
│   │   ├── git.rs              # Git operations (branches, merge, push, diff)
│   │   ├── prompts.rs          # Ideation prompt templates
│   │   └── validators.rs       # Validator execution and result aggregation
│   └── tauri.conf.json
├── frontend/           # React (TypeScript) frontend
│   ├── components/     # AddRepoModal, StatusBadge
│   ├── pages/          # HomePage, IdeationPage, LaunchConfigPage, FeatureStatusPage, AgentsPage, ReposPage, SettingsPage
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
