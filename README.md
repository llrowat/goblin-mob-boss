# Goblin Mob Boss

A desktop app for agent-based AI development workflows. Configure agents, plan features interactively with Claude, then launch parallel agents to execute tasks on isolated git worktrees. Features can span multiple repositories simultaneously.

## How It Works

1. **Configure Agents** — Set up AI agents with specialized roles (Full-Stack, Frontend, Backend, Test Writer, Reviewer). 5 built-in agents are provided; create custom agents for your workflow.
2. **Start a Feature** — Describe what you want to build and select one or more repositories. Feature branches are created in all selected repos.
3. **Plan with Claude** — An interactive Claude Code session in plan mode helps you refine the approach and break it into tasks with assigned agents. For multi-repo features, Claude sees context from all repos and tasks specify their target repo.
4. **Execute in Parallel** — Each task gets its own git worktree branched from the feature branch in its target repo. Claude Code agents work on tasks simultaneously with tailored prompts.
5. **Merge & Verify** — Completed tasks merge back to the feature branch in their respective repo. A final verification pass runs validators with test/reviewer agents across all repos.
6. **Push & PR** — Push feature branches and create pull requests across all repos when everything passes.

## Features

- **Agent-based workflow** — Configurable AI agents with roles and system prompts; 5 built-in defaults
- **Interactive planning** — Back-and-forth conversation with Claude in plan mode during ideation; configure which agents are available for task assignment during planning
- **Planning & verification agents** — Choose which agents participate in the planning stage and which handle final verification, independently configured in Settings
- **Multi-repo features** — A single feature can span multiple repositories with coordinated branches, tasks, verification, and PRs
- **Feature branch flow** — Base → feature branch → task work branches → merge back → verify → PR (per repo)
- **Parallel execution** — Multiple Claude Code agents work on separate worktrees simultaneously across repos
- **Repository management** — Register local git repos, configure validators and max parallel agents
- **Auto-generated prompts** — Each agent gets context-aware prompts with acceptance criteria
- **Change summary** — See files changed, lines added/removed per task before merging
- **Live status tracking** — Dashboard polls for task completion and verification results
- **Merge workflow** — Tasks merge to the feature branch; final verification before PR

## Project Structure

```
goblin-mob-boss/
├── backend/            # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── commands.rs         # Tauri IPC commands (agents, features, tasks, verification)
│   │   ├── models.rs           # Data models (Agent, Feature, Task, Repository)
│   │   ├── store.rs            # JSON file-based persistence
│   │   ├── context.rs          # Repo map and related files generation
│   │   ├── claude_md.rs        # CLAUDE.md generation for worktrees
│   │   ├── git.rs              # Git operations (worktrees, branches, merge, push)
│   │   ├── prompts.rs          # Ideation, agent, and verification prompt templates
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
