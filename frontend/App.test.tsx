import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Mock all page components to isolate sidebar testing
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

describe("App sidebar", () => {
  it("renders Setup section before Work section", () => {
    render(<App />);
    const sectionLabels = screen.getAllByText(/^(Setup|Work)$/i);
    expect(sectionLabels).toHaveLength(2);
    expect(sectionLabels[0]).toHaveTextContent("Setup");
    expect(sectionLabels[1]).toHaveTextContent("Work");
  });

  it("renders Agents, Repositories, and System Map before Features", () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    const items = nav.querySelectorAll(".sidebar-nav-item");
    const labels = Array.from(items).map((el) => el.textContent?.trim());

    const agentsIdx = labels.indexOf("Agents");
    const reposIdx = labels.indexOf("Repositories");
    const mapIdx = labels.indexOf("System Map");
    const featuresIdx = labels.findIndex((l) => l?.startsWith("Features"));

    expect(agentsIdx).toBeLessThan(featuresIdx);
    expect(reposIdx).toBeLessThan(featuresIdx);
    expect(mapIdx).toBeLessThan(featuresIdx);
  });

  it("renders Preferences as the last nav item", () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    const items = nav.querySelectorAll(".sidebar-nav-item");
    const last = items[items.length - 1];
    expect(last).toHaveTextContent("Preferences");
  });
});
