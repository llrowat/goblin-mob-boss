import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { HomePage } from "./HomePage";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no repositories exist", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No repositories yet")).toBeInTheDocument();
    });
  });

  it("shows feature form when repos exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") {
        return Promise.resolve([
          {
            id: "r1",
            name: "my-app",
            path: "/app",
            base_branch: "main",
            validators: [],
            pr_command: null,
            max_parallel_agents: 4,
            created_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Start a Feature")).toBeInTheDocument();
    });
    // Once the page header is visible, the repo data should also be rendered
    expect(screen.getByPlaceholderText("User Authentication")).toBeInTheDocument();
  });

  it("disables start button when fields are empty", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") {
        return Promise.resolve([
          {
            id: "r1",
            name: "repo",
            path: "/r",
            base_branch: "main",
            validators: [],
            pr_command: null,
            max_parallel_agents: 4,
            created_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Start Feature")).toBeInTheDocument();
    });

    const btn = screen.getByText("Start Feature");
    expect(btn).toBeDisabled();
  });

  it("navigates to repos page from empty state", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Add Repository")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Repository"));
    expect(mockNavigate).toHaveBeenCalledWith("/repos");
  });

  it("shows active features list", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") {
        return Promise.resolve([
          {
            id: "r1",
            name: "repo",
            path: "/r",
            base_branch: "main",
            validators: [],
            pr_command: null,
            max_parallel_agents: 4,
            created_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      if (cmd === "list_features") {
        return Promise.resolve([
          {
            id: "f1",
            repo_id: "r1",
            repos: [{ repo_id: "r1", branch: "feature/auth" }],
            name: "Auth Feature",
            description: "Add authentication",
            branch: "feature/auth",
            status: "in_progress",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Auth Feature")).toBeInTheDocument();
      expect(screen.getByText("In Progress")).toBeInTheDocument();
    });
  });
});
