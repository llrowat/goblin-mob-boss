import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import type {
  AgentFile,
  FeatureRecipe,
  Repository,
} from "../types";

export function GuidePage() {
  const tauri = useTauri();
  const [builtInAgents, setBuiltInAgents] = useState<AgentFile[]>([]);
  const [recipes, setRecipes] = useState<FeatureRecipe[]>([]);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [appliedAgents, setAppliedAgents] = useState<Set<string>>(
    new Set(),
  );
  const [applying, setApplying] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"agents" | "recipes">("agents");

  useEffect(() => {
    tauri.listBuiltInAgents().then(setBuiltInAgents);
    tauri.listFeatureRecipes().then(setRecipes);
    tauri.listRepositories().then((r) => {
      setRepos(r);
      if (r.length > 0) setSelectedRepo(r[0].path);
    });
  }, []);

  const handleAddBuiltIn = async (filename: string) => {
    if (!selectedRepo) return;
    setApplying(filename);
    try {
      await tauri.addBuiltInAgent(selectedRepo, filename);
      setAppliedAgents((prev) => new Set(prev).add(filename));
    } catch {
      // Best-effort
    } finally {
      setApplying(null);
    }
  };

  const categoryColors: Record<string, string> = {
    development: "#5b8abd",
    quality: "#c9a84c",
    infrastructure: "#c45a6a",
    backend: "#6b9e6b",
    frontend: "#5b8abd",
    "full-stack": "#9b6b9e",
    maintenance: "#7ba3cc",
  };

  return (
    <div>
      <div className="page-header">
        <h2>Guide</h2>
        <p>
          Built-in agents and recipes to help you get the most out of
          multi-agent workflows.
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${activeTab === "agents" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("agents")}
        >
          Built-in Agents ({builtInAgents.length})
        </button>
        <button
          className={`btn ${activeTab === "recipes" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("recipes")}
        >
          Feature Recipes ({recipes.length})
        </button>
      </div>

      {/* Built-in Agents Tab */}
      {activeTab === "agents" && (
        <>
          {repos.length > 0 && (
            <div className="panel" style={{ marginBottom: 16, padding: 12 }}>
              <label
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  marginRight: 8,
                }}
              >
                Add to repository:
              </label>
              <select
                className="form-select"
                value={selectedRepo}
                onChange={(e) => setSelectedRepo(e.target.value)}
                style={{ maxWidth: 300 }}
              >
                {repos.map((r) => (
                  <option key={r.id} value={r.path}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {builtInAgents.map((agent) => (
              <div key={agent.filename} className="panel" style={{ padding: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      backgroundColor: agent.color,
                      flexShrink: 0,
                    }}
                  />
                  <div
                    className="panel-title"
                    style={{ margin: 0, flex: 1 }}
                  >
                    {agent.name}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      backgroundColor: "rgba(90, 138, 92, 0.15)",
                      color: "#5a8a5c",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    built-in
                  </span>
                </div>

                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    marginBottom: 12,
                  }}
                >
                  {agent.description}
                </p>

                {agent.tools && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginBottom: 8,
                    }}
                  >
                    Tools: {agent.tools}
                  </div>
                )}

                <button
                  className={`btn btn-sm ${appliedAgents.has(agent.filename) ? "btn-secondary" : "btn-primary"}`}
                  onClick={() => handleAddBuiltIn(agent.filename)}
                  disabled={
                    !selectedRepo ||
                    applying === agent.filename ||
                    appliedAgents.has(agent.filename)
                  }
                  style={{ width: "100%" }}
                >
                  {appliedAgents.has(agent.filename)
                    ? "Added"
                    : applying === agent.filename
                      ? "Adding..."
                      : "Add to Repository"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Feature Recipes Tab */}
      {activeTab === "recipes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {recipes.map((r) => (
            <div key={r.id} className="panel" style={{ padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  className="panel-title"
                  style={{ margin: 0, flex: 1 }}
                >
                  {r.name}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    backgroundColor: `${categoryColors[r.category] ?? "#666"}22`,
                    color: categoryColors[r.category] ?? "#666",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {r.category}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    backgroundColor:
                      r.suggested_mode === "teams"
                        ? "rgba(91, 138, 189, 0.15)"
                        : "rgba(107, 158, 107, 0.15)",
                    color:
                      r.suggested_mode === "teams" ? "#5b8abd" : "#6b9e6b",
                  }}
                >
                  {r.suggested_mode === "teams"
                    ? "Teams"
                    : "Subagents"}
                </span>
              </div>

              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                {r.description}
              </p>

              <div className="task-spec-list">
                {r.task_templates.map((task, i) => (
                  <div key={i} className="task-spec-card">
                    <div className="task-spec-number">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="task-spec-content">
                      <div className="task-spec-title">{task.title}</div>
                      <div className="task-spec-description">
                        {task.description}
                      </div>
                      {task.suggested_agent && (
                        <div className="task-spec-agent">
                          Suggested agent: {task.suggested_agent}
                        </div>
                      )}
                      {task.dependencies.length > 0 && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            marginTop: 4,
                          }}
                        >
                          Depends on: Task{" "}
                          {task.dependencies.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
