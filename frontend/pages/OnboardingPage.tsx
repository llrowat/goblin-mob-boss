import { useNavigate } from "react-router-dom";

import goblinLogo from "../assets/icon/goblin-logo.png";
import emptyRepos from "../assets/empty/empty-repos.png";
import emptyAgents from "../assets/empty/empty-agents.png";
import headerHome from "../assets/headers/header-home.png";

const steps = [
  {
    number: 1,
    title: "Claim Your Turf",
    description:
      "Add the repositories you want to work on. Each repo becomes a lair where features take shape.",
    action: "Add Repositories",
    route: "/repos",
    art: emptyRepos,
  },
  {
    number: 2,
    title: "Assemble the Crew",
    description:
      "Define specialized agents — each one a goblin with unique skills and tools. They'll do the heavy lifting.",
    action: "Add Agents",
    route: "/agents",
    art: emptyAgents,
  },
  {
    number: 3,
    title: "Map the Territory",
    description:
      "Draw out your system architecture so the crew knows how the pieces fit together.",
    action: "Create System Map",
    route: "/map",
    art: null,
  },
  {
    number: 4,
    title: "Run the Schemes",
    description:
      "Describe what you want to build. Claude plans the work, your agents execute it, and you ship the result.",
    action: "Start a Feature",
    route: "/",
    art: headerHome,
  },
];

export function OnboardingPage() {
  const navigate = useNavigate();

  return (
    <div className="onboarding">
      <div className="onboarding-hero">
        <img
          src={goblinLogo}
          alt="Goblin Mob Boss"
          className="onboarding-logo"
        />
        <h1 className="onboarding-title">Welcome to Goblin Mob Boss</h1>
        <p className="onboarding-subtitle">
          Your crew of AI agents, ready to scheme and ship features on your
          command.
        </p>
      </div>

      <div className="onboarding-steps">
        {steps.map((step) => (
          <div
            key={step.number}
            className="onboarding-step panel"
            onClick={() => navigate(step.route)}
          >
            <div className="onboarding-step-number">{step.number}</div>
            <div className="onboarding-step-content">
              <h3 className="onboarding-step-title">{step.title}</h3>
              <p className="onboarding-step-desc">{step.description}</p>
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
            {step.art && (
              <img
                src={step.art}
                className="onboarding-step-art"
                alt=""
              />
            )}
          </div>
        ))}
      </div>

      <div className="onboarding-footer">
        <p>You can return here any time by clicking the goblin logo.</p>
      </div>
    </div>
  );
}
