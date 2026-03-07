import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { HomePage } from "./pages/HomePage";
import { FeatureDetailPage } from "./pages/FeatureDetailPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ReposPage } from "./pages/ReposPage";
import { SettingsPage } from "./pages/SettingsPage";
import { GuidePage } from "./pages/GuidePage";
import { SystemMapPage } from "./pages/SystemMapPage";
import { TerminalSessionProvider, useTerminalSession } from "./hooks/useTerminalSession";
import { PersistentTerminal } from "./components/PersistentTerminal";
import type { Feature } from "./types";

function App() {
  return (
    <BrowserRouter>
      <TerminalSessionProvider>
        <AppLayout />
      </TerminalSessionProvider>
    </BrowserRouter>
  );
}

function useExecutingCount() {
  const { session } = useTerminalSession();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const poll = () => {
      invoke<Feature[]>("list_features", { repoId: null }).then((features) => {
        setCount(features.filter((f) => f.status === "executing").length);
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [session]);

  return count;
}

function AppLayout() {
  const executingCount = useExecutingCount();

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
            {executingCount > 0 && (
              <span className="sidebar-executing-badge">
                <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                {executingCount}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/guide"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            Guide
          </NavLink>
          <NavLink
            to="/map"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? "active" : ""}`
            }
          >
            System Map
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
<Route path="/guide" element={<GuidePage />} />
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
