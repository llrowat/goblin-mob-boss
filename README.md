# Goblin Mob Boss

A desktop app for agent-based AI development workflows. Describe what you want to build, let Claude plan and break it into tasks, then launch parallel agents to execute them.

## How It Works

1. **Ideate** — Describe what you want to build. The app launches Claude Code to analyze your codebase, create a plan, and break it into parallelizable tasks.
2. **Review** — Tasks appear automatically as Claude creates them. Review the plan and import tasks when ready.
3. **Execute** — Each task gets its own git worktree. Launch Claude Code agents to work on tasks in parallel, with tailored prompts and context.
4. **Monitor** — Track task status from a dashboard. Run validators, mark tasks complete, and manage agent execution.

## Features

- **Ideation-driven workflow** — Start with a description, get a structured task breakdown automatically
- **Parallel agent execution** — Multiple Claude Code agents work on separate worktrees simultaneously
- **Repository management** — Register local git repos with native folder picker, configure validators and max parallel agents
- **Auto-generated prompts** — Each agent gets context-aware prompts with acceptance criteria and validator commands
- **Live status tracking** — Dashboard polls for task completion and verification results
- **Configurable** — Choose your terminal shell, set parallel agent limits per repo

## Project Structure

```
goblin-mob-boss/
├── backend/            # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── commands.rs         # Tauri IPC commands (ideation, agents, tasks)
│   │   ├── models.rs           # Data models (Ideation, Task, Repository)
│   │   ├── store.rs            # JSON file-based persistence
│   │   ├── context.rs          # Repo map and related files generation
│   │   ├── claude_md.rs        # CLAUDE.md generation for worktrees
│   │   ├── git.rs              # Git worktree operations
│   │   ├── prompts.rs          # Ideation and agent prompt templates
│   │   └── validators.rs       # Validator execution
│   └── tauri.conf.json
├── frontend/           # React (TypeScript) frontend
│   ├── components/     # StatusBadge, AddRepoModal
│   ├── pages/          # HomePage, IdeationPage, TaskBoardPage, ReposPage, SettingsPage
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
