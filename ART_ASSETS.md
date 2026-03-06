# Art Assets Guide

This document describes every custom art asset needed for Goblin Mob Boss, where each file goes, and how it gets wired into the app.

---

## Directory Structure

All art assets live under `frontend/assets/`. Create this structure:

```
frontend/assets/
├── icon/
│   ├── goblin-logo.png          # 512x512  — master app icon
│   ├── goblin-logo-mono.png     # 512x512  — monochrome ink-only variant
│   └── goblin-tray.png          # 32x32    — system tray (dark bg baked in)
├── map/
│   ├── parchment-bg.png         # 512x512  — seamless tileable background
│   ├── corners/
│   │   ├── corner-tl.png        # ~200x200 — top-left decoration
│   │   ├── corner-tr.png        # ~200x200 — top-right
│   │   ├── corner-bl.png        # ~200x200 — bottom-left
│   │   └── corner-br.png        # ~200x200 — bottom-right (compass rose)
│   └── nodes/
│       ├── node-backend.png     # 64x64    — forge/anvil
│       ├── node-frontend.png    # 64x64    — lookout tower
│       ├── node-database.png    # 64x64    — treasure chest
│       ├── node-queue.png       # 64x64    — minecart
│       ├── node-cache.png       # 64x64    — potion shelf
│       ├── node-gateway.png     # 64x64    — stone archway
│       ├── node-worker.png      # 64x64    — pickaxe & shovel
│       └── node-external.png    # 64x64    — distant mountain
├── empty/
│   ├── empty-agents.png         # ~200x200 — bored goblin on bucket
│   ├── empty-repos.png          # ~200x200 — cave with FOR RENT sign
│   ├── empty-features.png       # ~200x200 — blank scroll, spilled ink
│   ├── empty-validators.png     # ~200x200 — empty tripwire frame
│   └── empty-ideation.png       # ~200x200 — goblin thinking at desk
├── headers/
│   ├── header-home.png          # ~600x80  — desk with map and coins
│   ├── header-agents.png        # ~600x80  — goblin lineup silhouettes
│   ├── header-repos.png         # ~600x80  — cave entrances in cliff
│   └── header-settings.png      # ~600x80  — workbench with tools
├── status/
│   ├── status-planning.png      # 32x32    — scroll with quill
│   ├── status-running.png       # 32x32    — wooden gear spinning
│   ├── status-validating.png    # 32x32    — magnifying glass
│   ├── status-passed.png        # 32x32    — wax seal checkmark
│   ├── status-failed.png        # 32x32    — cracked potion bottle
│   └── status-merged.png        # 32x32    — converging rivers
├── toast/
│   ├── toast-success.png        # 24x24    — goblin thumbs up
│   ├── toast-warning.png        # 24x24    — lit bomb
│   └── toast-error.png          # 24x24    — crooked skull
├── spinner/
│   ├── goblin-run-1.png         # 64x64    — frame 1
│   ├── goblin-run-2.png         # 64x64    — frame 2
│   ├── goblin-run-3.png         # 64x64    — frame 3
│   ├── goblin-run-4.png         # 64x64    — frame 4
│   ├── goblin-run-5.png         # 64x64    — frame 5 (optional)
│   └── goblin-run-6.png         # 64x64    — frame 6 (optional)
└── detail-frame.png             # ~440x540 — wooden notice board frame
```

---

## Integration Guide

### 1. App Icon (`icon/`)

**Replaces**: current yin-yang icon in `backend/icons/`

**Steps**:
1. From `goblin-logo.png` (512x512), generate the required Tauri icon sizes:
   - `backend/icons/icon.png` — 512x512 (copy directly)
   - `backend/icons/32x32.png` — downscale
   - `backend/icons/128x128.png` — downscale
   - `backend/icons/128x128@2x.png` — 256x256
   - `backend/icons/icon.icns` — macOS bundle (use `iconutil` or an online converter)
   - `backend/icons/icon.ico` — Windows bundle (multi-size .ico)
2. For the system tray icon, copy `goblin-tray.png` to `backend/icons/tray.png`
3. Optionally add a favicon link in `index.html`:
   ```html
   <link rel="icon" type="image/png" href="/assets/icon/goblin-logo.png" />
   ```

**No code changes needed** — Tauri picks up icons from `backend/icons/` via `tauri.conf.json`.

---

### 2. System Map Background (`map/parchment-bg.png`)

**Replaces**: the current solid background on `.map-canvas-wrapper`

**CSS** (`frontend/styles.css`):
```css
.map-canvas-wrapper {
  background-image: url('../assets/map/parchment-bg.png');
  background-repeat: repeat;
  background-size: 512px 512px;
  /* keep existing border/shadow styles */
}
```

---

### 3. System Map Corner Decorations (`map/corners/`)

**Where**: `SystemMapPage.tsx` — render as absolutely-positioned `<img>` elements inside the map canvas wrapper.

**Implementation**:
```tsx
import cornerTL from '../../assets/map/corners/corner-tl.png';
import cornerTR from '../../assets/map/corners/corner-tr.png';
import cornerBL from '../../assets/map/corners/corner-bl.png';
import cornerBR from '../../assets/map/corners/corner-br.png';

// Inside the map canvas wrapper JSX, add:
<img src={cornerTL} className="map-corner map-corner-tl" alt="" />
<img src={cornerTR} className="map-corner map-corner-tr" alt="" />
<img src={cornerBL} className="map-corner map-corner-bl" alt="" />
<img src={cornerBR} className="map-corner map-corner-br" alt="" />
```

**CSS**:
```css
.map-corner {
  position: absolute;
  width: 160px;
  height: 160px;
  pointer-events: none;
  z-index: 10;
  opacity: 0.85;
}
.map-corner-tl { top: 0; left: 0; }
.map-corner-tr { top: 0; right: 0; transform: scaleX(-1); }
.map-corner-bl { bottom: 0; left: 0; }
.map-corner-br { bottom: 0; right: 0; }
```

---

### 4. System Map Node Icons (`map/nodes/`)

**Replaces**: the current Unicode emoji icons (⚒️, 👁️, ⚙️, etc.) in `SystemMapPage.tsx`

**Implementation**: In the node rendering section of `SystemMapPage.tsx`, replace the emoji `<text>` elements with `<image>` elements inside the SVG:

```tsx
// Map service type to asset path
const nodeIcons: Record<string, string> = {
  backend: nodeBackend,
  frontend: nodeFrontend,
  database: nodeDatabase,
  queue: nodeQueue,
  cache: nodeCache,
  gateway: nodeGateway,
  worker: nodeWorker,
  external: nodeExternal,
};

// In SVG, replace the emoji <text> with:
<image
  href={nodeIcons[service.serviceType]}
  x={service.x - 24}
  y={service.y - 24}
  width={48}
  height={48}
/>
```

---

### 5. Connection Lines

**Keep using SVG `stroke-dasharray`** — no image assets needed. Update the existing connection rendering in `SystemMapPage.tsx` to use hand-drawn-style dash patterns:

```css
/* Primary connections (REST, gRPC, GraphQL) */
.map-trail.primary {
  stroke-dasharray: 4 6;
  stroke-linecap: round;
  stroke-width: 2.5;
  opacity: 0.7;
}

/* Secondary connections (WebSocket, Event, IPC) */
.map-trail.secondary {
  stroke-dasharray: 8 5 2 5;
  stroke-linecap: round;
  stroke-width: 2;
  opacity: 0.55;
}

/* Weak/external connections (File System, Shared DB) */
.map-trail.weak {
  stroke-dasharray: 2 8;
  stroke-linecap: round;
  stroke-width: 1.5;
  opacity: 0.35;
}
```

---

### 6. Empty State Illustrations (`empty/`)

**Where**: `HomePage.tsx`, `AgentsPage.tsx`, `ReposPage.tsx`, and any page with an `.empty-state` block.

**Implementation** — add an `<img>` above the existing text in each empty state:

```tsx
// Example for AgentsPage
import emptyAgents from '../../assets/empty/empty-agents.png';

// In the empty state JSX:
<div className="empty-state">
  <img src={emptyAgents} className="empty-state-art" alt="" />
  <p>No goblins in the ranks yet...</p>
</div>
```

**CSS**:
```css
.empty-state-art {
  width: 160px;
  height: 160px;
  object-fit: contain;
  margin-bottom: 1rem;
  opacity: 0.8;
}
```

**Asset → Page mapping**:
| Asset | Page | Empty condition |
|---|---|---|
| `empty-agents.png` | `AgentsPage` | No agents loaded |
| `empty-repos.png` | `ReposPage` | No repositories added |
| `empty-features.png` | `HomePage` | No active features |
| `empty-validators.png` | `ReposPage` (validator section) | No validators configured |
| `empty-ideation.png` | `IdeationPage` | Before ideation starts |

---

### 7. Page Header Decorations (`headers/`)

**Where**: Top of each major page component, below the `<h2>` page title.

**Implementation**:
```tsx
import headerHome from '../../assets/headers/header-home.png';

// Below the page title:
<img src={headerHome} className="page-header-art" alt="" />
```

**CSS**:
```css
.page-header-art {
  width: 100%;
  max-width: 600px;
  height: 60px;
  object-fit: contain;
  opacity: 0.6;
  margin-bottom: 1rem;
}
```

**Asset → Page mapping**:
| Asset | Page |
|---|---|
| `header-home.png` | `HomePage` |
| `header-agents.png` | `AgentsPage` |
| `header-repos.png` | `ReposPage` |
| `header-settings.png` | `SettingsPage` |

---

### 8. Status Icons (`status/`)

**Replaces**: the colored dot in `StatusBadge.tsx`

**Implementation** — replace the `<span className="status-dot" />` with an `<img>`:

```tsx
const statusIcons: Record<string, string> = {
  planning: statusPlanning,
  running: statusRunning,
  executing: statusRunning,
  validating: statusValidating,
  verifying: statusValidating,
  completed: statusPassed,
  passed: statusPassed,
  failed: statusFailed,
  merged: statusMerged,
};

// In StatusBadge:
<span className={`status-badge ${displayStatus}`}>
  <img src={statusIcons[displayStatus]} className="status-icon" alt="" />
  {status}
</span>
```

**CSS**:
```css
.status-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
```

---

### 9. Toast / Notification Icons (`toast/`)

**Usage**: When displaying success/warning/error notifications, include the icon inline.

```tsx
const toastIcons = {
  success: toastSuccess,
  warning: toastWarning,
  error: toastError,
};

<div className={`toast toast-${type}`}>
  <img src={toastIcons[type]} className="toast-icon" alt="" />
  <span>{message}</span>
</div>
```

**CSS**:
```css
.toast-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}
```

---

### 10. Loading Spinner (`spinner/`)

**Implementation** — CSS animation cycling through sprite frames:

```tsx
import goblinRun1 from '../../assets/spinner/goblin-run-1.png';
// ... import all frames

const frames = [goblinRun1, goblinRun2, goblinRun3, goblinRun4];

function GoblinSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % frames.length), 150);
    return () => clearInterval(id);
  }, []);

  return <img src={frames[frame]} className="goblin-spinner" alt="Loading..." />;
}
```

**CSS**:
```css
.goblin-spinner {
  width: 48px;
  height: 48px;
  image-rendering: pixelated;
}
```

**Use in place of** any existing loading/spinner indicators throughout the app.

---

### 11. Detail Panel Frame (`detail-frame.png`)

**Where**: `SystemMapPage.tsx` — the `.map-detail-panel` that slides in when a node is selected.

**Implementation** — use as a `border-image`:

```css
.map-detail-panel {
  border: none;
  border-image-source: url('../assets/detail-frame.png');
  border-image-slice: 40 fill;
  border-image-width: 40px;
  background: transparent;
  padding: 48px 32px;
}
```

Alternatively, overlay the frame as a positioned image behind the panel content if `border-image` doesn't give enough control.

---

## Checklist

Use this to track which assets are ready:

- [ ] `icon/goblin-logo.png` — app icon (+ generate all sizes)
- [ ] `icon/goblin-logo-mono.png` — monochrome variant
- [ ] `icon/goblin-tray.png` — tray icon on dark bg
- [ ] `map/parchment-bg.png` — tileable background
- [ ] `map/corners/corner-tl.png` — top-left corner
- [ ] `map/corners/corner-tr.png` — top-right corner
- [ ] `map/corners/corner-bl.png` — bottom-left corner
- [ ] `map/corners/corner-br.png` — bottom-right (compass)
- [ ] `map/nodes/node-backend.png` — forge/anvil
- [ ] `map/nodes/node-frontend.png` — lookout tower
- [ ] `map/nodes/node-database.png` — treasure chest
- [ ] `map/nodes/node-queue.png` — minecart
- [ ] `map/nodes/node-cache.png` — potion shelf
- [ ] `map/nodes/node-gateway.png` — stone archway
- [ ] `map/nodes/node-worker.png` — pickaxe & shovel
- [ ] `map/nodes/node-external.png` — distant mountain
- [ ] `empty/empty-agents.png` — bored goblin
- [ ] `empty/empty-repos.png` — cave FOR RENT
- [ ] `empty/empty-features.png` — blank scroll
- [ ] `empty/empty-validators.png` — empty tripwire
- [ ] `empty/empty-ideation.png` — thinking goblin
- [ ] `headers/header-home.png` — desk scene
- [ ] `headers/header-agents.png` — goblin lineup
- [ ] `headers/header-repos.png` — cave entrances
- [ ] `headers/header-settings.png` — workbench
- [ ] `status/status-planning.png` — scroll + quill
- [ ] `status/status-running.png` — wooden gear
- [ ] `status/status-validating.png` — magnifying glass
- [ ] `status/status-passed.png` — wax seal
- [ ] `status/status-failed.png` — cracked bottle
- [ ] `status/status-merged.png` — converging rivers
- [ ] `toast/toast-success.png` — thumbs up
- [ ] `toast/toast-warning.png` — lit bomb
- [ ] `toast/toast-error.png` — skull
- [ ] `spinner/goblin-run-*.png` — 4-6 frames
- [ ] `detail-frame.png` — wooden notice board
