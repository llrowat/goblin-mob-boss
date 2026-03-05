import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { IdeationPage } from "./pages/IdeationPage";
import { TaskBoardPage } from "./pages/TaskBoardPage";
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
              Ideate
            </NavLink>

            <div className="sidebar-section-label">Settings</div>
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
            <Route path="/ideation/:ideationId" element={<IdeationPage />} />
            <Route path="/tasks/:repoId" element={<TaskBoardPage />} />
            <Route path="/repos" element={<ReposPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
