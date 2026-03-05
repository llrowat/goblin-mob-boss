import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header", () => {
    vi.mocked(invoke).mockResolvedValue({
      shell: "bash",
      verification_agent_ids: [],
    });

    render(<SettingsPage />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByText("Configure Goblin Mob Boss preferences."),
    ).toBeInTheDocument();
  });

  it("loads and displays current preferences", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_preferences") {
        return Promise.resolve({
          shell: "zsh",
          verification_agent_ids: ["builtin-reviewer"],
        });
      }
      if (cmd === "list_agents") {
        return Promise.resolve([
          {
            id: "builtin-reviewer",
            name: "Code Reviewer",
            role: "reviewer",
            system_prompt: "Review code",
            is_builtin: true,
          },
        ]);
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
        return Promise.resolve({ shell: "bash", verification_agent_ids: [] });
      }
      if (cmd === "list_agents") return Promise.resolve([]);
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
        return Promise.resolve({ shell: "bash", verification_agent_ids: [] });
      }
      if (cmd === "list_agents") return Promise.resolve([]);
      if (cmd === "set_preferences") {
        return Promise.resolve({ shell: "bash", verification_agent_ids: [] });
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

  it("shows empty agents message when no agents", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_preferences") {
        return Promise.resolve({ shell: "bash", verification_agent_ids: [] });
      }
      if (cmd === "list_agents") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("No agents configured. Add agents in the Agents page."),
      ).toBeInTheDocument();
    });
  });
});
