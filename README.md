<p align="center">
  <img src="frontend/assets/icon/goblin-logo.png" alt="Goblin Mob Boss" width="120" />
</p>

<h1 align="center">Goblin Mob Boss</h1>

<p align="center">
  Get more out of Claude Code.<br/>
  GMB guides you through planning, context injection, agent setup, and execution mode selection — so your agents start with the right context and the right strategy.
</p>

<p align="center">
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#screenshots">Screenshots</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

## What Is This?

Goblin Mob Boss (GMB) is a desktop app that helps you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code) more effectively. It doesn't replace Claude Code — it sits in front of it and handles the parts that make multi-agent workflows succeed or fail: **context injection**, **agent management**, **forced planning**, and **execution mode selection**.

Without GMB, getting good results from Claude Code agents means manually wrangling agent files, crafting prompts with the right context, deciding how to split work, and managing branches across repos. GMB turns that into a guided workflow:

- **Simplifies context injection** — Attach design specs, API schemas, and reference docs. GMB includes them in both planning and execution prompts so agents start with full context.
- **Manages agents & skills** — Visual editor for agents and skills with built-in templates and auto-generation. No more hand-editing YAML frontmatter.
- **Forces planning** — Every feature goes through an interactive planning phase with Claude before any code is written. The planner breaks work into task specs, assigns agents, and can ask you clarifying questions.
- **Suggests execution modes** — GMB analyzes your task dependency graph and recommends the right approach:
  - **Agent Teams** — Multiple Claude Code instances running in parallel, each with its own agent identity. Best for large features with independent workstreams.
  - **Subagents** — A single lead instance that delegates. Best for focused features with dependent tasks.
- **Handles git workflow** — Feature branches, worktrees, cross-repo coordination, validation, and PR creation.

## Screenshots

| Features | Feature Planning |
|:---:|:---:|
| ![Features](screenshots/home.png) | ![Planning](screenshots/feature-detail.png) |

| Agents & Skills | Repositories |
|:---:|:---:|
| ![Agents & Skills](screenshots/agents.png) | ![Repositories](screenshots/repos.png) |

| System Map |
|:---:|
| ![System Map](screenshots/system-map.png) |

## How It Works

1. **Register repos** — Point GMB at your local git repositories. Configure base branches, validators (tests, linters), and PR commands.

2. **Configure agents & skills** — Agents (`.claude/agents/*.md`) define who does the work; skills (`.claude/skills/<name>/SKILL.md`) define reusable workflows. Use the built-in form editor, add from templates, or let Claude auto-generate skills from a description.

3. **Start a feature** — Describe what you want to build, select repos, optionally attach docs (design specs, API schemas, reference files). GMB creates a feature branch and provisions a git worktree per repo.

4. **Plan with Claude** — An interactive Claude Code session in plan mode breaks the work into task specs with assigned agents. The planner can pause to ask clarifying questions — you answer in the UI, and planning resumes. Every plan revision is snapshotted so you can see how it evolved.

5. **Pick an execution mode** — GMB analyzes the task dependency graph and recommends Agent Teams or Subagents with confidence scoring. You can accept or override.

6. **Launch** — The generated command runs in an embedded PTY terminal. GMB tracks per-task progress, detects stale execution, and auto-completes when done.

7. **Validate** — Run your repo's test suites and linters against the feature branch. Review diffs and post-execution analysis (plan vs. actual changes). Optionally run a functional testing loop where a QA agent exercises the running app via Playwright, API calls, or CLI.

8. **Ship** — Push the feature branch and create PRs across all repos.

## Features

### Planning & Execution
- Interactive planning with clarifying Q&A and plan history
- Two execution modes: Agent Teams (parallel agents) or Subagents (delegated)
- Heuristic-based mode recommendation with confidence scoring
- Task dependency graph analysis (parallelism ratio, critical path)
- Document attachments included in both planning and execution prompts
- Feature lifecycle tracking: Ideation → Configuring → Executing → Testing → Ready → Pushed → Complete

### Agents & Skills
- **Agents** defined as `.claude/agents/*.md` with YAML frontmatter
- Form-based editor with color picker, role selector, tools, model, and system prompt
- Built-in agent templates (Frontend Dev, Backend Dev, Test Engineer, Code Reviewer, etc.)
- Quality-role agents automatically included as verification steps in every plan
- Per-repo and global agents
- **Agent track record** — performance history (success rate, task categories, avg duration) shown on each agent card and injected into planning prompts so Claude makes better agent assignments
- **Skills** defined as `.claude/skills/<name>/SKILL.md` — reusable workflows
- Create skills manually or auto-generate them with Claude (describe what you want, Claude writes the SKILL.md)
- Skills from installed plugins are discovered and shown alongside user-created skills
- Tabbed Agents + Skills UI

### Contextual Help & Onboarding
- Expandable "What is this?" help sections on key concepts: execution modes, agents, skills, validators, planning, functional testing, system maps
- Enhanced onboarding walkthrough with concept explanations at each step
- Progressive disclosure — beginners get guidance, power users can collapse it

### System Map
- Map your service topology: backends, frontends, workers, databases, queues, caches, external services
- Connection types: REST, gRPC, GraphQL, WebSocket, event, shared DB, file system, IPC
- Interactive SVG visualization with drag-and-drop layout
- Auto-discovery mode: Claude scans your repos to find services and connections

### Validation & Git
- Per-repo validators (tests, linters) run in isolated worktrees
- Git worktrees per feature for concurrent development without checkout conflicts
- Diff summary before pushing
- Multi-repo rollback on branch creation failure
- Atomic JSON persistence (write-to-temp-then-rename)

### Functional Testing
- Optional QA phase after implementation
- Test harness manages app-under-test as a background process
- QA agent exercises the app via browser automation, API, or CLI
- Proof artifacts (screenshots, API responses, console output) captured in the UI
- Failed tests loop back to implementation with proof context

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri v2 system dependencies](https://v2.tauri.app/start/prerequisites/)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and on PATH

### Build & Run

```bash
npm install
npm run tauri dev        # Dev mode (Vite + Tauri)
npm run tauri build      # Production build
```

### Testing

```bash
cd backend && cargo test --lib   # Rust backend tests
npm test                          # Frontend tests (Vitest)
```

## Tech Stack

- **Backend:** Rust + Tauri v2
- **Frontend:** React + TypeScript + Vite
- **Terminal:** xterm.js with PTY sessions
- **Persistence:** JSON files with atomic writes
- **Visualization:** Custom SVG rendering for system maps

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.
