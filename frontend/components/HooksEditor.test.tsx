import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { HooksEditor } from "./HooksEditor";
import { ToastProvider } from "../hooks/useToast";
import type { RepoHooks } from "../types";

function renderWithProviders(repoPath = "/test/repo") {
  return render(
    <ToastProvider>
      <HooksEditor repoPath={repoPath} />
    </ToastProvider>,
  );
}

const EMPTY_HOOKS: RepoHooks = {};

const HOOKS_WITH_RULES: RepoHooks = {
  PostToolUse: [
    { matcher: "Edit|Write", hooks: [{ type: "command", command: "npm run lint" }] },
  ],
  Stop: [
    { matcher: "", hooks: [{ type: "command", command: "npm test" }] },
  ],
};

describe("HooksEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));

    renderWithProviders();

    expect(screen.getByText("Loading hooks...")).toBeInTheDocument();
  });

  it("shows empty state when no hooks exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(
        screen.getByText("No hooks wired up yet."),
      ).toBeInTheDocument();
    });
  });

  it("shows add form when Add button is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Add")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add"));

    expect(screen.getByText("Event")).toBeInTheDocument();
    expect(screen.getByText("Matcher")).toBeInTheDocument();
    expect(screen.getByText("Command")).toBeInTheDocument();
    expect(screen.getByText("Add Hook")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("displays existing hooks grouped by event", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(HOOKS_WITH_RULES);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("After Tool Use")).toBeInTheDocument();
    });

    expect(screen.getByText("When Done")).toBeInTheDocument();
    expect(screen.getByText("Edit|Write")).toBeInTheDocument();
    expect(screen.getByText("npm run lint")).toBeInTheDocument();
    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.getByText("(2 rules)")).toBeInTheDocument();
  });

  it("can remove a hook rule", async () => {
    let savedHooks: RepoHooks | null = null;
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(HOOKS_WITH_RULES);
      if (cmd === "save_repo_hooks") {
        savedHooks = (args as { hooks: RepoHooks }).hooks;
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("npm run lint")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByTitle("Remove this hook");
    expect(removeButtons).toHaveLength(2);

    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(savedHooks).not.toBeNull();
    });

    expect(savedHooks!.PostToolUse).toHaveLength(0);
    expect(savedHooks!.Stop).toHaveLength(1);
  });

  it("disables Add Hook button when command is empty", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Add")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add"));

    const addButton = screen.getByText("Add Hook");
    expect(addButton).toBeDisabled();
  });

  it("submits a hook when Add Hook is clicked with a command", async () => {
    let savedHooks: RepoHooks | null = null;
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      if (cmd === "save_repo_hooks") {
        savedHooks = (args as { hooks: RepoHooks }).hooks;
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Add")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add"));

    fireEvent.change(screen.getByPlaceholderText("e.g. npm run lint --fix"), {
      target: { value: "cargo test" },
    });

    fireEvent.click(screen.getByText("Add Hook"));

    await waitFor(() => {
      expect(savedHooks).not.toBeNull();
    });

    expect(savedHooks!.PostToolUse).toHaveLength(1);
    expect(savedHooks!.PostToolUse![0].hooks[0].command).toBe("cargo test");
  });

  it("shows singular rule text for exactly one rule", async () => {
    const singleRuleHooks: RepoHooks = {
      PostToolUse: [
        { matcher: "Edit", hooks: [{ type: "command", command: "echo done" }] },
      ],
    };

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(singleRuleHooks);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("(1 rule)")).toBeInTheDocument();
    });
  });

  it("shows Create with AI button", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Create with AI")).toBeInTheDocument();
    });
  });

  it("shows generate form when Create with AI is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Create with AI")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create with AI"));

    expect(screen.getByText("Describe your hook")).toBeInTheDocument();
    expect(screen.getByText("Generate")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("disables Generate button when description is empty", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Create with AI")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create with AI"));

    expect(screen.getByText("Generate")).toBeDisabled();
  });

  it("hides generate form when Cancel is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Create with AI")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create with AI"));
    expect(screen.getByText("Describe your hook")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Describe your hook")).not.toBeInTheDocument();
  });

  it("hides add form when Create with AI is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Add")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add"));
    expect(screen.getByText("Add Hook")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Create with AI"));
    expect(screen.queryByText("Add Hook")).not.toBeInTheDocument();
    expect(screen.getByText("Describe your hook")).toBeInTheDocument();
  });
});
