import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

// Mock all page components to isolate tab bar testing
vi.mock("./pages/HomePage", () => ({
  HomePage: () => <div data-testid="home-page" />,
}));
vi.mock("./pages/FeatureDetailPage", () => ({
  FeatureDetailPage: () => <div data-testid="feature-detail-page" />,
}));
vi.mock("./pages/AgentsPage", () => ({
  AgentsPage: () => <div data-testid="agents-page" />,
}));
vi.mock("./pages/ReposPage", () => ({
  ReposPage: () => <div data-testid="repos-page" />,
}));
vi.mock("./pages/SettingsPage", () => ({
  SettingsPage: () => <div data-testid="settings-page" />,
}));
vi.mock("./pages/SystemMapPage", () => ({
  SystemMapPage: () => <div data-testid="system-map-page" />,
}));
vi.mock("./pages/OnboardingPage", () => ({
  OnboardingPage: () => <div data-testid="onboarding-page" />,
}));

// Mock providers and components that need Tauri
vi.mock("./hooks/useBackgroundPlanning", () => ({
  BackgroundPlanningProvider: ({ children }: { children: React.ReactNode }) => children,
  useBackgroundPlanning: () => ({ planningCount: 0, executingCount: 0 }),
}));
vi.mock("./components/PersistentTerminal", () => ({
  PersistentTerminal: () => null,
}));
vi.mock("./hooks/useTerminalSession", () => ({
  TerminalSessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useTerminalSession: () => ({ sessions: [], createSession: vi.fn() }),
}));

function mockCounts(agents: number, repos: number, maps: number) {
  const agentList = Array.from({ length: agents }, (_, i) => ({
    filename: `a${i}.md`, name: `Agent ${i}`, description: "",
    role: "developer", color: "#fff", system_prompt: "", tools: [], enabled: true,
  }));
  const repoList = Array.from({ length: repos }, (_, i) => ({
    id: `r${i}`, name: `repo${i}`, path: `/r${i}`, base_branch: "main",
    validators: [], pr_command: null, description: null, similar_repo_ids: [],
  }));
  const mapList = Array.from({ length: maps }, (_, i) => ({
    id: `m${i}`, name: `Map ${i}`, description: "", services: [], connections: [],
  }));

  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "list_global_agents") return Promise.resolve(agentList);
    if (cmd === "list_repositories") return Promise.resolve(repoList);
    if (cmd === "list_system_maps") return Promise.resolve(mapList);
    return Promise.resolve([]);
  });
}

describe("App tab bar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCounts(1, 1, 1);
  });

  it("renders all navigation tabs", async () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    const tabs = nav.querySelectorAll(".topbar-tab");
    const labels = Array.from(tabs).map((el) => el.textContent?.replace(/[\d⚠]/g, "").trim());

    expect(labels).toContain("Features");
    expect(labels).toContain("Agents");
    expect(labels).toContain("Repositories");
    expect(labels).toContain("System Map");
    await waitFor(() => {});
  });

  it("renders Features tab before the setup tabs", async () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    const tabs = nav.querySelectorAll(".topbar-tab");
    const labels = Array.from(tabs).map((el) => el.textContent?.replace(/[\d⚠]/g, "").trim());

    const featuresIdx = labels.indexOf("Features");
    const agentsIdx = labels.indexOf("Agents");
    const reposIdx = labels.indexOf("Repositories");
    const mapIdx = labels.indexOf("System Map");

    expect(featuresIdx).toBeLessThan(agentsIdx);
    expect(featuresIdx).toBeLessThan(reposIdx);
    expect(featuresIdx).toBeLessThan(mapIdx);
    await waitFor(() => {});
  });

  it("renders Preferences as a settings icon separate from tabs", async () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    const settingsLink = nav.querySelector(".topbar-settings");
    expect(settingsLink).toBeTruthy();
    expect(settingsLink).toHaveAttribute("title", "Preferences");
    await waitFor(() => {});
  });

  it("shows count badges for agents, repos, and system maps", async () => {
    mockCounts(3, 2, 1);
    render(<App />);

    await waitFor(() => {
      const badges = document.querySelectorAll(".tab-count-badge");
      expect(badges).toHaveLength(3);
    });

    const badges = document.querySelectorAll(".tab-count-badge");
    const texts = Array.from(badges).map((b) => b.textContent);
    expect(texts).toContain("3");
    expect(texts).toContain("2");
    expect(texts).toContain("1");
  });

  it("shows warning icon when count is zero", async () => {
    mockCounts(0, 0, 0);
    render(<App />);

    await waitFor(() => {
      const warnBadges = document.querySelectorAll(".tab-count-warn");
      expect(warnBadges).toHaveLength(3);
    });

    const warnBadges = document.querySelectorAll(".tab-count-warn");
    warnBadges.forEach((badge) => {
      expect(badge.textContent).toBe("\u26A0");
    });
  });

  it("shows warning only for items with zero count", async () => {
    mockCounts(2, 0, 1);
    render(<App />);

    await waitFor(() => {
      const badges = document.querySelectorAll(".tab-count-badge");
      expect(badges).toHaveLength(3);
    });

    const warnBadges = document.querySelectorAll(".tab-count-warn");
    expect(warnBadges).toHaveLength(1);
  });

  it("renders the brand logo in the topbar", async () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    const logo = nav.querySelector(".brand-logo");
    expect(logo).toBeTruthy();
    expect(logo).toHaveAttribute("alt", "Goblin Mob Boss");
    await waitFor(() => {});
  });

  it("includes a divider between Features and setup tabs", async () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    const divider = nav.querySelector(".topbar-divider");
    expect(divider).toBeTruthy();
    await waitFor(() => {});
  });

  it("redirects to onboarding when no repos are configured", async () => {
    mockCounts(0, 0, 0);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-page")).toBeTruthy();
    });
  });

  it("shows home page when repos exist", async () => {
    mockCounts(1, 1, 1);
    // Reset URL to root since previous test may have navigated away
    window.history.pushState({}, "", "/");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("home-page")).toBeTruthy();
    });
  });
});
