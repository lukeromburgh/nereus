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

## Local Dev Quick Start

For normal local development, start everything from the repo root with one command:

```bash
./flow
```

If you prefer npm scripts, the same entrypoint is available as:

```bash
npm run flow
```

That command:

- starts `db` and `redis`
- waits for Postgres to accept connections
- runs Django migrations inside the compose `api` container
- starts the compose `api` and `worker` services
- starts the Vite frontend on `http://localhost:5173`

When startup is successful, `./flow` stays attached to the Vite dev server and keeps that terminal occupied. That is expected. The success indicator is the Vite banner showing `ready` plus the local URL.

Useful companion commands:

```bash
./flow init        # first-time setup, including migrations and superuser creation
./flow start --build
./flow logs        # tail Django API and worker logs
./flow down        # stop the Docker services
```

Equivalent npm aliases also exist: `npm run flow:init`, `npm run flow:build`, `npm run flow:logs`, and `npm run flow:down`.

Notes:

- `./flow` is the daily path. It replaces the older habit of separately running host Django plus Docker.
- The frontend still runs locally with Vite; the backend services run through Docker Compose.
- `backend/.env` and `frontend/.env` must exist before running the wrapper.
- Press `Ctrl+C` to stop the foreground Vite process. Run `./flow down` afterwards if you also want to stop the Docker services.

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

---

Summary of simulation

Overview
Nereus is a hydrofoil CFD simulation platform built on OpenFOAM 11 (incompressible steady-state RANS), orchestrated through a Django REST API → Celery → Docker worker pipeline, with PyVista-based post-processing for browser playback.

1. User-Facing Controls (Frontend → API)
   The user controls these parameters via ConfigPanel.tsx, stored in a Zustand store (useSimStore.ts):

Parameter Range What it does
Velocity 1–50 m/s Freestream water speed. Sets the U inlet boundary condition.
Angle of Attack -15° to +15° Decomposed into Ux = V × cos(AoA) and Uz = -V × sin(AoA). Applied to the velocity field (not mesh rotation).
Mesh Density 0.5× to 2.0× Multiplier on the base cell count. Higher = more cells across the foil. Capped at 200k base cells (snappyHexMesh handles local refinement).
Submersion Depth 0–5 m Translates the foil geometry downward in z to simulate depth below water surface.
Slice Axis x / y / z Which plane the post-processing extracts cross-section frames from.
Vehicle mass, payload, CoG (x,y,z) Free Center of gravity feeds into the CofR parameter in the OpenFOAM forces function object.
Not directly exposed but hardcoded:

Water density: 1025 kg/m³ (seawater)
Kinematic viscosity: 1×10⁻⁶ m²/s (water at ~20°C)
Turbulence intensity: 5% (hardcoded in template_manager.py:509)
Reference length for turbulence: 0.1 m (hardcoded)
Max solver iterations: 1000 (hardcoded in write_interval=5)
Solver: simpleFoam (steady-state SIMPLE algorithm)
Turbulence model: k-ω SST (always) 2. Simulation Pipeline (5 Phases)
All orchestrated in tasks.py:973:

Phase 1 — Pre-flight & Domain Derivation
Fetch parameters from Django API via GET /api/runs/{id}/
Ensure STL exists — converts GLTF/GLB/OBJ → STL via trimesh (tasks.py:74)
surfaceCheck — validates the STL is watertight (rejects open edges)
Auto-scaling — if the STL characteristic length > 10m, assumes millimeters and scales by 0.001
Submersion translation — shifts foil center to -submersion_depth in z
Dynamic domain sizing — computes a bounding box around the foil:
Upstream padding: 5× characteristic length
Downstream: 10× characteristic length
Lateral: 5× characteristic length
Cell count heuristic — cell_size = char_len / (20 × mesh_density), clamped with a hard cap of 200k base cells
locationInMesh — placed 10% from the inlet face, centered in y/z (must be outside the foil, inside the domain)
Phase 2 — Meshing
blockMesh — creates the base hexahedral grid (single hex block, uniform grading)
snappyHexMesh -overwrite — castellated mesh + snap to the foil STL surface
Refinement levels: (3, 4) on the foil surface (hardcoded)
addLayers: false (boundary layers disabled for stability)
Mesh quality controls: relaxed defaults for MVP
Phase 3 — Solving
simpleFoam — steady-state incompressible RANS with SIMPLE pressure-velocity coupling
k-ω SST turbulence model
Solver numerics: GAMG for pressure, smoothSolver for U/k/omega
Relaxation: p=0.3, U=0.7, k=0.5, omega=0.5
Residual targets: p=1e-4, U=1e-5, k=1e-4, omega=1e-4
Divergence guardrail: a streaming log reader monitors stdout for "NaN" or "Fatal Error" → immediate SIGTERM + failure status
Real-time log streaming: patches current_logs to Django every 1 second
Phase 4 — Post-processing
Using PyVista (tasks.py:472):

Opens the case via pv.OpenFOAMReader
Selects the last 10 time steps (steady-state convergence tail)
For each frame:
Extracts the foil boundary surface (or falls back to a volume slice)
Generates pressure contour lines (30 iso-contours on the foil surface, tubed for visibility)
Generates streamlines (6×6 seed grid at the inlet + 3×3 seeds near the foil)
Parses forces.dat for per-frame Fx, Fy, Fz, and L/D ratio
Exports everything as STL files to /data/media/simulations/{id}/
Parses residuals from log.simpleFoam
Writes results_sequence.json manifest
Phase 5 — Status Update
Patches Django with COMPLETED status + all result URLs (frame_mapping, metrics_series, convergence_series).

3. Template System
   template_manager.py:445 uses Jinja2 to render 10 OpenFOAM dictionaries:

File Purpose Key dynamic values
0/U Velocity BCs ux, uz (from AoA decomposition)
0/p Pressure BCs Static (outlet fixed 0)
0/k Turbulent kinetic energy k = 1.5 × (TI × V)²
0/omega Specific dissipation rate Derived from k, TI, L_ref
0/nut Turbulent viscosity k / omega
system/controlDict Solver control + forces max_iterations, write_interval, water_density, CofR
system/fvSchemes Discretization schemes Static (linearUpwind for U, upwind for k/omega)
system/fvSolution Solver settings Static (GAMG, smoothSolver, relaxation factors)
system/blockMeshDict Base mesh geometry x/y/z_min/max, nx/ny/nz
system/snappyHexMeshDict Refinement around foil locationInMesh
constant/transportProperties Fluid properties nu (kinematic viscosity)
constant/turbulenceProperties Turbulence config Static (k-ω SST) 4. What's Realistic vs. What's Simplified
Currently realistic:

k-ω SST is an industry-standard turbulence model for external hydrodynamics
SIMPLE is appropriate for steady-state incompressible flows
Surface forces (pressure + viscous) are correctly computed and decomposed
AoA decomposition into velocity components is physically correct
Watertight STL validation prevents garbage-in/garbage-out
Simplified / MVP shortcuts that limit realism:

Limitation Impact What to do
No boundary layers (addLayers: false) Wall shear stress, drag, and separation prediction are inaccurate. y+ values are likely too large. Enable snappyHexMesh layer addition with appropriate y+ targeting (~1 for SST)
Fixed refinement levels (3,4) May under-resolve thin trailing edges or over-resolve blunt bodies Make refinement levels scale with mesh_density or add featureEdge refinement
No free surface (single-phase) Ignores wave drag, spray, ventilation, and surface piercing effects Switch to interFoam (VOF multiphase) for realistic hydrofoil-at-surface behavior
Steady-state only Cannot capture vortex shedding, flutter, transient startup, or unsteady separation Add transient solver option (pimpleFoam) for dynamic cases
Hardcoded turbulence (5% TI, 0.1m L_ref) Inlet turbulence may not match real operating conditions Expose TI and L_ref as user parameters, or compute from upstream geometry
No gravity / buoyancy Submersion depth translates geometry but doesn't create hydrostatic pressure gradient Add gravity term + correct reference pressure for submerged operation
Uniform grading (simpleGrading 1 1 1) Wastes cells in far-field, too coarse near boundaries Use graded mesh with expansion ratios toward walls/foil
No feature edge refinement Leading/trailing edges poorly resolved Add surfaceFeatureExtractDict + featureEdge refinement in snappyHexMesh
No moment coefficients Only forces are extracted, not pitch/roll/yaw moments Parse moment.dat from the forces function object (already written by OpenFOAM)
Flat velocity profile Inlet boundary layer not modeled Add inlet profile or use a mapped BC for developed flow
No cavitation At high speeds, hydrofoils cavitate — not captured Requires interPhaseChangeFoam or similar
Post-processing: STL slices only Loses field data (pressure/velocity magnitude) for rich visualization Export VTK/VTP with scalar fields for WebGL-based field rendering
No mesh independence study No automated convergence check across mesh densities Could run 2-3 mesh levels automatically and compare forces 5. Architecture for Extension
To make the simulation more realistic, the key extension points are:

template_manager.py — Add new templates or modify existing ones (e.g., interFoam controlDict, g file for gravity, alpha.water for VOF, layer addition in snappyHexMeshDict)

tasks.py run_hydro_simulation() — Add new solver phases (e.g., surfaceFeatureExtract before meshing, interFoam instead of simpleFoam, decomposePar/mpirun for parallel)

models.py SimulationRun — Add new fields for additional user parameters (turbulence intensity, solver type, enable_free_surface, etc.)

ConfigPanel.tsx — Add UI controls for any new parameters

tasks.py:472 — Extend to export richer data (VTK fields, moment coefficients, wall y+ visualization, free surface contours)

The pipeline is cleanly separated: UI → API model → Celery task → template rendering → OpenFOAM execution → PyVista post-processing → JSON manifest → frontend playback. Each layer can be extended independently.
