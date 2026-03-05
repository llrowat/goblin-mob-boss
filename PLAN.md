# GMB Refactor: Intelligent Execution Mode + Embedded Terminal

## Vision

GMB becomes a **GUI/UX layer** on top of Claude Code's multi-agent capabilities. It doesn't orchestrate agents — it makes the process of using multi-agent Claude sessions accessible to users unfamiliar with the concepts. Claude Code does the work; GMB provides setup, visibility, and git workflow.

**Key design decision**: During ideation, Claude analyzes the planned tasks and recommends the optimal execution mode — **Agent Teams** (parallel teammates via tmux) or **Subagents** (lead agent delegating subtasks). The user can accept or override. GMB adapts its terminal view and status tracking to whichever mode is chosen.

## Execution Modes

### Agent Teams (tmux mode)
Best for: **Large features with 3+ independent workstreams** touching different parts of the codebase.
- Multiple Claude Code instances running in parallel tmux panes
- Each teammate has its own agent identity (`.claude/agents/*.md`)
- Teammates coordinate via shared task list, file locking, messaging
- GMB shows: multi-pane tmux terminal, per-agent status indicators

### Subagents (single lead)
Best for: **Focused features with sequential/dependent tasks** or tight coordination needs.
- One lead Claude Code instance that spawns subagents as needed
- Lead decides when to delegate, what to delegate, and how to merge results
- Subagents run in the lead's context, visible in a single terminal stream
- GMB shows: single terminal, subagent activity in status panel

### Decision Heuristics (used by ideation prompt)
| Signal | Teams | Subagents |
|--------|-------|-----------|
| Task count | 4+ independent tasks | 1-3 tasks |
| Dependencies | Few cross-task deps | Heavy interdependencies |
| File overlap | Tasks touch different files/dirs | Tasks touch same files |
| Agent diversity | Multiple distinct roles needed | One role + helpers |
| Parallelism | High (>50% tasks can run concurrently) | Low (mostly sequential) |
| Coordination | Light (separate concerns) | Heavy (shared state/APIs) |

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  GMB Desktop App (Tauri v2 + React)                 │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │ Feature   │  │ Agent    │  │ Repo              │ │
│  │ Setup     │  │ Editor   │  │ Config            │ │
│  │ (UI)      │  │ (.claude/│  │ (branches, PRs)   │ │
│  │           │  │ agents/) │  │                   │ │
│  └─────┬─────┘  └──────────┘  └───────────────────┘ │
│        │                                             │
│  ┌─────▼───────────────────────────────────────────┐ │
│  │  Ideation (Claude in plan mode)                 │ │
│  │  → Discovers tasks                              │ │
│  │  → Recommends execution mode: Teams | Subagents │ │
│  │  → User reviews & can override                  │ │
│  └─────┬───────────────────────────────────────────┘ │
│        │                                             │
│  ┌─────▼───────────────────────────────────────────┐ │
│  │  Embedded Terminal (xterm.js + PTY)              │ │
│  │                                                  │ │
│  │  IF Teams:                     IF Subagents:     │ │
│  │  ┌────────┬────────┬───────┐  ┌───────────────┐ │ │
│  │  │ Lead   │ FE Dev │ Test  │  │ Lead Agent    │ │ │
│  │  │ Agent  │        │Writer │  │ (delegates    │ │ │
│  │  │        │        │       │  │  as needed)   │ │ │
│  │  └────────┴────────┴───────┘  └───────────────┘ │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Live Status Summary                            │ │
│  │  Mode: Teams | Agents: ● Lead ● FE ◐ Test      │ │
│  │  Tasks: 3/7 complete  Duration: 12m             │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Git Workflow: Validate → Push → PR             │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## What Changes

### REMOVED (Claude Code owns this now)

| Component | Current GMB | New Owner |
|-----------|------------|-----------|
| Agent definitions | `models.rs` Agent struct, `agents.json`, agent CRUD commands | `.claude/agents/*.md` files (Claude Code native) |
| Task orchestration | Worktrees, per-task branches, status polling, auto-merge | Claude Code (Teams mode: shared task list + file locking; Subagent mode: lead delegates) |
| Process management | External terminal spawning, one process per task | Single embedded PTY session (Teams: tmux multi-pane; Subagents: single stream) |
| Agent system prompts | `prompts.rs` agent_system_prompt, subagent injection | Agent markdown files with frontmatter |
| Task status tracking | `.gmb/status.json` polling every 5s | PTY output parsing (both modes) |
| Worktree management | `git.rs` create/remove worktree | Not needed — Claude Code manages working directory |
| Execution mode decision | Hardcoded: always worktree-per-task | Ideation recommends Teams vs Subagents based on task analysis |
| Multi-repo orchestration | FeatureRepo[], per-repo task storage | Dropped (single repo per feature for v1) |

### KEPT (GMB's value)

| Component | Purpose |
|-----------|---------|
| **Feature setup UI** | Describe what to build, pick repo, name the feature |
| **Agent editor UI** | Visual editor for `.claude/agents/*.md` files |
| **Repo config** | Base branch, validators, PR settings |
| **Ideation** | Launch Claude Code in plan mode, review discovered tasks |
| **Embedded terminal** | xterm.js showing tmux Agent Team session |
| **Live status summary** | Agent activity, task progress, duration, parsed from PTY output |
| **Git workflow** | Feature branch creation, validation, push, PR creation |
| **Settings** | Shell selection, default agents for planning/verification |

### NEW

| Component | Purpose |
|-----------|---------|
| **Embedded PTY terminal** | `portable-pty` + xterm.js + Tauri Channels |
| **Live status panel** | Parse PTY output for agent/task activity (adapts to execution mode) |
| **Agent file editor** | Read/write `.claude/agents/*.md` in repo |
| **Execution mode selector** | Ideation outputs recommendation; UI shows rationale + lets user override |
| **Mode-aware prompt builder** | Builds different launch prompts for Teams vs Subagents |

---

## Implementation Plan

### Phase 1: Embedded Terminal Infrastructure

**Goal**: Replace external terminal launching with an embedded xterm.js terminal connected to a PTY.

#### 1.1 Backend: PTY Management

**New file: `backend/src/pty.rs`**

```rust
// Core types
pub struct PtySession {
    pub id: String,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send>,
}

pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
}

// Tauri Channel event types
pub enum PtyEvent {
    Output { data: String },
    PromptDetected { prompt_type: String },
    Exit { code: i32 },
}
```

**New Tauri commands**:
- `spawn_pty(command, args, env, cwd, on_event: Channel<PtyEvent>) -> session_id`
- `write_to_pty(session_id, data)` — send keystrokes to PTY
- `resize_pty(session_id, rows, cols)` — handle terminal resize
- `kill_pty(session_id)` — terminate session

**Implementation**:
- Spawn PTY with `portable_pty::native_pty_system()`
- Read output in `tokio::task::spawn_blocking` thread
- Forward output via Tauri `Channel<PtyEvent>`
- Store writer handles in `Arc<Mutex<PtyManager>>` as Tauri managed state
- Strip ANSI and pattern-match for permission prompts before forwarding

**Dependencies**: Add `portable-pty = "0.9"` and `regex` to Cargo.toml.

#### 1.2 Frontend: Terminal Component

**New file: `frontend/components/Terminal/Terminal.tsx`**

```typescript
// React component wrapping xterm.js
interface TerminalProps {
  sessionId: string;
  onReady?: () => void;
}
```

**Implementation**:
- Custom React component with `useRef` + `useEffect` for xterm lifecycle
- `@xterm/xterm` v6 with `@xterm/addon-fit` and `@xterm/addon-webgl`
- Subscribe to PTY events via Tauri `Channel`
- `term.write(data)` on each `PtyEvent::Output`
- Terminal is **always interactive** (user can respond to permission prompts in any tmux pane)
- Handle resize via `@xterm/addon-fit` → `resize_pty` command

**Dependencies**: Add `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl` to package.json.

#### 1.3 Tests

- **Rust**: Test PTY spawn/write/kill lifecycle with `portable-pty` (use `echo` or `cat` as test commands)
- **Frontend**: Test Terminal component renders, mocks Channel events, writes to xterm

---

### Phase 2: Agent Editor (`.claude/agents/`)

**Goal**: Replace GMB's custom agent system with a UI for Claude Code's native `.claude/agents/*.md` files.

#### 2.1 Backend: Agent File Operations

**Replace agent CRUD commands** with file-based operations:

- `list_agents(repo_path) -> Vec<AgentFile>` — read all `.claude/agents/*.md` files
- `get_agent(repo_path, filename) -> AgentFile` — read single agent file
- `save_agent(repo_path, agent: AgentFile)` — write agent markdown file
- `delete_agent(repo_path, filename)` — delete agent file
- `list_global_agents() -> Vec<AgentFile>` — read `~/.claude/agents/*.md`

**New model**:
```rust
pub struct AgentFile {
    pub filename: String,        // e.g. "frontend-dev.md"
    pub name: String,            // from frontmatter
    pub description: String,     // from frontmatter
    pub tools: Option<String>,   // from frontmatter
    pub model: Option<String>,   // from frontmatter
    pub system_prompt: String,   // markdown body
}
```

**Implementation**: Parse YAML frontmatter + markdown body. Simple string splitting on `---` delimiters.

#### 2.2 Frontend: Agent Editor Page

**Rewrite `frontend/pages/AgentsPage.tsx`**:

- List agents from repo's `.claude/agents/` directory
- Also show global agents from `~/.claude/agents/` (read-only, with note)
- Edit form: name, description, tools (multi-select), model (dropdown), system prompt (textarea)
- Preview: show rendered markdown file
- Create new agent → writes `.claude/agents/{name}.md`
- Delete agent → removes file

#### 2.3 Remove Old Agent System

- Remove `Agent` struct from `models.rs` (replace with `AgentFile`)
- Remove agent CRUD from `store.rs` (no more `agents.json`)
- Remove built-in agent definitions from `models.rs`
- Remove `agents.json` persistence
- Update `useTauri.ts` — replace old agent commands with new file-based ones

#### 2.4 Tests

- **Rust**: Test agent file parsing (frontmatter + body), round-trip write/read, edge cases
- **Frontend**: Test AgentsPage renders agents, edit form saves correctly

---

### Phase 3: Simplified Feature & Task Flow

**Goal**: Remove worktrees, per-task branches, and multi-repo. Features run as a single Agent Team session on a feature branch.

#### 3.1 Simplify Models

**`models.rs` changes**:

```rust
// REMOVE
// - TaskStatus::Merged (no more per-task merge)
// - TaskDotStatus (no more .gmb/status.json polling)
// - Task.worktree_path, Task.branch (no more worktrees)
// - Feature.repos (no more multi-repo)
// - Agent struct (replaced by AgentFile)

// Execution mode — chosen during ideation, overridable by user
pub enum ExecutionMode {
    Teams,      // Parallel tmux teammates
    Subagents,  // Single lead with delegated subagents
}

pub struct ExecutionRecommendation {
    pub mode: ExecutionMode,
    pub rationale: String,        // Why this mode was chosen (shown in UI)
    pub confidence: f32,          // 0.0-1.0 — low confidence = show prominent override option
}

// SIMPLIFIED Feature
pub struct Feature {
    pub id: String,
    pub name: String,
    pub description: String,
    pub repo_id: String,          // Single repo
    pub branch: String,           // Feature branch
    pub status: FeatureStatus,    // ideation | executing | ready | failed
    pub execution_mode: Option<ExecutionMode>,  // Set after ideation
    pub execution_rationale: Option<String>,     // Why this mode
    pub pty_session_id: Option<String>,          // Active terminal session
    pub created_at: String,
}

pub enum FeatureStatus {
    Ideation,    // Planning phase
    Executing,   // Claude Code running (Teams or Subagents)
    Ready,       // Finished, ready for validation/PR
    Failed,      // Something went wrong
}

// Tasks become lightweight specs (from ideation), not managed entities
// Claude Code owns task execution — GMB just stores the specs for display
pub struct TaskSpec {
    pub title: String,
    pub description: String,
    pub agent: String,            // Agent name (references .claude/agents/)
    pub acceptance_criteria: Vec<String>,
    pub dependencies: Vec<String>,
}
```

#### 3.2 Simplify Commands

**Remove**:
- `start_task`, `complete_task`, `merge_task`, `delete_task`, `update_task_status`
- `poll_task_statuses` (no more status file polling)
- `get_task_diff` (feature-level diff instead)
- `get_task_terminal_command`, `launch_task`

**Simplify**:
- `start_feature` — just creates feature branch, no worktree setup
- `import_tasks` — stores task specs for display only, doesn't create worktrees/branches

**Add**:
- `launch_execution(feature_id, mode: ExecutionMode, agent_names, on_event: Channel<PtyEvent>)` — spawns Claude Code in the chosen mode (Teams: tmux multi-pane; Subagents: single session) in PTY on the feature branch
- `get_feature_diff(feature_id)` — diff between feature branch and base

**Keep**:
- `push_feature`, `get_pr_command` — git workflow unchanged
- Ideation commands — mostly unchanged
- Repository & preferences commands — unchanged

#### 3.3 Remove Worktree & Context Infrastructure

- Remove `context.rs` (Agent Teams discovers context itself)
- Remove `claude_md.rs` (agents read `.claude/agents/` and CLAUDE.md natively)
- Simplify `git.rs` — remove `create_worktree`, `remove_worktree`; keep branch, merge, push, diff

#### 3.4 Tests

- **Rust**: Test simplified feature flow, team launch command, feature diff
- **Frontend**: Test updated TaskBoardPage with embedded terminal

---

### Phase 4: Mode-Aware Launch & Live Status

**Goal**: Build the execution mode selector, mode-aware prompt builder, and live status summary.

#### 4.1 Ideation → Execution Mode Recommendation

**Update ideation prompt** (`prompts.rs`) to include execution mode analysis:

The ideation system prompt already asks Claude to discover tasks. Now it also asks Claude to output an execution mode recommendation as part of the task discovery JSON:

```json
{
  "tasks": [ ... ],
  "execution_mode": {
    "recommended": "teams" | "subagents",
    "rationale": "4 independent tasks touching separate directories with minimal file overlap. Frontend, backend, and test tasks can all run in parallel.",
    "confidence": 0.85
  }
}
```

**Guidance included in the ideation prompt**:

```
## Execution Mode Analysis

After defining tasks, recommend an execution mode:

**Choose "teams"** when:
- 4+ tasks can run in parallel
- Tasks touch different files/directories with minimal overlap
- Multiple distinct agent roles are needed (e.g., frontend + backend + testing)
- Dependencies between tasks are few and well-defined

**Choose "subagents"** when:
- Fewer than 4 tasks, or tasks are mostly sequential
- Tasks modify the same files or tightly coupled modules
- Heavy coordination is needed (shared APIs, database schemas, etc.)
- A single lead agent can effectively orchestrate the work

Include a rationale explaining your reasoning and a confidence score (0.0-1.0).
Low confidence means the feature could go either way — the user should review.
```

#### 4.2 Execution Mode UI (IdeationPage update)

After task discovery, the IdeationPage shows:

1. **Discovered tasks** (existing)
2. **Recommended execution mode** (NEW):
   - Mode badge: "Teams" or "Subagents"
   - Rationale text from Claude
   - Confidence indicator (high/medium/low)
   - **Override toggle**: User can switch to the other mode
   - If confidence < 0.6, the override option is prominently displayed

User clicks "Import Tasks & Start Working" → stores both task specs AND execution mode on the Feature.

#### 4.3 Mode-Aware Prompt Builder

**New file: `backend/src/launch.rs`** (renamed from `team.rs` — handles both modes)

Two prompt generation paths:

**Teams mode**:
```
Implement this feature using your team of agents:

## Feature: {name}
{description}

## Tasks
{task specs with agent assignments}

## Available Agents
{comma-separated agent names from .claude/agents/}

## Instructions
- Work on branch: {branch}
- Coordinate via shared task list
- Run validators when complete: {validators}
```

Launch command:
```rust
// Teams mode
env.insert("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "1");
// claude --teammate-mode tmux --append-system-prompt-file <prompt>
```

**Subagents mode**:
```
Implement this feature. You are the lead agent — delegate subtasks
to subagents as you see fit.

## Feature: {name}
{description}

## Tasks
{task specs — these are suggestions, you may reorganize}

## Available Agents
You can use these project agents as subagents: {agent names}

## Instructions
- Work on branch: {branch}
- Use the Agent tool to delegate work to subagents when beneficial
- Run validators when complete: {validators}
```

Launch command:
```rust
// Subagents mode — no teams env var, just a single Claude Code session
// claude --append-system-prompt-file <prompt>
```

#### 4.4 Live Status Summary

**New file: `frontend/components/StatusSummary/StatusSummary.tsx`**

Adapts display based on execution mode:

**Teams mode**:
- Per-agent status indicators (active/idle/done)
- Which agent is working on what
- Task completion progress

**Subagents mode**:
- Lead agent status
- Active subagent count and names
- Current delegation activity
- Task completion progress

**Common**:
- Session duration timer
- Overall progress bar

**Implementation**:
- Maintain state from `PtyEvent` stream
- Pattern match differs by mode:
  - Teams: tmux pane creation, teammate spawn messages
  - Subagents: "Agent tool" invocations, subagent completion messages
- Update React state on each relevant event

#### 4.5 Updated Task Board Page

**Rewrite `frontend/pages/TaskBoardPage.tsx`**:

Three sections:
1. **Status Summary** — mode indicator + agent activity + progress
2. **Embedded Terminal** — Teams: tmux multi-pane; Subagents: single pane
3. **Actions Bar** — "Launch" (if not started), "Stop" (kill PTY), "Validate", "Push & PR"

Mode badge shown prominently. Task specs from ideation in collapsible sidebar.

#### 4.6 Tests

- **Rust**: Test both prompt builder paths (teams + subagents), env setup per mode
- **Frontend**: Test StatusSummary in both modes with mock PTY events
- **Frontend**: Test execution mode selector in IdeationPage
- **Frontend**: Test TaskBoardPage adapts layout to execution mode

---

### Phase 5: Git Workflow & Validation

**Goal**: Post-team-completion flow — validate, push, and create PR.

#### 5.1 Validation

When the team signals completion (detected from PTY output):
- Feature status → `Ready`
- "Run Validators" button enabled
- Runs configured validators on feature branch (existing `validators.rs` logic)
- Shows pass/fail results in UI

#### 5.2 Push & PR

Unchanged from current implementation:
- `push_feature` — pushes feature branch to origin
- `get_pr_command` — returns `gh pr create` command
- Could enhance: auto-generate PR description from team's task completion summaries

#### 5.3 Tests

- **Rust**: Test validation on feature branch (no worktree)
- **Frontend**: Test validation results display, PR flow

---

### Phase 6: Cleanup & Documentation

#### 6.1 Remove Dead Code

- Delete `backend/src/context.rs`
- Delete `backend/src/claude_md.rs`
- Remove old agent/task CRUD from `commands.rs` and `store.rs`
- Remove `agents.json` references
- Remove multi-repo code paths from all files
- Clean up unused CSS classes in `styles.css`
- Remove old test files for deleted functionality

#### 6.2 Simplify Store

- Remove `agents.json` persistence (agents live in `.claude/agents/`)
- Remove per-repo `tasks.json` (task specs stored with feature)
- Keep: `repositories.json`, `features.json`, `preferences.json`

#### 6.3 Update README & CLAUDE.md

- Document new architecture
- Update project structure
- Update development and testing instructions
- Document Agent Teams dependency and setup

#### 6.4 Tests

- Verify all existing tests still pass or are updated
- Run full test suite: `cd backend && cargo test --lib` and `npm test`

---

## Migration Summary

### Files to CREATE
| File | Purpose |
|------|---------|
| `backend/src/pty.rs` | PTY management (spawn, read, write, kill) |
| `backend/src/launch.rs` | Mode-aware prompt builder (Teams + Subagents paths) |
| `frontend/components/Terminal/Terminal.tsx` | xterm.js React wrapper |
| `frontend/components/Terminal/Terminal.test.tsx` | Terminal tests |
| `frontend/components/StatusSummary/StatusSummary.tsx` | Mode-aware live agent/task status |
| `frontend/components/StatusSummary/StatusSummary.test.tsx` | Status summary tests |
| `frontend/components/ExecutionModeSelector/ExecutionModeSelector.tsx` | Mode recommendation display + override toggle |
| `frontend/components/ExecutionModeSelector/ExecutionModeSelector.test.tsx` | Mode selector tests |

### Files to SIGNIFICANTLY REWRITE
| File | Changes |
|------|---------|
| `backend/src/commands.rs` | Remove task lifecycle commands, add team launch + agent file ops |
| `backend/src/models.rs` | Simplify Feature, remove Task/Agent, add AgentFile |
| `backend/src/store.rs` | Remove agent/task persistence |
| `backend/src/git.rs` | Remove worktree functions |
| `backend/src/prompts.rs` | Simplify to team prompt only |
| `backend/src/lib.rs` | Update registered commands |
| `frontend/pages/TaskBoardPage.tsx` | Embedded terminal + status summary |
| `frontend/pages/AgentsPage.tsx` | File-based agent editor |
| `frontend/pages/HomePage.tsx` | Remove multi-repo |
| `frontend/pages/IdeationPage.tsx` | Add execution mode recommendation display + override |
| `frontend/hooks/useTauri.ts` | Update command signatures |
| `frontend/types/index.ts` | Match new models (add ExecutionMode, ExecutionRecommendation) |

### Files to DELETE
| File | Reason |
|------|--------|
| `backend/src/context.rs` | Agent Teams discovers context natively |
| `backend/src/claude_md.rs` | Agents read .claude/agents/ natively |

### Dependencies to ADD
| Dependency | Where | Purpose |
|------------|-------|---------|
| `portable-pty = "0.9"` | Cargo.toml | PTY spawning |
| `regex` | Cargo.toml | ANSI stripping, prompt detection |
| `@xterm/xterm` | package.json | Terminal rendering |
| `@xterm/addon-fit` | package.json | Terminal auto-resize |
| `@xterm/addon-webgl` | package.json | GPU-accelerated rendering |

### Dependencies to REMOVE
| Dependency | Where | Reason |
|------------|-------|--------|
| `tauri-plugin-shell` | Cargo.toml | No more external terminal spawning |

---

## Execution Order

1. **Phase 1** (Terminal) — Foundation. Everything depends on this.
2. **Phase 2** (Agents) — Independent of Phase 1. Can parallel.
3. **Phase 3** (Simplify) — Depends on Phase 1 & 2 being complete.
4. **Phase 4** (Team Launch) — Depends on Phase 1 & 3.
5. **Phase 5** (Git Workflow) — Depends on Phase 3.
6. **Phase 6** (Cleanup) — Last. After everything works.

Phases 1 and 2 can run in parallel. Phases 4 and 5 can run in parallel after Phase 3.
