import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { HooksEditor } from "./HooksEditor";
import { ToastProvider } from "../hooks/useToast";
import type { RepoHooks, HookTemplate } from "../types";

function renderWithProviders(repoPath = "/test/repo") {
  return render(
    <ToastProvider>
      <HooksEditor repoPath={repoPath} />
    </ToastProvider>,
  );
}

const EMPTY_HOOKS: RepoHooks = {};

const SAMPLE_TEMPLATES: HookTemplate[] = [
  {
    id: "lint-on-save",
    name: "Lint on save",
    description: "Run linter after file edits",
    event: "PostToolUse",
    matcher: "Edit|Write",
    command: "npm run lint --fix",
  },
  {
    id: "test-on-stop",
    name: "Test when done",
    description: "Run tests after Claude finishes",
    event: "Stop",
    matcher: "",
    command: "npm test",
  },
];

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
      if (cmd === "list_hook_templates") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(
        screen.getByText("No hooks wired up yet. Add a template or write your own."),
      ).toBeInTheDocument();
    });
  });

  it("shows templates panel when Template button is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      if (cmd === "list_hook_templates") return Promise.resolve(SAMPLE_TEMPLATES);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Template")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Template"));

    expect(screen.getByText("Lint on save")).toBeInTheDocument();
    expect(screen.getByText("Run linter after file edits")).toBeInTheDocument();
    expect(screen.getByText("Test when done")).toBeInTheDocument();
    expect(screen.getByText("Run tests after Claude finishes")).toBeInTheDocument();
    expect(
      screen.getByText("Quick-add a hook from a template. You can customize the command after adding."),
    ).toBeInTheDocument();
  });

  it("shows custom hook form when Custom button is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      if (cmd === "list_hook_templates") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Custom")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Custom"));

    expect(screen.getByText("Event")).toBeInTheDocument();
    expect(screen.getByText("Matcher")).toBeInTheDocument();
    expect(screen.getByText("Command")).toBeInTheDocument();
    expect(screen.getByText("Add Hook")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("e.g. Bash, Edit|Write, or leave blank for all"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("e.g. npm run lint --fix"),
    ).toBeInTheDocument();
  });

  it("displays existing hooks grouped by event", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(HOOKS_WITH_RULES);
      if (cmd === "list_hook_templates") return Promise.resolve([]);
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
      if (cmd === "list_hook_templates") return Promise.resolve([]);
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

  it("hides templates panel when Custom button is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      if (cmd === "list_hook_templates") return Promise.resolve(SAMPLE_TEMPLATES);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Template")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Template"));
    expect(screen.getByText("Lint on save")).toBeInTheDocument();

    fireEvent.click(screen.getByText("+ Custom"));
    expect(screen.queryByText("Lint on save")).not.toBeInTheDocument();
    expect(screen.getByText("Add Hook")).toBeInTheDocument();
  });

  it("disables Add Hook button when command is empty", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      if (cmd === "list_hook_templates") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Custom")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Custom"));

    const addButton = screen.getByText("Add Hook");
    expect(addButton).toBeDisabled();
  });

  it("submits a custom hook when Add Hook is clicked with a command", async () => {
    let savedHooks: RepoHooks | null = null;
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      if (cmd === "list_hook_templates") return Promise.resolve([]);
      if (cmd === "save_repo_hooks") {
        savedHooks = (args as { hooks: RepoHooks }).hooks;
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Custom")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Custom"));

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

  it("applies a template when a template row is clicked", async () => {
    let savedHooks: RepoHooks | null = null;
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(EMPTY_HOOKS);
      if (cmd === "list_hook_templates") return Promise.resolve(SAMPLE_TEMPLATES);
      if (cmd === "save_repo_hooks") {
        savedHooks = (args as { hooks: RepoHooks }).hooks;
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("+ Template")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Template"));
    fireEvent.click(screen.getByText("Lint on save"));

    await waitFor(() => {
      expect(savedHooks).not.toBeNull();
    });

    expect(savedHooks!.PostToolUse).toHaveLength(1);
    expect(savedHooks!.PostToolUse![0].matcher).toBe("Edit|Write");
    expect(savedHooks!.PostToolUse![0].hooks[0].command).toBe("npm run lint --fix");
  });

  it("shows singular rule text for exactly one rule", async () => {
    const singleRuleHooks: RepoHooks = {
      PostToolUse: [
        { matcher: "Edit", hooks: [{ type: "command", command: "echo done" }] },
      ],
    };

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_repo_hooks") return Promise.resolve(singleRuleHooks);
      if (cmd === "list_hook_templates") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("(1 rule)")).toBeInTheDocument();
    });
  });
});
