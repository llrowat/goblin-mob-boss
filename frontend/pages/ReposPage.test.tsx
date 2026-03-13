import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { ReposPage } from "./ReposPage";

vi.mock("../components/AddRepoModal", () => ({
  AddRepoModal: ({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) => (
    <div data-testid="add-repo-modal">
      <button onClick={onClose}>MockClose</button>
      <button onClick={onAdded}>MockAdded</button>
    </div>
  ),
}));

describe("ReposPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRepos = [
    {
      id: "repo-1",
      name: "frontend-app",
      path: "/home/user/projects/frontend-app",
      base_branch: "main",
      description: "React frontend application",
      validators: ["npm test", "npm run lint"],
      pr_command: "gh pr create",
      similar_repo_ids: ["repo-2"],
      commit_pattern: "^(feat|fix|chore): .+",
      created_at: "2026-01-15T10:00:00Z",
    },
    {
      id: "repo-2",
      name: "backend-api",
      path: "/home/user/projects/backend-api",
      base_branch: "develop",
      description: "Rust backend service",
      validators: ["cargo test"],
      pr_command: null,
      similar_repo_ids: [],
      commit_pattern: null,
      created_at: "2026-01-16T10:00:00Z",
    },
  ];

  function mockInvokeForRepos(repos = mockRepos) {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_repositories") return Promise.resolve(repos);
      if (cmd === "update_repository") return Promise.resolve(undefined);
      if (cmd === "remove_repository") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
  }

  it("renders page header", async () => {
    mockInvokeForRepos([]);

    render(<ReposPage />);

    expect(screen.getByText("Repositories")).toBeInTheDocument();
    expect(
      screen.getByText("Manage the repositories your agents work in."),
    ).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("shows empty state when no repos", async () => {
    mockInvokeForRepos([]);

    render(<ReposPage />);

    await waitFor(() => {
      expect(
        screen.getByText("No repos on the map yet. Add one to set up shop."),
      ).toBeInTheDocument();
    });
  });

  it("displays repos with name, path, branch", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
      expect(screen.getByText("backend-api")).toBeInTheDocument();
    });

    expect(
      screen.getByText("/home/user/projects/frontend-app"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("/home/user/projects/backend-api"),
    ).toBeInTheDocument();
    expect(screen.getByText("Branch: main")).toBeInTheDocument();
    expect(screen.getByText("Branch: develop")).toBeInTheDocument();
  });

  it("shows validator count", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    expect(screen.getByText("Validators: 2")).toBeInTheDocument();
    expect(screen.getByText("Validators: 1")).toBeInTheDocument();
  });

  it("shows similar repo names", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    expect(screen.getByText("Similar: backend-api")).toBeInTheDocument();
  });

  it("opens AddRepoModal when Add Repository clicked", async () => {
    mockInvokeForRepos([]);

    render(<ReposPage />);

    expect(screen.queryByTestId("add-repo-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("+ Add Repository"));

    expect(screen.getByTestId("add-repo-modal")).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("closes modal on close callback", async () => {
    mockInvokeForRepos([]);

    render(<ReposPage />);

    fireEvent.click(screen.getByText("+ Add Repository"));
    expect(screen.getByTestId("add-repo-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByText("MockClose"));
    expect(screen.queryByTestId("add-repo-modal")).not.toBeInTheDocument();

    await waitFor(() => {});
  });

  it("enters edit mode when Edit clicked", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("populates edit fields from repo data", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    expect(screen.getByDisplayValue("frontend-app")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("React frontend application"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("main")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText("npm test") as HTMLTextAreaElement;
    expect(textarea.value).toBe("npm test\nnpm run lint");
    // PR Command field has been removed
  });

  it("calls update_repository on Save", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    const nameInput = screen.getByDisplayValue("frontend-app");
    fireEvent.change(nameInput, { target: { value: "frontend-app-v2" } });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("update_repository", {
        id: "repo-1",
        name: "frontend-app-v2",
        baseBranch: "main",
        description: "React frontend application",
        validators: ["npm test", "npm run lint"],
        prCommand: null,
        similarRepoIds: ["repo-2"],
        commitPattern: "^(feat|fix|chore): .+",
      });
    });
  });

  it("exits edit mode on Cancel", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    expect(screen.getByText("Save")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Save")).not.toBeInTheDocument();
    expect(screen.getByText("frontend-app")).toBeInTheDocument();
  });

  it("shows confirmation when Remove clicked and removes on Confirm", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    // Should show confirmation instead of immediately removing
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("remove_repository", expect.anything());

    // Click Confirm to actually remove
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("remove_repository", {
        id: "repo-1",
      });
    });
  });

  it("cancels removal when Cancel clicked after Remove", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    expect(screen.getByText("Confirm")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));

    // Should return to normal state with Remove button visible
    await waitFor(() => {
      expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Remove")).toHaveLength(2);
  });

  it("shows commit pattern when configured", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    expect(screen.getByText("^(feat|fix|chore): .+")).toBeInTheDocument();
  });

  it("populates commit pattern in edit mode", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    expect(screen.getByDisplayValue("^(feat|fix|chore): .+")).toBeInTheDocument();
    expect(screen.getByText("Regex that commit messages must match (optional)")).toBeInTheDocument();
  });

  it("sends commitPattern on Save", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("update_repository", expect.objectContaining({
        commitPattern: "^(feat|fix|chore): .+",
      }));
    });
  });

  it("shows Similar Repositories checkboxes in edit mode when multiple repos exist", async () => {
    mockInvokeForRepos();

    render(<ReposPage />);

    await waitFor(() => {
      expect(screen.getByText("frontend-app")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    expect(screen.getByText("Similar Repositories")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(1);

    // backend-api should appear as a checkbox option (not frontend-app since that's the one being edited)
    // Use getAllByText since "backend-api" also appears in the non-editing repo panel
    const backendLabels = screen.getAllByText("backend-api");
    expect(backendLabels.length).toBeGreaterThanOrEqual(1);

    // The checkbox should be checked since repo-2 is in similar_repo_ids
    expect(checkboxes[0]).toBeChecked();
  });
});
