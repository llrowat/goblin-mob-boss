import { useState, useEffect, useRef, useCallback } from "react";
import { useTauri } from "../hooks/useTauri";
import { useCommandDisplay, CommandDisplayButton, CommandDisplayContent } from "../components/CommandDisplay";
import type {
  SystemMap,
  MapService,
  MapConnection,
  ServiceType,
  ConnectionType,
  Repository,
  DiscoveryStatus,
} from "../types";

// ── Service type visual config ──

const SERVICE_LABELS: Record<ServiceType, string> = {
  backend: "Backend",
  frontend: "Frontend",
  worker: "Worker",
  gateway: "Gateway",
  database: "Database",
  queue: "Queue",
  cache: "Cache",
  external: "External",
};

// Short abbreviations shown inside each shape
const SERVICE_ABBR: Record<ServiceType, string> = {
  backend: "BE",
  frontend: "FE",
  worker: "WK",
  gateway: "GW",
  database: "DB",
  queue: "Q",
  cache: "CA",
  external: "EX",
};

// Shape: "circle" or "square" (rounded)
const SERVICE_SHAPE: Record<ServiceType, "circle" | "square"> = {
  backend: "square",
  frontend: "circle",
  worker: "square",
  gateway: "square",
  database: "circle",
  queue: "square",
  cache: "circle",
  external: "circle",
};

// All connections use dashed lines — different dash patterns like map trails
const CONNECTION_STYLES: Record<
  ConnectionType,
  { dash: string; color: string; label: string }
> = {
  rest: { dash: "8 4", color: "#b8944a", label: "REST" },
  grpc: { dash: "12 4", color: "#5b8abd", label: "gRPC" },
  graphql: { dash: "6 3 2 3", color: "#9b6abf", label: "GraphQL" },
  websocket: { dash: "3 5", color: "#5a8a5c", label: "WebSocket" },
  event: { dash: "2 4 6 4", color: "#c4654a", label: "Event" },
  shared_db: { dash: "10 3 3 3", color: "#d4aa5a", label: "Shared DB" },
  file_system: { dash: "4 6", color: "#6a675f", label: "File System" },
  ipc: { dash: "2 3", color: "#9a978f", label: "IPC" },
};

const SERVICE_COLORS: Record<ServiceType, string> = {
  backend: "#5a8a5c",
  frontend: "#5b8abd",
  worker: "#9b6abf",
  gateway: "#b8944a",
  database: "#d4aa5a",
  queue: "#c4654a",
  cache: "#6a8a7a",
  external: "#6a675f",
};

const DEFAULT_MAP_NAME = "New System Map";

// ── Helper: generate a position for new services ──
function nextPosition(services: MapService[]): [number, number] {
  if (services.length === 0) return [400, 300];
  const cols = 3;
  const row = Math.floor(services.length / cols);
  const col = services.length % cols;
  return [200 + col * 250, 150 + row * 200];
}

// ── Force-directed auto-layout ──

export function autoLayout(
  services: MapService[],
  connections: MapConnection[],
): Record<string, [number, number]> {
  const result: Record<string, [number, number]> = {};
  if (services.length === 0) return result;

  // Only consider connections between services that exist in this map
  const ids = new Set(services.map((s) => s.id));
  const edges = connections.filter(
    (c) => ids.has(c.from_service) && ids.has(c.to_service),
  );

  // ── Topological layering ──
  // Build adjacency for topological sort (sources → intermediaries → sinks)
  const inDeg: Record<string, number> = {};
  const outAdj: Record<string, string[]> = {};
  for (const s of services) {
    inDeg[s.id] = 0;
    outAdj[s.id] = [];
  }
  for (const e of edges) {
    inDeg[e.to_service] = (inDeg[e.to_service] ?? 0) + 1;
    outAdj[e.from_service] = outAdj[e.from_service] ?? [];
    outAdj[e.from_service].push(e.to_service);
  }

  // BFS layering (Kahn's algorithm)
  const layerOf: Record<string, number> = {};
  const queue: string[] = [];
  for (const s of services) {
    if (inDeg[s.id] === 0) {
      queue.push(s.id);
      layerOf[s.id] = 0;
    }
  }
  let head = 0;
  let maxLayer = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const nb of (outAdj[cur] ?? [])) {
      inDeg[nb]--;
      const nextLayer = (layerOf[cur] ?? 0) + 1;
      layerOf[nb] = Math.max(layerOf[nb] ?? 0, nextLayer);
      maxLayer = Math.max(maxLayer, layerOf[nb]);
      if (inDeg[nb] === 0) queue.push(nb);
    }
  }
  // Assign unvisited nodes (cycles) to the last layer + 1
  for (const s of services) {
    if (layerOf[s.id] === undefined) {
      layerOf[s.id] = maxLayer + 1;
      maxLayer = layerOf[s.id];
    }
  }

  // Group services by layer
  const layers: string[][] = [];
  for (let i = 0; i <= maxLayer; i++) layers.push([]);
  for (const s of services) layers[layerOf[s.id]].push(s.id);

  // ── Initialize positions by layer rows ──
  const cx = 600, cy = 400;
  const px: Record<string, number> = {};
  const py: Record<string, number> = {};
  const vx: Record<string, number> = {};
  const vy: Record<string, number> = {};

  const layerSpacingY = 160;
  const totalHeight = maxLayer * layerSpacingY;
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const rowY = cy - totalHeight / 2 + li * layerSpacingY;
    const rowWidth = (layer.length - 1) * 180;
    for (let ni = 0; ni < layer.length; ni++) {
      const sid = layer[ni];
      px[sid] = cx - rowWidth / 2 + ni * 180;
      py[sid] = rowY;
      vx[sid] = 0;
      vy[sid] = 0;
    }
  }

  // ── Force simulation ──
  const IDEAL_DIST = Math.max(180, 300 - services.length * 8);
  const iterations = Math.min(500, 300 + services.length * 10);

  // Build a type-group map for clustering bias
  const typeOf: Record<string, ServiceType> = {};
  for (const s of services) typeOf[s.id] = s.service_type;

  for (let iter = 0; iter < iterations; iter++) {
    const temp = Math.max(0.01, 1 - iter / iterations);

    // Repulsion between all pairs
    for (let i = 0; i < services.length; i++) {
      for (let j = i + 1; j < services.length; j++) {
        const a = services[i].id, b = services[j].id;
        const dx = px[a] - px[b];
        const dy = py[a] - py[b];
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (IDEAL_DIST * IDEAL_DIST) / dist;
        const fx = (dx / dist) * force * temp;
        const fy = (dy / dist) * force * temp;
        vx[a] += fx; vy[a] += fy;
        vx[b] -= fx; vy[b] -= fy;
      }
    }

    // Attraction along edges
    for (const e of edges) {
      const dx = px[e.to_service] - px[e.from_service];
      const dy = py[e.to_service] - py[e.from_service];
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - IDEAL_DIST) * 0.1 * temp;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      vx[e.from_service] += fx; vy[e.from_service] += fy;
      vx[e.to_service] -= fx; vy[e.to_service] -= fy;
    }

    // Centering force — pull toward center of mass
    let cmx = 0, cmy = 0;
    for (const s of services) { cmx += px[s.id]; cmy += py[s.id]; }
    cmx /= services.length;
    cmy /= services.length;
    const centerStrength = 0.05 * temp;
    for (const s of services) {
      vx[s.id] += (cx - cmx) * centerStrength;
      vy[s.id] += (cy - cmy) * centerStrength;
    }

    // Service type grouping bias — weak clustering force
    for (let i = 0; i < services.length; i++) {
      for (let j = i + 1; j < services.length; j++) {
        const a = services[i].id, b = services[j].id;
        if (typeOf[a] === typeOf[b]) {
          const dx = px[b] - px[a];
          const dy = py[b] - py[a];
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const clusterForce = 0.02 * temp;
          const fx = (dx / dist) * clusterForce * dist;
          const fy = (dy / dist) * clusterForce * dist;
          vx[a] += fx; vy[a] += fy;
          vx[b] -= fx; vy[b] -= fy;
        }
      }
    }

    // Apply velocities with damping
    for (const s of services) {
      vx[s.id] *= 0.85;
      vy[s.id] *= 0.85;
      const speed = Math.sqrt(vx[s.id] ** 2 + vy[s.id] ** 2);
      if (speed > 50) {
        vx[s.id] = (vx[s.id] / speed) * 50;
        vy[s.id] = (vy[s.id] / speed) * 50;
      }
      px[s.id] += vx[s.id];
      py[s.id] += vy[s.id];
    }
  }

  // ── Edge crossing reduction: sweep within layers ──
  // For each layer, try swapping adjacent nodes and keep swaps that reduce crossings
  const countCrossings = (): number => {
    let crossings = 0;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i], e2 = edges[j];
        const x1a = px[e1.from_service], x1b = px[e1.to_service];
        const x2a = px[e2.from_service], x2b = px[e2.to_service];
        // Edges cross if their x-orderings are inverted between layers
        if ((x1a - x2a) * (x1b - x2b) < 0) crossings++;
      }
    }
    return crossings;
  };

  for (let pass = 0; pass < 3; pass++) {
    for (const layer of layers) {
      if (layer.length < 2) continue;
      // Sort layer nodes by current x position
      layer.sort((a, b) => px[a] - px[b]);
      for (let i = 0; i < layer.length - 1; i++) {
        const before = countCrossings();
        // Swap x positions
        const tmpX = px[layer[i]];
        px[layer[i]] = px[layer[i + 1]];
        px[layer[i + 1]] = tmpX;
        const after = countCrossings();
        if (after >= before) {
          // Revert swap
          const revert = px[layer[i]];
          px[layer[i]] = px[layer[i + 1]];
          px[layer[i + 1]] = revert;
        } else {
          // Keep swap, also swap in the layer array
          const tmp = layer[i];
          layer[i] = layer[i + 1];
          layer[i + 1] = tmp;
        }
      }
    }
  }

  // ── Collision pass: ensure minimum 120px between node centers ──
  const MIN_SPACING = 120;
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i < services.length; i++) {
      for (let j = i + 1; j < services.length; j++) {
        const a = services[i].id, b = services[j].id;
        const dx = px[a] - px[b];
        const dy = py[a] - py[b];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_SPACING && dist > 0) {
          const overlap = (MIN_SPACING - dist) / 2;
          const nx = (dx / dist) * overlap;
          const ny = (dy / dist) * overlap;
          px[a] += nx; py[a] += ny;
          px[b] -= nx; py[b] -= ny;
        } else if (dist === 0) {
          // Nudge apart if exactly overlapping
          px[a] += MIN_SPACING / 2;
          px[b] -= MIN_SPACING / 2;
        }
      }
    }
  }

  // ── Fit into target area (viewBox 1200x800 with padding) ──
  const PAD = 80;
  const targetW = 1200 - PAD * 2;
  const targetH = 800 - PAD * 2;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of services) {
    minX = Math.min(minX, px[s.id]);
    minY = Math.min(minY, py[s.id]);
    maxX = Math.max(maxX, px[s.id]);
    maxY = Math.max(maxY, py[s.id]);
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(targetW / spanX, targetH / spanY, 1);

  for (const s of services) {
    const nx = (px[s.id] - minX) * scale + PAD + (targetW - spanX * scale) / 2;
    const ny = (py[s.id] - minY) * scale + PAD + (targetH - spanY * scale) / 2;
    result[s.id] = [Math.round(nx), Math.round(ny)];
  }

  return result;
}

// ── Fit-to-view calculation (pure, testable) ──

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function calculateFitViewBox(
  services: MapService[],
  _currentViewBox: ViewBox,
): ViewBox | null {
  if (services.length === 0) return null;

  if (services.length === 1) {
    const [sx, sy] = services[0].position;
    // Center with 600x400 default, clamped to bounds
    const w = Math.max(200, Math.min(4800, 600));
    const h = Math.max(133, Math.min(3200, 400));
    return { x: sx - w / 2, y: sy - h / 2, w, h };
  }

  // Calculate bounding box of all services
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of services) {
    const [sx, sy] = s.position;
    minX = Math.min(minX, sx);
    minY = Math.min(minY, sy);
    maxX = Math.max(maxX, sx);
    maxY = Math.max(maxY, sy);
  }

  const PAD = 80;
  let w = maxX - minX + PAD * 2;
  let h = maxY - minY + PAD * 2;

  // Clamp to zoom bounds
  w = Math.max(200, Math.min(4800, w));
  h = Math.max(133, Math.min(3200, h));

  // Maintain aspect ratio 3:2 (1200:800) — expand to fit
  const targetAspect = 3 / 2;
  const currentAspect = w / h;
  if (currentAspect > targetAspect) {
    h = w / targetAspect;
  } else {
    w = h * targetAspect;
  }

  // Re-clamp after aspect ratio adjustment
  w = Math.max(200, Math.min(4800, w));
  h = Math.max(133, Math.min(3200, h));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return { x: centerX - w / 2, y: centerY - h / 2, w, h };
}

export function SystemMapPage() {
  const tauri = useTauri();

  // ── State ──
  const [maps, setMaps] = useState<SystemMap[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Editing
  const [showNewMapModal, setShowNewMapModal] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [newMapDesc, setNewMapDesc] = useState("");
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<MapService | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [editingConnection, setEditingConnection] =
    useState<MapConnection | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null,
  );
  const [confirmDeleteMap, setConfirmDeleteMap] = useState(false);

  // Discovery (Explore)
  const [repos, setRepos] = useState<Repository[]>([]);
  const [showExploreModal, setShowExploreModal] = useState(false);
  const [exploreRepoIds, setExploreRepoIds] = useState<string[]>([]);
  const [exploring, setExploring] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);
  const [discoveryCommand, setDiscoveryCommand] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveryCmdDisplay = useCommandDisplay(discoveryCommand);

  // Dragging
  const [dragServiceId, setDragServiceId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Zoom & pan
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1200, h: 800 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const fitAnimRef = useRef<number | null>(null);

  // Service form state
  const [svcName, setSvcName] = useState("");
  const [svcType, setSvcType] = useState<ServiceType>("backend");
  const [svcRuntime, setSvcRuntime] = useState("");
  const [svcFramework, setSvcFramework] = useState("");
  const [svcDesc, setSvcDesc] = useState("");
  const [svcData, setSvcData] = useState("");

  // Connection form state
  const [connFrom, setConnFrom] = useState("");
  const [connTo, setConnTo] = useState("");
  const [connType, setConnType] = useState<ConnectionType>("rest");
  const [connSync, setConnSync] = useState(true);
  const [connLabel, setConnLabel] = useState("");
  const [connDesc, setConnDesc] = useState("");

  const activeMap = maps.find((m) => m.id === activeMapId) ?? null;

  // ── Cleanup discovery polling and fit animation on unmount ──
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (fitAnimRef.current !== null) cancelAnimationFrame(fitAnimRef.current);
    };
  }, []);

  // Attach wheel handler as non-passive so preventDefault works
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      setViewBox((v) => {
        const newW = Math.max(200, Math.min(4800, v.w * zoomFactor));
        const newH = Math.max(133, Math.min(3200, v.h * zoomFactor));
        return { x: v.x + (v.w - newW) * mx, y: v.y + (v.h - newH) * my, w: newW, h: newH };
      });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  });

  // ── Load ──
  useEffect(() => {
    Promise.all([tauri.listSystemMaps(), tauri.listRepositories()])
      .then(([mapList, repoList]) => {
        setMaps(mapList);
        setRepos(repoList);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Persist helper ──
  const persistMap = useCallback(
    async (updated: SystemMap) => {
      try {
        // Sanitize: ensure all positions are valid numbers (guards against null/undefined)
        const sanitized: SystemMap = {
          ...updated,
          services: updated.services.map((s) => ({
            ...s,
            position: [
              typeof s.position?.[0] === "number" ? s.position[0] : 0,
              typeof s.position?.[1] === "number" ? s.position[1] : 0,
            ] as [number, number],
          })),
        };
        const saved = await tauri.updateSystemMap(sanitized);
        setMaps((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
      } catch (e) {
        setError(String(e));
      }
    },
    [tauri],
  );

  // ── Map CRUD ──
  const handleCreateMap = async () => {
    const name = newMapName.trim() || DEFAULT_MAP_NAME;
    try {
      const created = await tauri.createSystemMap(name, newMapDesc.trim());
      setMaps((prev) => [...prev, created]);
      setActiveMapId(created.id);
      setShowNewMapModal(false);
      setNewMapName("");
      setNewMapDesc("");
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteMap = async () => {
    if (!activeMapId) return;
    try {
      await tauri.deleteSystemMap(activeMapId);
      setMaps((prev) => prev.filter((m) => m.id !== activeMapId));
      setActiveMapId(null);
      setConfirmDeleteMap(false);
    } catch (e) {
      setError(String(e));
    }
  };

  // ── Service CRUD ──
  const openAddService = () => {
    setEditingService(null);
    setSvcName("");
    setSvcType("backend");
    setSvcRuntime("");
    setSvcFramework("");
    setSvcDesc("");
    setSvcData("");
    setShowServiceModal(true);
  };

  const openEditService = (svc: MapService) => {
    setEditingService(svc);
    setSvcName(svc.name);
    setSvcType(svc.service_type);
    setSvcRuntime(svc.runtime);
    setSvcFramework(svc.framework);
    setSvcDesc(svc.description);
    setSvcData(svc.owns_data.join(", "));
    setShowServiceModal(true);
  };

  const handleSaveService = async () => {
    if (!activeMap) return;
    const name = svcName.trim();
    if (!name) return;

    const services = [...activeMap.services];
    if (editingService) {
      const idx = services.findIndex((s) => s.id === editingService.id);
      if (idx >= 0) {
        services[idx] = {
          ...services[idx],
          name,
          service_type: svcType,
          runtime: svcRuntime.trim(),
          framework: svcFramework.trim(),
          description: svcDesc.trim(),
          owns_data: svcData
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          color: SERVICE_COLORS[svcType],
        };
      }
    } else {
      const pos = nextPosition(services);
      services.push({
        id: crypto.randomUUID(),
        name,
        service_type: svcType,
        repo_id: null,
        runtime: svcRuntime.trim(),
        framework: svcFramework.trim(),
        description: svcDesc.trim(),
        owns_data: svcData
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        position: pos,
        color: SERVICE_COLORS[svcType],
      });
    }

    await persistMap({ ...activeMap, services });
    setShowServiceModal(false);
  };

  const handleDeleteService = async (svcId: string) => {
    if (!activeMap) return;
    const services = activeMap.services.filter((s) => s.id !== svcId);
    const connections = activeMap.connections.filter(
      (c) => c.from_service !== svcId && c.to_service !== svcId,
    );
    await persistMap({ ...activeMap, services, connections });
    setSelectedServiceId(null);
  };

  // ── Connection CRUD ──
  const openAddConnection = () => {
    if (!activeMap || activeMap.services.length < 2) return;
    setEditingConnection(null);
    setConnFrom(activeMap.services[0].id);
    setConnTo(activeMap.services[1].id);
    setConnType("rest");
    setConnSync(true);
    setConnLabel("");
    setConnDesc("");
    setShowConnectionModal(true);
  };

  const openEditConnection = (conn: MapConnection) => {
    setEditingConnection(conn);
    setConnFrom(conn.from_service);
    setConnTo(conn.to_service);
    setConnType(conn.connection_type);
    setConnSync(conn.sync);
    setConnLabel(conn.label);
    setConnDesc(conn.description);
    setShowConnectionModal(true);
  };

  const handleSaveConnection = async () => {
    if (!activeMap) return;
    if (connFrom === connTo) return;

    const connections = [...activeMap.connections];
    if (editingConnection) {
      const idx = connections.findIndex((c) => c.id === editingConnection.id);
      if (idx >= 0) {
        connections[idx] = {
          ...connections[idx],
          from_service: connFrom,
          to_service: connTo,
          connection_type: connType,
          sync: connSync,
          label: connLabel.trim(),
          description: connDesc.trim(),
        };
      }
    } else {
      connections.push({
        id: crypto.randomUUID(),
        from_service: connFrom,
        to_service: connTo,
        connection_type: connType,
        sync: connSync,
        label: connLabel.trim(),
        description: connDesc.trim(),
      });
    }

    await persistMap({ ...activeMap, connections });
    setShowConnectionModal(false);
  };

  const handleDeleteConnection = async (connId: string) => {
    if (!activeMap) return;
    const connections = activeMap.connections.filter((c) => c.id !== connId);
    await persistMap({ ...activeMap, connections });
  };

  // ── Drag to reposition services ──
  const handleSvgMouseDown = (e: React.MouseEvent, svcId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg || !activeMap) return;
    const svc = activeMap.services.find((s) => s.id === svcId);
    if (!svc) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    setDragServiceId(svcId);
    setDragOffset({ x: svgPt.x - svc.position[0], y: svgPt.y - svc.position[1] });
  };

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragServiceId || !svgRef.current || !activeMap) return;
      const pt = svgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
      const newX = svgPt.x - dragOffset.x;
      const newY = svgPt.y - dragOffset.y;

      setMaps((prev) =>
        prev.map((m) => {
          if (m.id !== activeMapId) return m;
          return {
            ...m,
            services: m.services.map((s) =>
              s.id === dragServiceId
                ? { ...s, position: [newX, newY] as [number, number] }
                : s,
            ),
          };
        }),
      );
    },
    [dragServiceId, dragOffset, activeMapId],
  );

  const handleSvgMouseUp = useCallback(() => {
    if (dragServiceId && activeMap) {
      persistMap(activeMap);
    }
    setDragServiceId(null);
    setIsPanning(false);
  }, [dragServiceId, activeMap, persistMap]);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start pan if clicking on the canvas background (not a node)
      if (e.button !== 0) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };
    },
    [viewBox],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragServiceId) {
        handleSvgMouseMove(e);
        return;
      }
      if (!isPanning || !svgRef.current) return;
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      // Scale mouse delta to SVG coordinate space
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      const dx = (e.clientX - panStart.current.x) * scaleX;
      const dy = (e.clientY - panStart.current.y) * scaleY;
      setViewBox((v) => ({ ...v, x: panStart.current.vx - dx, y: panStart.current.vy - dy }));
    },
    [isPanning, dragServiceId, viewBox.w, viewBox.h, handleSvgMouseMove],
  );

  // ── Fit to View ──
  const fitToView = useCallback((servicesForFit?: MapService[]) => {
    const svcs = servicesForFit ?? activeMap?.services ?? [];
    if (svcs.length === 0) return;

    const target = calculateFitViewBox(svcs, viewBox);
    if (!target) return;

    // Cancel any running animation
    if (fitAnimRef.current !== null) {
      cancelAnimationFrame(fitAnimRef.current);
      fitAnimRef.current = null;
    }

    // Capture the current viewBox at animation start
    const startVB = { ...viewBox };
    const duration = 300; // ms
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // Ease-out quad
      const ease = 1 - (1 - t) * (1 - t);

      setViewBox({
        x: startVB.x + (target.x - startVB.x) * ease,
        y: startVB.y + (target.y - startVB.y) * ease,
        w: startVB.w + (target.w - startVB.w) * ease,
        h: startVB.h + (target.h - startVB.h) * ease,
      });

      if (t < 1) {
        fitAnimRef.current = requestAnimationFrame(animate);
      } else {
        fitAnimRef.current = null;
      }
    };

    fitAnimRef.current = requestAnimationFrame(animate);
  }, [activeMap, viewBox]);

  // ── Auto Layout ──
  const handleAutoLayout = useCallback(() => {
    if (!activeMap || activeMap.services.length < 2) return;
    const positions = autoLayout(activeMap.services, activeMap.connections);
    const updatedServices = activeMap.services.map((s) => ({
      ...s,
      position: positions[s.id] ?? s.position ?? [400, 300],
    }));
    const updated: SystemMap = {
      ...activeMap,
      services: updatedServices,
    };
    setMaps((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    fitToView(updatedServices);
    persistMap(updated);
  }, [activeMap, persistMap, fitToView]);

  // ── Discovery (Explore) ──
  const handleExplore = async () => {
    if (!activeMapId || exploreRepoIds.length === 0) return;
    setExploring(true);
    setDiscoveryStatus(null);
    setDiscoveryCommand(null);
    try {
      await tauri.startDiscoveryPty(activeMapId, exploreRepoIds, 120, 30);
      // Fetch the command for the "Show Command" button (prompt files written above)
      tauri.startMapDiscovery(activeMapId, exploreRepoIds).then(setDiscoveryCommand).catch(() => {});
      setShowExploreModal(false);
      startDiscoveryPolling();
    } catch (e) {
      setError(String(e));
      setExploring(false);
    }
  };

  const startDiscoveryPolling = () => {
    if (!activeMapId) return;
    const repoIds = exploreRepoIds;
    let attempts = 0;
    const maxAttempts = 120; // ~10 minutes at 5s intervals

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setExploring(false);
        setError("Discovery timed out. Try again or check your repos.");
        return;
      }
      attempts++;
      try {
        const status = await tauri.pollMapDiscovery(activeMapId!, repoIds);
        setDiscoveryStatus(status);
        if (status.complete) {
          setExploring(false);
          // Reload the map to show discovered services
          const updated = await tauri.getSystemMap(activeMapId!);
          setMaps((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        } else {
          pollRef.current = setTimeout(poll, 5000);
        }
      } catch (e) {
        // Discovery files may not exist yet; keep polling
        pollRef.current = setTimeout(poll, 5000);
      }
    };

    pollRef.current = setTimeout(poll, 3000); // Initial delay before first poll
  };

  const toggleExploreRepo = (repoId: string) => {
    setExploreRepoIds((prev) =>
      prev.includes(repoId)
        ? prev.filter((id) => id !== repoId)
        : [...prev, repoId],
    );
  };

  // ── Render helpers ──

  const renderConnectionPath = (conn: MapConnection) => {
    if (!activeMap) return null;
    const from = activeMap.services.find((s) => s.id === conn.from_service);
    const to = activeMap.services.find((s) => s.id === conn.to_service);
    if (!from || !to) return null;

    const [x1, y1] = from.position;
    const [x2, y2] = to.position;

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const style = CONNECTION_STYLES[conn.connection_type];

    return (
      <g key={conn.id} className="map-connection-group">
        {/* Wider invisible hit area */}
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="transparent"
          strokeWidth={16}
          style={{ cursor: "pointer" }}
          onClick={() => openEditConnection(conn)}
        />
        {/* Dotted map-trail path */}
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={style.color}
          strokeWidth={2}
          strokeDasharray={style.dash}
          strokeLinecap="round"
          opacity={0.6}
          className="map-trail"
        />
        {/* Small dot at midpoint */}
        <circle cx={midX} cy={midY} r={3} fill={style.color} opacity={0.7} />
        {/* Label */}
        {conn.label && (
          <text
            x={midX}
            y={midY - 10}
            textAnchor="middle"
            className="map-connection-label"
            fill={style.color}
          >
            {conn.label}
          </text>
        )}
        {/* Async indicator */}
        {!conn.sync && (
          <text
            x={midX + 8}
            y={midY + 5}
            className="map-async-badge"
            fill={style.color}
          >
            async
          </text>
        )}
      </g>
    );
  };

  const renderServiceNode = (svc: MapService) => {
    const [x, y] = svc.position;
    const isSelected = selectedServiceId === svc.id;
    const shape = SERVICE_SHAPE[svc.service_type];
    const abbr = SERVICE_ABBR[svc.service_type];
    const size = 32;

    return (
      <g
        key={svc.id}
        className={`map-service-node ${isSelected ? "selected" : ""}`}
        onMouseDown={(e) => handleSvgMouseDown(e, svc.id)}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedServiceId(isSelected ? null : svc.id);
        }}
        style={{ cursor: dragServiceId === svc.id ? "grabbing" : "grab" }}
        filter="url(#sketch)"
      >
        {/* Selection ring — dashed circle */}
        {isSelected && (
          shape === "circle" ? (
            <circle
              cx={x} cy={y} r={size + 8}
              fill="none"
              stroke={svc.color}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.6}
            />
          ) : (
            <rect
              x={x - size - 8} y={y - size - 8}
              width={(size + 8) * 2} height={(size + 8) * 2}
              rx={6}
              fill="none"
              stroke={svc.color}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.6}
            />
          )
        )}

        {/* Shape */}
        {shape === "circle" ? (
          <circle
            cx={x} cy={y} r={size}
            fill="var(--bg)"
            stroke={svc.color}
            strokeWidth={2}
            className="map-node-border"
          />
        ) : (
          <rect
            x={x - size} y={y - size}
            width={size * 2} height={size * 2}
            rx={6}
            fill="var(--bg)"
            stroke={svc.color}
            strokeWidth={2}
            className="map-node-border"
          />
        )}

        {/* Abbreviation inside shape */}
        <text
          x={x} y={y}
          textAnchor="middle"
          dominantBaseline="central"
          className="map-node-abbr"
          fill={svc.color}
        >
          {abbr}
        </text>

        {/* Service name below */}
        <text
          x={x}
          y={y + size + 18}
          textAnchor="middle"
          className="map-node-name"
          fill="var(--text)"
        >
          {svc.name}
        </text>
      </g>
    );
  };

  // ── Loading / Error ──
  if (loading) {
    return (
      <div className="empty-state">
        <p>Loading system maps...</p>
      </div>
    );
  }

  // ── No maps yet ──
  if (maps.length === 0 && !showNewMapModal) {
    return (
      <div>
        <div className="page-header">
          <h2>System Map</h2>
          <p>Visualize how your services connect and interact.</p>
        </div>
        <div className="empty-state">
          <h3>No maps yet</h3>
          <p>
            Every good boss knows the lay of the land. Create a map to chart
            your services and how they connect.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => setShowNewMapModal(true)}>
            New Map
          </button>
        </div>

        {showNewMapModal && renderNewMapModal()}
      </div>
    );
  }

  // ── Modal renderers ──
  function renderNewMapModal() {
    return (
      <div className="modal-overlay" onClick={() => setShowNewMapModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">New Map</div>
          <div className="form-group">
            <label className="form-label">Map Name</label>
            <input
              className="form-input"
              value={newMapName}
              onChange={(e) => setNewMapName(e.target.value)}
              placeholder="e.g. Platform Overview"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={newMapDesc}
              onChange={(e) => setNewMapDesc(e.target.value)}
              placeholder="What does this map cover?"
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowNewMapModal(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreateMap}>
              Create Map
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderServiceModal() {
    return (
      <div className="modal-overlay" onClick={() => setShowServiceModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">
            {editingService ? "Edit Service" : "Add Service"}
          </div>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={svcName}
              onChange={(e) => setSvcName(e.target.value)}
              placeholder="e.g. Auth Service"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              className="form-select"
              value={svcType}
              onChange={(e) => setSvcType(e.target.value as ServiceType)}
            >
              <option value="backend">Backend</option>
              <option value="frontend">Frontend</option>
              <option value="worker">Worker</option>
              <option value="gateway">Gateway</option>
              <option value="database">Database</option>
              <option value="queue">Queue</option>
              <option value="cache">Cache</option>
              <option value="external">External</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Runtime</label>
            <input
              className="form-input"
              value={svcRuntime}
              onChange={(e) => setSvcRuntime(e.target.value)}
              placeholder="e.g. Node.js, Python, Rust"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Framework</label>
            <input
              className="form-input"
              value={svcFramework}
              onChange={(e) => setSvcFramework(e.target.value)}
              placeholder="e.g. Express, FastAPI, Actix"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={svcDesc}
              onChange={(e) => setSvcDesc(e.target.value)}
              placeholder="What does this service do?"
              rows={2}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Owns Data (comma-separated)</label>
            <input
              className="form-input"
              value={svcData}
              onChange={(e) => setSvcData(e.target.value)}
              placeholder="e.g. users, sessions, oauth_tokens"
            />
            <div className="form-help">Tables, collections, or data domains this service owns.</div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowServiceModal(false)}>
              Cancel
            </button>
            {editingService && (
              <button
                className="btn btn-danger"
                onClick={() => {
                  handleDeleteService(editingService.id);
                  setShowServiceModal(false);
                }}
              >
                Remove
              </button>
            )}
            <button className="btn btn-primary" onClick={handleSaveService} disabled={!svcName.trim()}>
              {editingService ? "Update" : "Add"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderConnectionModal() {
    if (!activeMap) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowConnectionModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">
            {editingConnection ? "Edit Connection" : "Add Connection"}
          </div>
          <div className="form-group">
            <label className="form-label">From</label>
            <select
              className="form-select"
              value={connFrom}
              onChange={(e) => setConnFrom(e.target.value)}
            >
              {activeMap.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">To</label>
            <select
              className="form-select"
              value={connTo}
              onChange={(e) => setConnTo(e.target.value)}
            >
              {activeMap.services
                .filter((s) => s.id !== connFrom)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Connection Type</label>
            <select
              className="form-select"
              value={connType}
              onChange={(e) => setConnType(e.target.value as ConnectionType)}
            >
              {Object.entries(CONNECTION_STYLES).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label} ({key})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">
              <input
                type="checkbox"
                checked={connSync}
                onChange={(e) => setConnSync(e.target.checked)}
                style={{ marginRight: 8, accentColor: "var(--accent)" }}
              />
              Synchronous
            </label>
            <div className="form-help">
              Uncheck for async connections (message queues, events).
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Label</label>
            <input
              className="form-input"
              value={connLabel}
              onChange={(e) => setConnLabel(e.target.value)}
              placeholder="e.g. /api/auth, user.created"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={connDesc}
              onChange={(e) => setConnDesc(e.target.value)}
              placeholder="What flows through this connection?"
              rows={2}
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowConnectionModal(false)}>
              Cancel
            </button>
            {editingConnection && (
              <button
                className="btn btn-danger"
                onClick={() => {
                  handleDeleteConnection(editingConnection.id);
                  setShowConnectionModal(false);
                }}
              >
                Remove
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleSaveConnection}
              disabled={connFrom === connTo}
            >
              {editingConnection ? "Update" : "Add"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail panel for selected service ──
  function renderServiceDetail() {
    if (!activeMap || !selectedServiceId) return null;
    const svc = activeMap.services.find((s) => s.id === selectedServiceId);
    if (!svc) return null;

    const incoming = activeMap.connections.filter(
      (c) => c.to_service === svc.id,
    );
    const outgoing = activeMap.connections.filter(
      (c) => c.from_service === svc.id,
    );

    return (
      <div className="map-detail-panel panel">
        <div className="panel-header">
          <div className="map-detail-title">
            <svg width={24} height={24} className="map-detail-icon">
              {SERVICE_SHAPE[svc.service_type] === "circle" ? (
                <circle cx={12} cy={12} r={10} fill="none" stroke={svc.color} strokeWidth={2} />
              ) : (
                <rect x={2} y={2} width={20} height={20} rx={4} fill="none" stroke={svc.color} strokeWidth={2} />
              )}
            </svg>
            <span className="panel-title">{svc.name}</span>
          </div>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => openEditService(svc)}
          >
            Edit
          </button>
        </div>

        <div className="map-detail-body">
          <div className="map-detail-info">
            <div className="map-detail-meta">
              {SERVICE_LABELS[svc.service_type]}
              {svc.runtime && ` \u00B7 ${svc.runtime}`}
              {svc.framework && ` \u00B7 ${svc.framework}`}
            </div>
            {svc.description && (
              <p className="map-detail-desc">{svc.description}</p>
            )}
          </div>

          {svc.owns_data.length > 0 && (
            <div className="map-detail-section">
              <div className="map-detail-section-label">Owned Data</div>
              <div className="map-detail-tags">
                {svc.owns_data.map((d) => (
                  <span key={d} className="map-detail-tag">{d}</span>
                ))}
              </div>
            </div>
          )}

          {incoming.length > 0 && (
            <div className="map-detail-section">
              <div className="map-detail-section-label">Incoming Routes</div>
              {incoming.map((c) => {
                const fromSvc = activeMap.services.find((s) => s.id === c.from_service);
                return (
                  <div
                    key={c.id}
                    className="map-detail-route"
                    onClick={() => openEditConnection(c)}
                  >
                    {fromSvc?.name ?? "?"} \u2192 {c.connection_type}
                    {c.label && ` (${c.label})`}
                    {!c.sync && " [async]"}
                  </div>
                );
              })}
            </div>
          )}

          {outgoing.length > 0 && (
            <div className="map-detail-section">
              <div className="map-detail-section-label">Outgoing Routes</div>
              {outgoing.map((c) => {
                const toSvc = activeMap.services.find((s) => s.id === c.to_service);
                return (
                  <div
                    key={c.id}
                    className="map-detail-route"
                    onClick={() => openEditConnection(c)}
                  >
                    \u2192 {toSvc?.name ?? "?"} ({c.connection_type})
                    {c.label && ` ${c.label}`}
                    {!c.sync && " [async]"}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Legend ──
  function renderLegendBar() {
    return (
      <div className="map-legend-bar">
        {(Object.keys(SERVICE_LABELS) as ServiceType[]).map((type) => (
          <div key={type} className="map-legend-item">
            <svg width={16} height={16} style={{ flexShrink: 0 }}>
              {SERVICE_SHAPE[type] === "circle" ? (
                <circle cx={8} cy={8} r={6} fill="none" stroke={SERVICE_COLORS[type]} strokeWidth={1.5} />
              ) : (
                <rect x={2} y={2} width={12} height={12} rx={2} fill="none" stroke={SERVICE_COLORS[type]} strokeWidth={1.5} />
              )}
            </svg>
            <span>{SERVICE_LABELS[type]}</span>
          </div>
        ))}
        <span className="map-legend-sep" />
        {Object.entries(CONNECTION_STYLES).map(([type, style]) => (
          <div key={type} className="map-legend-item">
            <svg width={20} height={8} style={{ flexShrink: 0 }}>
              <line x1={0} y1={4} x2={20} y2={4} stroke={style.color} strokeWidth={2} strokeDasharray={style.dash} strokeLinecap="round" />
            </svg>
            <span>{style.label}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderExploreModal() {
    return (
      <div className="modal-overlay" onClick={() => setShowExploreModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">Explore Repositories</div>
          <p className="modal-desc">
            Scan your repositories to discover services, connections, and data
            ownership. Select which repos to explore.
          </p>
          {repos.length === 0 ? (
            <div className="explore-empty">
              No repositories registered. Add repositories first.
            </div>
          ) : (
            <div className="explore-repo-list">
              {repos.map((repo) => (
                <label key={repo.id} className="explore-repo-item">
                  <input
                    type="checkbox"
                    checked={exploreRepoIds.includes(repo.id)}
                    onChange={() => toggleExploreRepo(repo.id)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>{repo.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {repo.path}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowExploreModal(false)}>
              Cancel
            </button>
            <button
              className="btn btn-brass"
              onClick={handleExplore}
              disabled={exploreRepoIds.length === 0}
            >
              Start Discovery
            </button>
          </div>
        </div>
      </div>
    );
  }


  function renderDiscoveryProgress() {
    return (
      <div className="discovery-progress">
        <div className="discovery-progress-header">
          {discoveryStatus ? (
            <div className="discovery-status">
              <div className="discovery-status-header">
                {!discoveryStatus.complete && <span className="discovery-spinner" />}
                <span className="discovery-status-title">
                  {discoveryStatus.complete
                    ? "Discovery complete!"
                    : `${discoveryStatus.found} of ${discoveryStatus.total} repos scanned...`}
                </span>
              </div>
              <div className="discovery-status-counts">
                {discoveryStatus.services_discovered} service{discoveryStatus.services_discovered !== 1 ? "s" : ""} discovered
                {" \u00B7 "}
                {discoveryStatus.connections_discovered} route{discoveryStatus.connections_discovered !== 1 ? "s" : ""} mapped
              </div>
              {discoveryStatus.errors.length > 0 && (
                <div className="discovery-errors">
                  {discoveryStatus.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="discovery-preparing">
              <span className="discovery-spinner" />
              Scouting the turf — this usually takes a minute or two.
            </div>
          )}
          <CommandDisplayButton {...discoveryCmdDisplay} />
        </div>
        <CommandDisplayContent {...discoveryCmdDisplay} />
      </div>
    );
  }

  // ── Main render ──
  // ── Map list view (no map selected) ──
  if (!activeMap) {
    return (
      <div className="system-map-page">
        <div className="page-header map-page-header">
          <div>
            <h2>System Map</h2>
            <p>Chart the big picture — how your services and repos fit together.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNewMapModal(true)}>
            New Map
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {maps.length === 0 ? (
          <div className="empty-state">
            <h3>No maps yet</h3>
            <p>Create a system map to start charting your turf.</p>
            <button className="btn btn-brass" onClick={() => setShowNewMapModal(true)}>
              New Map
            </button>
          </div>
        ) : (
          <div className="map-list">
            {maps.map((m) => (
              <button
                key={m.id}
                className="map-list-item"
                onClick={() => setActiveMapId(m.id)}
              >
                <div className="map-list-item-name">{m.name}</div>
                <div className="map-list-item-meta">
                  {m.services.length} service{m.services.length !== 1 ? "s" : ""}
                  {" \u00B7 "}
                  {m.connections.length} connection{m.connections.length !== 1 ? "s" : ""}
                </div>
                {m.description && (
                  <div className="map-list-item-desc">{m.description}</div>
                )}
              </button>
            ))}
          </div>
        )}

        {showNewMapModal && renderNewMapModal()}
      </div>
    );
  }

  // ── Active map view ──
  return (
    <div className="system-map-page">
      <div className="page-header map-page-header">
        <div className="page-header-with-back">
          <button className="back-btn" onClick={() => setActiveMapId(null)} title="Back to maps">
            &larr;
          </button>
          <div>
            <h2>{activeMap.name}</h2>
            {activeMap.description && <p>{activeMap.description}</p>}
          </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Toolbar */}
      <div className="map-toolbar">
        <div className="map-toolbar-group">
          <button className="btn btn-brass btn-sm" onClick={openAddService}>
            Add Service
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={openAddConnection}
            disabled={activeMap.services.length < 2}
          >
            Add Connection
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleAutoLayout}
            disabled={!activeMap || activeMap.services.length < 2}
          >
            Auto Layout
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fitToView()}
            disabled={!activeMap || activeMap.services.length === 0}
          >
            Fit View
          </button>
          <button
            className="btn btn-brass btn-sm"
            onClick={() => setShowExploreModal(true)}
            disabled={exploring || repos.length === 0}
          >
            {exploring ? "Exploring..." : "Explore"}
          </button>
        </div>
        <span className="map-toolbar-stats">
          {activeMap.services.length} service{activeMap.services.length !== 1 ? "s" : ""}
          {" \u00B7 "}
          {activeMap.connections.length} connection{activeMap.connections.length !== 1 ? "s" : ""}
        </span>
        <div className="map-toolbar-group">
          {confirmDeleteMap ? (
            <div className="map-delete-confirm">
              <span className="map-delete-prompt">Delete this map?</span>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteMap}>
                Yes
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDeleteMap(false)}>
                No
              </button>
            </div>
          ) : (
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDeleteMap(true)}>
              Delete Map
            </button>
          )}
        </div>
      </div>

      {/* Discovery progress */}
      {exploring && renderDiscoveryProgress()}

      {/* Map Canvas */}
      <div className="map-canvas-container">
        <div className="map-canvas-wrapper">
          {activeMap.services.length === 0 ? (
            <div className="empty-state map-empty-canvas">
              <h3>No services yet</h3>
              <p>Add a service or explore your repos to see what&apos;s out there.</p>
              <div className="map-empty-actions">
                <button className="btn btn-brass" onClick={openAddService}>
                  Add Service
                </button>
                {repos.length > 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowExploreModal(true)}
                    disabled={exploring}
                  >
                    Explore
                  </button>
                )}
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="map-svg"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              preserveAspectRatio="xMidYMid meet"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleSvgMouseUp}
              onMouseLeave={handleSvgMouseUp}
              onClick={() => { if (!isPanning) setSelectedServiceId(null); }}
              style={{ cursor: isPanning ? "grabbing" : dragServiceId ? "grabbing" : "default" }}
            >
              <defs>
                <pattern id="dot-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="20" cy="20" r="1" fill="var(--border)" opacity="0.4" />
                </pattern>
                <filter id="sketch" x="-5%" y="-5%" width="110%" height="110%">
                  <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="2" result="noise" seed="1" />
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" />
                </filter>
              </defs>

              <rect x={viewBox.x - 2000} y={viewBox.y - 2000} width={viewBox.w + 4000} height={viewBox.h + 4000} fill="var(--bg)" />
              <rect x={viewBox.x - 2000} y={viewBox.y - 2000} width={viewBox.w + 4000} height={viewBox.h + 4000} fill="url(#dot-grid)" />

              {activeMap.connections.map(renderConnectionPath)}
              {activeMap.services.map(renderServiceNode)}
            </svg>
          )}

          {/* Detail panel overlaid on map */}
          {selectedServiceId && renderServiceDetail()}
        </div>

        {/* Legend bar at bottom of canvas area */}
        {activeMap.services.length > 0 && renderLegendBar()}
      </div>

      {/* Modals */}
      {showNewMapModal && renderNewMapModal()}
      {showServiceModal && renderServiceModal()}
      {showConnectionModal && renderConnectionModal()}
      {showExploreModal && renderExploreModal()}
    </div>
  );
}
