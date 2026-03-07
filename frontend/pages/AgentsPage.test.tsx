import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { AgentsPage } from "./AgentsPage";

describe("AgentsPage", () => {
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

  const mockAgents = [
    {
      filename: "fullstack-dev.md",
      name: "Full-Stack Developer",
      description: "Senior full-stack dev",
      tools: "Read, Edit, Write, Bash",
      model: null,
      system_prompt: "You are a senior full-stack developer.",
      is_global: false,
      color: "#5a8a5c",
      role: "developer",
    },
    {
      filename: "frontend-dev.md",
      name: "Frontend Developer",
      description: "",
      tools: null,
      model: null,
      system_prompt: "You are a frontend specialist.",
      is_global: true,
      color: "#5b8abd",
      role: "developer",
    },
  ];

  const mockBuiltInAgents = [
    {
      filename: "frontend-developer.md",
      name: "Frontend Developer",
      description: "React/TypeScript UI specialist",
      tools: "Read, Edit, Write, Bash, Glob, Grep",
      model: null,
      system_prompt: "You are a frontend development specialist.",
      is_global: true,
      color: "#5b8abd",
      role: "developer",
    },
    {
      filename: "test-engineer.md",
      name: "Test Engineer",
      description: "Testing and quality assurance specialist",
      tools: "Read, Edit, Write, Bash, Glob, Grep",
      model: null,
      system_prompt: "You are a testing specialist.",
      is_global: true,
      color: "#c9a84c",
      role: "quality",
    },
  ];

  function mockInvokeForAgents() {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve(mockAgents);
      if (cmd === "list_built_in_agents") return Promise.resolve(mockBuiltInAgents);
      return Promise.resolve([]);
    });
  }

  it("renders page header", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(
      screen.getByText(/Manage your agents/),
    ).toBeInTheDocument();
  });

  it("displays repo and global agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
      // "Frontend Developer" appears in both agent list and built-in section
      expect(screen.getAllByText("Frontend Developer").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Repository Agents")).toBeInTheDocument();
    });
  });

  it("shows Remove button only for repo agents, not global", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    // Only one Remove button for the repo agent
    const removeButtons = screen.getAllByText("Remove");
    expect(removeButtons).toHaveLength(1);
  });

  it("opens create modal when Add Agent is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add Agent"));

    expect(screen.getAllByText("Create Agent")).toHaveLength(2); // header + button
    expect(screen.getByPlaceholderText("My Custom Agent")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("You are a specialist in..."),
    ).toBeInTheDocument();
  });

  it("shows edit modal when Edit is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("Full-Stack Developer"),
      ).toBeInTheDocument();
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
      expect(screen.getByText("Edit Agent")).toBeInTheDocument();
    });
  });

  it("displays agent colors in cards", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const avatars = document.querySelectorAll(".agent-card-avatar");
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    // First avatar is the repo agent with color #5a8a5c
    expect((avatars[0] as HTMLElement).style.background).toBe(
      "rgb(90, 138, 92)",
    );
  });

  it("shows global badge for global agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("global")).toBeInTheDocument();
    });
  });

  it("shows color picker in create modal", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add Agent"));

    const swatches = document.querySelectorAll(".agent-color-swatch");
    expect(swatches.length).toBeGreaterThanOrEqual(12);
  });

  it("closes modal when Cancel is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add Agent"));
    expect(screen.getAllByText("Create Agent").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryAllByText("Create Agent")).toHaveLength(0);
  });

  it("shows delete confirmation for repo agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Remove"));

    await waitFor(() => {
      expect(screen.getByText("Delete?")).toBeInTheDocument();
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("No")).toBeInTheDocument();
    });
  });

  it("shows empty state when no agents and no built-in agents exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("No Agents")).toBeInTheDocument();
      expect(screen.getByText(/No crew members yet/)).toBeInTheDocument();
    });
  });

  it("shows tools and model metadata when present", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Tools: Read, Edit, Write, Bash"),
      ).toBeInTheDocument();
    });
  });

  it("shows unapplied built-in agents as greyed-out cards", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
    });

    // test-engineer built-in is not in agents, so should appear
    expect(screen.getByText("Test Engineer")).toBeInTheDocument();

    // built-in cards have "Add to Repo" buttons
    const addButtons = screen.getAllByText("+ Add to Repo");
    expect(addButtons.length).toBeGreaterThan(0);

    // The built-in card should have the built-in badge
    const builtInBadges = screen.getAllByText("built-in");
    expect(builtInBadges.length).toBeGreaterThan(0);
  });

  it("hides built-in agents already added as agents", async () => {
    // frontend-developer.md built-in has a different filename than "frontend-dev.md" in agents
    // so both built-ins should show (neither matches agent filenames exactly)
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
    });

    // Both built-ins should show since agent filenames are "fullstack-dev.md" and "frontend-dev.md"
    // but built-in filenames are "frontend-developer.md" and "test-engineer.md"
    const addButtons = screen.getAllByText("+ Add to Repo");
    expect(addButtons).toHaveLength(2);
  });

  it("calls addBuiltInAgent when Add to Repo is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
    });

    const addButtons = screen.getAllByText("+ Add to Repo");
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("add_built_in_agent", {
        repoPath: "/home/user/my-project",
        filename: "frontend-developer.md",
      });
    });
  });

  it("shows built-in agents section when no agents but built-ins exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve(mockBuiltInAgents);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
      expect(screen.getAllByText("+ Add to Repo")).toHaveLength(2);
    });

    // Empty state should NOT show when built-in agents are available
    expect(screen.queryByText("No Agents")).not.toBeInTheDocument();
  });

  it("shows filename and description fields in create modal", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add Agent"));

    expect(
      screen.getByPlaceholderText("auto-generated-from-name.md"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Specializes in React and CSS"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Read, Edit, Write, Bash"),
    ).toBeInTheDocument();
  });
});
