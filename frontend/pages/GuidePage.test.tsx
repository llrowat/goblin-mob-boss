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

  const mockTemplates = [
    {
      id: "frontend-developer",
      name: "Frontend Developer",
      description: "React/TypeScript UI specialist",
      category: "development",
      agent: {
        filename: "frontend-developer.md",
        name: "Frontend Developer",
        description: "React/TypeScript UI specialist",
        tools: "Read, Edit, Write, Bash, Glob, Grep",
        model: null,
        system_prompt: "You are a frontend specialist.",
        is_global: false,
        color: "#5b8abd",
      },
    },
    {
      id: "test-engineer",
      name: "Test Engineer",
      description: "Testing specialist",
      category: "quality",
      agent: {
        filename: "test-engineer.md",
        name: "Test Engineer",
        description: "Testing specialist",
        tools: "Read, Edit, Write, Bash",
        model: null,
        system_prompt: "You are a testing specialist.",
        is_global: false,
        color: "#c9a84c",
      },
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
      if (cmd === "list_agent_templates") return Promise.resolve(mockTemplates);
      if (cmd === "list_feature_recipes") return Promise.resolve(mockRecipes);
      return Promise.resolve([]);
    });
  }

  it("renders page header", async () => {
    mockInvoke();
    render(<GuidePage />);
    expect(screen.getByText("Guide")).toBeInTheDocument();
    expect(
      screen.getByText(/Starter templates and recipes/),
    ).toBeInTheDocument();
  });

  it("shows agent templates tab by default", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
      expect(screen.getByText("Test Engineer")).toBeInTheDocument();
    });
  });

  it("shows template categories", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      expect(screen.getByText("development")).toBeInTheDocument();
      expect(screen.getByText("quality")).toBeInTheDocument();
    });
  });

  it("shows template tools", async () => {
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

  it("shows Add to Repository button for templates", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      const addButtons = screen.getAllByText("Add to Repository");
      expect(addButtons).toHaveLength(2);
    });
  });

  it("calls apply template on button click", async () => {
    mockInvoke();
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agent_templates") return Promise.resolve(mockTemplates);
      if (cmd === "list_feature_recipes") return Promise.resolve(mockRecipes);
      if (cmd === "apply_agent_template")
        return Promise.resolve(mockTemplates[0].agent);
      return Promise.resolve([]);
    });

    render(<GuidePage />);

    await waitFor(() => {
      expect(screen.getAllByText("Add to Repository")).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByText("Add to Repository")[0]);

    await waitFor(() => {
      expect(screen.getByText("Applied")).toBeInTheDocument();
    });
  });

  it("shows repo selector when repos exist", async () => {
    mockInvoke();
    render(<GuidePage />);

    await waitFor(() => {
      expect(screen.getByText("Apply to repository:")).toBeInTheDocument();
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
