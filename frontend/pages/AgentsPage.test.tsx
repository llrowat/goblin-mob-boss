import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { AgentsPage } from "./AgentsPage";

describe("AgentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAgents = [
    {
      filename: "fullstack-dev.md",
      name: "Full-Stack Developer",
      description: "Senior full-stack dev",
      tools: "Read, Edit, Write, Bash",
      model: null,
      system_prompt: "You are a senior full-stack developer.",
      is_global: true,
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
      if (cmd === "list_global_agents") return Promise.resolve(mockAgents);
      if (cmd === "list_built_in_agents") return Promise.resolve(mockBuiltInAgents);
      return Promise.resolve([]);
    });
  }

  it("renders page header", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(
      screen.getByText(/Manage your global agents/),
    ).toBeInTheDocument();
  });

  it("displays global agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
      expect(screen.getAllByText("Frontend Developer").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows Remove button for all agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    expect(removeButtons).toHaveLength(2);
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
    expect((avatars[0] as HTMLElement).style.background).toBe(
      "rgb(90, 138, 92)",
    );
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

  it("shows delete confirmation", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Delete?")).toBeInTheDocument();
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("No")).toBeInTheDocument();
    });
  });

  it("calls delete_global_agent on confirm delete", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Yes"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("delete_global_agent", {
        filename: "fullstack-dev.md",
      });
    });
  });

  it("shows empty state when no agents and no built-in agents exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
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

  it("shows unapplied built-in agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
    });

    expect(screen.getByText("Test Engineer")).toBeInTheDocument();

    const addButtons = screen.getAllByText("+ Add");
    expect(addButtons.length).toBeGreaterThan(0);

    const builtInBadges = screen.getAllByText("built-in");
    expect(builtInBadges.length).toBeGreaterThan(0);
  });

  it("saves built-in agent globally when Add is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
    });

    const addButtons = screen.getAllByText("+ Add");
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("save_global_agent", {
        agent: expect.objectContaining({
          filename: "frontend-developer.md",
          is_global: true,
        }),
      });
    });
  });

  it("shows built-in agents section when no agents but built-ins exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve(mockBuiltInAgents);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
      expect(screen.getAllByText("+ Add")).toHaveLength(2);
    });

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
