import { useState, useEffect } from "react";
import { useTauri } from "../hooks/useTauri";
import type {
  AgentTemplate,
  FeatureRecipe,
  Repository,
} from "../types";

export function GuidePage() {
  const tauri = useTauri();
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [recipes, setRecipes] = useState<FeatureRecipe[]>([]);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [appliedTemplates, setAppliedTemplates] = useState<Set<string>>(
    new Set(),
  );
  const [applying, setApplying] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"agents" | "recipes">("agents");

  useEffect(() => {
    tauri.listAgentTemplates().then(setTemplates);
    tauri.listFeatureRecipes().then(setRecipes);
    tauri.listRepositories().then((r) => {
      setRepos(r);
      if (r.length > 0) setSelectedRepo(r[0].path);
    });
  }, []);

  const handleApplyTemplate = async (templateId: string) => {
    if (!selectedRepo) return;
    setApplying(templateId);
    try {
      await tauri.applyAgentTemplate(selectedRepo, templateId);
      setAppliedTemplates((prev) => new Set(prev).add(templateId));
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
          Starter templates and recipes to help you get the most out of
          multi-agent workflows.
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${activeTab === "agents" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("agents")}
        >
          Agent Templates ({templates.length})
        </button>
        <button
          className={`btn ${activeTab === "recipes" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("recipes")}
        >
          Feature Recipes ({recipes.length})
        </button>
      </div>

      {/* Agent Templates Tab */}
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
                Apply to repository:
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
            {templates.map((t) => (
              <div key={t.id} className="panel" style={{ padding: 16 }}>
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
                      backgroundColor: t.agent.color,
                      flexShrink: 0,
                    }}
                  />
                  <div
                    className="panel-title"
                    style={{ margin: 0, flex: 1 }}
                  >
                    {t.name}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      backgroundColor: `${categoryColors[t.category] ?? "#666"}22`,
                      color: categoryColors[t.category] ?? "#666",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {t.category}
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
                  {t.description}
                </p>

                {t.agent.tools && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginBottom: 8,
                    }}
                  >
                    Tools: {t.agent.tools}
                  </div>
                )}

                <button
                  className={`btn btn-sm ${appliedTemplates.has(t.id) ? "btn-secondary" : "btn-primary"}`}
                  onClick={() => handleApplyTemplate(t.id)}
                  disabled={
                    !selectedRepo ||
                    applying === t.id ||
                    appliedTemplates.has(t.id)
                  }
                  style={{ width: "100%" }}
                >
                  {appliedTemplates.has(t.id)
                    ? "Applied"
                    : applying === t.id
                      ? "Applying..."
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
