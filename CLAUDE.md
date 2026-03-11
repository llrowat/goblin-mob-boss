# Goblin Mob Boss — Agent-Based Development Workflow

## Project Structure

This is a Tauri v2 + React (TypeScript) desktop application with a Rust backend. The app provides a GUI/UX layer on top of Claude Code's multi-agent capabilities — configure agents, plan features interactively, choose an execution mode (Agent Teams or Subagents), then launch Claude Code to execute.

```
goblin-mob-boss/
├── backend/            # Rust backend (Tauri app)
│   ├── src/
│   │   ├── lib.rs              # App entry, state management, plugin setup
│   │   ├── main.rs             # Binary entry point
│   │   ├── commands.rs         # Tauri IPC command handlers (repos, agents, features, ideation, launch, validation, PR)
│   │   ├── models.rs           # Data models (AgentFile, Feature, TaskSpec, Repository, Preferences, ExecutionMode, SystemMap)
│   │   ├── store.rs            # JSON file-based persistence (repos, features, agents, preferences, system maps)
│   │   ├── launch.rs           # Launch command builder (Teams/Subagents mode)
│   │   ├── git.rs              # Git operations (branches, merge, push, diff)
│   │   ├── prompts.rs          # Ideation prompt templates with execution mode heuristics
│   │   ├── validators.rs       # Validator execution and result aggregation
│   │   ├── templates.rs        # Built-in agent definitions and feature recipes
│   │   ├── observer.rs         # Execution observability (git activity polling)
│   │   ├── analytics.rs        # Post-execution analysis (plan vs reality)
│   │   ├── guidance.rs         # Mid-execution guidance notes
│   │   ├── heuristics.rs       # Task graph analysis and mode recommendation
│   │   ├── functional_testing.rs # Functional testing loop (proof collection, QA prompts)
│   │   ├── harness.rs          # Test harness process management (start/stop app under test)
│   │   └── pty.rs              # PTY session management for embedded terminal
│   └── tauri.conf.json
├── frontend/           # React frontend
│   ├── components/     # Shared UI components
│   │   ├── AddRepoModal        # Repository addition dialog (with folder picker)
│   │   ├── StatusBadge         # Feature status indicator
│   │   ├── Terminal            # xterm.js PTY terminal emulation
│   │   ├── PersistentTerminal  # Portal-based terminal with session persistence
│   │   ├── CommandDisplay      # Shell command transparency display
│   │   ├── ToastContainer      # Auto-dismissing toast notifications
│   │   ├── ActivityLog         # Feature lifecycle timeline
│   │   └── ErrorBoundary       # React error boundary with retry
│   ├── pages/          # Page components
│   │   ├── HomePage            # Feature launcher (describe what to build, list active features)
│   │   ├── FeatureDetailPage   # Unified feature lifecycle (ideation, execution, validation, testing, PR)
│   │   ├── feature-detail/     # Sub-components for FeatureDetailPage
│   │   │   ├── PlanningComponents  # TaskTable, ExecutionModeSelector, PlanHistory
│   │   │   ├── ValidationPanel     # Validator results, diff summary, push status
│   │   │   └── TestingPanel        # Functional testing harness, proof collection
│   │   ├── AgentsPage          # Agent CRUD (form-based editor for .claude/agents/*.md files)
│   │   ├── ReposPage           # Repository management (validators, base branch, PR command)
│   │   ├── SettingsPage        # App preferences (shell, execution defaults, model, auto-validate, functional testing)
│   │   └── SystemMapPage       # Interactive system topology map (SVG visualization)
│   ├── hooks/          # React hooks
│   │   ├── useTauri            # Tauri IPC wrapper
│   │   ├── useToast            # Global toast notification context
│   │   ├── useTerminalSession  # PTY session lifecycle context
│   │   └── useBackgroundPlanning # Background ideation tracking and polling
│   ├── types/          # TypeScript type definitions
│   ├── test/           # Test setup
│   │   └── setup.ts            # Vitest global setup (Tauri mock, jest-dom)
│   └── styles.css      # Global styles (dark theme)
├── Cargo.toml          # Workspace root
├── package.json        # Frontend dependencies
└── vite.config.ts      # Vite configuration (with vitest)
```

## Core Workflow

1. **Agents** — Defined as `.claude/agents/*.md` files with YAML frontmatter (name, description, tools, model, system_prompt, color, role). Per-repo and global agents supported. Built-in agent templates available for one-click setup.
2. **Feature** — User starts a feature → creates feature branch from repo base branch with isolated git worktree per repo
3. **Ideation** — Background Claude Code session in plan mode; discovers task specs with assigned agents, recommends an execution mode (Teams vs Subagents) with confidence scoring. Can pause to ask clarifying questions.
4. **Launch Config** — User reviews tasks and execution mode recommendation, selects agents, generates launch command
5. **Execution** — Launch command runs in an embedded PTY terminal; GMB tracks feature status with live progress (commits, file changes, task completion)
6. **Validation** — Run repository validators (tests, linters) against the feature branch; review diff summary; post-execution analysis compares plan vs actual changes
7. **Functional Testing** — Optional QA phase: a test harness runs the app under test while a QA agent exercises it via browser/API/CLI, collecting proof artifacts (screenshots, responses, console output)
8. **PR** — Push feature branch to all repos and create PRs

## Development

```bash
# Install frontend deps
npm install

# Run in dev mode (starts both Vite and Tauri)
npm run tauri dev

# Build for production
npm run tauri build
```

## Environment Notes

- **GTK/WebKit system dependencies** — Rust backend compilation requires `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, and `libjavascriptcoregtk-4.1-dev`. These **will not install** in the Claude mobile app (web) environment. When working from mobile, skip `cargo test --lib` and rely on frontend tests (`npm test`) only. CI will run the full Rust test suite.

## Testing

### Running Tests

```bash
# Run Rust backend unit tests (requires GTK dev libs — skip on mobile/web)
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
- **CI**: GitHub Actions workflow (`.github/workflows/tests.yml`) runs Rust backend and frontend test jobs. Currently set to `workflow_dispatch` (manual trigger) — re-enable push/PR triggers when ready for automated CI.

## Voice & Tone

The app has a light **goblin mob-boss personality** woven into UI copy — empty states, page descriptions, and status messages use playful mob/heist/crew language (e.g., "The crew is idle," "No lairs claimed yet"). Follow these guidelines:

- **Keep it subtle** — One short phrase per empty state or description. Never let flavor text crowd out functional guidance.
- **No war or military language** — Avoid words like battle, war, raid, rally, recruit, orders, troops, deploy. Prefer crew/mob/heist/scheme/lair/hustle framing instead.
- **Usability first** — Every themed message must still clearly communicate what the user should do. If in doubt, lead with the practical instruction and add a touch of character around it.
- **Consistent vocabulary** — Agents are "goblins" or "the mob/crew." Repos are "lairs" or "turf." Features are "schemes" or "jobs." Planning is "scheming." Execution is "the mob at work."
- **Don't overdo it** — Headers, button labels, form fields, and error messages stay plain and functional. Character belongs in descriptions, empty states, and confirmations.

## Documentation

- **Update README after each change** — When a change affects project structure, features, configuration, commands, or public-facing behavior, update the README (and any other relevant documentation) to reflect the change. Documentation should stay in sync with the code at all times.
