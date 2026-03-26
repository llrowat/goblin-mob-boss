import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { AgentsPage } from "./AgentsPage";

describe("AgentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAgents = [
    {
      filename: "fullstack-dev.md",
      name: "Full-Stack Developer",
      description: "Senior full-stack dev",
      tools: "Read, Edit, Write, Bash",
      model: null,
      system_prompt: "You are a senior full-stack developer.",
      is_global: true,
      color: "#5a8a5c",
      role: "developer",
      enabled: true,
    },
    {
      filename: "frontend-dev.md",
      name: "Frontend Developer",
      description: "",
      tools: null,
      model: null,
      system_prompt: "You are a frontend specialist.",
      is_global: true,
      color: "#5b8abd",
      role: "developer",
      enabled: true,
    },
  ];

  const mockBuiltInAgents = [
    {
      filename: "frontend-developer.md",
      name: "Frontend Developer",
      description: "React/TypeScript UI specialist",
      tools: "Read, Edit, Write, Bash, Glob, Grep",
      model: null,
      system_prompt: "You are a frontend development specialist.",
      is_global: true,
      color: "#5b8abd",
      role: "developer",
      enabled: true,
    },
    {
      filename: "test-engineer.md",
      name: "Test Engineer",
      description: "Testing and quality assurance specialist",
      tools: "Read, Edit, Write, Bash, Glob, Grep",
      model: null,
      system_prompt: "You are a testing specialist.",
      is_global: true,
      color: "#c9a84c",
      role: "quality",
      enabled: true,
    },
  ];

  const mockSkills = [
    {
      filename: "review-pr.md",
      name: "Review PR",
      description: "Automates PR review",
      prompt_template: "Review the current PR for issues.",
      is_global: true,
    },
    {
      filename: "run-tests.md",
      name: "Run Tests",
      description: "",
      prompt_template: "Run all tests and report failures.",
      is_global: true,
    },
  ];

  function mockInvokeForAgents() {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve(mockAgents);
      if (cmd === "list_built_in_agents") return Promise.resolve(mockBuiltInAgents);
      if (cmd === "list_global_skills") return Promise.resolve([]);
      return Promise.resolve([]);
    });
  }

  function mockInvokeForSkills() {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      if (cmd === "list_global_skills") return Promise.resolve(mockSkills);
      if (cmd === "get_teach_skill_command") return Promise.resolve("claude --print 'teach a skill'");
      return Promise.resolve([]);
    });
  }

  function mockInvokeEmpty() {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      if (cmd === "list_global_skills") return Promise.resolve([]);
      return Promise.resolve([]);
    });
  }

  // ── Page Header & Tabs ──

  it("renders page header with crew title", async () => {
    mockInvokeEmpty();
    render(<AgentsPage />);

    expect(screen.getByText("The Crew")).toBeInTheDocument();
    expect(screen.getByText(/goblins and their tricks/)).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("renders Goblins and Tricks tabs", async () => {
    mockInvokeEmpty();
    render(<AgentsPage />);

    expect(screen.getByRole("tab", { name: "Goblins" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tricks" })).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("defaults to Goblins tab active", async () => {
    mockInvokeForAgents();
    render(<AgentsPage />);

    const goblinsTab = screen.getByRole("tab", { name: "Goblins" });
    expect(goblinsTab.getAttribute("aria-selected")).toBe("true");

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });
  });

  // ── Agents Tab (preserved behavior) ──

  it("displays global agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
      expect(screen.getAllByText("Frontend Developer").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows Remove button for all agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    expect(removeButtons).toHaveLength(2);
  });

  it("opens create modal when Add Agent is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add Agent"));

    expect(screen.getAllByText("Create Agent")).toHaveLength(2); // header + button
    expect(screen.getByPlaceholderText("My Custom Agent")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("You are a specialist in..."),
    ).toBeInTheDocument();
  });

  it("shows edit modal when Edit is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("Full-Stack Developer"),
      ).toBeInTheDocument();
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
      expect(screen.getByText("Edit Agent")).toBeInTheDocument();
    });
  });

  it("displays agent colors in cards", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const avatars = document.querySelectorAll(".agent-card-avatar");
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    expect((avatars[0] as HTMLElement).style.background).toBe(
      "rgb(90, 138, 92)",
    );
  });

  it("shows color picker in create modal", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add Agent"));

    const swatches = document.querySelectorAll(".agent-color-swatch");
    expect(swatches.length).toBeGreaterThanOrEqual(12);
  });

  it("closes modal when Cancel is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add Agent"));
    expect(screen.getAllByText("Create Agent").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryAllByText("Create Agent")).toHaveLength(0);
  });

  it("shows delete confirmation", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Delete?")).toBeInTheDocument();
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("No")).toBeInTheDocument();
    });
  });

  it("calls delete_global_agent on confirm delete", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Yes"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("delete_global_agent", {
        filename: "fullstack-dev.md",
      });
    });
  });

  it("shows empty state when no agents and no built-in agents exist", async () => {
    mockInvokeEmpty();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("No Agents")).toBeInTheDocument();
      expect(screen.getByText(/No crew members yet/)).toBeInTheDocument();
    });
  });

  it("shows tools and model metadata when present", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Tools: Read, Edit, Write, Bash"),
      ).toBeInTheDocument();
    });
  });

  it("shows unapplied built-in agents", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
    });

    expect(screen.getByText("Test Engineer")).toBeInTheDocument();

    const addButtons = screen.getAllByText("+ Add");
    expect(addButtons.length).toBeGreaterThan(0);

    const builtInBadges = screen.getAllByText("built-in");
    expect(builtInBadges.length).toBeGreaterThan(0);
  });

  it("saves built-in agent globally when Add is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
    });

    const addButtons = screen.getAllByText("+ Add");
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("save_global_agent", {
        agent: expect.objectContaining({
          filename: "frontend-developer.md",
          is_global: true,
        }),
      });
    });
  });

  it("shows built-in agents section when no agents but built-ins exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve(mockBuiltInAgents);
      if (cmd === "list_global_skills") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Built-in Agents")).toBeInTheDocument();
      expect(screen.getAllByText("+ Add")).toHaveLength(2);
    });

    expect(screen.queryByText("No Agents")).not.toBeInTheDocument();
  });

  it("shows enabled toggle on agent cards", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const toggles = document.querySelectorAll(".agent-toggle input");
    expect(toggles.length).toBe(2);
    expect((toggles[0] as HTMLInputElement).checked).toBe(true);
    expect((toggles[1] as HTMLInputElement).checked).toBe(true);
  });

  it("calls save_global_agent with enabled=false when toggle is clicked", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const toggles = document.querySelectorAll(".agent-toggle input");
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("save_global_agent", {
        agent: expect.objectContaining({
          filename: "fullstack-dev.md",
          enabled: false,
        }),
      });
    });
  });

  it("shows disabled styling for disabled agents", async () => {
    const disabledAgents = [
      { ...mockAgents[0], enabled: false },
      mockAgents[1],
    ];

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve(disabledAgents);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      if (cmd === "list_global_skills") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Full-Stack Developer")).toBeInTheDocument();
    });

    const cards = document.querySelectorAll(".agent-card");
    expect(cards[0].classList.contains("agent-card-disabled")).toBe(true);
    expect(cards[1].classList.contains("agent-card-disabled")).toBe(false);
  });

  it("shows filename and description fields in create modal", async () => {
    mockInvokeForAgents();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ Add Agent"));

    expect(
      screen.getByPlaceholderText("auto-generated-from-name.md"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Specializes in React and CSS"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Read, Edit, Write, Bash"),
    ).toBeInTheDocument();
  });

  // ── Skills Tab ──

  it("switches to Tricks tab when clicked", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    const tricksTab = screen.getByRole("tab", { name: "Tricks" });
    expect(tricksTab.getAttribute("aria-selected")).toBe("true");

    await waitFor(() => {
      expect(screen.getByText("Review PR")).toBeInTheDocument();
    });
  });

  it("displays skill cards on Tricks tab", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("Review PR")).toBeInTheDocument();
      expect(screen.getByText("Run Tests")).toBeInTheDocument();
    });

    expect(screen.getByText("/review-pr")).toBeInTheDocument();
    expect(screen.getByText("/run-tests")).toBeInTheDocument();
  });

  it("shows skill description when present", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("Automates PR review")).toBeInTheDocument();
    });
  });

  it("shows New Skill and Teach a Trick buttons", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("+ New Skill")).toBeInTheDocument();
      expect(screen.getByText("Teach a Trick")).toBeInTheDocument();
    });
  });

  it("opens skill create modal when New Skill is clicked", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("+ New Skill")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ New Skill"));

    expect(screen.getAllByText("Create Skill")).toHaveLength(2); // header + button
    expect(screen.getByPlaceholderText("review-pr")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Review the current PR and check for..."),
    ).toBeInTheDocument();
  });

  it("opens skill edit modal when Edit is clicked on a skill", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("Review PR")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Review PR")).toBeInTheDocument();
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
      expect(screen.getByText("Edit Skill")).toBeInTheDocument();
    });
  });

  it("calls save_global_skill on skill create", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("+ New Skill")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ New Skill"));

    fireEvent.change(screen.getByPlaceholderText("review-pr"), {
      target: { value: "deploy" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Review the current PR and check for..."),
      { target: { value: "Deploy to production" } },
    );

    const createButtons = screen.getAllByText("Create Skill");
    fireEvent.click(createButtons[createButtons.length - 1]); // click the button, not the header

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("save_global_skill", {
        skill: expect.objectContaining({
          name: "deploy",
          prompt_template: "Deploy to production",
          is_global: true,
        }),
      });
    });
  });

  it("calls delete_global_skill on skill confirm delete", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("Review PR")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Yes"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("delete_global_skill", {
        filename: "review-pr.md",
      });
    });
  });

  it("shows empty state when no skills exist", async () => {
    mockInvokeEmpty();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("No Tricks Yet")).toBeInTheDocument();
      expect(screen.getByText(/hasn't learned any moves/)).toBeInTheDocument();
    });
  });

  it("shows teach command panel when Teach a Trick is clicked", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("Teach a Trick")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Teach a Trick"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_teach_skill_command");
      expect(screen.getByText("Teach a new trick")).toBeInTheDocument();
      expect(screen.getByText("Dismiss")).toBeInTheDocument();
    });
  });

  it("dismisses teach panel when Dismiss is clicked", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("Teach a Trick")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Teach a Trick"));

    await waitFor(() => {
      expect(screen.getByText("Dismiss")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Dismiss"));

    expect(screen.queryByText("Teach a new trick")).not.toBeInTheDocument();
  });

  it("closes skill modal when Cancel is clicked", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tricks" }));

    await waitFor(() => {
      expect(screen.getByText("+ New Skill")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ New Skill"));
    expect(screen.getAllByText("Create Skill").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryAllByText("Create Skill")).toHaveLength(0);
  });
});
