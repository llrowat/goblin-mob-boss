import { useState } from "react";

/**
 * Expandable "What is this?" help section for inline documentation.
 * Provides contextual explanations without cluttering the UI.
 */
export function ContextualHelp({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="contextual-help">
      <button
        className="contextual-help-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        type="button"
      >
        <span className="contextual-help-icon">?</span>
        {title || "What is this?"}
        <span className="contextual-help-chevron" data-open={open}>
          &#9662;
        </span>
      </button>
      {open && <div className="contextual-help-body">{children}</div>}
    </div>
  );
}

/**
 * Pre-built help content blocks for common concepts.
 */
export const HELP_CONTENT = {
  executionModes: (
    <>
      <p>
        <strong>Agent Teams</strong> runs multiple Claude Code instances in
        parallel, each with its own agent identity. Best when tasks are
        independent and touch different files.
      </p>
      <p>
        <strong>Subagents</strong> uses a single lead instance that delegates
        subtasks. Best when tasks are tightly coupled and need coordination.
      </p>
      <p>
        GMB analyzes your task dependencies and recommends an approach, but
        you can override the recommendation.
      </p>
    </>
  ),

  agents: (
    <>
      <p>
        Agents are Claude Code identities defined in{" "}
        <code>.claude/agents/*.md</code> files. Each agent has a system prompt
        that shapes how it approaches work — a frontend agent knows to focus on
        UI, a backend agent focuses on API logic.
      </p>
      <p>
        <strong>Roles</strong> matter: agents marked as "Quality" are
        automatically added as verification steps in plans.
      </p>
      <p>
        Start with the built-in templates below, then customize as you learn
        what works for your codebase.
      </p>
    </>
  ),

  skills: (
    <>
      <p>
        Skills are reusable slash commands (<code>/skill-name</code>) that
        define workflow prompts. Use <code>$ARGUMENTS</code> in the template
        for user-provided input.
      </p>
      <p>
        Example: A "review-pr" skill could contain a prompt that reviews the
        current branch for security issues, code quality, and test coverage.
      </p>
    </>
  ),

  validators: (
    <>
      <p>
        Validators are shell commands (like <code>npm test</code> or{" "}
        <code>cargo clippy</code>) that run against the feature branch after
        execution completes. They verify the agents' work passes your quality
        bar.
      </p>
      <p>
        Add your existing test and lint commands — the same ones you'd run
        before opening a PR.
      </p>
    </>
  ),

  planning: (
    <>
      <p>
        Every feature goes through a planning phase before any code is written.
        Claude explores your codebase, breaks the work into tasks, assigns
        agents, and may ask clarifying questions.
      </p>
      <p>
        You can revise the plan as many times as needed. Each revision is
        saved in the plan history so you can see how it evolved.
      </p>
      <p>
        <strong>Acceptance criteria</strong> are specific, verifiable
        conditions for each task. Agents use these to know when their work is
        done.
      </p>
    </>
  ),

  functionalTesting: (
    <>
      <p>
        After code execution, a QA agent can exercise the running application
        to verify the feature works end-to-end. The agent uses Playwright,
        API calls, or CLI commands to test the app and collect proof artifacts
        (screenshots, responses, console output).
      </p>
      <p>
        If tests fail, the mob gets a chance to fix issues and re-test —
        up to the configured retry limit.
      </p>
    </>
  ),

  systemMap: (
    <>
      <p>
        System maps describe how your services communicate — which services
        exist, what they depend on, and how they talk to each other. This
        context helps Claude make better architectural decisions during
        planning.
      </p>
      <p>
        You can auto-discover maps from your repos or build them manually.
      </p>
    </>
  ),
};
