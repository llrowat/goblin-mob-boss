import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { FeatureDetailPage } from "./pages/FeatureDetailPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ReposPage } from "./pages/ReposPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SystemMapPage } from "./pages/SystemMapPage";
import { TerminalSessionProvider } from "./hooks/useTerminalSession";
import { BackgroundPlanningProvider, useBackgroundPlanning } from "./hooks/useBackgroundPlanning";
import { PersistentTerminal } from "./components/PersistentTerminal";
import { useTauri } from "./hooks/useTauri";
import { ErrorBoundary } from "./components/ErrorBoundary";

function App() {
  return (
    <BrowserRouter>
      <TerminalSessionProvider>
        <BackgroundPlanningProvider>
          <AppLayout />
        </BackgroundPlanningProvider>
      </TerminalSessionProvider>
    </BrowserRouter>
  );
}

function CountBadge({ count }: { count: number | null }) {
  if (count === null) return null;
  const isZero = count === 0;
  return (
    <span
      className={`sidebar-count-badge${isZero ? " sidebar-count-warn" : ""}`}
      title={isZero ? "None configured" : `${count} configured`}
    >
      {isZero ? "\u26A0" : count}
    </span>
  );
}

function AppLayout() {
  const { planningCount, executingCount } = useBackgroundPlanning();
  const tauri = useTauri();
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [repoCount, setRepoCount] = useState<number | null>(null);
  const [mapCount, setMapCount] = useState<number | null>(null);

  useEffect(() => {
    tauri.listGlobalAgents().then((a) => setAgentCount(a.length));
    tauri.listRepositories().then((r) => setRepoCount(r.length));
    tauri.listSystemMaps().then((m) => setMapCount(m.length));
  }, []);

  return (
    <div className="app-layout">
      <nav className="sidebar" aria-label="Main navigation">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="brand-icon" aria-hidden="true">
              &#x2692;
            </span>
            <h1>Goblin Mob Boss</h1>
          </div>
        </div>
        <div className="sidebar-nav">
          <div className="sidebar-section-label">Setup</div>
          <NavLink
            to="/agents"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            Agents
            <span className="sidebar-badges">
              <CountBadge count={agentCount} />
            </span>
          </NavLink>
          <NavLink
            to="/repos"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            Repositories
            <span className="sidebar-badges">
              <CountBadge count={repoCount} />
            </span>
          </NavLink>
          <NavLink
            to="/map"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            System Map
            <span className="sidebar-badges">
              <CountBadge count={mapCount} />
            </span>
          </NavLink>
          <div className="sidebar-section-label">Work</div>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            Features
            <span className="sidebar-badges">
              {planningCount > 0 && (
                <span className="sidebar-planning-badge" title={`${planningCount} planning`} aria-label={`${planningCount} features planning`}>
                  <span className="spinner spinner-planning" style={{ width: 10, height: 10, borderWidth: 1.5 }} aria-hidden="true" />
                  {planningCount}
                </span>
              )}
              {executingCount > 0 && (
                <span className="sidebar-executing-badge" title={`${executingCount} executing`} aria-label={`${executingCount} features executing`}>
                  <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} aria-hidden="true" />
                  {executingCount}
                </span>
              )}
            </span>
          </NavLink>
          <div className="sidebar-spacer" />
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            Preferences
          </NavLink>
        </div>
      </nav>

      <main className="main-content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/feature/:featureId/detail"
              element={<FeatureDetailPage />}
            />
            <Route path="/map" element={<SystemMapPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/repos" element={<ReposPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </ErrorBoundary>
        <PersistentTerminal />
      </main>
    </div>
  );
}

export default App;
