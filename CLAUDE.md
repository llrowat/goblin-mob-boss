# Goblin Mob Boss — Agent-Based Development Workflow

## Project Structure

This is a Tauri v2 + React (TypeScript) desktop application with a Rust backend. The app provides agent-based AI development workflows — configure agents, plan features interactively, execute tasks in parallel via Claude Code, merge, verify, and create PRs.

```
goblin-mob-boss/
├── backend/            # Rust backend (Tauri app)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management
│   │   ├── main.rs             # Binary entry
│   │   ├── commands.rs         # Tauri IPC command handlers (agents, features, tasks, verification, PR)
│   │   ├── models.rs           # Data models (Agent, Feature, Task, Repository, Preferences)
│   │   ├── store.rs            # JSON file-based persistence (repos, agents, features, tasks, preferences)
│   │   ├── context.rs          # Repo map and related files generation
│   │   ├── claude_md.rs        # CLAUDE.md file management for worktrees
│   │   ├── git.rs              # Git operations (worktrees, branches, merge, push)
│   │   ├── prompts.rs          # Ideation, agent, and verification prompt templates
│   │   └── validators.rs       # Validator execution
│   └── tauri.conf.json
├── frontend/           # React frontend
│   ├── components/     # Shared UI components
│   │   ├── AddRepoModal        # Repository addition dialog (with folder picker)
│   │   └── StatusBadge         # Task/feature status indicator
│   ├── pages/          # Page components
│   │   ├── HomePage            # Feature launcher (describe what to build, list active features)
│   │   ├── IdeationPage        # Interactive Claude Code planning + task discovery
│   │   ├── TaskBoardPage       # Agent dashboard (task cards, merge, verification, PR)
│   │   ├── AgentsPage          # Agent CRUD (built-in + custom agents)
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

## Core Workflow

1. **Agents** — 5 built-in agents (Full-Stack, Frontend, Backend, Test Writer, Reviewer) + custom agents
2. **Feature** — User starts a feature → creates feature branch from repo base
3. **Ideation** — Interactive Claude Code session in plan mode; results in task specs with assigned agents
4. **Tasks** — Each task gets a worktree branched from the feature branch; Claude Code executes with agent config
5. **Merge** — Completed tasks merge back to the feature branch
6. **Verification** — Final verification pass with test/reviewer agents on the feature branch
7. **PR** — Push feature branch and create PR

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

- **Tests are mandatory** — Every code change (new feature, bug fix, refactor) must include corresponding unit tests. Do not merge or consider a task complete without tests covering the new or changed behavior.
- **Rust backend**: Add `#[cfg(test)] mod tests { ... }` blocks inline in the module being tested. Test both the happy path and error cases. Use `tempfile` for tests that need filesystem access.
- **Frontend**: Use Vitest + React Testing Library. Test files live next to the source files they test (e.g., `Foo.test.tsx` next to `Foo.tsx`). Mock Tauri `invoke` calls via the setup in `frontend/test/setup.ts`.
- **Test naming**: Use descriptive names that explain what is being tested.
- **Verify before committing**: Run `cd backend && cargo test --lib` and `npm test` to ensure all tests pass before committing.

## Documentation

- **Update README after each change** — When a change affects project structure, features, configuration, commands, or public-facing behavior, update the README (and any other relevant documentation) to reflect the change. Documentation should stay in sync with the code at all times.
