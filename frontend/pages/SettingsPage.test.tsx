import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "./SettingsPage";
import { ToastProvider } from "../hooks/useToast";
import { ToastContainer } from "../components/ToastContainer";

const defaultPrefs = {
  shell: "bash",
  default_execution_mode: "",
  default_model: "",
  auto_validate: false,
};

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
    vi.mocked(invoke).mockResolvedValue(defaultPrefs);

    renderWithProviders();

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByText("Tune things to your liking."),
    ).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("loads and displays current preferences", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_preferences") {
        return Promise.resolve({
          ...defaultPrefs,
          shell: "zsh",
          default_execution_mode: "teams",
          default_model: "claude-opus-4-6",
          auto_validate: true,
        });
      }
      return Promise.resolve({});
    });

    renderWithProviders();

    await waitFor(() => {
      const select = screen.getByDisplayValue("Zsh");
      expect(select).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Agent Teams")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Claude Opus 4.6")).toBeInTheDocument();
  });

  it("shows shell options", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_preferences") {
        return Promise.resolve(defaultPrefs);
      }
      return Promise.resolve({});
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Bash")).toBeInTheDocument();
    });
    expect(screen.getByText("PowerShell")).toBeInTheDocument();
    expect(screen.getByText("Zsh")).toBeInTheDocument();
  });

  it("saves preferences when Save is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_preferences") {
        return Promise.resolve(defaultPrefs);
      }
      if (cmd === "set_preferences") {
        return Promise.resolve(defaultPrefs);
      }
      return Promise.resolve({});
    });

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
    vi.mocked(invoke).mockResolvedValue(defaultPrefs);

    renderWithProviders();

    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Shell")).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("renders execution defaults section", async () => {
    vi.mocked(invoke).mockResolvedValue(defaultPrefs);

    renderWithProviders();

    expect(screen.getByText("Execution Defaults")).toBeInTheDocument();
    expect(screen.getByText("Default Execution Mode")).toBeInTheDocument();
    expect(screen.getByText("Preferred Model")).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("renders auto-validate checkbox", async () => {
    vi.mocked(invoke).mockResolvedValue(defaultPrefs);

    renderWithProviders();

    expect(
      screen.getByText("Auto-run validators when execution completes"),
    ).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("shows execution mode options", async () => {
    vi.mocked(invoke).mockResolvedValue(defaultPrefs);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Use recommendation")).toBeInTheDocument();
    });
    expect(screen.getByText("Agent Teams")).toBeInTheDocument();
    expect(screen.getByText("Subagents")).toBeInTheDocument();
  });

  it("shows model options", async () => {
    vi.mocked(invoke).mockResolvedValue(defaultPrefs);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Default")).toBeInTheDocument();
    });
    expect(screen.getByText("Claude Opus 4.6")).toBeInTheDocument();
    expect(screen.getByText("Claude Sonnet 4.6")).toBeInTheDocument();
    expect(screen.getByText("Claude Haiku 4.5")).toBeInTheDocument();
  });
});
