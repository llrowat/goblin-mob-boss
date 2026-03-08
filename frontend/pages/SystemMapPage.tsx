import { useState, useEffect, useRef, useCallback } from "react";
import { useTauri } from "../hooks/useTauri";
import { Terminal } from "../components/Terminal";
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
  const [discoverySessionId, setDiscoverySessionId] = useState<string | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dragging
  const [dragServiceId, setDragServiceId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

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

  // ── Cleanup discovery polling on unmount ──
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // ── Load ──
  useEffect(() => {
    Promise.all([tauri.listSystemMaps(), tauri.listRepositories()])
      .then(([mapList, repoList]) => {
        setMaps(mapList);
        if (mapList.length > 0) setActiveMapId(mapList[0].id);
        setRepos(repoList);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Persist helper ──
  const persistMap = useCallback(
    async (updated: SystemMap) => {
      try {
        const saved = await tauri.updateSystemMap(updated);
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
      setActiveMapId(maps.length > 1 ? maps.find((m) => m.id !== activeMapId)!.id : null);
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
  }, [dragServiceId, activeMap, persistMap]);

  // ── Discovery (Explore) ──
  const handleExplore = async () => {
    if (!activeMapId || exploreRepoIds.length === 0) return;
    setExploring(true);
    setDiscoveryStatus(null);
    setDiscoverySessionId(null);
    try {
      const sessionId = await tauri.startDiscoveryPty(activeMapId, exploreRepoIds, 120, 30);
      setDiscoverySessionId(sessionId);
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
          setExploreCommand("");
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
          filter="url(#sketch)"
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width={24} height={24} style={{ flexShrink: 0 }}>
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

        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
          {SERVICE_LABELS[svc.service_type]}
          {svc.runtime && ` \u00B7 ${svc.runtime}`}
          {svc.framework && ` \u00B7 ${svc.framework}`}
        </div>

        {svc.description && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            {svc.description}
          </p>
        )}

        {svc.owns_data.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
              Owned Data
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {svc.owns_data.map((d) => (
                <span
                  key={d}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: "rgba(184, 148, 74, 0.12)",
                    color: "var(--accent-brass)",
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {incoming.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
              Incoming Routes
            </div>
            {incoming.map((c) => {
              const fromSvc = activeMap.services.find((s) => s.id === c.from_service);
              return (
                <div
                  key={c.id}
                  style={{ fontSize: 12, color: "var(--text-secondary)", padding: "2px 0", cursor: "pointer" }}
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
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
              Outgoing Routes
            </div>
            {outgoing.map((c) => {
              const toSvc = activeMap.services.find((s) => s.id === c.to_service);
              return (
                <div
                  key={c.id}
                  style={{ fontSize: 12, color: "var(--text-secondary)", padding: "2px 0", cursor: "pointer" }}
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
    );
  }

  // ── Legend ──
  function renderLegend() {
    return (
      <div className="map-legend">
        <div className="map-legend-title">Legend</div>
        <div className="map-legend-section">
          {(Object.keys(SERVICE_LABELS) as ServiceType[]).map((type) => (
            <div key={type} className="map-legend-item">
              <svg width={24} height={18} style={{ flexShrink: 0 }}>
                {SERVICE_SHAPE[type] === "circle" ? (
                  <circle cx={12} cy={9} r={7} fill="none" stroke={SERVICE_COLORS[type]} strokeWidth={1.5} />
                ) : (
                  <rect x={5} y={2} width={14} height={14} rx={3} fill="none" stroke={SERVICE_COLORS[type]} strokeWidth={1.5} />
                )}
              </svg>
              <span>{SERVICE_LABELS[type]}</span>
            </div>
          ))}
        </div>
        <div className="map-legend-divider" />
        <div className="map-legend-section">
          {Object.entries(CONNECTION_STYLES).map(([type, style]) => (
            <div key={type} className="map-legend-item">
              <svg width={24} height={10} style={{ flexShrink: 0 }}>
                <line
                  x1={0}
                  y1={5}
                  x2={24}
                  y2={5}
                  stroke={style.color}
                  strokeWidth={2}
                  strokeDasharray={style.dash}
                  strokeLinecap="round"
                />
              </svg>
              <span>{style.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderExploreModal() {
    return (
      <div className="modal-overlay" onClick={() => setShowExploreModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">Explore Repositories</div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
            Scan your repositories to discover services, connections, and data
            ownership. Select which repos to explore.
          </p>
          {repos.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>
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

  const handleDiscoveryExit = async () => {
    setExploring(false);
    setDiscoverySessionId(null);
    // Reload the map to show any discovered services
    if (activeMapId) {
      try {
        const updated = await tauri.getSystemMap(activeMapId);
        setMaps((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      } catch {
        // Map may not exist if it was deleted
      }
    }
  };

  function renderDiscoveryProgress() {
    return (
      <div className="discovery-progress">
        {discoverySessionId && (
          <div style={{ height: 300, marginBottom: 12 }}>
            <Terminal sessionId={discoverySessionId} onExit={handleDiscoveryExit} />
          </div>
        )}
        {discoveryStatus && (
          <div className="discovery-status">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {!discoveryStatus.complete && <span className="discovery-spinner" />}
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {discoveryStatus.complete
                  ? "Discovery complete!"
                  : `${discoveryStatus.found} of ${discoveryStatus.total} repos scanned...`}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {discoveryStatus.services_discovered} service{discoveryStatus.services_discovered !== 1 ? "s" : ""} discovered
              {" \u00B7 "}
              {discoveryStatus.connections_discovered} route{discoveryStatus.connections_discovered !== 1 ? "s" : ""} mapped
            </div>
            {discoveryStatus.errors.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>
                {discoveryStatus.errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {!discoverySessionId && !discoveryStatus && exploring && (
          <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="discovery-spinner" />
            Preparing discovery...
          </div>
        )}
      </div>
    );
  }

  // ── Main render ──
  return (
    <div className="system-map-page">
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2>System Map</h2>
          <p>Visualize how your services connect and interact.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {maps.length > 1 && (
            <select
              className="form-select"
              style={{ width: "auto" }}
              value={activeMapId ?? ""}
              onChange={(e) => setActiveMapId(e.target.value)}
            >
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-primary" onClick={() => setShowNewMapModal(true)}>
            New Map
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {activeMap && (
        <>
          {/* Toolbar */}
          <div className="map-toolbar">
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
              className="btn btn-brass btn-sm"
              onClick={() => setShowExploreModal(true)}
              disabled={exploring || repos.length === 0}
            >
              {exploring ? "Exploring..." : "Explore"}
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {activeMap.services.length} service{activeMap.services.length !== 1 ? "s" : ""}
              {" \u00B7 "}
              {activeMap.connections.length} connection{activeMap.connections.length !== 1 ? "s" : ""}
            </span>
            <div style={{ flex: 1 }} />
            {confirmDeleteMap ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--danger)" }}>Delete this map?</span>
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

          {/* Discovery progress */}
          {exploring && renderDiscoveryProgress()}

          {/* Map Canvas */}
          <div className="map-canvas-container">
            <div className="map-canvas-wrapper">
              {activeMap.services.length === 0 ? (
                <div className="empty-state" style={{ padding: "80px 24px" }}>
                  <h3>No services yet</h3>
                  <p>Add a service or explore your repos to see what&apos;s out there.</p>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
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
                  viewBox="0 0 1200 800"
                  preserveAspectRatio="xMidYMid meet"
                  onMouseMove={handleSvgMouseMove}
                  onMouseUp={handleSvgMouseUp}
                  onMouseLeave={handleSvgMouseUp}
                  onClick={() => setSelectedServiceId(null)}
                >
                  <defs>
                    {/* Subtle sketch filter for hand-drawn feel */}
                    <filter id="sketch">
                      <feTurbulence
                        type="turbulence"
                        baseFrequency="0.03"
                        numOctaves={2}
                        seed={7}
                        result="warp"
                      />
                      <feDisplacementMap
                        in="SourceGraphic"
                        in2="warp"
                        scale={1.5}
                        xChannelSelector="R"
                        yChannelSelector="G"
                      />
                    </filter>
                    {/* Dot pattern for grid background */}
                    <pattern id="dot-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                      <circle cx="20" cy="20" r="1" fill="var(--border)" opacity="0.4" />
                    </pattern>
                  </defs>

                  {/* Clean background */}
                  <rect width="1200" height="800" fill="var(--bg)" />

                  {/* Dot grid */}
                  <rect width="1200" height="800" fill="url(#dot-grid)" />

                  {/* Map title */}
                  <text
                    x={32}
                    y={36}
                    className="map-title-text"
                    fill="var(--muted)"
                  >
                    {activeMap.name}
                  </text>

                  {/* Connections (drawn first, under nodes) */}
                  {activeMap.connections.map(renderConnectionPath)}

                  {/* Service nodes */}
                  {activeMap.services.map(renderServiceNode)}
                </svg>
              )}
            </div>

            {/* Side panels */}
            <div className="map-side-panels">
              {renderServiceDetail()}
              {renderLegend()}
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {showNewMapModal && renderNewMapModal()}
      {showServiceModal && renderServiceModal()}
      {showConnectionModal && renderConnectionModal()}
      {showExploreModal && renderExploreModal()}
    </div>
  );
}
