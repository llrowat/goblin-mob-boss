# Goblin Mob Boss — Claude Code Launch Pad

## Project Structure

This is a Tauri v2 + React (TypeScript) desktop application with a Rust backend. The app provides structured AI-assisted development workflows — task creation, phase pipelines, verification, and Claude Code integration.

```
goblin-mob-boss/
├── backend/            # Rust backend (Tauri app)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── main.rs             # Binary entry
│   │   ├── commands.rs         # Tauri IPC command handlers
│   │   ├── models.rs           # Data models (Task, Repository, Preferences, etc.)
│   │   ├── store.rs            # JSON file-based persistence (repos, tasks, preferences)
│   │   ├── context.rs          # Task context generation
│   │   ├── claude_md.rs        # CLAUDE.md file management
│   │   ├── git.rs              # Git operations
│   │   ├── prompts.rs          # Prompt templates
│   │   └── validators.rs       # Input validation
│   └── tauri.conf.json
├── frontend/           # React frontend
│   ├── components/     # Shared UI components
│   │   ├── AddRepoModal        # Repository addition dialog (with folder picker)
│   │   ├── PhasePipeline       # Task phase visualization
│   │   └── StatusBadge         # Task status indicator
│   ├── pages/          # Page components
│   │   ├── HomePage            # New task creation
│   │   ├── ReposPage           # Repository management
│   │   ├── TaskListPage        # Task list view
│   │   ├── TaskDetailPage      # Task detail with phases and Claude Code launch
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
