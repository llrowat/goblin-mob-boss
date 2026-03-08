import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { SystemMapPage } from "./SystemMapPage";

// Mock Terminal component (xterm not available in jsdom)
vi.mock("../components/Terminal", () => ({
  Terminal: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="terminal" data-session-id={sessionId}>
      Terminal
    </div>
  ),
}));

// Mock crypto.randomUUID for tests
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: () => "test-uuid-1234",
    },
  });
}

const mockRepos = [
  {
    id: "repo-1",
    name: "Backend API",
    path: "/home/user/backend-api",
    base_branch: "main",
    validators: [],
    pr_command: null,
  },
  {
    id: "repo-2",
    name: "Frontend App",
    path: "/home/user/frontend-app",
    base_branch: "main",
    validators: [],
    pr_command: null,
  },
];

const mockMap = {
  id: "map-1",
  name: "Platform Overview",
  description: "Main system map",
  services: [
    {
      id: "s1",
      name: "Auth Service",
      service_type: "backend" as const,
      repo_id: null,
      runtime: "node",
      framework: "express",
      description: "Handles authentication",
      owns_data: ["users", "sessions"],
      position: [200, 200] as [number, number],
      color: "#5a8a5c",
    },
    {
      id: "s2",
      name: "Web App",
      service_type: "frontend" as const,
      repo_id: null,
      runtime: "node",
      framework: "react",
      description: "Main UI",
      owns_data: [],
      position: [500, 200] as [number, number],
      color: "#5b8abd",
    },
  ],
  connections: [
    {
      id: "c1",
      from_service: "s2",
      to_service: "s1",
      connection_type: "rest" as const,
      sync: true,
      label: "/api/auth",
      description: "Auth calls",
    },
  ],
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

// Mock SVG methods that jsdom doesn't support
beforeAll(() => {
  // @ts-expect-error - jsdom doesn't implement SVG methods
  SVGElement.prototype.createSVGPoint = function () {
    return { x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) };
  };
  // @ts-expect-error - jsdom doesn't implement SVG methods
  SVGElement.prototype.getScreenCTM = function () {
    return { inverse: () => ({}) };
  };
});

describe("SystemMapPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no maps exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([]);
      if (cmd === "list_repositories") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No maps yet")).toBeInTheDocument();
      expect(screen.getByText("New Map")).toBeInTheDocument();
    });
  });

  it("shows page header and description", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([]);
      if (cmd === "list_repositories") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("System Map")).toBeInTheDocument();
    });
  });

  it("renders map with services and connections", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Auth Service")).toBeInTheDocument();
      expect(screen.getByText("Web App")).toBeInTheDocument();
    });
  });

  it("shows toolbar with service and connection counts", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/2 services/)).toBeInTheDocument();
      expect(screen.getByText(/1 connection/)).toBeInTheDocument();
    });
  });

  it("opens create map modal", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("New Map")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Map"));

    expect(screen.getByPlaceholderText("e.g. Platform Overview")).toBeInTheDocument();
  });

  it("opens add service modal from toolbar", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Add Service")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Service"));

    expect(screen.getByPlaceholderText("e.g. Auth Service")).toBeInTheDocument();
  });

  it("shows legend with service types and connection types", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Legend")).toBeInTheDocument();
      // Use getAllByText since labels appear in both the map and the legend
      expect(screen.getAllByText("Backend").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Frontend").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("REST")).toBeInTheDocument();
      expect(screen.getByText("Event")).toBeInTheDocument();
    });
  });

  it("shows service detail panel when a service is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Auth Service")).toBeInTheDocument();
    });

    // Click the service node text
    fireEvent.click(screen.getByText("Auth Service"));

    await waitFor(() => {
      expect(screen.getByText("Owned Data")).toBeInTheDocument();
      expect(screen.getByText("users")).toBeInTheDocument();
      expect(screen.getByText("sessions")).toBeInTheDocument();
    });
  });

  it("shows delete confirmation for map", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Delete Map")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Delete Map"));

    expect(screen.getByText("Delete this map?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("shows explore button in toolbar when repos exist", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Explore")).toBeInTheDocument();
    });
  });

  it("opens explore modal with repo checkboxes", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Explore")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Explore"));

    await waitFor(() => {
      expect(screen.getByText("Explore Repositories")).toBeInTheDocument();
      expect(screen.getByText("Backend API")).toBeInTheDocument();
      expect(screen.getByText("Frontend App")).toBeInTheDocument();
      expect(screen.getByText("Start Discovery")).toBeInTheDocument();
    });
  });

  it("disables send scouts button when no repos selected", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Explore")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Explore"));

    await waitFor(() => {
      const sendButton = screen.getByText("Start Discovery");
      expect(sendButton).toBeDisabled();
    });
  });

  it("shows explore button in empty territory state when repos exist", async () => {
    const emptyMap = { ...mockMap, services: [], connections: [] };
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([emptyMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No services yet")).toBeInTheDocument();
      // The Explore button in the toolbar + the one in empty state
      const exploreButtons = screen.getAllByText("Explore");
      expect(exploreButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows empty territory when map has no services", async () => {
    const emptyMap = { ...mockMap, services: [], connections: [] };
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([emptyMap]);
      if (cmd === "list_repositories") return Promise.resolve(mockRepos);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No services yet")).toBeInTheDocument();
    });
  });
});
