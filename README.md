# Goblin Mob Boss

A desktop app for agent-based AI development workflows. Configure agents, plan features interactively with Claude, then launch parallel agents to execute tasks on isolated git worktrees. Features can span multiple repositories simultaneously.

## How It Works

1. **Configure Agents** — Set up AI agents with specialized roles (Full-Stack, Frontend, Backend, Test Writer, Reviewer, Architect, Product Owner, Security Reviewer, Integration Tester). 9 built-in agents are provided; create custom agents for your workflow.
2. **Start a Feature** — Describe what you want to build and select one or more repositories. Feature branches are created in all selected repos.
3. **Plan with Claude** — An interactive Claude Code session in plan mode helps you refine the approach and break it into tasks, each with assigned implementation agents and verification agents.
4. **Execute in Parallel** — Each task gets its own git worktree. Claude Code agents work on tasks simultaneously, implementing changes and self-verifying using the assigned verification agents' expertise. Tasks report progress via `.gmb/status.json` dot files.
5. **Auto-Merge** — When a task completes (detected via dot file polling), it automatically merges back to the feature branch. When all tasks are merged, the feature is marked ready.
6. **Push & PR** — Push feature branches and create pull requests across all repos.

## Features

- **Agent-based workflow** — Configurable AI agents with roles and system prompts; 5 built-in defaults
- **Interactive planning** — Back-and-forth conversation with Claude in plan mode during ideation; configure which agents are available for task assignment during planning
- **Planning & verification agents** — Choose which agents participate in planning and which handle per-task verification, independently configured in Settings
- **Inline verification** — Each task includes verification agents whose expertise is applied as a self-review step before completion — no separate verification phase
- **Status dot files** — Agents report progress (`implementing`, `verifying`, `done`, `failed`) via `.gmb/status.json`; the app polls these to auto-update status and trigger merges
- **Auto-merge** — Completed tasks automatically merge back to the feature branch; when all tasks merge, the feature is ready for PR
- **Multi-repo features** — A single feature can span multiple repositories with coordinated branches, tasks, and PRs
- **Feature branch flow** — Base → feature branch → task worktrees → auto-merge → PR (per repo)
- **Parallel execution** — Multiple Claude Code agents work on separate worktrees simultaneously across repos
- **Repository management** — Register local git repos, configure validators and max parallel agents
- **Auto-generated prompts** — Each agent gets context-aware prompts with acceptance criteria and verification lenses
- **Change summary** — See files changed, lines added/removed per task before merging
- **Live status tracking** — Dashboard polls dot files for real-time task progress

## Project Structure

```
goblin-mob-boss/
├── backend/            # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── commands.rs         # Tauri IPC commands (agents, features, tasks, status polling)
│   │   ├── models.rs           # Data models (Agent, Feature, Task, Repository)
│   │   ├── store.rs            # JSON file-based persistence
│   │   ├── context.rs          # Repo map and related files generation
│   │   ├── claude_md.rs        # CLAUDE.md generation for worktrees
│   │   ├── git.rs              # Git operations (worktrees, branches, merge, push)
│   │   ├── prompts.rs          # Ideation and agent prompt templates
│   │   └── validators.rs       # Validator execution
│   └── tauri.conf.json
├── frontend/           # React (TypeScript) frontend
│   ├── components/     # StatusBadge, AddRepoModal
│   ├── pages/          # HomePage, IdeationPage, TaskBoardPage, AgentsPage, ReposPage, SettingsPage
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
