import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { AddRepoModal } from "./AddRepoModal";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

describe("AddRepoModal", () => {
  const onClose = vi.fn();
  const onAdded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock list_repositories which is called on mount to populate similar repos list
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
  });

  it("renders the modal title", () => {
    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    expect(screen.getByText("Add Repository")).toBeInTheDocument();
  });

  it("renders path input and Browse/Detect buttons", () => {
    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    expect(screen.getByPlaceholderText("/home/user/my-project")).toBeInTheDocument();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.getByText("Detect")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when overlay is clicked", () => {
    const { container } = render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not show name/branch fields before detection", () => {
    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    // Before detection, the Name and Base Branch inputs should not be shown
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Base Branch")).not.toBeInTheDocument();
  });

  it("shows form fields after successful detection", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([]);
      if (cmd === "detect_repo_info")
        return Promise.resolve({
          name: "my-project",
          base_branch: "main",
          has_claude_md: true,
        });
      return Promise.resolve(undefined);
    });

    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);

    fireEvent.change(screen.getByPlaceholderText("/home/user/my-project"), {
      target: { value: "/some/path" },
    });
    fireEvent.click(screen.getByText("Detect"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("my-project")).toBeInTheDocument();
      expect(screen.getByDisplayValue("main")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Brief description of this repo")).toBeInTheDocument();
    });
  });

  it("shows error when detection fails", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([]);
      if (cmd === "detect_repo_info") return Promise.reject("Not a git repo");
      return Promise.resolve(undefined);
    });

    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);

    fireEvent.change(screen.getByPlaceholderText("/home/user/my-project"), {
      target: { value: "/bad/path" },
    });
    fireEvent.click(screen.getByText("Detect"));

    await waitFor(() => {
      expect(screen.getByText("Not a git repo")).toBeInTheDocument();
    });
  });

  it("shows CLAUDE.md found when repo has one", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([]);
      if (cmd === "detect_repo_info")
        return Promise.resolve({
          name: "my-project",
          base_branch: "main",
          has_claude_md: true,
        });
      return Promise.resolve(undefined);
    });

    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);

    fireEvent.change(screen.getByPlaceholderText("/home/user/my-project"), {
      target: { value: "/some/path" },
    });
    fireEvent.click(screen.getByText("Detect"));

    await waitFor(() => {
      expect(screen.getByText("CLAUDE.md found")).toBeInTheDocument();
    });
  });

  it("shows No CLAUDE.md with Generate button when repo lacks one", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([]);
      if (cmd === "detect_repo_info")
        return Promise.resolve({
          name: "my-project",
          base_branch: "main",
          has_claude_md: false,
        });
      return Promise.resolve(undefined);
    });

    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);

    fireEvent.change(screen.getByPlaceholderText("/home/user/my-project"), {
      target: { value: "/some/path" },
    });
    fireEvent.click(screen.getByText("Detect"));

    await waitFor(() => {
      expect(screen.getByText("No CLAUDE.md")).toBeInTheDocument();
      expect(screen.getByText("Generate")).toBeInTheDocument();
    });
  });

  it("shows similar repos checkboxes after detection when repos exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories")
        return Promise.resolve([
          {
            id: "repo-1",
            name: "api-service",
            path: "/repos/api",
            base_branch: "main",
            description: "API service",
            validators: [],
            pr_command: null,
            similar_repo_ids: [],
            created_at: "2025-01-01T00:00:00Z",
          },
        ]);
      if (cmd === "detect_repo_info")
        return Promise.resolve({
          name: "new-service",
          base_branch: "main",
          has_claude_md: true,
        });
      return Promise.resolve(undefined);
    });

    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);

    fireEvent.change(screen.getByPlaceholderText("/home/user/my-project"), {
      target: { value: "/some/path" },
    });
    fireEvent.click(screen.getByText("Detect"));

    await waitFor(() => {
      expect(screen.getByText("api-service")).toBeInTheDocument();
      expect(
        screen.getByText("Repos with similar patterns — agents will use them as hints"),
      ).toBeInTheDocument();
    });
  });

  it("shows generating state when Generate is clicked", async () => {
    let generateCalled = false;
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve([]);
      if (cmd === "detect_repo_info")
        return Promise.resolve({
          name: "my-project",
          base_branch: "main",
          has_claude_md: false,
        });
      if (cmd === "generate_claude_md") {
        generateCalled = true;
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);

    fireEvent.change(screen.getByPlaceholderText("/home/user/my-project"), {
      target: { value: "/some/path" },
    });
    fireEvent.click(screen.getByText("Detect"));

    await waitFor(() => {
      expect(screen.getByText("Generate")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Generate"));

    await waitFor(() => {
      expect(generateCalled).toBe(true);
      expect(screen.getByText("Generating CLAUDE.md...")).toBeInTheDocument();
      expect(screen.getByText("Goblins exploring the lair")).toBeInTheDocument();
    });
  });
});
