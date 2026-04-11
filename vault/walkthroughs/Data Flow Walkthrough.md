# Data Flow Walkthrough

> Trace a single simulation from button click to rendered VTK scene.

---

## 1. User Clicks "Run Simulation"

**File**: `frontend/src/components/ConfigPanel.tsx`

`handleRunSimulation()` reads the current parameter state from the Zustand store (velocity, AoA, mesh density, etc.) and fires:

```
POST http://localhost:8000/api/runs/
```

with a JSON payload containing the selected `asset` ID and all configuration fields. On success it calls `startNewSim(response.data.id)` to begin tracking.

> [!warning] Hardcoded URL
> The `localhost:8000` base is hardcoded here and in 7+ other files. See [[Hardcoded API URLs]].

---

## 2. Zustand Store Updates

**File**: `frontend/src/store/useSimStore.ts`

`startNewSim(id)` sets:
- `activeSimId` → the new run ID
- `status` → `"PENDING"`
- Clears all result fields (residuals, metrics, frame maps)

This state change triggers polling in `App.tsx`.

> [!note] God Store
> This single store manages 50+ fields across 5 unrelated domains. See [[God Store Problem]].

---

## 3. Django Creates the SimulationRun

**Files**: `backend/api/urls.py` → `backend/api/views.py` → `backend/api/serializers.py`

The `POST /api/runs/` route maps to `SimulationRunViewSet`. The flow:

1. `SimulationRunSerializer` validates input fields
2. `perform_create()` saves the model instance
3. The asset STL is copied into the case directory at `/data/simulations/{id}/constant/triSurface/`
4. A Celery task is dispatched:

```python
celery_app.send_task('tasks.run_hydro_simulation', args=[instance.id])
```

> [!warning] No validation
> There is no pre-flight check that the asset exists, is a valid STL, or that parameters are physically sensible. The serializer accepts any numeric value.

> [!warning] No authentication
> Any client can POST to this endpoint. See [[No Authentication]].

---

## 4. Celery Worker Picks Up the Task

**File**: `simulation_worker/config.py`

The worker process bootstraps Django ORM access and configures a Celery app connected to Redis. The `DJANGO_API_URL` is set to `http://host.docker.internal:8000` (breaks on Linux).

**File**: `simulation_worker/tasks.py` → `run_hydro_simulation(sim_id)`

The task executes 6 phases:

### 4a. Parameter Fetch
```
GET /api/runs/{sim_id}/
```
Fetches the full SimulationRun JSON. Uses `requests.get()` (though the import is broken as `http_req` — see [[BlockMesh Bug]] notes).

### 4b. Pre-flight
- Converts non-STL files to STL via Trimesh
- Runs `surfaceCheck` to validate geometry
- Auto-scales the mesh if bounding box is outside expected range
- Applies orientation correction (Euler rotation to OpenFOAM conventions)

### 4c. Case Generation
**File**: `simulation_worker/template_manager.py`

`TemplateManager` generates all OpenFOAM dictionaries:
- `blockMeshDict` — background hex domain
- `snappyHexMeshDict` — surface refinement
- `controlDict`, `fvSchemes`, `fvSolution` — solver config
- `transportProperties`, `turbulenceProperties` — fluid & turbulence model
- `0/` boundary conditions (U, p, k, omega, nut)

> [!bug] blockMesh never executes
> The command list has a typo (`["chd", "->", "snappyHexMesh"]`). `blockMesh` is skipped entirely, so snappyHexMesh operates on whatever mesh state already exists. See [[BlockMesh Bug]].

### 4d. Meshing
Status patched to `MESHING` via `PATCH /api/runs/{id}/`.
Runs `snappyHexMesh -overwrite` and streams stdout to the Django logs field.

### 4e. Solving
Status patched to `RUNNING`.
Runs `simpleFoam` (steady-state RANS with k-ω SST). The worker monitors stdout for divergence indicators. Residuals are parsed and periodically PATCHed to Django.

> [!warning] Boundary condition error
> The `walls` patch (far-field domain boundary) uses `noSlip` instead of `slip`. This creates a thin boundary layer on the domain walls that contaminates results. See [[Walls Boundary Condition Bug]].

### 4f. Post-processing
**Files**: `simulation_worker/services/postprocess.py`, `simulation_worker/extractors/temporal.py`

PyVista extracts the last N time steps:
- Foil surface mesh (VTP)
- Pressure / velocity / vorticity field data
- Streamline geometry
- Force & moment coefficients (Cl, Cd, L/D)
- Wall y+ distribution

Results are written to `/data/simulations/{id}/` and metadata is PATCHed back.

---

## 5. Status PATCH Back to Django

**File**: `simulation_worker/status.py`

`patch_django_status()` sends:
```
PATCH /api/runs/{id}/
{
  "status": "COMPLETED",
  "logs": "...",
  "results_path": "/data/simulations/{id}/",
  "frame_map": {...},
  "metrics_series": [...],
  "convergence_series": [...]
}
```

> [!warning] Serializer bypass
> The `update()` method in `SimulationRunSerializer` uses `self.initial_data` directly, bypassing `read_only_fields` and letting any client overwrite status, results, or logs. See [[God Table Problem]].

---

## 6. Frontend Polls for Completion

**File**: `frontend/src/App.tsx`

A `useEffect` hook watches `activeSimId` + `status`. While status is `PENDING`, `MESHING`, or `RUNNING`:

1. Poll `GET /api/runs/{id}/` with exponential backoff (2s → 60s)
2. Call `updateSim(data)` to push the latest state into Zustand
3. UI reactively updates: status badges, log panels, progress indicators

When status becomes `COMPLETED`, a second effect fetches:
```
GET /api/runs/{id}/analysis/
```
and calls `setAnalysisData(data)` to populate charts and metrics.

---

## 7. VTK Renders the Results

**File**: `frontend/src/components/VTK/VtkViewport.tsx`

The viewport composes 4 hooks:

| Hook | Role |
|------|------|
| `useVtkRenderer` | WebGL pipeline — RenderWindow, Renderer, Interactor, lights |
| `useVtkScene` | Loads geometry (VTP/STL), builds actors, applies colormaps |
| `useVtkPlayback` | rAF loop for temporal frame stepping |
| `useTransformGizmo` | Orientation widget for camera control |

### Scene Loading (`useVtkScene.ts` — 1264 lines)

Six effects run in sequence:
1. **Foil geometry** — Fetch VTP/STL from `/data/simulations/{id}/`, parse, create actor
2. **Overlay layers** — Pressure contours, velocity vectors, vorticity, streamlines
3. **Colormap update** — Apply selected LUT (rainbow, coolwarm, viridis, etc.)
4. **Orientation rotation** — Euler rotation applied at vertex level to match preview
5. **Reset on run change** — Tear down all actors when `activeSimId` changes
6. **Cleanup** — Dispose VTK objects on unmount

> [!warning] Memory leak
> Geometry is cached but never evicted. Switching between runs accumulates GPU-resident buffers. See [[VTK Memory Leak]].

> [!note] God Hook
> This 1264-line hook handles 6 unrelated concerns. Splitting into focused hooks is flagged in [[03 - Frontend & UI Audit]].

---

## Sequence Diagram

```
User          ConfigPanel       Django API        Redis       Worker         VTK Viewport
 │                │                 │               │            │                │
 │──Run Click────▶│                 │               │            │                │
 │                │──POST /runs/───▶│               │            │                │
 │                │                 │──send_task────▶│            │                │
 │                │◀──201 {id}──────│               │──dequeue──▶│                │
 │                │                 │               │            │                │
 │          startNewSim(id)         │               │            │                │
 │          poll loop starts        │               │  PATCH MESHING             │
 │                │──GET /runs/id──▶│◀──────────────│────────────│                │
 │                │◀──{MESHING}─────│               │            │                │
 │                │                 │               │  blockMesh+snappy          │
 │                │                 │               │  PATCH RUNNING             │
 │                │──GET /runs/id──▶│◀──────────────│────────────│                │
 │                │◀──{RUNNING}─────│               │            │                │
 │                │                 │               │  simpleFoam                │
 │                │                 │               │  post-process              │
 │                │                 │               │  PATCH COMPLETED           │
 │                │──GET /runs/id──▶│◀──────────────│────────────│                │
 │                │◀──{COMPLETED}───│               │            │                │
 │                │                 │               │            │                │
 │          setAnalysisData()       │               │            │                │
 │                │─────────────────│───────────────│────────────│──load VTP────▶│
 │                │                 │               │            │          render│
 │◀───────────────│─────────────────│───────────────│────────────│◀───────────────│
```

---

## Key Files Reference

| Step | File | Function |
|------|------|----------|
| 1. Click | `frontend/src/components/ConfigPanel.tsx` | `handleRunSimulation()` |
| 2. State | `frontend/src/store/useSimStore.ts` | `startNewSim()` |
| 3. API | `backend/api/views.py` | `SimulationRunViewSet.perform_create()` |
| 4. Dispatch | `backend/api/views.py` | `celery_app.send_task()` |
| 5. Worker | `simulation_worker/tasks.py` | `run_hydro_simulation()` |
| 5b. Templates | `simulation_worker/template_manager.py` | `TemplateManager` |
| 5c. Status | `simulation_worker/status.py` | `patch_django_status()` |
| 6. Poll | `frontend/src/App.tsx` | `useEffect` polling loop |
| 7. Render | `frontend/src/hooks/useVtkScene.ts` | 6 scene-loading effects |

---

## Related Notes

- [[BlockMesh Bug]]
- [[Walls Boundary Condition Bug]]
- [[God Table Problem]]
- [[God Store Problem]]
- [[Hardcoded API URLs]]
- [[No Authentication]]
- [[VTK Memory Leak]]
