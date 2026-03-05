import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { AgentsPage } from "./AgentsPage";

describe("AgentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRepos = [
    {
      id: "r1",
      name: "my-app",
      path: "/app",
      base_branch: "main",
      validators: [],
      pr_command: null,
      created_at: "2025-01-01T00:00:00Z",
    },
  ];

  const mockAgents = [
    {
      filename: "full-stack-dev.md",
      name: "Full-Stack Developer",
      description: "Senior full-stack developer",
      tools: null,
      model: null,
      system_prompt: "You are a senior full-stack developer.",
      is_global: false,
    },
    {
      filename: "my-agent.md",
      name: "My Agent",
      description: "",
      tools: null,
      model: null,
      system_prompt: "You are a test writer.",
      is_global: false,
    },
  ];

  it("renders page header", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<AgentsPage />);

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(
      screen.getByText(/Manage .claude\/agents\/\*\.md files/),
    ).toBeInTheDocument();
  });

  it("displays repo agents", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve(mockAgents);
      return Promise.resolve({});
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
      expect(screen.getByText("My Agent")).toBeInTheDocument();
      expect(screen.getByText("Repository Agents")).toBeInTheDocument();
    });
  });

  it("shows Remove button for repo agents", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve(mockAgents);
      return Promise.resolve({});
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("My Agent")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    expect(removeButtons).toHaveLength(2);
  });

  it("toggles add agent form", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<AgentsPage />);

    expect(screen.queryByText("New Agent")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("+ Add Agent"));

    expect(screen.getByText("New Agent")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Frontend Developer"),
    ).toBeInTheDocument();
  });

  it("shows empty state when no agents", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      if (cmd === "list_agents") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/No agents found/),
      ).toBeInTheDocument();
    });
  });
});
