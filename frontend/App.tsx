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

function AppLayout() {
  const { planningCount, executingCount } = useBackgroundPlanning();

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="brand-icon" aria-hidden="true">
              &#x2692;
            </span>
            <h1>Goblin Mob Boss</h1>
          </div>
        </div>
        <div className="sidebar-nav">
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
                <span className="sidebar-planning-badge" title={`${planningCount} planning`}>
                  <span className="spinner spinner-planning" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                  {planningCount}
                </span>
              )}
              {executingCount > 0 && (
                <span className="sidebar-executing-badge" title={`${executingCount} executing`}>
                  <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                  {executingCount}
                </span>
              )}
            </span>
          </NavLink>
          <div className="sidebar-section-label">Settings</div>
          <NavLink
            to="/agents"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            Agents
          </NavLink>
          <NavLink
            to="/repos"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            Repositories
          </NavLink>
          <NavLink
            to="/map"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            System Map
          </NavLink>
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
        <PersistentTerminal />
      </main>
    </div>
  );
}

export default App;
