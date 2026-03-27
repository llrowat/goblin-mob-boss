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
      filename: "developer.md",
      name: "Developer",
      description: "General-purpose coding agent",
      tools: "Read, Edit, Write, Bash, Glob, Grep",
      model: null,
      system_prompt: "You are a software developer.",
      is_global: true,
      color: "#5b8abd",
      role: "developer",
      enabled: true,
    },
    {
      filename: "architect.md",
      name: "Architect",
      description: "System design and code review specialist",
      tools: "Read, Glob, Grep, Bash",
      model: null,
      system_prompt: "You are a software architect.",
      is_global: true,
      color: "#9b6b9e",
      role: "architect",
      enabled: true,
    },
  ];

  const mockBuiltInSkills = [
    {
      dir_name: "review-plan",
      name: "review-plan",
      description: "Review an ideation plan and suggest improvements",
      prompt_template: "Review the ideation plan for the current feature.",
      source: "user",
      plugin_name: null,
    },
    {
      dir_name: "validate-and-fix",
      name: "validate-and-fix",
      description: "Run validators and auto-fix failures in a loop",
      prompt_template: "Run the project's validators and fix any failures.",
      source: "user",
      plugin_name: null,
    },
  ];

  const mockSkills = [
    {
      dir_name: "review-pr",
      name: "review-pr",
      description: "Automates PR review",
      prompt_template: "Review the current PR for issues.",
      source: "user",
      plugin_name: null,
    },
    {
      dir_name: "run-tests",
      name: "run-tests",
      description: "",
      prompt_template: "Run all tests and report failures.",
      source: "user",
      plugin_name: null,
    },
  ];

  function mockInvokeForAgents() {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve(mockAgents);
      if (cmd === "list_built_in_agents") return Promise.resolve(mockBuiltInAgents);
      if (cmd === "list_global_skills") return Promise.resolve([]);
      if (cmd === "list_built_in_skills") return Promise.resolve([]);
      return Promise.resolve([]);
    });
  }

  function mockInvokeForSkills() {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      if (cmd === "list_global_skills") return Promise.resolve(mockSkills);
      if (cmd === "list_built_in_skills") return Promise.resolve(mockBuiltInSkills);
      return Promise.resolve([]);
    });
  }

  function mockInvokeEmpty() {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      if (cmd === "list_global_skills") return Promise.resolve([]);
      if (cmd === "list_built_in_skills") return Promise.resolve([]);
      return Promise.resolve([]);
    });
  }

  // ── Page Header & Tabs ──

  it("renders page header with crew title", async () => {
    mockInvokeEmpty();
    render(<AgentsPage />);

    expect(screen.getByText("Agents & Skills")).toBeInTheDocument();
    expect(screen.getByText(/agents and their skills/)).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("renders Goblins and Tricks tabs", async () => {
    mockInvokeEmpty();
    render(<AgentsPage />);

    expect(screen.getByRole("tab", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Skills" })).toBeInTheDocument();

    await waitFor(() => {});
  });

  it("defaults to Goblins tab active", async () => {
    mockInvokeForAgents();
    render(<AgentsPage />);

    const goblinsTab = screen.getByRole("tab", { name: "Agents" });
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

    expect(screen.getByText("Architect")).toBeInTheDocument();

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
          filename: "developer.md",
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
      if (cmd === "list_built_in_skills") return Promise.resolve([]);
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
      if (cmd === "list_built_in_skills") return Promise.resolve([]);
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

    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    const tricksTab = screen.getByRole("tab", { name: "Skills" });
    expect(tricksTab.getAttribute("aria-selected")).toBe("true");

    await waitFor(() => {
      expect(screen.getByText("review-pr")).toBeInTheDocument();
    });
  });

  it("displays skill cards on Tricks tab", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("review-pr")).toBeInTheDocument();
      expect(screen.getByText("run-tests")).toBeInTheDocument();
    });
  });

  it("shows skill description when present", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("Automates PR review")).toBeInTheDocument();
    });
  });

  it("shows New Skill and Auto-Create buttons", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("+ New Skill")).toBeInTheDocument();
      expect(screen.getByText("Auto-Create Skill")).toBeInTheDocument();
    });
  });

  it("opens skill create modal when New Skill is clicked", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

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
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("review-pr")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue("review-pr")).toBeInTheDocument();
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
      expect(screen.getByText("Edit Skill")).toBeInTheDocument();
    });
  });

  it("calls save_global_skill on skill create", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

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
          source: "user",
        }),
      });
    });
  });

  it("calls delete_global_skill on skill confirm delete", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("review-pr")).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Yes"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("delete_global_skill", {
        dirName: "review-pr",
      });
    });
  });

  it("shows empty state when no skills exist", async () => {
    mockInvokeEmpty();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("No Skills Yet")).toBeInTheDocument();
      expect(screen.getByText(/No tricks in the book yet/)).toBeInTheDocument();
    });
  });

  it("shows auto-create input when Auto-Create Skill is clicked", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("Auto-Create Skill")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Auto-Create Skill"));

    expect(screen.getByText("Describe your skill")).toBeInTheDocument();
    expect(screen.getByText("Generate")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("hides auto-create input when Cancel is clicked", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("Auto-Create Skill")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Auto-Create Skill"));
    expect(screen.getByText("Describe your skill")).toBeInTheDocument();

    const cancelButtons = screen.getAllByText("Cancel");
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);

    expect(screen.queryByText("Describe your skill")).not.toBeInTheDocument();
  });

  it("closes skill modal when Cancel is clicked", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("+ New Skill")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("+ New Skill"));
    expect(screen.getAllByText("Create Skill").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryAllByText("Create Skill")).toHaveLength(0);
  });

  it("shows unapplied built-in skills on Skills tab", async () => {
    mockInvokeForSkills();

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("Built-in Skills")).toBeInTheDocument();
    });

    // validate-and-fix is in built-ins but not in user skills
    expect(screen.getByText("validate-and-fix")).toBeInTheDocument();
  });

  it("saves built-in skill when Add is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      if (cmd === "list_global_skills") return Promise.resolve([]);
      if (cmd === "list_built_in_skills") return Promise.resolve(mockBuiltInSkills);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("Built-in Skills")).toBeInTheDocument();
    });

    const addButtons = screen.getAllByText("+ Add");
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("save_global_skill", {
        skill: expect.objectContaining({
          dir_name: "review-plan",
          source: "user",
        }),
      });
    });
  });

  it("hides built-in skill once already added by user", async () => {
    // User already has review-plan, but not validate-and-fix
    const userSkillsWithBuiltIn = [
      {
        dir_name: "review-plan",
        name: "review-plan",
        description: "Review an ideation plan",
        prompt_template: "Review the plan.",
        source: "user",
        plugin_name: null,
      },
    ];

    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_global_agents") return Promise.resolve([]);
      if (cmd === "list_built_in_agents") return Promise.resolve([]);
      if (cmd === "list_global_skills") return Promise.resolve(userSkillsWithBuiltIn);
      if (cmd === "list_built_in_skills") return Promise.resolve(mockBuiltInSkills);
      return Promise.resolve([]);
    });

    render(<AgentsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));

    await waitFor(() => {
      expect(screen.getByText("Built-in Skills")).toBeInTheDocument();
    });

    // Only validate-and-fix should appear as unapplied
    const addButtons = screen.getAllByText("+ Add");
    expect(addButtons).toHaveLength(1);
  });
});
