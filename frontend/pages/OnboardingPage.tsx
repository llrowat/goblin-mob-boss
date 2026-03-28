import { useNavigate } from "react-router-dom";

const setupSteps = [
  {
    number: 1,
    title: "Add Repositories",
    flavor: "Claim your turf.",
    description:
      "Point GMB at the repos you want to work on. Configure base branches, validators, and PR settings.",
    detail:
      "Validators are shell commands (like `npm test` or `cargo clippy`) that verify work quality. GMB runs them automatically after agents finish coding.",
    action: "Add Repositories",
    route: "/repos",
  },
  {
    number: 2,
    title: "Create Agents",
    flavor: "Assemble the mob.",
    description:
      "Define specialized agents with specific tools, models, and system prompts. They handle the work.",
    detail:
      "Each agent gets a system prompt that shapes its expertise. A frontend agent knows to focus on UI; a backend agent focuses on API logic. Start with the built-in templates — you can customize later.",
    action: "Create Agents",
    route: "/agents",
  },
  {
    number: 3,
    title: "Build a System Map",
    flavor: "Map the territory.",
    description:
      "Lay out your architecture — services, databases, queues — so agents understand how the pieces connect.",
    detail:
      "System maps help Claude make better architectural decisions during planning. You can auto-discover them from your repos, or skip this step if you have a simple project.",
    action: "Build System Map",
    route: "/map",
    optional: true,
  },
];

const workSteps = [
  {
    number: 4,
    title: "Implement Features",
    flavor: "Time to hustle.",
    description:
      "Describe what you want to build. Claude plans the tasks, agents execute them, and you review and ship.",
    detail:
      "The workflow: describe your feature → Claude creates a plan with tasks and agent assignments → you review and tweak → agents execute → validators check the work → you push and create PRs. Each step gives you control to adjust.",
    action: "Start a Feature",
    route: "/",
  },
];

export function OnboardingPage() {
  const navigate = useNavigate();

  return (
    <div className="onboarding">
      <div className="onboarding-hero">
        <h1 className="onboarding-title">Welcome to Goblin Mob Boss</h1>
        <p className="onboarding-subtitle">
          Your mob of AI agents, ready to scheme and ship features on your
          command.
        </p>
        <p className="onboarding-explainer">
          GMB helps you use Claude Code more effectively. It handles context
          injection, agent management, planning, and execution mode selection
          — so your agents start with the right context and the right strategy.
        </p>
      </div>

      <div className="onboarding-section-label">Set up context</div>
      <div className="onboarding-steps">
        {setupSteps.map((step) => (
          <div
            key={step.number}
            className="onboarding-step panel"
            onClick={() => navigate(step.route)}
          >
            <div className="onboarding-step-number">{step.number}</div>
            <div className="onboarding-step-content">
              <h3 className="onboarding-step-title">
                {step.title}
                <span className="onboarding-step-flavor">{step.flavor}</span>
                {step.optional && (
                  <span className="onboarding-optional-badge">Optional</span>
                )}
              </h3>
              <p className="onboarding-step-desc">{step.description}</p>
              {step.detail && (
                <p className="onboarding-step-detail">{step.detail}</p>
              )}
              <button
                className="btn btn-secondary btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(step.route);
                }}
              >
                {step.action} &rarr;
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="onboarding-section-label">Do work</div>
      <div className="onboarding-steps">
        {workSteps.map((step) => (
          <div
            key={step.number}
            className="onboarding-step panel"
            onClick={() => navigate(step.route)}
          >
            <div className="onboarding-step-number">{step.number}</div>
            <div className="onboarding-step-content">
              <h3 className="onboarding-step-title">
                {step.title}
                <span className="onboarding-step-flavor">{step.flavor}</span>
              </h3>
              <p className="onboarding-step-desc">{step.description}</p>
              {step.detail && (
                <p className="onboarding-step-detail">{step.detail}</p>
              )}
              <button
                className="btn btn-secondary btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(step.route);
                }}
              >
                {step.action} &rarr;
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="onboarding-footer">
        <p>You can return here any time by clicking the goblin logo.</p>
      </div>
    </div>
  );
}
