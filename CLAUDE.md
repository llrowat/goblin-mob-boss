# Goblin Mob Boss — Claude Code Launch Pad

## Project Structure

This is a Tauri v2 + React (TypeScript) desktop application with a Rust backend. The app provides agent-based AI development workflows — ideation, task creation, parallel agent execution, and status tracking.

```
goblin-mob-boss/
├── backend/            # Rust backend (Tauri app)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── main.rs             # Binary entry
│   │   ├── commands.rs         # Tauri IPC command handlers
│   │   ├── models.rs           # Data models (Ideation, Task, Repository, Preferences)
│   │   ├── store.rs            # JSON file-based persistence (repos, ideations, tasks, preferences)
│   │   ├── context.rs          # Repo map and related files generation
│   │   ├── claude_md.rs        # CLAUDE.md file management for worktrees
│   │   ├── git.rs              # Git operations (worktrees, branches)
│   │   ├── prompts.rs          # Ideation and agent prompt templates
│   │   └── validators.rs       # Validator execution
│   └── tauri.conf.json
├── frontend/           # React frontend
│   ├── components/     # Shared UI components
│   │   ├── AddRepoModal        # Repository addition dialog (with folder picker)
│   │   └── StatusBadge         # Task status indicator
│   ├── pages/          # Page components
│   │   ├── HomePage            # Ideation launcher (describe what to build)
│   │   ├── IdeationPage        # Claude Code launch + task discovery
│   │   ├── TaskBoardPage       # Agent dashboard (task cards, status, actions)
│   │   ├── ReposPage           # Repository management (validators, max agents)
│   │   └── SettingsPage        # App preferences (shell selection)
│   ├── hooks/          # React hooks
│   │   └── useTauri            # Tauri IPC wrapper
│   ├── types/          # TypeScript type definitions
│   ├── test/           # Test setup
│   │   └── setup.ts            # Vitest global setup (Tauri mock, jest-dom)
│   └── styles.css      # Global styles (dark theme)
├── Cargo.toml          # Workspace root
├── package.json        # Frontend dependencies
└── vite.config.ts      # Vite configuration (with vitest)
```

## Development

```bash
# Install frontend deps
npm install

# Run in dev mode (starts both Vite and Tauri)
npm run tauri dev

# Build for production
npm run tauri build
```

## Testing

### Running Tests

```bash
# Run Rust backend unit tests
cd backend && cargo test --lib

# Run frontend tests
npm test

# Run frontend tests in watch mode
npm run test:watch
```

### Testing Requirements

- **Rust backend**: Add `#[cfg(test)] mod tests { ... }` blocks inline in the module being tested. Test both the happy path and error cases.
- **Frontend**: Use Vitest + React Testing Library. Test files live next to the source files they test (e.g., `Foo.test.tsx` next to `Foo.tsx`). Mock Tauri `invoke` calls via the setup in `frontend/test/setup.ts`.
- **Test naming**: Use descriptive names that explain what is being tested.

## Documentation

- **Update README after each change** — When a change affects project structure, features, configuration, commands, or public-facing behavior, update the README (and any other relevant documentation) to reflect the change. Documentation should stay in sync with the code at all times.
