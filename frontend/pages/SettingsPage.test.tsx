import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "./SettingsPage";
import { ToastProvider } from "../hooks/useToast";
import { ToastContainer } from "../components/ToastContainer";

const defaultPrefs = {
  shell: "bash",
  claude_path: "",
  default_execution_mode: "",
  default_model: "",
  auto_validate: false,
  functional_testing_enabled: false,
};

const detectedShells: [string, string][] = [
  ["bash", "Bash"],
  ["zsh", "Zsh"],
  ["tmux", "tmux"],
];

function mockInvoke(overrides: Record<string, unknown> = {}) {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_preferences") {
      return Promise.resolve(overrides.get_preferences ?? defaultPrefs);
    }
    if (cmd === "detect_available_shells") {
      return Promise.resolve(overrides.detect_available_shells ?? detectedShells);
    }
    if (cmd === "set_preferences") {
      return Promise.resolve(overrides.set_preferences ?? defaultPrefs);
    }
    return Promise.resolve({});
  });
}

function renderWithProviders() {
  return render(
    <ToastProvider>
      <SettingsPage />
      <ToastContainer />
    </ToastProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header", async () => {
    mockInvoke();
    renderWithProviders();

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByText("Tune things to your liking."),
    ).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("loads and displays current preferences", async () => {
    mockInvoke({
      get_preferences: {
        ...defaultPrefs,
        shell: "zsh",
        default_execution_mode: "teams",
        default_model: "claude-opus-4-6",
        auto_validate: true,
      },
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Zsh")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Agent Teams")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Claude Opus 4.6")).toBeInTheDocument();
  });

  it("shows auto-detected shell options", async () => {
    mockInvoke();
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Bash")).toBeInTheDocument();
    });
    expect(screen.getByText("Zsh")).toBeInTheDocument();
    expect(screen.getByText("tmux")).toBeInTheDocument();
  });

  it("saves preferences when Save is clicked", async () => {
    mockInvoke();
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Save Settings")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Save Settings"));

    await waitFor(() => {
      expect(screen.getByText("Settings saved")).toBeInTheDocument();
    });
  });

  it("renders terminal section", async () => {
    mockInvoke();
    renderWithProviders();

    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Shell")).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("renders Claude executable path input", async () => {
    mockInvoke();
    renderWithProviders();

    expect(screen.getByText("Claude Executable Path")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("claude"),
    ).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("loads claude_path preference", async () => {
    mockInvoke({
      get_preferences: {
        ...defaultPrefs,
        claude_path: "/usr/local/bin/claude",
      },
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByDisplayValue("/usr/local/bin/claude")).toBeInTheDocument();
    });
  });

  it("renders execution defaults section", async () => {
    mockInvoke();
    renderWithProviders();

    expect(screen.getByText("Execution Defaults")).toBeInTheDocument();
    expect(screen.getByText("Default Execution Mode")).toBeInTheDocument();
    expect(screen.getByText("Preferred Model")).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("renders auto-validate checkbox", async () => {
    mockInvoke();
    renderWithProviders();

    expect(
      screen.getByText("Auto-run validators when execution completes"),
    ).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("shows execution mode options", async () => {
    mockInvoke();
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Use recommendation")).toBeInTheDocument();
    });
    expect(screen.getByText("Agent Teams")).toBeInTheDocument();
    expect(screen.getByText("Subagents")).toBeInTheDocument();
  });

  it("shows model options", async () => {
    mockInvoke();
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Claude Opus 4.6")).toBeInTheDocument();
    });
    expect(screen.getByText("Claude Sonnet 4.6")).toBeInTheDocument();
    expect(screen.getByText("Claude Haiku 4.5")).toBeInTheDocument();
  });

  it("renders functional testing checkbox", async () => {
    mockInvoke();
    renderWithProviders();

    expect(
      screen.getByText("Enable functional testing loop"),
    ).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("renders experimental badge next to functional testing toggle", async () => {
    mockInvoke();
    renderWithProviders();

    expect(screen.getByText("Experimental")).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("loads functional_testing_enabled preference", async () => {
    mockInvoke({
      get_preferences: {
        ...defaultPrefs,
        functional_testing_enabled: true,
      },
    });

    renderWithProviders();

    await waitFor(() => {
      const checkbox = screen.getByRole("checkbox", {
        name: /enable functional testing loop/i,
      });
      expect(checkbox).toBeChecked();
    });
  });
});
