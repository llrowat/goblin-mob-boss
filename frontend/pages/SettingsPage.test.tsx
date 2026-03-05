import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header", () => {
    vi.mocked(invoke).mockResolvedValue({ shell: "bash" });

    render(<SettingsPage />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByText("Configure Goblin Mob Boss preferences."),
    ).toBeInTheDocument();
  });

  it("loads and displays current preferences", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_preferences") {
        return Promise.resolve({ shell: "zsh" });
      }
      return Promise.resolve({});
    });

    render(<SettingsPage />);

    await waitFor(() => {
      const select = screen.getByDisplayValue("Zsh");
      expect(select).toBeInTheDocument();
    });
  });

  it("shows shell options", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_preferences") {
        return Promise.resolve({ shell: "bash" });
      }
      return Promise.resolve({});
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Bash")).toBeInTheDocument();
    });
    expect(screen.getByText("PowerShell")).toBeInTheDocument();
    expect(screen.getByText("Zsh")).toBeInTheDocument();
  });

  it("saves preferences when Save is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_preferences") {
        return Promise.resolve({ shell: "bash" });
      }
      if (cmd === "set_preferences") {
        return Promise.resolve({ shell: "bash" });
      }
      return Promise.resolve({});
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Save Settings")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Save Settings"));

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("renders terminal section", () => {
    vi.mocked(invoke).mockResolvedValue({ shell: "bash" });

    render(<SettingsPage />);

    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Shell")).toBeInTheDocument();
  });
});
