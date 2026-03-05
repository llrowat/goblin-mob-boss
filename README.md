# Goblin Mob Boss

A local desktop app for structured AI-assisted development workflows. Create tasks, walk through phased pipelines (plan, code, verify), and launch Claude Code with tailored prompts — all from a single interface.

## Features

- **Task creation** — Define tasks with descriptions, select a target repository, and get a structured workflow
- **Phase pipeline** — Walk through plan / code / verify phases with status tracking
- **Repository management** — Register local git repos with native folder picker or manual path entry
- **Claude Code launch** — Open Claude Code in your preferred terminal directly from a task, with context-aware prompts pre-loaded
- **Verification** — Run checks and view results inline
- **Configurable shell** — Choose your preferred terminal (PowerShell, cmd, Windows Terminal, Bash, Zsh) in Settings

## Project Structure

```
goblin-mob-boss/
├── backend/            # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── commands.rs         # Tauri IPC command handlers
│   │   ├── models.rs           # Data models (Task, Repository, etc.)
│   │   ├── store.rs            # JSON file-based persistence
│   │   ├── context.rs          # Task context generation
│   │   ├── claude_md.rs        # CLAUDE.md file management
│   │   ├── git.rs              # Git operations
│   │   ├── prompts.rs          # Prompt templates
│   │   └── validators.rs       # Input validation
│   └── tauri.conf.json
├── frontend/           # React (TypeScript) frontend
│   ├── components/     # Shared UI components
│   ├── pages/          # Page components (Home, Repos, TaskList, TaskDetail, Settings)
│   ├── hooks/          # React hooks (useTauri)
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

# Run frontend tests in watch mode
npm run test:watch
```

## License

MIT
