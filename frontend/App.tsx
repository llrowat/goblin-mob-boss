import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { IdeationPage } from "./pages/IdeationPage";
import { LaunchConfigPage } from "./pages/LaunchConfigPage";
import { FeatureStatusPage } from "./pages/FeatureStatusPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ReposPage } from "./pages/ReposPage";
import { SettingsPage } from "./pages/SettingsPage";

function App() {
  return (
    <BrowserRouter>
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
              path="/feature/:featureId/ideation"
              element={<IdeationPage />}
            />
            <Route
              path="/feature/:featureId/launch"
              element={<LaunchConfigPage />}
            />
            <Route
              path="/feature/:featureId/status"
              element={<FeatureStatusPage />}
            />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/repos" element={<ReposPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
