import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { GuidePage } from "./GuidePage";

describe("GuidePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRepos = [
    {
      id: "repo-1",
      name: "my-project",
      path: "/home/user/my-project",
      base_branch: "main",
      validators: [],
      pr_command: null,
      created_at: "2025-01-01T00:00:00Z",
    },
  ];

  const mockBuiltInAgents = [
    {
      filename: "frontend-developer.md",
      name: "Frontend Developer",
      description: "React/TypeScript UI specialist",
      tools: "Read, Edit, Write, Bash, Glob, Grep",
      model: null,
      system_prompt: "You are a frontend specialist.",
      is_global: true,
      color: "#5b8abd",
      role: "developer",
    },
    {
      filename: "test-engineer.md",
      name: "Test Engineer",
      description: "Testing specialist",
      tools: "Read, Edit, Write, Bash",
      model: null,
      system_prompt: "You are a testing specialist.",
      is_global: true,
      color: "#c9a84c",
      role: "quality",
    },
  ];

  const mockRecipes = [
    {
      id: "crud-endpoint",
      name: "CRUD API Endpoint",
      description: "Add a complete CRUD endpoint",
      category: "backend",
      suggested_mode: "subagents",
      task_templates: [
        {
          title: "Define data model",
          description: "Create the data model",
          acceptance_criteria: ["Model defined"],
          dependencies: [],
          suggested_agent: "backend-developer",
        },
        {
          title: "Implement handlers",
          description: "Create endpoint handlers",
          acceptance_criteria: ["Endpoints work"],
          dependencies: ["1"],
          suggested_agent: "backend-developer",
        },
      ],
    },
    {
      id: "full-stack-feature",
      name: "Full-Stack Feature",
      description: "End-to-end feature",
      category: "full-stack",
      suggested_mode: "teams",
      task_templates: [
        {
          title: "Backend API",
          description: "Build the API",
          acceptance_criteria: ["API works"],
          dependencies: [],
          suggested_agent: "backend-developer",
        },
      ],
    },
  ];

  function mockInvoke() {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_built_in_agents") return Promise.resolve(mockBuiltInAgents);
      if (cmd === "list_feature_recipes") return Promise.resolve(mockRecipes);
      return Promise.resolve([]);
    });
  }

  it("renders page header", async () => {
    mockInvoke();
    render(<GuidePage />);
    expect(screen.getByText("Guide")).toBeInTheDocument();
    expect(
      screen.getByText(/Built-in agents and recipes/),
    ).toBeInTheDocument();
  });

  it("shows built-in agents tab by default", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
      expect(screen.getByText("Test Engineer")).toBeInTheDocument();
    });
  });

  it("shows built-in badge on agents", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      const badges = screen.getAllByText("built-in");
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows agent tools", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      expect(
        screen.getByText("Tools: Read, Edit, Write, Bash, Glob, Grep"),
      ).toBeInTheDocument();
    });
  });

  it("switches to recipes tab", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      expect(screen.getByText(/Feature Recipes/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Feature Recipes/));

    await waitFor(() => {
      expect(screen.getByText("CRUD API Endpoint")).toBeInTheDocument();
      expect(screen.getByText("Full-Stack Feature")).toBeInTheDocument();
    });
  });

  it("shows recipe task templates", async () => {
    mockInvoke();
    render(<GuidePage />);

    fireEvent.click(screen.getByText(/Feature Recipes/));

    await waitFor(() => {
      expect(screen.getByText("Define data model")).toBeInTheDocument();
      expect(screen.getByText("Implement handlers")).toBeInTheDocument();
    });
  });

  it("shows recipe suggested mode", async () => {
    mockInvoke();
    render(<GuidePage />);

    fireEvent.click(screen.getByText(/Feature Recipes/));

    await waitFor(() => {
      expect(screen.getByText("Subagents")).toBeInTheDocument();
      expect(screen.getByText("Teams")).toBeInTheDocument();
    });
  });

  it("shows Add to Repository button for built-in agents", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      const addButtons = screen.getAllByText("Add to Repository");
      expect(addButtons).toHaveLength(2);
    });
  });

  it("calls add_built_in_agent on button click", async () => {
    mockInvoke();
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_built_in_agents") return Promise.resolve(mockBuiltInAgents);
      if (cmd === "list_feature_recipes") return Promise.resolve(mockRecipes);
      if (cmd === "add_built_in_agent")
        return Promise.resolve(mockBuiltInAgents[0]);
      return Promise.resolve([]);
    });

    render(<GuidePage />);

    await waitFor(() => {
      expect(screen.getAllByText("Add to Repository")).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByText("Add to Repository")[0]);

    await waitFor(() => {
      expect(screen.getByText("Added")).toBeInTheDocument();
    });
  });

  it("shows repo selector when repos exist", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      expect(screen.getByText("Add to repository:")).toBeInTheDocument();
      expect(screen.getByText("my-project")).toBeInTheDocument();
    });
  });

  it("shows recipe task dependencies", async () => {
    mockInvoke();
    render(<GuidePage />);

    fireEvent.click(screen.getByText(/Feature Recipes/));

    await waitFor(() => {
      expect(screen.getByText(/Depends on: Task 1/)).toBeInTheDocument();
    });
  });
});
