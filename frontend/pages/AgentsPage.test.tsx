import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { AgentsPage } from "./AgentsPage";

describe("AgentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAgents = [
    {
      id: "builtin-fullstack",
      name: "Full-Stack Developer",
      role: "developer",
      system_prompt: "You are a senior full-stack developer.",
      is_builtin: true,
    },
    {
      id: "custom-1",
      name: "My Agent",
      role: "testing",
      system_prompt: "You are a test writer.",
      is_builtin: false,
    },
  ];

  it("renders page header", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    render(<AgentsPage />);

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(
      screen.getByText("Configure AI agents for task execution."),
    ).toBeInTheDocument();
  });

  it("displays built-in and custom agents", async () => {
    vi.mocked(invoke).mockResolvedValue(mockAgents);

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
      expect(screen.getByText("My Agent")).toBeInTheDocument();
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
      expect(screen.getByText("Custom Agents")).toBeInTheDocument();
    });
  });

  it("shows Remove button only for custom agents", async () => {
    vi.mocked(invoke).mockResolvedValue(mockAgents);

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("My Agent")).toBeInTheDocument();
    });

    // Only one Remove button for the custom agent
    const removeButtons = screen.getAllByText("Remove");
    expect(removeButtons).toHaveLength(1);
  });

  it("toggles add agent form", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    render(<AgentsPage />);

    expect(screen.queryByText("New Agent")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("+ Add Agent"));

    expect(screen.getByText("New Agent")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("My Custom Agent")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("You are a specialist in..."),
    ).toBeInTheDocument();
  });

  it("shows edit form when Edit is clicked", async () => {
    vi.mocked(invoke).mockResolvedValue(mockAgents);

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Full-Stack Developer")).toBeInTheDocument();
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
  });
});
