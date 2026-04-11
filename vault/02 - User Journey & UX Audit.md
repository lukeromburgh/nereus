# 02 — User Journey & UX Audit

> End-to-end workflows, friction points, missing guardrails, and what a hydrofoil designer actually needs.

---

## Navigation & Layout

The app is a single-page dashboard built with React Router. Three top-level routes are accessible from a permanent **SideNav** (left rail, 224 px):

| Route | Page | Purpose |
|-------|------|---------|
| `/` | `SimulationPage` (App.tsx default export) | Main workspace: 3D viewport, config, analysis |
| `/assets` | `AssetManagerPage` | File manager for uploaded geometries |
| `/comparison` | `RunComparisonPage` | Side-by-side metrics of two completed runs |

A **NEW RUN** button at the bottom of the SideNav calls `resetForNewRun()` and navigates to `/`.

The `AppShell` component renders:
1. SideNav (permanent left column)
2. Top toolbar (11 px header with brand + per-page actions injected via `ToolbarContext`)
3. `<Outlet />` for the active page

---

## Journey 1 — First-Time User (Upload → Simulate → Analyse)

This is the critical path. Below is the full walkthrough **as it works today**, with friction points annotated.

### Step 1: Arrive at the dashboard

**What happens**: User sees `SimulationPage`. The 3D viewport shows a dark background with a CSS grid. The right panel shows the **Configuration** form. The left asset panel opens by default showing "No assets yet. Upload one above."

> **Friction**: There is no onboarding, empty-state guidance, or wizard. A new user is dropped straight into a complex CFD interface with no indication of what to do first. The "Upload one above" text refers to the toolbar upload button, which is in the top-right toolbar — not visually "above" the sidebar panel text.

### Step 2: Upload a geometry file

**Two paths**:
- **Toolbar button**: Click "Upload" in the top toolbar → native file picker → `POST /api/assets/`
- **Drag & drop**: Drop an STL/OBJ/GLTF/GLB file anywhere on the viewport area

**What happens**: File is validated client-side (extension check, 100 MB max, non-empty). Uploaded via `multipart/form-data`. On success, the asset is auto-selected and the sidebar refreshes.

> **Friction 1**: Upload happens against a hardcoded `http://localhost:8000` URL — see [[Hardcoded API URLs]]. In production, this will break unless the environment variable / proxy is set up. There are **multiple** places where `localhost:8000` is hardcoded — `App.tsx`, `ConfigPanel.tsx`, `Sidebar.tsx`, `TopNavbar.tsx`, `RunComparisonPage.tsx`, `LogConsole.tsx`, `AnalysisPanel.tsx`. Only `assetApi.ts` centralises its BASE URL (also hardcoded).

> **Friction 2**: No thumbnail or preview is generated on upload. The user sees only the filename in the sidebar. They cannot visually confirm "this is my foil" until they select it and it loads in the VTK viewport.

> **Friction 3**: File validation is client-side only. The backend `HydrofoilAssetSerializer` validates extensions via Django's `FileExtensionValidator`, but there is no server-side geometry validation (e.g., is the STL actually parseable? Does it have vertices?). Corrupt files pass upload and only fail at simulation time.

### Step 3: Select the asset

**What happens**: Clicking an asset in the sidebar calls `setSelectedAsset()`, which updates the Zustand store. The VTK viewport hook (`useVtkScene`) reacts and loads the asset's geometry into the 3D scene via `fetchPolyData()`.

> **Friction**: There is no loading spinner or skeleton state while the VTK geometry loads. For large STLs (50+ MB), there can be a multi-second stall with no visual feedback.

### Step 4: Adjust orientation (if needed)

**What happens**: If the backend detected the foil's chord axis isn't X, an `OrientationWarningBanner` appears (yellow for auto-rotated, red if geometry still looks sideways). The user can expand the **Orientation Correction** panel in the right column and adjust pitch/roll/yaw via sliders.

> **Friction 1**: The orientation correction is only available in "asset preview mode" (no simulation results loaded). If the user clicks a completed run first, the sliders are locked. The UI explains this but the flow feels backwards — you need to select the asset, not a run, to adjust orientation.

> **Friction 2**: Orientation changes are PATCHed to `/api/runs/{id}/` — but the user hasn't created a run yet. The `activeSimId` is null, so `patchOrientation` silently no-ops. The orientation values are stored in the Zustand store but **are not sent with the simulation creation payload** in `handleRunSimulation()`. They are only stored on a `SimulationRun` model field. This means orientation corrections set before the first run may be ignored.

### Step 5: Configure simulation parameters

**What happens**: The right panel shows structured config sections:
- **Flow Parameters**: Velocity (1–50 m/s), Angle of Attack (-15° to +15°)
- **Mesh Settings**: Mesh Density multiplier (0.5–2.0)
- **Advanced** (collapsed by default): Water Density, Submersion Depth, Slice Axis, Vehicle Mass, Payload Weight, Center of Gravity (x/y/z)

All values use `SliderWithInput` components — combined slider + numeric input.

> **Friction 1**: The **default values** are not shown to the user until they interact. Velocity defaults to whatever `useSimStore` initialises (checked: not visible in the truncated store code — likely 5 or 10). A hydrofoil designer needs to know what units everything is in. The hints help ("Speed of water flow. Typical range: 5–15 m/s for small foils"), but they're small tooltip-style text.

> **Friction 2**: No **parameter validation beyond slider bounds**. A user can type `0` into the velocity input (min is 1 on the slider, but the number input isn't clamped). The backend will accept it and OpenFOAM will silently produce garbage or NaN.

> **Friction 3**: The **Run** button is enabled as long as an asset is selected and no simulation is active. There is no preflight validation summary. The user doesn't see "Velocity = 10 m/s, AoA = 5°, Mesh = 1.0×" before clicking run.

> **Friction 4**: Several config inputs that the backend model supports are not exposed in the UI: `enable_gravity`, `enable_layers`, `n_surface_layers`, `layer_expansion`, `feature_level`. These are always sent as defaults. An advanced user has no way to control boundary layer resolution.

### Step 6: Run the simulation

**What happens**: Click blue "Run Simulation" button → `POST /api/runs/` with config payload → backend creates `SimulationRun`, copies asset to OpenFOAM case dir, dispatches Celery task → response includes the run ID → `startNewSim(id)` updates the store → polling begins.

The status badge in the VTK viewport shows `PENDING → MESHING → RUNNING → COMPLETED | FAILED`.

Polling uses exponential backoff: 2s → 3s → 4.5s → … → 60s cap.

> **Friction 1**: There is no **estimated time** shown. A mesh_density=2.0 run might take 30+ minutes. The user has no idea.

> **Friction 2**: **The entire right panel is replaced** by the AnalysisPanel as soon as status hits COMPLETED. The config values are gone — the user can't see what parameters they used for this run. To see config, they'd need to GET the run from the API manually.

> **Friction 3**: No way to **cancel** a running simulation from the UI. The only option is to kill the Docker container or wait.

### Step 7: Monitor progress

**What happens**: The bottom panel (`LogConsoleCompact`) shows streaming solver logs. The VTK viewport shows a `StatusBadge` with status and current solver time. Logs update on each poll.

> **Friction**: The log console is a fixed 224px tall panel at the bottom. It auto-scrolls but there's no way to search, filter, or copy logs. For a designer debugging a failed run, this is insufficient.

### Step 8: View results

**What happens**: On COMPLETED:
- Right panel switches to `AnalysisPanel` with metric cards (L/D ratio, Lift Fz, Drag Fx, Side Fy), coefficient display (Cl, Cd, Cs), and multi-residual convergence chart
- VTK viewport loads the result geometry (VTP files) with Cp scalar coloring
- Timeline controller appears at the bottom of viewport for stepping through frames
- Layer manager allows toggling: Foil Surface, Pressure Map, Flow Lines, Vorticity, Streamlines
- Colorbar legend shows pressure scale
- Export buttons for Metrics CSV and Convergence CSV

> **Friction 1**: No **summary card** at the top showing "your foil produced X N lift at Y m/s". The numbers are there but distributed across multiple tiny cards. A designer wants the headline: "L/D = 12.3 at 10 m/s, 5° AoA".

> **Friction 2**: The **frame playback** system shows the last ~10 time steps. For a steady-state solver (simpleFoam), these "frames" are really the last 10 iterations. The UI calls them "frames" and has Play/Pause/Step controls — this is misleading for steady-state. The playback makes sense for transient, but simpleFoam is steady-state.

> **Friction 3**: No way to **go back to configuration** without clicking "NEW RUN". The `AnimatePresence` mode="wait" hard-switches between ConfigPanel and AnalysisPanel based on status.

---

## Journey 2 — Asset Management

Available at `/assets` via the SideNav.

### Current Capabilities
- Hierarchical folder system (create folders, nest them)
- Upload assets to the current folder or root
- Drag-and-drop reordering & folder moves (internal `application/x-nereus-item` MIME)
- External file drops for upload
- Context menu: Rename, Move to Folder, Delete (with confirmation)
- Breadcrumb navigation
- Grid and List view modes
- Tree view in left panel

### What Works Well
- Folder system is fully functional with backend support (CRUD + move + tree endpoint)
- Delete has a cascade warning when assets have simulation runs attached
- Asset → Simulation linking via `setSelectedAsset` + navigate to `/`

> **Friction 1**: After selecting an asset for simulation, the user is navigated to `/` but the asset isn't **visually confirmed** as loaded. The sidebar on the simulation page shows assets too, creating **two separate asset browsing experiences** that don't stay in sync.

> **Friction 2**: No **multi-file upload**. Only one file at a time.

> **Friction 3**: No **asset versioning**. A designer iterating on a foil design re-uploads with a new name each time. There's no history or diff.

> **Friction 4**: No **file format preview** before committing to simulation. The user can't see vertex count, bounding box, or watertightness until either the VTK viewport loads it (which only shows the mesh) or the simulation worker runs surfaceCheck (which might fail).

---

## Journey 3 — Run Comparison

Available at `/comparison` via the SideNav.

### Current Capabilities
- Two dropdowns to pick completed runs (Run A vs Run B)
- "Compare" button fetches both run payloads
- Delta table showing: Peak L/D, Peak Lift, Peak Drag, Stall Frame, plus delta and % change
- Overlay SVG chart (L/D series from both runs on one plot)
- Auto-generated "synthesis note" paragraph summarising which run is better
- (Deprecated) VTK viewport for side-by-side 3D — imports `VtkViewport-DEPRECATED`

### What Works Well
- The delta table and synthesis note are genuinely useful for a designer comparing design iterations
- Color coding (green = better, red = worse) makes results scannable

> **Friction 1**: Uses **`VtkViewport-DEPRECATED`**, which is a React Three Fiber component, not the VTK.js renderer. This is a dead code path — the component likely doesn't render or renders the wrong thing since the rest of the app moved to VTK.js.

> **Friction 2**: Can only compare **exactly two** runs. No multi-run overlay or Pareto frontier.

> **Friction 3**: No indication of **which asset** each run used. Just "Run #42 vs Run #57". A designer needs to know "NACA 2412 vs NACA 4415" at a glance.

> **Friction 4**: **Charts are SVG polylines drawn manually** rather than using Recharts (which is available and used elsewhere). The chart code is a manual implementation with fixed width/height constants.

---

## Journey 4 — Iterative Design (the real workflow)

A hydrofoil designer's actual workflow is:
1. Design a foil shape in CAD (Rhino, Fusion, Solidworks)
2. Export STL
3. Upload to Nereus
4. Run simulation at cruise conditions
5. Look at L/D, Cl, Cd, moment coefficients
6. Modify design → re-export → re-upload → re-run
7. Compare runs to see if changes helped
8. Repeat until satisfied

### Missing Capabilities for This Workflow

| Capability | Status | Impact |
|-----------|--------|--------|
| **Parameter sweep** | ❌ Missing | Can't run "5° to 15° AoA in 1° steps" automatically. Must create each run manually. |
| **Batch runs** | ❌ Missing | Can't queue multiple runs. Must wait for one to finish, then start the next. |
| **Run tagging / notes** | ❌ Missing | Can't annotate "this was with the thicker trailing edge" on a run. |
| **Run → Asset linking in UI** | ⚠️ Partial | Asset name not displayed on run cards in sidebar or comparison page. |
| **Config comparison** | ❌ Missing | Can't see "Run A was 10 m/s, Run B was 12 m/s" side by side. |
| **Polar plot** | ❌ Missing | No Cl vs AoA or Cd vs AoA chart — the fundamental hydrofoil performance view. |
| **Report export** | ❌ Missing | Can't generate a PDF summarising results for a client or team. |
| **Undo / re-run with tweaks** | ❌ Missing | Can't clone a previous run with one parameter changed. |
| **Mesh convergence study** | ❌ Missing | Can't automatically run at 3 mesh densities to check grid independence. |

---

## Journey 5 — Handling Failures

### What Happens on Failure
- Worker catches exceptions and PATCHes `status=FAILED` + error in `current_logs`
- Frontend polling picks up the FAILED status
- Status badge turns red, logs show the error

### What's Missing

> **Friction 1**: No **categorised error messages**. The log dump contains raw OpenFOAM output. A "Floating point exception" means "your mesh has negative-volume cells" — but the user sees a wall of text.

> **Friction 2**: No **retry button**. After a failure, the only option is NEW RUN (which resets all parameters).

> **Friction 3**: No **failure diagnostics**. Common failure modes (non-watertight mesh, diverged solver, insufficient mesh resolution) could be detected and presented with actionable suggestions.

> **Friction 4**: If the Docker worker dies or Redis disconnects, the run stays `PENDING` forever. No **timeout or heartbeat** mechanism.

---

## Cross-Cutting UX Issues

### 1. Hardcoded API URLs → [[Hardcoded API URLs]]

`http://localhost:8000` appears in **at least 7 files**:
- `App.tsx` (upload, polling, analysis fetch)
- `ConfigPanel.tsx` (run creation)
- `Sidebar.tsx` (runs list, run detail fetch)
- `TopNavbar.tsx` (upload)
- `LogConsole.tsx` (result download)
- `AnalysisPanel.tsx` (result download)
- `RunComparisonPage.tsx` (runs list, run detail)

Only `assetApi.ts` defines a `BASE` constant (also hardcoded). The fix is trivial: one shared constant or env var (`VITE_API_URL`).

### 2. No Authentication

No login, no users, no project ownership. The `User` model referenced in the summary doesn't exist in the actual codebase — `Project` has no owner field. For a single-designer tool this is fine for MVP, but it means anyone on the network can see/delete any project.

### 3. Project is Hardcoded

`useSimStore` initialises `projectId: 1`. There is no project selector, no project creation UI. The `Project` model exists, the API exists, but the frontend always uses project 1. Multi-project support is **structurally ready** but **UI-dead**.

### 4. No Responsive Design

The layout assumes a large screen. The SideNav is a fixed 224px column. The right panel is a fixed 320px column. Sub-1200px screens will see a crushed viewport. No mobile consideration (acceptable for a desktop CAD tool, but should be noted).

### 5. No Keyboard Shortcuts (beyond gizmo)

The GizmoToolbar supports Q/W/E/R shortcuts (implied by labels). There are no other keyboard shortcuts — no Ctrl+Z, no Escape to close panels, no Space to play/pause.

### 6. State Persistence

Nothing is persisted to localStorage or URL params. Refreshing the page loses:
- Selected asset
- Simulation parameters
- Active run reference
- UI state (panel collapsed, view mode)

The user must re-select everything after every page refresh.

---

## Priority — What a Designer Needs First

Ranked by impact for MVP handoff:

### P0 — Must Have (blocks real use)

1. **Centralise API URL** — Single env var, fix all 7+ hardcoded locations
2. **Parameter validation** — Reject invalid combinations before hitting OpenFOAM
3. **Config persistence** — Show what parameters a completed run used
4. **Clone/rerun** — One-click "run again with tweaks" from completed results
5. **Run-asset link visible** — Show asset name on every run card and comparison

### P1 — High Value (makes the tool useful)

6. **Failure diagnostics** — Parse common OpenFOAM errors into human-readable messages
7. **Upload preview** — Show vertex count, bounding box, watertight check on upload
8. **Batch / parameter sweep** — Queue runs at different AoA values automatically
9. **Polar plot** — Cl vs AoA from multiple runs on one chart
10. **Run notes / tags** — Annotate runs with design intent

### P2 — Nice to Have (polish)

11. **Empty-state onboarding** — Guide first-time users through upload → configure → run
12. **Estimated run time** — Based on mesh density + historical data
13. **Cancel simulation** — Kill the Celery task from the UI
14. **Project selector** — Unlock the multi-project support that already exists in the backend
15. **URL-based state** — Deep-link to specific runs or assets
16. **Log search / filter** — Ctrl+F in the log console

---

## Relationship to Other Sections

- API URL hardcoding and Docker networking: [[01 - Backend Audit]]
- Component architecture and state management patterns: [[03 - Frontend & UI Audit]]
- The simulation pipeline and post-processing output format directly shapes what the AnalysisPanel can display — see [[01 - Backend Audit]] Phase 5.
