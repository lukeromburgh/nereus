# 01 — Backend Audit

> Solver pipeline, physics correctness, OpenFOAM configuration, dependencies, data flow, and infrastructure.

---

## Architecture Overview

Nereus uses a **Django + Celery + OpenFOAM** pipeline. The system has four Docker services:

| Service | Role | Image |
|---------|------|-------|
| `api` | Django REST API, serves media, dispatches tasks | `python:3.10-slim` |
| `worker` | Celery consumer, runs OpenFOAM + PyVista post-processing | `openfoam/openfoam11-paraview510` |
| `redis` | Message broker for Celery | `redis:6-alpine` |
| `db` | PostgreSQL (Docker) / SQLite (dev) | `postgres:15-alpine` |

Data flows through a shared bind-mount volume at `/data`:
```
User uploads file → Django saves to /data/media/assets/
                   → Django copies to /data/simulations/{id}/constant/triSurface/
                   → Celery task picked up by worker
                   → Worker runs OpenFOAM in /data/simulations/{id}/
                   → Worker writes results to /data/media/simulations/{id}/
                   → Worker PATCHes results back to Django API
                   → Frontend polls Django for status + result paths
```

---

## Simulation Pipeline — Step-by-Step

The entire simulation lifecycle is orchestrated by a single Celery task: `run_hydro_simulation(sim_id)` in [[simulation_worker-tasks]].

### Phase 1: Parameter Fetch & Pre-flight

1. **Fetch run config** — HTTP GET to `http://host.docker.internal:8000/api/runs/{id}/`
2. **Ensure STL** — Convert GLB/GLTF/OBJ → STL via trimesh if needed ([[simulation_worker-geometry]])
3. **Surface check** — Run `surfaceCheck` to verify watertight geometry
4. **Auto-scale** — If characteristic length > 10m, assume millimetres and scale ×0.001
5. **Orientation correction** — Apply user pitch/roll/yaw via Euler matrix (syxz convention)

### Phase 2: Domain & Case Setup

6. **Bounding box analysis** — Read STL bounds via PyVista
7. **Domain derivation** — Compute computational domain from foil dimensions
8. **First layer thickness** — Flat-plate skin friction estimate for target y⁺ = 1
9. **Template generation** — Jinja2 renders all OpenFOAM dictionaries ([[simulation_worker-template_manager]])

### Phase 3: Meshing

10. **blockMesh** — Generates base hexahedral mesh
11. **surfaceFeatureExtract** — Extracts feature edges for refinement
12. **snappyHexMesh** — Refinement + snap + boundary layers

### Phase 4: Solving

13. **simpleFoam** — Steady-state RANS solver (k-ω SST)
14. **Divergence monitoring** — Kill if residual > 1e6

### Phase 5: Post-processing

15. **PyVista pipeline** — Foil surface Cp, skin friction, spanwise sections, vorticity, Q-criterion, wake planes, forces, moments, y+ ([[simulation_worker-postprocess]])
16. **Temporal frames** — Extract last 10 time steps as VTP files with Cp ([[simulation_worker-temporal]])

### Phase 6: Upload

17. **PATCH results** — Send all metrics, paths, and manifests back to Django API

---

## Physics Assessment

### What's Correct

| Aspect | Implementation | Notes |
|--------|---------------|-------|
| **Turbulence model** | k-ω SST | Industry standard for hydrofoils. Good choice. |
| **Solver** | simpleFoam (steady RANS) | Appropriate for MVP; avoids transient complexity |
| **Wall functions** | `kqRWallFunction`, `omegaWallFunction`, `nutkWallFunction` | Correct pairing for k-ω SST |
| **Pressure BCs** | Fixed outlet p=0, zeroGradient inlet | Standard incompressible setup |
| **Velocity decomposition** | `Ux = V·cos(AoA)`, `Uz = -V·sin(AoA)` | Correct for positive AoA = nose up |
| **Forces function object** | Patches `foil`, `rhoInf` mode | Correct for incompressible solver |
| **Cp calculation** | `(p - p_ref) / (q_inf / rho)` | Correct — accounts for OpenFOAM's kinematic pressure `p/ρ` |
| **First layer sizing** | Flat-plate correlation → y⁺ = 1 target | Physically reasonable |

### What's Concerning

#### CRITICAL: Boundary Condition Completeness → [[Walls Boundary Condition Bug]]

**Problem**: The `walls` boundary uses `noSlip` for velocity. This is physically wrong for the far-field boundaries of an external flow domain. The outer walls should be `slip` (frictionless) or `freestream` to avoid creating artificial boundary layers on the domain edges that pollute the solution.

**Impact**: Artificial drag from domain walls. Over-prediction of forces, especially at low mesh density where the domain walls are close to the foil.

**Fix**: Change `walls` in the U template from `noSlip` to `slip`:
```
walls {
    type            slip;
}
```
And correspondingly remove or change the wall functions for k/omega/nut on the `walls` patch.

#### CRITICAL: No blockMesh Step Actually Runs → [[BlockMesh Bug]]

**Problem**: In `tasks.py` Phase 3, the code runs `snappyHexMesh -overwrite` but **never actually calls `blockMesh`** first. Looking at the command:
```python
["chd", "->", "snappyHexMesh", "-overwrite"]
```
This appears to be a typo/artifact (`chd` is not a valid command, `->` is not valid). The code should be running `blockMesh` followed by `snappyHexMesh`.

**Impact**: Without `blockMesh`, there's no base mesh for `snappyHexMesh` to refine. The simulation may be failing silently or relying on a previously generated mesh in the case directory.

**Fix**: Add explicit `blockMesh` and `surfaceFeatureExtract` steps before `snappyHexMesh`.

#### HIGH: Domain Sizing Too Tight

**Problem**: The domain extends only 2× chord upstream and 4× chord downstream. For RANS simulations, the recommended domain extent is:
- **Upstream**: ≥ 5× chord
- **Downstream**: ≥ 10× chord  
- **Lateral**: ≥ 5× chord from foil surface

The current `max(0.5 * chord, 1.0)` for y-extent (vertical) is far too small.

**Impact**: Blockage effects inflate forces. Results won't match reference data or experimental measurements. A hydrofoil designer will immediately notice unrealistic CL/CD values.

**Fix**: Increase domain multipliers:
```python
domain = {
    "x_min": bounds[0] - max(5.0 * chord_approx, 5.0),
    "x_max": bounds[1] + max(10.0 * chord_approx, 10.0),
    "y_min": bounds[2] - max(5.0 * chord_approx, 5.0),
    "y_max": bounds[3] + max(5.0 * chord_approx, 5.0),
    "z_min": bounds[4] - max(half_span + 2.0, 5.0),
    "z_max": bounds[5] + max(half_span + 2.0, 5.0),
}
```

#### HIGH: Turbulence Reference Length Hardcoded

**Problem**: The turbulence initialization uses `L_ref = 0.1` (hardcoded) for computing omega:
```python
omega_val = math.sqrt(k_val) / (0.09 ** 0.25 * 0.07 * l_ref)
```
This should be based on the actual foil chord length, not a fixed 0.1m constant.

**Impact**: For foils with chord >> 0.1m, omega will be way too high at the inlet, causing initial instability or slow convergence. For micro-foils (chord << 0.1m), omega will be too low.

**Fix**: Set `L_ref = characteristic_len` (the measured chord) in the `initialize_case` method.

#### HIGH: `http_req` Not Imported

**Problem**: In `tasks.py`, the `_run_command` function references `import http_req` which doesn't exist anywhere in the codebase. The main task function uses `requests` for HTTP calls but `_run_command` tries to import a non-existent module. Additionally, `run_hydro_simulation` initialises `resp = http_req.get(...)` on line 71, but the import at the top of the file only imports `requests`.

**Impact**: This appears to be a latent bug. The `_run_command` helper would fail on import. Looking at the code more carefully, the `http_req` usage in `_run_command` may be dead code that never executes.

**Fix**: Replace `http_req` with `requests` throughout, or remove the dead import.

#### MEDIUM: Mesh Density Scaling Weak

**Problem**: The mesh density multiplier affects cell counts linearly (`int(40 * mesh_density)`) but a user sliding mesh_density from 1.0 to 2.0 only doubles cell count in each direction, yielding 8× total cells. The relationship between the slider and actual mesh quality isn't communicated to the user.

Additionally, `maxGlobalCells` in snappyHexMeshDict is capped at 2,000,000 regardless of density — this limits refinement even when the user requests high density.

**Impact**: Users may expect "fine mesh" to dramatically improve results, but the cap prevents it.

**Fix**: Scale `maxGlobalCells` with `mesh_density`:
```python
max_global_cells = int(2_000_000 * mesh_density**2)
```

#### MEDIUM: Gravity Implementation Incomplete

**Problem**: When `enable_gravity = True`, the code writes `constant/g` and `0/p_rgh`, but OpenFOAM's `simpleFoam` doesn't natively use `p_rgh` — that's for `buoyantSimpleFoam` or multiphase solvers. Writing `p_rgh` alongside `p` without switching the solver application is potentially confusing to OpenFOAM.

**Impact**: The gravity toggle may have no actual effect on the simulation. If OpenFOAM ignores the `g` file for `simpleFoam`, the user is given a false sense of control.

**Fix**: Either switch to `buoyantSimpleFoam` when gravity is enabled, or remove the gravity toggle and document that the current solver is single-phase incompressible.

#### MEDIUM: No Mesh Quality Validation

**Problem**: After snappyHexMesh completes, there's no check on mesh quality metrics (non-orthogonality, skewness, aspect ratio). Post-processing proceeds regardless of mesh quality.

**Impact**: A bad mesh produces garbage results that look plausible in the viewport. A designer won't know the mesh was poor unless they inspect logs.

**Fix**: Parse `checkMesh` output and include quality metrics in the results. Warn the user (in the UI and convergence panel) when quality thresholds are exceeded.

#### MEDIUM: Write Interval & purgeWrite Conflict

**Problem**: `controlDict` has `writeInterval = 50`, `purgeWrite = 20`, and `endTime = 1000`. This means OpenFOAM writes every 50 iterations but only keeps the last 20 time directories. With 1000 iterations / 50 = 20 writes, exactly at the limit — any rounding or restart could lose early frames.

The temporal extractor then tries to pick the "last 10 frames", but those frames are just the last 500 iterations, not the full convergence history.

**Impact**: Convergence data from early iterations is lost. The user can't see the full residual history in the viewport.

**Fix**: Either increase `purgeWrite` or reduce `writeInterval`. For a steadystate MVP, writing every 50 iterations with `purgeWrite = 0` (keep all) is safest, or write only the last N with a clear UX indication.

#### LOW: No Free-Surface Modeling

**Problem**: The solver is single-phase `simpleFoam`. There's no air-water interface, no Volume of Fluid (VOF), no free-surface effects. The `submersion_depth` parameter exists in the model but has no effect on the physics — the entire domain is water.

**Impact**: For a hydrofoil operating near the surface, wave drag and ventilation are significant effects. A designer will notice that surface proximity effects are missing.

**Fix**: For MVP, clearly document this limitation in the UI. Future work: switch to `interFoam` or `interIsoFoam` for VOF two-phase simulation.

#### LOW: No Mesh Convergence Study Support

**Problem**: There's no mechanism to run the same geometry at multiple mesh densities and compare results. Mesh independence is fundamental to CFD credibility.

**Impact**: A designer can't verify that results are mesh-independent. They'd have to manually create multiple simulation runs and compare.

**Fix**: Future feature — add a "mesh convergence study" mode that auto-runs 3 density levels and reports the Richardson extrapolation error.

---

## Data Model Assessment

### SimulationRun Model — Field Sprawl → [[God Table Problem]]

The `SimulationRun` model has grown to **50+ fields**. Some concerns:

| Issue | Details |
|-------|---------|
| **Flat structure** | All physics inputs, mesh config, orientation, and results live on one model. This makes the serializer huge and the frontend form complex. |
| **Redundant orientation fields** | `pitch`, `roll`, `yaw` (user input) + `detected_chord_axis`, `detected_span_axis`, `detected_up_axis` (diagnosis) + `geometry_axes_detected` (JSON) + `geometry_dimensions` (JSON). Multiple representations of the same info. |
| **Mixed concerns** | Vehicle config (mass, payload), operating conditions (velocity, AoA), environment (density, wave_height), meshing params, post-processing results, and file paths all on one table. |
| **JSON blobs** | `frame_mapping`, `metrics_series`, `convergence_series`, `file_manifest`, `center_of_gravity`, `geometry_dimensions`, `geometry_axes_detected` are all JSONFields. This makes querying difficult. |

**Recommendation for MVP**: Don't refactor the model now — it works. But consider splitting into `SimulationConfig` (inputs) and `SimulationResults` (outputs) as a next-phase improvement. The current flat model is fine for demo purposes.

### Missing: Run Comparison

A designer's core workflow is comparing multiple configurations. The model has no built-in support for:
- Tagging runs (e.g., "baseline", "5° AoA sweep", "high mesh")
- Grouping runs for comparison
- Delta/diff between two runs

---

## Serializer & API Assessment

### Serializer Bypass Pattern

The `SimulationRunSerializer.update()` method manually copies fields from `self.initial_data`, bypassing DRF's validation pipeline:
```python
if 'status' in self.initial_data:
    instance.status = self.initial_data['status']
```

This means `read_only_fields` are enforced on user-facing creates but not on worker PATCHes. This is **intentional** (the worker needs to write status/logs) but **fragile** — there's no authentication distinguishing user requests from worker requests.

**Risk**: Any client can PATCH a simulation's status to "COMPLETED" and inject fake results. For MVP this is acceptable, but for production you'd need either:
- A separate internal API endpoint for the worker (with a service token)
- Or DRF permission classes that distinguish user vs. worker

### Missing API Features

| Gap | Impact |
|-----|--------|
| **No pagination** | `GET /api/runs/` returns all runs. With many simulations, this becomes slow. |
| **No filtering** | Can't filter runs by status, asset, or date range. |
| **No run cancellation** | Once a Celery task is dispatched, there's no way to cancel it via the API. |
| **No re-run** | Can't re-run a failed simulation without creating a new SimulationRun. |
| **No batch operations** | Can't delete multiple runs, or queue multiple parameter sweeps. |

---

## Dependencies Assessment

### Backend (`requirements.txt`)

```
Django==5.1.7
djangorestframework
celery
redis
django-cors-headers
requests
```

**Issues**:
- Only Django is pinned. All other packages float freely — builds are non-reproducible.
- Missing: `gunicorn` (production WSGI server). The Docker CMD uses `manage.py runserver`.
- Missing: `psycopg2-binary` in requirements.txt (though it's installed in the Dockerfile directly).

### Worker (Dockerfile pip install)

The worker Dockerfile installs packages directly rather than from a requirements.txt:
```dockerfile
RUN pip install celery redis pyvista meshio jinja2 requests trimesh pygltflib Django>=4.2,<5 djangorestframework django-cors-headers
```

**Issues**:
- **Django version mismatch**: Worker installs `Django>=4.2,<5`, but the API uses `Django==5.1.7`. These are incompatible. The worker imports Django models via the ORM, so the Django version mismatch could cause subtle bugs.
- No `requirements.txt` for the worker — package management is embedded in the Dockerfile.
- `numpy` is not explicitly listed but is pulled in by pyvista. Version could vary.
- `vtk` is pulled in by pyvista but version depends on the paraview base image.

**Fix**: Create `simulation_worker/requirements.txt` with pinned versions matching the API's Django version.

---

## Infrastructure Assessment

### Docker Compose

| Issue | Severity | Details |
|-------|----------|---------|
| **API uses `runserver`** | Medium | Development server in production Docker config. Should use gunicorn. |
| **No healthcheck on API** | Medium | Worker can't verify API is up before sending PATCHes. |
| **PostgreSQL unused in dev** | Low | `db` service exists but dev uses SQLite. Migrations may drift. |
| **No resource limits** | Medium | Worker can consume unlimited CPU/RAM. A divergent solve or dense mesh could OOM the host. |
| **`host.docker.internal`** | Medium | Used by worker to reach API. This works on macOS Docker Desktop but breaks on Linux without `extra_hosts` (which is configured, but fragile). |
| **No restart policy** | Low | Services don't auto-restart on crash. |
| **Shared volume bind-mount** | Low | Works for dev, but `/data` on host accumulates simulation files without cleanup. |

### Worker-API Communication

The worker communicates with Django two ways:
1. **Django ORM** (direct DB access via `/backend` volume mount + `DJANGO_SETTINGS_MODULE`)
2. **HTTP API** (PATCH to `host.docker.internal:8000`)

This dual approach is confusing and fragile:
- ORM writes happen for orientation data: `SimulationRun.objects.filter(id=sim_id).update(...)`
- HTTP PATCH happens for status, logs, and final results
- If either path fails, the simulation state is inconsistent

**Recommendation**: Pick one. For MVP, use HTTP-only (remove ORM access from worker). The worker should be a pure HTTP client.

---

## Test Suite Assessment

The test suite is **surprisingly good** for a project at this stage. It covers:

| Suite | Tests | Coverage |
|-------|-------|----------|
| STL normalisation | 7 tests | Orientation, scaling, user rotations, edge cases |
| OpenFOAM coordinates | 7 tests | Velocity decomposition, domain sizing, BCs |
| Post-processing | 7 tests | Cp sign, CL/CD, sections, vorticity, Q-criterion |
| Scene transforms (TS) | 7 tests | Frontend Three.js transforms, camera, euler convention |
| End-to-end | 5 tests | Full pipeline coordinate integrity |

**Gaps**:
- No integration tests that actually run OpenFOAM (all mocked)
- No tests for the API layer (serializer validation, viewset behavior)
- No tests for the Celery task orchestration
- No tests for error paths (divergence, missing STL, bad mesh)
- The `test_scene_transforms.ts` file is present but may not be wired into CI

---

## Detailed Next Steps — Backend MVP Readiness

Prioritised by impact on a real designer's experience:

### Tier 1: Must Fix Before Demo

1. **Fix the `blockMesh` command** — The mesh generation step appears broken. Verify by checking worker logs for a recent simulation. If `blockMesh` isn't running, the entire pipeline is producing garbage. Add explicit `blockMesh` and `surfaceFeatureExtract` steps before `snappyHexMesh`.

2. **Fix wall boundary conditions** — Change `walls` from `noSlip` to `slip` in U, k, omega, nut templates. This is a one-file change in `template_manager.py` that significantly improves force accuracy.

3. **Increase domain size** — Update the domain derivation in `tasks.py` to use 5× upstream / 10× downstream / 5× lateral multipliers. Critical for believable CL/CD values.

4. **Fix the `http_req` import** — Replace with `requests` to prevent runtime crashes.

5. **Pin all dependencies** — Create `simulation_worker/requirements.txt` with exact versions. Fix the Django version mismatch (worker should use Django 5.1.7, not <5).

### Tier 2: Important for Credibility

6. **Add mesh quality checks** — Run `checkMesh` after snappyHexMesh, parse output, and include max non-orthogonality and max skewness in results. Display a warning badge in the UI if quality is poor.

7. **Turbulence L_ref from geometry** — Replace hardcoded `L_ref = 0.1` with actual chord length in `initialize_case()`.

8. **Add `checkMesh` step** — Insert between snappyHexMesh and simpleFoam. Log the results. Fail if mesh quality is extremely bad (non-orthogonality > 85°).

9. **Choose one worker-API communication path** — Remove ORM access from the worker. Use HTTP PATCH exclusively. This simplifies the architecture and removes the need for the `/backend` volume mount.

### Tier 3: Nice-to-Have for MVP

10. **Gravity toggle cleanup** — Either implement `buoyantSimpleFoam` or remove the gravity toggle and document the limitation.

11. **Run cancellation** — Add a Celery `revoke()` endpoint so users can stop long-running simulations.

12. **Result cleanup** — Add a management command or scheduled task to clean up old simulation data in `/data`.

13. **Scale `maxGlobalCells`** — Tie `maxGlobalCells` in snappyHexMeshDict to the mesh density slider.

14. **Add API pagination and filtering** — For when the designer has 50+ simulation runs.

---

## File Index

Key backend files referenced in this audit:

| Reference | Path |
|-----------|------|
| [[simulation_worker-tasks]] | `simulation_worker/tasks.py` |
| [[simulation_worker-geometry]] | `simulation_worker/geometry.py` |
| [[simulation_worker-template_manager]] | `simulation_worker/template_manager.py` |
| [[simulation_worker-postprocess]] | `simulation_worker/services/postprocess.py` |
| [[simulation_worker-temporal]] | `simulation_worker/extractors/temporal.py` |
| [[simulation_worker-config]] | `simulation_worker/config.py` |
| [[simulation_worker-status]] | `simulation_worker/status.py` |
| [[backend-models]] | `backend/api/models.py` |
| [[backend-serializers]] | `backend/api/serializers.py` |
| [[backend-views]] | `backend/api/views.py` |
| [[docker-compose]] | `docker-compose.yml` |

---

*Part 1 of 3. Continue with [[02 - User Journey & UX Audit]] after compacting this conversation.*
