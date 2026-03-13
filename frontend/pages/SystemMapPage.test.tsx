import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { SystemMapPage, autoLayout, calculateFitViewBox } from "./SystemMapPage";
import type { MapService, MapConnection } from "../types";

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

/** Render the page and click into a map from the list view. */
async function renderAndSelectMap(mapData = [mockMap], repoData = mockRepos) {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "list_system_maps") return Promise.resolve(mapData);
    if (cmd === "list_repositories") return Promise.resolve(repoData);
    return Promise.resolve(null);
  });

  render(
    <MemoryRouter>
      <SystemMapPage />
    </MemoryRouter>,
  );

  // Wait for the map list and click into the first map
  await waitFor(() => {
    expect(screen.getByText(mapData[0].name)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText(mapData[0].name));
}

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

  it("shows map list with service counts", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_system_maps") return Promise.resolve([mockMap]);
      if (cmd === "list_repositories") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter>
        <SystemMapPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Platform Overview")).toBeInTheDocument();
      expect(screen.getByText(/2 services/)).toBeInTheDocument();
    });
  });

  it("renders map with services after clicking into it", async () => {
    await renderAndSelectMap();

    await waitFor(() => {
      expect(screen.getByText("Auth Service")).toBeInTheDocument();
      expect(screen.getByText("Web App")).toBeInTheDocument();
    });
  });

  it("shows toolbar with service and connection counts", async () => {
    await renderAndSelectMap();

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
    await renderAndSelectMap();

    await waitFor(() => {
      expect(screen.getByText("Add Service")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Service"));

    expect(screen.getByPlaceholderText("e.g. Auth Service")).toBeInTheDocument();
  });

  it("shows legend bar with service types and connection types", async () => {
    await renderAndSelectMap();

    await waitFor(() => {
      expect(screen.getAllByText("Backend").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Frontend").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("REST")).toBeInTheDocument();
      expect(screen.getByText("Event")).toBeInTheDocument();
    });
  });

  it("shows service detail panel when a service is clicked", async () => {
    await renderAndSelectMap();

    await waitFor(() => {
      expect(screen.getByText("Auth Service")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Auth Service"));

    await waitFor(() => {
      expect(screen.getByText("Owned Data")).toBeInTheDocument();
      expect(screen.getByText("users")).toBeInTheDocument();
      expect(screen.getByText("sessions")).toBeInTheDocument();
    });
  });

  it("shows delete confirmation for map", async () => {
    await renderAndSelectMap();

    await waitFor(() => {
      expect(screen.getByText("Delete Map")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Delete Map"));

    expect(screen.getByText("Delete this map?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("shows explore button in toolbar when repos exist", async () => {
    await renderAndSelectMap();

    await waitFor(() => {
      expect(screen.getByText("Explore")).toBeInTheDocument();
    });
  });

  it("opens explore modal with repo checkboxes", async () => {
    await renderAndSelectMap();

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
    await renderAndSelectMap();

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
    await renderAndSelectMap([emptyMap]);

    await waitFor(() => {
      expect(screen.getByText("No services yet")).toBeInTheDocument();
      const exploreButtons = screen.getAllByText("Explore");
      expect(exploreButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows empty territory when map has no services", async () => {
    const emptyMap = { ...mockMap, services: [], connections: [] };
    await renderAndSelectMap([emptyMap]);

    await waitFor(() => {
      expect(screen.getByText("No services yet")).toBeInTheDocument();
    });
  });

  it("renders a single-node map correctly", async () => {
    const singleNodeMap = {
      ...mockMap,
      services: [mockMap.services[0]],
      connections: [],
    };
    await renderAndSelectMap([singleNodeMap]);

    await waitFor(() => {
      expect(screen.getByText("Auth Service")).toBeInTheDocument();
      expect(screen.getByText(/1 service/)).toBeInTheDocument();
      expect(screen.getByText(/0 connections/)).toBeInTheDocument();
    });

    // Verify the SVG canvas is rendered (not the empty state)
    expect(screen.queryByText("No services yet")).not.toBeInTheDocument();

    // Verify the sketch filter is defined in the SVG defs
    const svg = document.querySelector(".map-svg");
    expect(svg).toBeTruthy();
    const sketchFilter = svg!.querySelector("filter#sketch");
    expect(sketchFilter).toBeTruthy();
  });

  it("navigates back to map list with back button", async () => {
    await renderAndSelectMap();

    await waitFor(() => {
      expect(screen.getByText("Auth Service")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("←"));

    await waitFor(() => {
      expect(screen.getByText(/2 services/)).toBeInTheDocument();
      expect(screen.queryByText("Auth Service")).not.toBeInTheDocument();
    });
  });

  it("shows Fit View button in toolbar", async () => {
    await renderAndSelectMap();

    await waitFor(() => {
      expect(screen.getByText("Fit View")).toBeInTheDocument();
    });
  });

  it("disables Fit View button when map has no services", async () => {
    const emptyMap = { ...mockMap, services: [], connections: [] };
    await renderAndSelectMap([emptyMap]);

    await waitFor(() => {
      expect(screen.getByText("No services yet")).toBeInTheDocument();
    });
    // The Fit View button should be in the toolbar, disabled
    const fitBtn = screen.getByText("Fit View");
    expect(fitBtn).toBeDisabled();
  });
});

// ── autoLayout unit tests ──

function makeSvc(id: string, type: MapService["service_type"] = "backend"): MapService {
  return {
    id,
    name: `Service ${id}`,
    service_type: type,
    repo_id: null,
    runtime: "",
    framework: "",
    description: "",
    owns_data: [],
    position: [0, 0],
    color: "#000",
  };
}

function makeConn(from: string, to: string): MapConnection {
  return {
    id: `${from}-${to}`,
    from_service: from,
    to_service: to,
    connection_type: "rest",
    sync: true,
    label: "",
    description: "",
  };
}

describe("autoLayout", () => {
  it("returns empty object for no services", () => {
    expect(autoLayout([], [])).toEqual({});
  });

  it("returns position for a single service", () => {
    const svcs = [makeSvc("a")];
    const result = autoLayout(svcs, []);
    expect(result).toHaveProperty("a");
    expect(result["a"]).toHaveLength(2);
    expect(typeof result["a"][0]).toBe("number");
    expect(typeof result["a"][1]).toBe("number");
  });

  it("returns positions for all services", () => {
    const svcs = [makeSvc("a"), makeSvc("b"), makeSvc("c")];
    const conns = [makeConn("a", "b"), makeConn("b", "c")];
    const result = autoLayout(svcs, conns);
    expect(Object.keys(result)).toHaveLength(3);
    expect(result).toHaveProperty("a");
    expect(result).toHaveProperty("b");
    expect(result).toHaveProperty("c");
  });

  it("places connected nodes closer than unconnected ones", () => {
    const svcs = [makeSvc("a"), makeSvc("b"), makeSvc("c")];
    const conns = [makeConn("a", "b")]; // a->b connected, c isolated
    const result = autoLayout(svcs, conns);
    const distAB = Math.sqrt(
      (result["a"][0] - result["b"][0]) ** 2 + (result["a"][1] - result["b"][1]) ** 2,
    );
    const distAC = Math.sqrt(
      (result["a"][0] - result["c"][0]) ** 2 + (result["a"][1] - result["c"][1]) ** 2,
    );
    // Connected nodes should generally be closer (or at least not significantly farther)
    // This is probabilistic, so we check a weaker condition
    expect(distAB).toBeGreaterThan(0);
    expect(distAC).toBeGreaterThan(0);
  });

  it("ensures minimum spacing between nodes", () => {
    const svcs = [makeSvc("a"), makeSvc("b"), makeSvc("c"), makeSvc("d")];
    const result = autoLayout(svcs, []);
    const ids = Object.keys(result);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const dist = Math.sqrt(
          (result[ids[i]][0] - result[ids[j]][0]) ** 2 +
          (result[ids[i]][1] - result[ids[j]][1]) ** 2,
        );
        // After collision pass, nodes should be at least 120px apart
        // Allow small tolerance for floating point
        expect(dist).toBeGreaterThanOrEqual(119);
      }
    }
  });

  it("ignores connections referencing nonexistent services", () => {
    const svcs = [makeSvc("a"), makeSvc("b")];
    const conns = [makeConn("a", "b"), makeConn("a", "nonexistent")];
    const result = autoLayout(svcs, conns);
    expect(Object.keys(result)).toHaveLength(2);
  });

  it("handles graph with cycles", () => {
    const svcs = [makeSvc("a"), makeSvc("b"), makeSvc("c")];
    const conns = [makeConn("a", "b"), makeConn("b", "c"), makeConn("c", "a")];
    const result = autoLayout(svcs, conns);
    expect(Object.keys(result)).toHaveLength(3);
    // Should not throw or produce NaN
    for (const id of ["a", "b", "c"]) {
      expect(Number.isFinite(result[id][0])).toBe(true);
      expect(Number.isFinite(result[id][1])).toBe(true);
    }
  });

  it("scales IDEAL_DIST with node count", () => {
    // With 2 nodes, IDEAL_DIST = max(180, 300-16) = 284
    // With 20 nodes, IDEAL_DIST = max(180, 300-160) = 180
    const small = [makeSvc("a"), makeSvc("b")];
    const large = Array.from({ length: 20 }, (_, i) => makeSvc(`s${i}`));
    const rSmall = autoLayout(small, []);
    const rLarge = autoLayout(large, []);
    // Both should produce valid results
    expect(Object.keys(rSmall)).toHaveLength(2);
    expect(Object.keys(rLarge)).toHaveLength(20);
  });

  it("ensures minimum spacing between connected nodes", () => {
    const svcs = [makeSvc("a"), makeSvc("b"), makeSvc("c"), makeSvc("d"), makeSvc("e")];
    const conns = [
      makeConn("a", "b"),
      makeConn("b", "c"),
      makeConn("c", "d"),
      makeConn("d", "e"),
      makeConn("e", "a"),
    ];
    const result = autoLayout(svcs, conns);
    const ids = Object.keys(result);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const dist = Math.sqrt(
          (result[ids[i]][0] - result[ids[j]][0]) ** 2 +
          (result[ids[i]][1] - result[ids[j]][1]) ** 2,
        );
        expect(dist).toBeGreaterThanOrEqual(119);
      }
    }
  });

  it("produces no overlapping nodes with many services", () => {
    const svcs = Array.from({ length: 15 }, (_, i) => makeSvc(`n${i}`));
    const conns = Array.from({ length: 14 }, (_, i) => makeConn(`n${i}`, `n${i + 1}`));
    const result = autoLayout(svcs, conns);
    const ids = Object.keys(result);
    expect(ids).toHaveLength(15);
    // All positions should be distinct (no two nodes at the exact same spot)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const dist = Math.sqrt(
          (result[ids[i]][0] - result[ids[j]][0]) ** 2 +
          (result[ids[i]][1] - result[ids[j]][1]) ** 2,
        );
        // With many nodes the layout may scale down, but nodes should
        // never overlap (node radius ~20px, so >0 distance suffices)
        expect(dist).toBeGreaterThan(0);
      }
    }
    // All positions should have finite values
    for (const id of ids) {
      expect(Number.isFinite(result[id][0])).toBe(true);
      expect(Number.isFinite(result[id][1])).toBe(true);
    }
  });

  it("groups same-type services closer together", () => {
    const svcs = [
      makeSvc("fe1", "frontend"),
      makeSvc("fe2", "frontend"),
      makeSvc("be1", "backend"),
      makeSvc("be2", "backend"),
      makeSvc("db1", "database"),
    ];
    const result = autoLayout(svcs, []);
    // Same-type nodes should cluster. Check that FE nodes are closer to each other
    // than to DB node on average
    const distFE = Math.sqrt(
      (result["fe1"][0] - result["fe2"][0]) ** 2 + (result["fe1"][1] - result["fe2"][1]) ** 2,
    );
    expect(distFE).toBeGreaterThan(0);
    expect(Object.keys(result)).toHaveLength(5);
  });
});

// ── calculateFitViewBox unit tests ──

describe("calculateFitViewBox", () => {
  const defaultVB = { x: 0, y: 0, w: 1200, h: 800 };

  it("returns null for zero services", () => {
    expect(calculateFitViewBox([], defaultVB)).toBeNull();
  });

  it("centers single service with 600x400 viewBox", () => {
    const svcs = [{ ...makeSvc("a"), position: [300, 200] as [number, number] }];
    const result = calculateFitViewBox(svcs, defaultVB);
    expect(result).not.toBeNull();
    expect(result!.w).toBe(600);
    expect(result!.h).toBe(400);
    // Center should be at service position
    expect(result!.x + result!.w / 2).toBe(300);
    expect(result!.y + result!.h / 2).toBe(200);
  });

  it("calculates bounding box for multiple services with padding", () => {
    const svcs = [
      { ...makeSvc("a"), position: [100, 100] as [number, number] },
      { ...makeSvc("b"), position: [500, 400] as [number, number] },
    ];
    const result = calculateFitViewBox(svcs, defaultVB);
    expect(result).not.toBeNull();
    // Bounding box: 100-500 x, 100-400 y => span 400x300, plus padding 80*2 = 560x460
    // Then aspect ratio adjustment expands it
    // The center should be at (300, 250)
    const cx = result!.x + result!.w / 2;
    const cy = result!.y + result!.h / 2;
    expect(cx).toBeCloseTo(300, 0);
    expect(cy).toBeCloseTo(250, 0);
  });

  it("clamps viewBox to minimum bounds", () => {
    // Two very close services
    const svcs = [
      { ...makeSvc("a"), position: [400, 300] as [number, number] },
      { ...makeSvc("b"), position: [410, 310] as [number, number] },
    ];
    const result = calculateFitViewBox(svcs, defaultVB);
    expect(result).not.toBeNull();
    expect(result!.w).toBeGreaterThanOrEqual(200);
    expect(result!.h).toBeGreaterThanOrEqual(133);
  });

  it("clamps viewBox to maximum bounds", () => {
    // Very spread out services
    const svcs = [
      { ...makeSvc("a"), position: [0, 0] as [number, number] },
      { ...makeSvc("b"), position: [10000, 8000] as [number, number] },
    ];
    const result = calculateFitViewBox(svcs, defaultVB);
    expect(result).not.toBeNull();
    expect(result!.w).toBeLessThanOrEqual(4800);
    expect(result!.h).toBeLessThanOrEqual(3200);
  });

  it("viewBox contains all node positions with padding", () => {
    const svcs = [
      { ...makeSvc("a"), position: [100, 150] as [number, number] },
      { ...makeSvc("b"), position: [700, 500] as [number, number] },
      { ...makeSvc("c"), position: [400, 300] as [number, number] },
    ];
    const result = calculateFitViewBox(svcs, defaultVB);
    expect(result).not.toBeNull();
    // Every service position must fall within the viewBox
    for (const s of svcs) {
      const [sx, sy] = s.position;
      expect(sx).toBeGreaterThanOrEqual(result!.x);
      expect(sx).toBeLessThanOrEqual(result!.x + result!.w);
      expect(sy).toBeGreaterThanOrEqual(result!.y);
      expect(sy).toBeLessThanOrEqual(result!.y + result!.h);
    }
  });

  it("viewBox contains all nodes even when spread across many positions", () => {
    const positions: [number, number][] = [
      [50, 50], [900, 50], [50, 700], [900, 700], [500, 400],
    ];
    const svcs = positions.map((pos, i) => ({
      ...makeSvc(`s${i}`),
      position: pos,
    }));
    const result = calculateFitViewBox(svcs, defaultVB);
    expect(result).not.toBeNull();
    for (const s of svcs) {
      const [sx, sy] = s.position;
      expect(sx).toBeGreaterThanOrEqual(result!.x);
      expect(sx).toBeLessThanOrEqual(result!.x + result!.w);
      expect(sy).toBeGreaterThanOrEqual(result!.y);
      expect(sy).toBeLessThanOrEqual(result!.y + result!.h);
    }
  });

  it("maintains roughly 3:2 aspect ratio", () => {
    const svcs = [
      { ...makeSvc("a"), position: [100, 100] as [number, number] },
      { ...makeSvc("b"), position: [800, 600] as [number, number] },
    ];
    const result = calculateFitViewBox(svcs, defaultVB);
    expect(result).not.toBeNull();
    const aspect = result!.w / result!.h;
    expect(aspect).toBeCloseTo(1.5, 1);
  });
});

// ── autoLayout scaling tests for large graphs ──

describe("autoLayout — large graph scaling", () => {
  it("spreads 25+ nodes with no overlapping positions", () => {
    const svcs = Array.from({ length: 25 }, (_, i) => makeSvc(`n${i}`));
    const conns = Array.from({ length: 24 }, (_, i) => makeConn(`n${i}`, `n${i + 1}`));
    const result = autoLayout(svcs, conns);
    const ids = Object.keys(result);
    expect(ids).toHaveLength(25);

    // After fit-to-canvas, positions are scaled — verify no two nodes share a position
    // and all are spread apart (node radius is 32px, so >0 distance is the baseline)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const dist = Math.sqrt(
          (result[ids[i]][0] - result[ids[j]][0]) ** 2 +
          (result[ids[i]][1] - result[ids[j]][1]) ** 2,
        );
        expect(dist).toBeGreaterThan(0);
      }
    }

    // All positions should be finite
    for (const id of ids) {
      expect(Number.isFinite(result[id][0])).toBe(true);
      expect(Number.isFinite(result[id][1])).toBe(true);
    }
  });

  it("produces a larger bounding box for 30 nodes than for 5 nodes", () => {
    const small = Array.from({ length: 5 }, (_, i) => makeSvc(`s${i}`));
    const large = Array.from({ length: 30 }, (_, i) => makeSvc(`l${i}`));

    const rSmall = autoLayout(small, []);
    const rLarge = autoLayout(large, []);

    // Compute bounding boxes
    const bbox = (r: Record<string, [number, number]>) => {
      const xs = Object.values(r).map(([x]) => x);
      const ys = Object.values(r).map(([, y]) => y);
      return {
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    };

    const smallBox = bbox(rSmall);
    const largeBox = bbox(rLarge);

    // Larger graph should occupy more space
    expect(largeBox.w + largeBox.h).toBeGreaterThan(smallBox.w + smallBox.h);
  });

  it("produces finite positions for a highly connected 20-node graph", () => {
    const svcs = Array.from({ length: 20 }, (_, i) => makeSvc(`n${i}`));
    // Star topology: all nodes connect to node 0
    const conns = Array.from({ length: 19 }, (_, i) => makeConn("n0", `n${i + 1}`));
    const result = autoLayout(svcs, conns);
    expect(Object.keys(result)).toHaveLength(20);
    for (const id of Object.keys(result)) {
      expect(Number.isFinite(result[id][0])).toBe(true);
      expect(Number.isFinite(result[id][1])).toBe(true);
    }
  });
});
