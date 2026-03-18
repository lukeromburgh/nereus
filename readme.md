# Nereus — Hydrofoil CFD Simulation Dashboard

Nereus is a browser-based computational fluid dynamics (CFD) platform for simulating and analysing hydrofoil performance. Users upload 3D hydrofoil geometry, configure flow conditions, and launch OpenFOAM simulations — all from a single-page dashboard that streams solver output in real time and provides an interactive 3D post-processing environment with temporal playback, overlay layers, and synchronised telemetry charts.

---

## Tech Stack

### Frontend

| Layer            | Technology                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Framework        | **React 19** (TypeScript)                                                                                                  |
| Build tool       | **Vite 8**                                                                                                                 |
| 3D engine        | **Three.js 0.183** via **React Three Fiber 9** + **Drei 10** (OrbitControls, Bounds, GizmoHelper, Stage, GLTF/STL loaders) |
| State management | **Zustand 5** (single `useSimStore` atom)                                                                                  |
| Charts           | **Recharts 3** (line charts for convergence & L/D sparkline)                                                               |
| HTTP             | **Axios**                                                                                                                  |
| Icons            | **Lucide React**                                                                                                           |
| Styling          | **Tailwind CSS 3** with PostCSS + Autoprefixer                                                                             |
| Linting          | ESLint 9 with React Hooks & React Refresh plugins                                                                          |

### Backend

| Layer         | Technology                                               |
| ------------- | -------------------------------------------------------- |
| API framework | **Django 5** + **Django REST Framework**                 |
| Task queue    | **Celery** with **Redis** broker                         |
| Database      | **SQLite** (dev) / **PostgreSQL 15** (Docker)            |
| CORS          | **django-cors-headers**                                  |
| Media serving | Django `MEDIA_URL` mapped to `/data/media` shared volume |

### Simulation Worker

| Layer               | Technology                                                              |
| ------------------- | ----------------------------------------------------------------------- |
| CFD solver          | **OpenFOAM 11** (blockMesh → snappyHexMesh → simpleFoam)                |
| Turbulence model    | k-ω SST (RAS)                                                           |
| Post-processing     | **PyVista** (OpenFOAM reader, slicing, contouring, streamlines)         |
| Geometry conversion | **Trimesh** (GLB/GLTF/OBJ → STL pre-flight conversion)                  |
| Template engine     | **Jinja2** (generates all OpenFOAM dictionary files from UI parameters) |

### Infrastructure

| Layer               | Technology                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| Orchestration       | **Docker Compose** (4 services: `db`, `redis`, `api`, `worker`)                     |
| Shared storage      | Docker named volume (`shared_data`) mounted at `/data` on API and worker            |
| Inter-service comms | Celery task dispatch (Redis); worker PATCHes status/results back to Django REST API |

---

## Data Model

Three core Django models:

- **Project** — top-level organiser (name, description).
- **HydrofoilAsset** — uploaded 3D geometry file (STL / OBJ / GLTF / GLB) linked to a project.
- **SimulationRun** — a single CFD run, storing:
  - **Vehicle config:** mass, payload weight, centre of gravity.
  - **Operating conditions:** velocity (m/s), angle of attack (°).
  - **Environment:** water density (kg/m³), wave height.
  - **Meshing:** mesh density multiplier (0.5×–2.0×).
  - **Post-processing:** slice axis (X/Y/Z).
  - **Status lifecycle:** `PENDING → MESHING → RUNNING → COMPLETED | FAILED`.
  - **Results:** streamed logs, result mesh path, temporal frame mapping, metrics series, convergence series.

---

## Simulation Pipeline (Worker)

When a run is created, the backend copies the uploaded asset into an OpenFOAM case directory and dispatches a Celery task. The worker then:

1. **Pre-flight** — validates the STL is watertight (`surfaceCheck`). Converts non-STL formats (GLB/GLTF/OBJ) to STL via Trimesh. Auto-detects if geometry is in millimetres and scales to metres.
2. **Domain derivation** — reads STL bounding box with PyVista and generates a proportional blockMesh domain (upstream 5×, downstream 10×, lateral 5× characteristic length). Mesh cell counts are derived from the mesh density multiplier, capped at 200k base cells.
3. **Template generation** — Jinja2 renders all OpenFOAM dictionaries: `blockMeshDict`, `snappyHexMeshDict`, `controlDict` (with forces function object), `fvSchemes`, `fvSolution`, `transportProperties`, `turbulenceProperties`, boundary conditions (`U`, `p`, `k`, `omega`, `nut`).
4. **Meshing** — `blockMesh` → `snappyHexMesh -overwrite`. Output is streamed to Django via rate-limited PATCH calls.
5. **Solving** — `simpleFoam` (steady-state RANS). A divergence guardrail monitors for NaN / fatal errors and triggers SIGTERM + automatic FAILED status if detected.
6. **Post-processing** — PyVista reads the OpenFOAM case, extracts the last 10 time steps, and for each frame exports:
   - **Foil surface STL** (boundary patch or axis-aligned slice fallback).
   - **Pressure contour lines** (20 iso-contours tubed into visible STL geometry).
   - **Flow streamlines** (seeded from inlet + near-body, tubed, decimated to stay browser-friendly).
   - **Per-frame metrics** parsed from `postProcessing/forces/` (Fx, Fy, Fz, L/D ratio).
   - **Convergence series** parsed from `log.simpleFoam` (max initial residual per time step).
7. **Completion** — all frame mappings, metrics series, and convergence data are PATCHed to Django. The frontend picks up the completed state on its next poll cycle.

---

## Frontend Dashboard Layout

The UI is a full-screen, dark-themed (`bg-slate-950`) monospace layout split into four persistent zones:

```
┌──────────────────────────────────────────────────────────────────┐
│  TopNavbar                                                       │
├────────────┬──────────────────────────────────┬──────────────────┤
│            │                                  │                  │
│  Sidebar   │          3D Viewport             │  Right Panel     │
│  (272px)   │   (flex, takes remaining space)  │  (320px)         │
│            │                                  │                  │
│  - Assets  │  ┌ Run/Status badge (top-left)   │  ConfigPanel     │
│  - Runs    │  │ MetricHUD (top-right)         │    OR            │
│            │  │ LayerManager (left)           │  AnalysisPanel   │
│            │  │ L/D sparkline (bottom-right)  │                  │
│            │  │ TimelineController (bottom)   │                  │
│            │  └                               │                  │
│            ├──────────────────────────────────┤                  │
│            │  LogConsole (224px tall)          │                  │
│            │  - Log stream + residual chart   │                  │
└────────────┴──────────────────────────────────┴──────────────────┘
```

---

## Component Breakdown & Features

### TopNavbar

- **Upload Asset** button — opens a file picker for `.stl`, `.obj`, `.gltf`, `.glb` files. Uploads via `POST /api/assets/` with `multipart/form-data`. Auto-selects the newly uploaded asset.
- **Refresh** button — triggers a sidebar data reload (assets + runs).
- Upload state feedback (uploading spinner, error indicator).

### Sidebar (Left Panel)

- **Assets section** — lists all hydrofoil assets for the current project. Clicking an asset selects it for preview in the 3D viewport and for future simulation runs. Shows asset name + file path.
- **Simulation Runs section** — lists the 30 most recent runs, sorted newest-first. Each entry shows:
  - Colour-coded status dot (blue pulsing = running/meshing/pending, green = completed, orange = failed).
  - Run ID, status label, linked asset ID, and creation timestamp.
  - Clicking a run loads its full state (logs, results, analysis data) into the viewport.

### 3D Viewport (Centre)

Built on React Three Fiber with a `<Canvas>` containing:

- **PerspectiveCamera** (FOV 50, near 0.001, far 10000) with **OrbitControls** for mouse-driven rotation, pan, and zoom.
- **Infinite Grid** (slate-coloured cell/section lines).
- **Stage** lighting (city environment map, intensity 0.5).
- **Gizmo** (bottom-right axis indicator with RGB axis colours).
- **Auto camera fit** — `<Bounds>` component with `<FitToContent>` that resets the camera to frame the loaded geometry whenever the active mesh, frame, or overlay changes.

**Content states:**

1. **Temporal playback mode** (when a completed run has frames) — renders `<SimulationFrame>` which loads STL/GLTF frames with an LRU cache (current + neighbours preloaded; distant frames evicted).
2. **Static result** — renders `<HydrofoilResults>` with the single result mesh (STL or GLTF).
3. **Asset preview** — renders `<HydrofoilResults>` to preview the selected uploaded asset before running.
4. **Empty state** — wireframe cube placeholder.

**Overlay layers** (rendered on top of the main geometry):

- `<OverlayFrame>` for **pressure contour lines** (red, 0.9 opacity).
- `<OverlayFrame>` for **flow streamlines** (blue, 0.85 opacity).
- Both use double-sided transparent materials with emissive glow and polygon offset to prevent z-fighting.

**Playback engine** — `<PlaybackSyncLoop>` runs inside the Three.js render loop (`useFrame`), advancing frames at the configured playback speed. Supports loop and clamp-to-end modes.

**HUD overlays** (rendered as absolute-positioned HTML over the canvas):

- **Run/Status badge** (top-left) — shows active run ID, current status, and latest `Time =` line from solver output.
- **MetricHUD** (top-right) — real-time telemetry for the current frame: L/D ratio, Fz (lift in N), Fx (drag in N).
- **L/D sparkline** (bottom-right) — synchronised Recharts `LineChart` showing L/D ratio across all frames with a vertical reference line tracking the current frame.
- **LayerManager** (top-left, below badge) — toggle checkboxes for Flow Lines, Pressure Lines, and Vorticity layers.
- **TimelineController** (bottom, full-width) — transport controls (step back, play/pause, step forward, loop toggle) + a scrub slider with orange marker dots at notable frames (max drag frame, instability/peak-residual frame).

### ConfigPanel (Right Panel — Pre-Run)

Visible when no completed run is selected. Provides slider/select controls for all simulation parameters:

| Parameter       | Control  | Range                   | Default |
| --------------- | -------- | ----------------------- | ------- |
| Velocity        | Slider   | 1–50 m/s                | 10      |
| Angle of Attack | Slider   | -15° to +15°            | 5°      |
| Water Density   | Slider   | 900–1200 kg/m³ (step 5) | 1025    |
| Mesh Density    | Slider   | 0.5×–2.0× (step 0.05)   | 1.0×    |
| Slice Axis      | Dropdown | X / Y / Z               | Y       |

- All controls disabled while a simulation is running.
- **Run Simulation** button — sends `POST /api/runs/` and starts polling. Disabled until an asset is selected.
- Button text adapts: "Upload an Asset to Run" / "Run Simulation" / "Calculating..."

### AnalysisPanel (Right Panel — Post-Run)

Replaces ConfigPanel once a run reaches `COMPLETED` status. Contains:

- **Telemetry grid** (2×2 cards):
  - L/D Ratio (2 decimal places)
  - Fz / Lift (N, integer)
  - Fx / Drag (N, integer)
  - Current frame index
- **Convergence chart** — Recharts `LineChart` plotting max initial residual per solver time step. X-axis = time, Y-axis = residual magnitude. Displays "No residual series available" if data is missing.

### LogConsole (Bottom Panel)

Split into two sub-panels:

- **Log stream** (left, scrollable) — auto-scrolling `<pre>` block showing raw solver output (`current_logs`) in green monospace text. Parses OpenFOAM `Solving for p/Ux` lines to extract initial residuals in real time.
- **Metrics panel** (right, 320px) — contains:
  - **Residual sparkline** — SVG polyline chart plotting pressure (`p`, blue) and velocity (`Ux`, white) residuals on a log₁₀ scale. Prefers the persisted `convergence_series` for completed runs, falls back to live-parsed residuals during a running simulation.
  - **Download Mesh** button — direct download link to the result mesh file (appears once `result_mesh_path` is set).
  - Status badge (colour-coded: green/completed, orange/failed, blue/running, slate/idle).

---

## State Management

A single Zustand store (`useSimStore`) manages all application state:

- **Project/Asset context** — `projectId`, `selectedAssetId`, `selectedAssetName`, `selectedAssetFileUrl`.
- **Simulation lifecycle** — `activeSimId`, `status`, `logs`, `resultMeshPath`.
- **Temporal playback** — `resultSequencePath`, `frameMapping`, `metricsSeries`, `convergenceSeries`, `totalFrames`, `currentFrame`, `isPlaying`, `playbackSpeed` (default 8 fps, range 0.25–60), `loopPlayback`.
- **Visualisation toggles** — `showFlowLines`, `showPressureMap` (default on), `showVorticity`.
- **Simulation inputs** — `velocity`, `aoa`, `waterDensity`, `meshDensity`, `sliceAxis`.

The App component runs two `useEffect` hooks:

1. **Polling loop** — while a run is PENDING/RUNNING/MESHING, polls `GET /api/runs/:id/` every 2 seconds and calls `updateSim()` to sync status and logs. Stops on COMPLETED/FAILED.
2. **Analysis loader** — when status becomes COMPLETED, fetches `GET /api/runs/:id/analysis/` and populates the full temporal analysis payload (frame mapping, metrics, convergence).

---

## API Endpoints

All endpoints are provided by Django REST Framework's `DefaultRouter`:

| Method               | Endpoint                  | Description                                                                           |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| GET/POST             | `/api/projects/`          | List / create projects                                                                |
| GET/PUT/PATCH/DELETE | `/api/projects/:id/`      | Project detail                                                                        |
| GET/POST             | `/api/assets/`            | List / upload hydrofoil assets (multipart)                                            |
| GET/PUT/PATCH/DELETE | `/api/assets/:id/`        | Asset detail                                                                          |
| GET/POST             | `/api/runs/`              | List / launch simulation runs                                                         |
| GET/PUT/PATCH/DELETE | `/api/runs/:id/`          | Run detail (also used by worker to PATCH status)                                      |
| GET                  | `/api/runs/:id/analysis/` | Returns temporal analysis payload (frame_mapping, metrics_series, convergence_series) |

---

## Metrics & Telemetry Available to the User

| Metric                              | Source                                                     | Where Displayed                                |
| ----------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| **Fx (Drag)**                       | OpenFOAM forces function object → `postProcessing/forces/` | MetricHUD, AnalysisPanel telemetry grid        |
| **Fy (Side Force)**                 | OpenFOAM forces function object                            | AnalysisPanel telemetry grid                   |
| **Fz (Lift)**                       | OpenFOAM forces function object                            | MetricHUD, AnalysisPanel telemetry grid        |
| **L/D Ratio**                       | Computed as Fz / Fx                                        | MetricHUD, AnalysisPanel, L/D sparkline chart  |
| **Pressure residual (p)**           | Parsed from solver log (`Initial residual`)                | LogConsole residual chart                      |
| **Velocity residual (Ux)**          | Parsed from solver log (`Initial residual`)                | LogConsole residual chart                      |
| **Convergence (max residual/step)** | Parsed from `log.simpleFoam` post-run                      | AnalysisPanel convergence chart, LogConsole    |
| **Solver time step**                | Parsed from solver `Time = X` lines                        | Viewport status badge                          |
| **Run status**                      | Django model lifecycle                                     | Sidebar dots, Viewport badge, LogConsole badge |
| **Frame index / total**             | Temporal frame mapping                                     | TimelineController, AnalysisPanel              |

---

## Visualisation Tools

| Tool                       | Description                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| **3D Orbit Controls**      | Mouse rotate, pan, zoom around the hydrofoil geometry                                          |
| **Auto Camera Fit**        | Camera automatically frames the geometry when switching runs/frames/overlays                   |
| **Axis Gizmo**             | RGB axis indicator (bottom-right) showing current camera orientation                           |
| **Temporal Playback**      | Play/pause/step/scrub through simulation time steps with configurable speed and loop           |
| **Frame Markers**          | Orange dots on the timeline at frames with max drag or peak instability                        |
| **Pressure Lines Overlay** | Toggleable red contour lines showing pressure distribution on the foil surface                 |
| **Flow Lines Overlay**     | Toggleable blue streamlines showing flow patterns around the hydrofoil                         |
| **Vorticity Toggle**       | Layer toggle present (visualisation pipeline placeholder)                                      |
| **Asset Preview**          | Preview uploaded geometry in the 3D viewport before running simulations                        |
| **Residual Sparkline**     | Real-time log-scale SVG chart of p and Ux residuals during solver execution                    |
| **L/D Sparkline**          | Synchronised Recharts line chart tracking L/D ratio across frames with current-frame indicator |
| **Convergence Chart**      | Post-run line chart of max residual per solver step                                            |
| **Log Stream**             | Live-scrolling raw solver output console                                                       |
| **Mesh Download**          | Direct download link to the exported result mesh file                                          |
