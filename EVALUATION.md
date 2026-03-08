# Goblin Mob Boss — App Evaluation & Improvement Recommendations

## Executive Summary

Goblin Mob Boss is a well-architected Tauri v2 + React desktop application with a clear domain model and solid fundamentals. The codebase has 153 passing frontend tests and comprehensive Rust backend test coverage across most modules. The app successfully implements a complex multi-stage workflow (agents → features → ideation → launch → execution → validation → PR) with multi-repository support. Below are findings organized by category with prioritized improvement recommendations.

---

## 1. Architecture & Code Organization

### Strengths
- Clean separation between frontend pages, components, hooks, and types
- Well-encapsulated Tauri IPC layer via `useTauri` hook with 50+ typed commands
- Rust backend modules are well-scoped (git, store, launch, prompts, validators)
- Multi-repo feature support is thoughtfully designed with per-repo worktrees

### Issues

**Critical: Oversized files need decomposition**
- `FeatureDetailPage.tsx` (~65KB) manages the entire feature lifecycle in a single component with 20+ useState hooks. This makes it hard to test individual stages, reason about state transitions, and maintain.
- `SystemMapPage.tsx` (~51KB) handles canvas rendering, service CRUD, connection management, and terminal-based discovery all in one file.
- `commands.rs` (~84KB) contains 77 IPC command handlers — the largest and most critical backend file.

**Recommendation:** Extract sub-components/modules by domain:
- `FeatureDetailPage` → `IdeationSection`, `LaunchConfigSection`, `ExecutionMonitor`, `ValidationSection`, `PRSection`
- `SystemMapPage` → `MapCanvas`, `ServiceEditor`, `ConnectionEditor`, `DiscoveryTerminal`
- `commands.rs` → `repo_commands.rs`, `agent_commands.rs`, `feature_commands.rs`, `ideation_commands.rs`, `system_map_commands.rs`

---

## 2. Error Handling

### Strengths
- Store layer handles corrupted JSON gracefully (returns empty list, creates backup)
- Git operations use a custom `GitError` type internally
- Atomic branch creation with rollback on multi-repo failure

### Issues

**Backend: Generic string errors everywhere**
- All Tauri commands use `Result<T, String>` — no error type hierarchy
- ~281 `unwrap()` calls across the Rust codebase; while most are safe Mutex locks, some in command execution and git config are risky
- No error context propagation (file paths, line numbers lost)

**Frontend: Silent error swallowing**
- `FeatureDetailPage` uses `.catch(() => {})` extensively, silently dropping errors
- No global React error boundary for crash recovery
- Users get no feedback when operations fail silently
- No retry logic or error recovery strategies in the IPC layer

**Recommendations:**
1. Define domain-specific error enums (`StorageError`, `GitError`, `ValidationError`) using `thiserror`
2. Add error banners/toasts to all pages for failed IPC calls
3. Add a React error boundary at the app level
4. Replace silent `.catch(() => {})` with user-visible error states
5. Audit risky `unwrap()` calls and replace with proper error propagation

---

## 3. Test Coverage

### Strengths
- 153 frontend tests across 13 test files — all passing
- Rust backend has good test coverage for `models`, `store`, `git`, `launch`, `prompts`, `validators`, `heuristics`, `observer`, `analytics`, `templates`
- Test infrastructure is solid (Vitest + React Testing Library, tempfile for Rust)

### Gaps

| Area | Status | Impact |
|------|--------|--------|
| `commands.rs` (backend) | **No tests** | Critical — core business logic untested |
| `ReposPage.tsx` | **No tests** | Medium — repo CRUD untested |
| `FeatureDetailPage.tsx` | Has tests but likely incomplete for 65KB file | High — state transitions partially covered |
| Integration tests | None | Medium — no cross-module testing |
| E2E tests | None | Low for now — useful for regression |

**Recommendations:**
1. Add unit tests for `commands.rs` — prioritize feature lifecycle, repo validation, and agent CRUD commands
2. Add `ReposPage.test.tsx` covering add/edit/remove repos, inline editing, validator config
3. Expand `FeatureDetailPage` tests to cover all status transitions and edge cases
4. Fix `act(...)` warnings in existing tests (AddRepoModal, AgentsPage, App, BackgroundPlanning, Settings, PersistentTerminal)

---

## 4. UI/UX & Accessibility

### Strengths
- Consistent dark theme with earthy goblin-themed colors
- Good empty states with thematic messaging and clear CTAs
- Modal overlays with escape-to-close
- Command transparency via `CommandDisplay` component
- Loading states on buttons ("Adding...", "Creating...")

### Issues

**Accessibility gaps:**
- No ARIA labels on icon-only buttons (status dots, branch icons, color swatches)
- Modals don't trap focus or set initial focus on open
- Color-only status indicators (red for executing, green for ready) — need text/icon supplements for colorblind users
- No keyboard navigation testing for modal dialogs
- No skip-to-content link for sidebar navigation

**UX improvements:**
- No confirmation before deleting features (data loss risk)
- Settings page is minimal (only shell selection) — could include theme, notification preferences, default execution mode
- No search/filter on the Agents page when many agents exist
- No undo/redo for destructive operations
- Polling intervals (3s for planning, 5s for features) are fixed — could be adaptive

**Recommendations:**
1. Add `aria-label` to all icon-only buttons and interactive elements
2. Implement focus trap in modals using a library like `focus-trap-react`
3. Add text labels alongside color status indicators
4. Add confirmation dialogs for destructive operations (delete feature, remove repo)
5. Consider keyboard shortcuts for power users (Ctrl+N for new feature, etc.)

---

## 5. Performance & Scalability

### Strengths
- Polling-based sync works well for desktop app scale
- Atomic file writes prevent corruption
- Background planning runs in a separate context

### Issues

**Polling overhead:**
- Multiple `setInterval` timers running simultaneously (3s planning poll, 5s feature list, 2s CLAUDE.md generation check)
- All features loaded into memory at startup — grows with project age
- Agent files read from disk on every `list_agents` call (no caching)
- Full JSON file rewrite on every store change

**Concurrency concerns:**
- All backend state behind a single `Mutex<AppState>` — potential contention
- No guards preventing simultaneous execution of the same feature
- No file locking on JSON store — concurrent processes could corrupt data
- PTY sessions lost on app restart (no session persistence)

**Recommendations:**
1. Replace polling with Tauri event-based notifications where possible
2. Add agent list caching with file-watcher invalidation
3. Consider `RwLock` instead of `Mutex` for read-heavy operations
4. Add feature execution guards (prevent double-launch)
5. Implement lazy loading or pagination for large feature lists

---

## 6. Security

### Strengths
- Shell-quoting utility for command injection prevention
- Path validation rejects `..` and `/` in feature names
- Git repo validation before operations
- No credential storage

### Issues
- Validator commands could be injection vectors if from untrusted source
- No input sanitization for feature descriptions embedded in prompts
- PTY escape sequences not sanitized (arbitrary terminal control possible)
- CSP is set to `null` in Tauri config — should be restricted
- Agent `system_prompt` content is user-supplied and injected into prompts without escaping

**Recommendations:**
1. Set a restrictive CSP in `tauri.conf.json`
2. Sanitize user input before embedding in prompt templates
3. Add output size limits for validator execution
4. Consider sandboxing validator command execution

---

## 7. CI/CD & DevOps

### Issues
- **CI is disabled** — `.github/workflows/tests.yml.disabled` needs to be renamed to `.yml`
- No ESLint configuration file exists despite ESLint being a devDependency
- No Prettier or code formatter configured
- No pre-commit hooks for linting/testing
- No test coverage reporting

**Recommendations:**
1. Enable CI by renaming the workflow file
2. Add `eslint.config.js` with TypeScript rules
3. Add Prettier for consistent formatting
4. Add Husky + lint-staged for pre-commit checks
5. Add coverage reporting (e.g., Codecov integration)

---

## 8. Feature Completeness

### Working well
- Agent CRUD with templates, color picker, role system
- Multi-repo feature creation with branch/worktree management
- Interactive ideation with question/answer flow
- Execution mode recommendation with confidence scoring
- Live execution monitoring (git activity, commit tracking)
- Guidance notes during execution
- Validation runner with output capture
- System map with service/connection visualization
- PR push workflow

### Missing or incomplete
1. **No feature history/archive** — Completed features disappear or accumulate; no way to review past work
2. **No agent performance tracking** — No metrics on which agents perform well on which task types
3. **No plan versioning** — If ideation is re-run, the previous plan is overwritten
4. **No execution logs persistence** — Terminal output is lost after session ends
5. **No notification system** — No alerts when execution completes or validators fail
6. **No import/export** — Can't share agent configurations or feature templates across machines
7. **No worktree cleanup** — `.gmb/worktrees/` grows indefinitely; old worktrees not garbage collected

---

## 9. Prioritized Improvement Roadmap

### P0 — Critical (address first)
1. Enable CI/CD pipeline
2. Add tests for `commands.rs` (backend) and `ReposPage` (frontend)
3. Fix silent error swallowing — add user-visible error feedback
4. Add confirmation dialogs for destructive operations

### P1 — High (significant quality impact)
5. Decompose `FeatureDetailPage.tsx` into sub-components
6. Decompose `commands.rs` into domain-specific modules
7. Add React error boundary
8. Fix `act(...)` warnings in existing tests
9. Add ARIA labels and focus management for accessibility
10. Set restrictive CSP in Tauri config

### P2 — Medium (quality of life)
11. Add agent list caching
12. Replace polling with Tauri events where possible
13. Add feature execution concurrency guards
14. Add worktree garbage collection
15. Add ESLint config and Prettier
16. Expand Settings page (theme, notifications, defaults)

### P3 — Low (nice to have)
17. Feature history/archive view
18. Plan versioning
19. Execution log persistence
20. Agent import/export
21. Keyboard shortcuts for power users
22. Notification system for long-running operations
