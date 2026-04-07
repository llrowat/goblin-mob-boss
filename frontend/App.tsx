import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { FeatureDetailPage } from "./pages/FeatureDetailPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ReposPage } from "./pages/ReposPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SystemMapPage } from "./pages/SystemMapPage";
import { TerminalSessionProvider } from "./hooks/useTerminalSession";
import { BackgroundPlanningProvider, useBackgroundPlanning } from "./hooks/useBackgroundPlanning";
import { ToastProvider } from "./hooks/useToast";
import { PersistentTerminal } from "./components/PersistentTerminal";
import { ToastContainer } from "./components/ToastContainer";
import { useTauri } from "./hooks/useTauri";
import { ErrorBoundary } from "./components/ErrorBoundary";
import goblinLogo from "./assets/icon/goblin-logo.png";

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <TerminalSessionProvider>
          <BackgroundPlanningProvider>
            <AppLayout />
          </BackgroundPlanningProvider>
        </TerminalSessionProvider>
        <ToastContainer />
      </ToastProvider>
    </BrowserRouter>
  );
}

function CountBadge({ count }: { count: number | null }) {
  if (count === null) return null;
  const isZero = count === 0;
  return (
    <span
      className={`tab-count-badge${isZero ? " tab-count-warn" : ""}`}
      title={isZero ? "None configured" : `${count} configured`}
    >
      {isZero ? "\u26A0" : count}
    </span>
  );
}

function AppLayout() {
  const { planningCount, executingCount } = useBackgroundPlanning();
  const tauri = useTauri();
  const location = useLocation();
  const navigate = useNavigate();
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [repoCount, setRepoCount] = useState<number | null>(null);
  const [mapCount, setMapCount] = useState<number | null>(null);
  const [activeFeatureCount, setActiveFeatureCount] = useState<number | null>(null);
  const didInitialRedirect = useRef(false);

  // Re-fetch badge counts whenever the route changes
  useEffect(() => {
    tauri.listGlobalAgents().then((a) => setAgentCount(a.length));
    tauri.listRepositories().then((r) => {
      setRepoCount(r.length);
      // On first load, redirect to onboarding if no repos configured
      if (!didInitialRedirect.current) {
        didInitialRedirect.current = true;
        if (r.length === 0 && location.pathname === "/") {
          navigate("/onboarding", { replace: true });
        }
      }
    });
    tauri.listSystemMaps().then((m) => setMapCount(m.length));
  }, [location.pathname]);

  useEffect(() => {
    const loadFeatureCount = () => {
      tauri.listAllFeatures().then((f) => {
        setActiveFeatureCount(f.filter((feat) => feat.status !== "complete").length);
      }).catch(() => {});
    };
    loadFeatureCount();
    const interval = setInterval(loadFeatureCount, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-layout">
      <nav className="topbar" aria-label="Main navigation">
        <NavLink to="/" className="topbar-brand topbar-brand-link" title="Home">
          <img
            src={goblinLogo}
            alt="Goblin Mob Boss"
            className="brand-logo"
          />
        </NavLink>
        <div className="topbar-tabs">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `topbar-tab ${isActive ? "active" : ""}`
            }
          >
            Features
            <span className="tab-badges">
              {activeFeatureCount !== null && activeFeatureCount > 0 && (
                <CountBadge count={activeFeatureCount} />
              )}
              {planningCount > 0 && (
                <span className="tab-planning-badge" title={`${planningCount} planning`} aria-label={`${planningCount} features planning`}>
                  <span className="spinner spinner-planning" style={{ width: 10, height: 10, borderWidth: 1.5 }} aria-hidden="true" />
                  {planningCount}
                </span>
              )}
              {executingCount > 0 && (
                <span className="tab-executing-badge" title={`${executingCount} executing`} aria-label={`${executingCount} features executing`}>
                  <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} aria-hidden="true" />
                  {executingCount}
                </span>
              )}
            </span>
          </NavLink>
          <span className="topbar-divider" aria-hidden="true" />
          <NavLink
            to="/agents"
            className={({ isActive }) =>
              `topbar-tab ${isActive ? "active" : ""}`
            }
          >
            Agents
            <CountBadge count={agentCount} />
          </NavLink>
          <NavLink
            to="/repos"
            className={({ isActive }) =>
              `topbar-tab ${isActive ? "active" : ""}`
            }
          >
            Repositories
            <CountBadge count={repoCount} />
          </NavLink>
          <NavLink
            to="/map"
            className={({ isActive }) =>
              `topbar-tab ${isActive ? "active" : ""}`
            }
          >
            System Map
            <CountBadge count={mapCount} />
          </NavLink>
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `topbar-settings ${isActive ? "active" : ""}`
          }
          title="Preferences"
        >
          &#x2699;
        </NavLink>
      </nav>

      <main className="main-content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
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
