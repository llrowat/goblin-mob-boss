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
    },
  ];

  function mockInvokeForAgents() {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve(mockAgents);
      return Promise.resolve([]);
    });
  }

  it("renders page header", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(
      screen.getByText(/Manage .claude\/agents\/\*\.md files/),
    ).toBeInTheDocument();
  });

  it("displays repo and global agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
      expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
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
    expect(avatars).toHaveLength(2);
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

  it("shows empty state when no agents exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("No Agents")).toBeInTheDocument();
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
