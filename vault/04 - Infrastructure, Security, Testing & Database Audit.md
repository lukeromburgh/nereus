# 04 — Infrastructure, Security, Testing & Database Audit

> Docker architecture, deployment readiness, security posture, test coverage, and schema health.

---

# Part A — Infrastructure & Deployment

## Current Architecture

Four Docker Compose services:

```
┌─────────────────────────────────────────────────────────────┐
│  docker-compose.yml                                         │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │   db      │  │  redis   │  │   api    │  │   worker   │  │
│  │ postgres  │  │ 6-alpine │  │ Django   │  │ OpenFOAM11 │  │
│  │ 15-alpine │  │          │  │ runserver│  │ + Celery    │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│                     ↕              ↕              ↕         │
│                 ┌───────────────────────────────────┐       │
│                 │   ./data  (bind mount to /data)   │       │
│                 └───────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘

Frontend: NOT containerised — runs locally via `npm run dev`
```

### Service Details

| Service | Image | Volume Mounts | Ports | Notes |
|---------|-------|---------------|-------|-------|
| `db` | `postgres:15-alpine` | None (ephemeral!) | None exposed | **No persistent volume** — DB is lost on `docker compose down` |
| `redis` | `redis:6-alpine` | None | 6379:6379 | Healthcheck configured (good) |
| `api` | Build `./backend` | `./backend:/app`, `./data:/data` | 8000:8000 | Uses `runserver` (dev server — not production) |
| `worker` | Build `./simulation_worker` | `./simulation_worker:/app`, `./backend:/backend`, `./data:/data` | None | Sources OpenFOAM bashrc; `platform: linux/amd64` forced |

### What Works

- **Bind-mount sharing** (`./data:/data`) between `api` and `worker` is straightforward — both can read/write simulation files and media without NFS overhead.
- **Redis healthcheck** with `depends_on: condition: service_healthy` means the worker won't start before Redis is ready.
- **Worker platform pinning** (`linux/amd64`) is correct — OpenFOAM 11 Docker images are x86 only. On Apple Silicon, Docker Desktop uses Rosetta emulation.
- **Environment variables** for Celery broker/backend URLs are correctly configured.

### Issues

#### CRITICAL: Database Has No Persistent Volume

```yaml
db:
  image: postgres:15-alpine
  environment:
    POSTGRES_DB: nereus
    POSTGRES_USER: nereus_admin
    POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
  # ← No volumes: section!
```

`docker compose down` destroys the database container and all data. Every run, every project, every asset record — gone. The PostgreSQL data directory is inside the container's ephemeral filesystem.

**Fix**:
```yaml
db:
  image: postgres:15-alpine
  volumes:
    - pgdata:/var/lib/postgresql/data
  environment:
    ...

volumes:
  pgdata:
```

#### CRITICAL: API Runs Django Dev Server in Docker

```yaml
api:
  command: python manage.py runserver 0.0.0.0:8000
```

`runserver` is single-threaded, auto-reloads on code changes, leaks memory, and is explicitly documented as "not suitable for production" by Django. Under concurrent load (e.g., polling + upload + media serving), it will stall.

**Fix**: Use `gunicorn`:
```yaml
api:
  command: gunicorn nereus_core.wsgi:application --bind 0.0.0.0:8000 --workers 4 --timeout 120
```
Add `gunicorn` to `requirements.txt`.

#### CRITICAL: API Uses SQLite in Dev, Postgres in Docker — But Settings Always Use SQLite

`settings.py` hardcodes:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
```

Even though Postgres is running in Docker, the API ignores it. There is no `DATABASE_URL` environment variable, no conditional database backend. The Django `api` container writes to `db.sqlite3` inside `./backend` (bind-mounted), never touching Postgres.

**Impact**: The `db` service exists but is unused. SQLite works for single-user dev but will corrupt under concurrent writes from multiple workers or API processes.

**Fix**: Add database config via environment variable:
```python
import dj_database_url
DATABASES = {
    'default': dj_database_url.config(
        default='sqlite:///db.sqlite3',
        conn_max_age=600,
    )
}
```
And set `DATABASE_URL=postgres://nereus_admin:${DB_PASSWORD}@db:5432/nereus` in the docker-compose `api` environment.

#### HIGH: Worker Communicates to API via `host.docker.internal`

```yaml
worker:
  extra_hosts:
    - "host.docker.internal:host-gateway"
  environment:
    DJANGO_API_URL: http://host.docker.internal:8000/api/runs
```

The worker PATCHes results back to Django via `host.docker.internal`, which:
- Only works on Docker Desktop (macOS/Windows). Does not exist on native Linux Docker.
- Routes through the host network stack, adding latency.
- Breaks if the API port changes or if running behind a reverse proxy.

**Fix**: Use Docker's internal service DNS:
```yaml
DJANGO_API_URL: http://api:8000/api/runs
```
This resolves directly within the Compose network. No `extra_hosts` needed.

#### HIGH: No Reverse Proxy / Static File Server

The Django dev server serves media files directly (via `static()` in `urls.py`, only when `DEBUG=True`). In production:
- No nginx/caddy to serve static assets, media files, or proxy API requests
- No TLS (HTTPS)
- No compression (gzip/brotli)
- Frontend (`npm run dev`) runs Vite's dev server — not a built static bundle

**Fix**: Add an nginx service:
```yaml
nginx:
  image: nginx:alpine
  volumes:
    - ./frontend/dist:/usr/share/nginx/html
    - ./data/media:/data/media
    - ./nginx.conf:/etc/nginx/conf.d/default.conf
  ports:
    - "80:80"
  depends_on:
    - api
```

#### HIGH: No Migrations Run Automatically

The `api` container starts `runserver` immediately. There is no `python manage.py migrate` step. If the database is empty (first run, or after volume loss), the API serves 500 errors because tables don't exist.

**Fix**: Add an entrypoint script:
```bash
#!/bin/sh
python manage.py migrate --noinput
exec "$@"
```

#### MEDIUM: Dockerfile Ignores requirements.txt

The backend Dockerfile:
```dockerfile
RUN pip install Django==5.1.7 djangorestframework celery redis psycopg2-binary django-cors-headers requests
```

It hardcodes package names and pins only Django. The `requirements.txt` file (which has the same packages, also mostly unpinned) is never used. Version drift between local dev and Docker is guaranteed.

**Fix**: `COPY requirements.txt . && pip install -r requirements.txt` — and pin all versions in requirements.txt.

#### MEDIUM: Worker Dockerfile Pins Django 4.x, API Pins Django 5.x → [[Worker Django Version Mismatch]]

```dockerfile
# worker Dockerfile
RUN pip3 install ... "Django>=4.2,<5" djangorestframework ...

# backend Dockerfile  
RUN pip install Django==5.1.7 djangorestframework ...
```

The worker imports Django models from `/backend` (bind-mounted), but installs a different major version of Django. If any Django 5 API is used in models.py, it will crash in the worker at runtime.

**Fix**: Both Dockerfiles should install the same Django version. Better: share a single requirements file.

#### MEDIUM: No Docker Volume for Media

`./data:/data` is a bind mount, not a named volume. This works for dev but means:
- File ownership depends on the host user's UID (may mismatch container UID)
- No backup/snapshot mechanism via Docker
- Files are visible and editable from the host (feature in dev, risk in prod)

#### LOW: No `.dockerignore` Files

Neither `backend/` nor `simulation_worker/` has a `.dockerignore`. Every `COPY . /app/` picks up `__pycache__`, `.pytest_cache`, `db.sqlite3`, `media/` uploads, and `.venv/` — bloating images and potentially leaking data.

#### LOW: Redis Port Exposed to Host

```yaml
redis:
  ports:
    - "6379:6379"
```

Redis is accessible from `localhost:6379` on the host machine — no auth, no ACL. Anyone on the machine can read/write queue data.

**Fix**: Remove the `ports` mapping. Services within Compose can access `redis:6379` internally without exposing to the host.

---

## CI/CD

**Status: None exists.**

No `.github/workflows/`, no `Makefile`, no `Jenkinsfile`, no shell scripts for build/deploy (except `run_coordinate_tests.sh` for the test suite).

### Recommended Minimal CI Pipeline

```yaml
# .github/workflows/ci.yml
jobs:
  backend:
    - pip install -r requirements.txt
    - python manage.py test
    - flake8 / black --check
  
  frontend:
    - npm ci
    - npm run lint
    - npm run build (catches TS errors)
    - npm test (when tests exist)
  
  worker-tests:
    - pytest tests/ -m "not openfoam"
  
  docker:
    - docker compose build (smoke test)
```

---

# Part B — Security Audit

## OWASP Top 10 Assessment

### 1. Broken Access Control — CRITICAL → [[No Authentication]]

**No authentication exists.** Zero auth middleware, no login, no user model in use, no API tokens.

Every endpoint is fully open:
- `DELETE /api/projects/1/` — deletes all data
- `DELETE /api/assets/1/` — deletes any user's geometry
- `PATCH /api/runs/1/` — can overwrite any simulation results
- `GET /api/runs/` — can list all simulations

The serializer's `update()` method explicitly allows the worker to set `status`, `current_logs`, `result_mesh_path`, and many other fields via `self.initial_data` — bypassing DRF's `read_only_fields`. This means **any HTTP client** can PATCH a run to `COMPLETED` with fabricated metrics.

**Severity**: On a shared network, anyone can destroy all data. Single-user localhost is acceptable for personal dev only.

**Fix (MVP)**: Add DRF `IsAuthenticated` permission class + token auth. Even a single hardcoded API key is better than none.

**Fix (proper)**: Add user model, JWT auth (SimpleJWT), and per-project ownership.

### 2. Injection — MEDIUM

#### Template Injection via Jinja2

User-supplied values are interpolated directly into OpenFOAM dictionary templates via Jinja2:
```python
self.write_file("0/U", U_TEMPLATE, {"ux": f"{ux:.6g}", "uz": f"{uz:.6g}"})
```

The template variables (`ux`, `uz`, `k`, `omega`, `loc_x`, etc.) are derived from **numeric fields** that pass through `float()` conversion first. This means Jinja2 template injection is not exploitable — you can't inject `{{ }}` syntax through a float.

However, `center_of_gravity` is a JSONField that passes through as a list:
```python
"cofr_x": cofr[0], "cofr_y": cofr[1], "cofr_z": cofr[2]
```

If `cofr[0]` is a string (JSONField accepts any JSON), it could inject arbitrary text into the OpenFOAM controlDict. This would cause OpenFOAM to crash (not execute arbitrary code), but it's still malformed input reaching a file write.

**Risk**: Low — OpenFOAM is a compiled C++ solver that parses its own dict format. Injecting arbitrary strings causes parse errors, not code execution. But it's still sloppy.

**Fix**: Validate `center_of_gravity` as a list of exactly 3 floats in the serializer.

#### Shell Injection via subprocess

```python
subprocess.Popen(cmd, cwd=case_dir, ...)
```

`cmd` is always a hardcoded list (e.g., `["simpleFoam"]`, `["snappyHexMesh", "-overwrite"]`). User input does not reach `cmd` — it goes through template files only. `shell=False` (the default for `Popen` with a list) means no shell injection vector.

**Assessment**: Not exploitable. The subprocess pattern is safe.

#### `_run_command` Has a Dead Import

```python
def _run_command(cmd, cwd, sim_id, ...):
    import http_req  # ← Module does not exist
```

This import is at function scope. If `_run_command` is ever called, it will raise `ModuleNotFoundError` immediately. The function IS called (for snappyHexMesh and simpleFoam). This means either:
1. The function is being called but the import is after a code path that never reaches it (unlikely — it's line 1 of the function)
2. There's a monkey-patch or module alias happening at runtime
3. The meshing and solving steps silently fail

**This needs investigation** — it may explain simulation failures.

### 3. Cryptographic Failures — HIGH

#### Hardcoded Django SECRET_KEY

```python
SECRET_KEY = 'django-insecure-73+j70=f8yhr!svdjk9l4s#+6znu^(-o@t#7=m$=(0$-r!*7sm'
```

This is the default insecure key from `django-admin startproject`. It's in version control. Anyone with repo access can:
- Forge session cookies
- Forge CSRF tokens
- Tamper with signed cookies

**Fix**: `SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')` with a generated key in `.env` (which is `.gitignore`'d — good, `.env` is empty and gitignored already).

#### Default Postgres Password

```yaml
POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
```

Falls back to `postgres` if `DB_PASSWORD` is unset (it is — `.env` is empty).

### 4. Security Misconfiguration — HIGH

| Setting | Value | Risk |
|---------|-------|------|
| `DEBUG = True` | Always on | Stack traces exposed to any visitor; media serving enabled |
| `CORS_ALLOW_ALL_ORIGINS = True` | All origins | Any website can make API requests to the backend |
| `ALLOWED_HOSTS` | `localhost, 127.0.0.1, api, host.docker.internal` | Correct for dev, but hardcoded |
| `CSRF_COOKIE_SECURE` | Not set (default `False`) | CSRF cookie sent over HTTP |
| Redis | No password, no ACL | Anyone on localhost can access the queue |

### 5. Server-Side Request Forgery (SSRF) — LOW

The worker fetches run config from the Django API:
```python
resp = http_req.get(f"{DJANGO_API_URL}/{sim_id}/")
```

`DJANGO_API_URL` is an environment variable, not user input. `sim_id` is an integer. No SSRF vector.

### 6. File Upload — MEDIUM

| Check | Status |
|-------|--------|
| Extension validation (client) | ✅ `.stl`, `.obj`, `.gltf`, `.glb` only |
| Extension validation (server) | ✅ `FileExtensionValidator` on model field |
| File size limit (client) | ✅ 100 MB |
| File size limit (server) | ✅ 100 MB in serializer `validate_file()` |
| Content-type validation | ❌ Not checked — a `.stl` file could contain anything |
| File content validation | ❌ No binary header check — corrupt/malicious files accepted |
| Filename sanitization | ⚠️ Django's `upload_to` handles path traversal, but the original filename is preserved in `name` field |
| Malicious STL | ❌ No vertex/face count limit — a 100 MB STL with millions of faces will crash PyVista/OpenFOAM |

**Fix**: Add a content validation step in the serializer:
1. Read the first few bytes to verify magic number (STL binary: 80-byte header + face count; ASCII: starts with "solid")
2. Cap face count (e.g., 2M faces max)
3. Reject files that fail `trimesh.load()` at upload time rather than at simulation time

### 7. Vulnerable Dependencies — MEDIUM

`requirements.txt` has **no version pins** except Django:
```
Django==5.1.7
djangorestframework
celery
redis
django-cors-headers
requests
```

`pip install -r requirements.txt` installs the latest version of everything except Django. A breaking change or security vulnerability in any dependency will be silently pulled.

The worker Dockerfile also pip-installs inline with loose version ranges.

**Fix**: Pin all dependencies. Run `pip freeze > requirements.txt` for the current working set, then audit with `pip-audit` or `safety check`.

---

# Part C — Testing Strategy

## Current Test Coverage

### What Exists

| Test File | Tests | Framework | Coverage |
|-----------|-------|-----------|----------|
| `test_stl_normalisation.py` | ~5 tests | pytest | STL orientation (OBB, Euler rotation, centring) |
| `test_openfoam_coordinates.py` | ~5 tests | pytest | Template rendering (velocity decomp, gravity, blockMesh, pressure) |
| `test_postprocess_coordinates.py` | ~3 tests | pytest | Scene centre offset, coordinate preservation |
| `test_end_to_end_coordinates.py` | ~3 tests | pytest | Full pipeline: STL → normalise → submersion → manifest |
| `test_scene_transforms.ts` | ~5 tests | Vitest | Three.js math (group transforms, Euler convention, centering) |

**Total: ~21 tests**, all focused on **coordinate system correctness**. This is a narrow but critical slice — the coordinate pipeline is the most error-prone part of a CFD tool.

### What's Missing

| Area | Current Coverage | Risk if Untested |
|------|-----------------|------------------|
| **Django API (CRUD)** | 0 tests | Schema changes break serialisation silently |
| **Serializer validation** | 0 tests | Bad input accepted, good input rejected |
| **Celery task dispatch** | 0 tests | `perform_create` → `send_task` chain untested |
| **Frontend components** | 0 tests | UI regressions invisible |
| **Frontend utility functions** | 0 tests (except scene transforms) | `coefficients.ts`, `residuals.ts`, `exportCSV.ts` untested |
| **Zustand store** | 0 tests | State transitions (`resetForNewRun`, `updateSim`) untested |
| **OpenFOAM execution** | Marked `@openfoam` — skipped in normal CI | Mesh/solve failures only caught manually |
| **Integration (API → Worker → API)** | 0 tests | The full simulation lifecycle is never tested automatically |

### Test Infrastructure Assessment

**Pytest** (backend/worker):
- `conftest.py` has well-designed fixtures: `make_foil_stl`, `make_fake_forces_dat`, `fake_run`
- `pytest.ini` configures markers and `pythonpath`
- `run_coordinate_tests.sh` runs all 5 test suites sequentially
- No Django test runner integration (no `pytest-django`, no `DJANGO_SETTINGS_MODULE` in pytest.ini for API tests)

**Vitest** (frontend):
- Configured in `vite.config.ts` with glob patterns for `../tests/` and `src/`
- `test_scene_transforms.ts` uses Three.js directly — no DOM, no React component rendering
- No component test utilities (no `@testing-library/react`, no `jsdom` environment configured)

### Recommended Test Plan (Priority Order)

#### Tier 1 — Pure Function Unit Tests (4 hours, high ROI)

These require no mocking, no Docker, no database:

```
Backend / Worker:
- test_coefficients.py → Cl, Cd, Cs computation from forces
- test_residuals_parser.py → Regex parsing of OpenFOAM log lines
- test_forces_parser.py → forces.dat parsing, metrics series building
- test_domain_derivation.py → Bounding box → domain extent calculation
- test_first_layer_thickness.py → y⁺ = 1 flat-plate correlation

Frontend:
- coefficients.test.ts → Cl/Cd/Cs from F/q
- residuals.test.ts → Log line regex, series extraction
- exportCSV.test.ts → CSV string generation
- performanceColor.test.ts → L/D → color class mapping
```

#### Tier 2 — Django API Tests (6 hours, medium ROI)

Requires `pytest-django` and a test database:

```
- test_project_crud.py → Create, list, update, delete projects
- test_asset_crud.py → Upload, rename, move, delete assets
- test_asset_validation.py → File extension, size, empty file rejection
- test_folder_crud.py → Create, nest, move (circular ref check), delete cascade
- test_run_creation.py → POST /api/runs/ triggers Celery task dispatch (mock Celery)
- test_run_analysis.py → GET /api/runs/{id}/analysis/ returns correct payload shape
- test_serializer_update.py → Worker PATCH updates status, logs, metrics correctly
```

#### Tier 3 — Store & Hook Tests (4 hours, medium ROI)

```
Frontend:
- useSimStore.test.ts → resetForNewRun clears state, startNewSim sets PENDING, updateSim maps fields
- useAssetStore.test.ts → loadTree, rename, move, delete actions
- useRunSimulation.test.ts → POST payload shape, error handling
```

#### Tier 4 — Integration Tests (8 hours, high ROI but high effort)

```
- test_sim_lifecycle.py → API create run → mock worker response → API returns COMPLETED
- test_file_pipeline.py → Upload STL → asset saved → run created → file copied to case dir
- test_comparison.py → Two completed runs → comparison metrics calculated correctly
```

---

# Part D — Database & Migration Health

## Schema Overview

3 tables + 13 migrations over 25 days (Mar 17 → Apr 11):

| Model | Fields | Migrations | Notes |
|-------|--------|-----------|-------|
| `Project` | 4 | 0001 | Minimal — name, description, timestamps |
| `Folder` | 5 + FK | 0013 | Added late (Apr 2); hierarchical via self-FK |
| `HydrofoilAsset` | 5 + 2 FK | 0001, 0013 | File upload, folder assignment |
| `SimulationRun` | **40+ fields** | 0001–0013 (12 migrations) | Massive — everything from config to results to diagnostics |

### SimulationRun Field Growth

```
Migration  Fields Added                                          Running Total
─────────  ───────────────────────────────────────────────────   ─────────────
0001       mass, payload, cog, velocity, aoa, density, wave,     ~15
           status, logs, result_mesh_path, asset, project
0002       mesh_density                                          16
0003       result_sequence_path, frame_mapping,                  20
           metrics_series, convergence_series
0004       slice_axis                                            21
0005       submersion_depth                                      22
0006       enable_layers, n_surface_layers, layer_expansion,     26
           feature_level
0007       enable_gravity                                        27
0008       pitch_moment, roll_moment, yaw_moment                 30
0009       wall_yplus_max, wall_yplus_mean                       32
0010       cl, cd, l_d_ratio, cm_pitch, cavitation_risk,         41
           sigma, cavitation_onset_x_over_c,
           cavitating_surface_fraction, vortex_decay_rate,
           omega_0, x_over_c_10pct_decay, file_manifest
0011       pitch, roll, yaw, geometry_axes_detected,             46
           geometry_dimensions
0012       orientation_preview_url                               47
0013       Folder model + asset.folder FK                        47 + Folder
```

### Issues

#### HIGH: SimulationRun is a God Table

47 fields on one table mixing 5 concerns:

1. **Input config** (velocity, aoa, density, mesh_density, etc.) — 15+ fields
2. **Lifecycle tracking** (status, logs) — 2 fields
3. **Result paths** (result_mesh_path, result_sequence_path) — 2 fields
4. **Computed metrics** (cl, cd, l_d_ratio, forces, moments, y+, cavitation) — 15+ fields
5. **Geometry diagnostics** (pitch, roll, yaw, detected axes, preview URL) — 8+ fields
6. **Temporal series** (frame_mapping, metrics_series, convergence_series) — 3 JSONFields

**Problems**:
- Every serializer response sends all 47 fields (via `fields = '__all__'`) even when the client only needs status
- JSONFields (`frame_mapping`, `metrics_series`, `convergence_series`) can be multi-MB — they're loaded on every status poll
- Adding a new metric requires a migration — even though it's a nullable float

**Recommendation**: Normalise into related tables:
```
SimulationRun (lifecycle only: id, project, asset, status, created_at, updated_at)
  ├── RunConfig (FK) — velocity, aoa, density, mesh_density, orientation, etc.
  ├── RunResults (FK) — cl, cd, l_d, moments, yplus, cavitation, file_manifest
  └── RunTimeSeries (FK) — frame_mapping, metrics_series, convergence_series
```

This lets the polling endpoint return only `{id, status, logs}` without loading MB of JSON.

#### HIGH: No Database Indexes

No model has `db_index=True` on any field, `Meta.indexes`, or `unique_together` constraints beyond the implicit primary key.

Queries that will be slow as data grows:
- `SimulationRun.objects.filter(project_id=X)` — no index on `project_id` FK (Django creates one by default for ForeignKey, so this is actually OK)
- `SimulationRun.objects.filter(status='RUNNING')` — no index on `status`
- `Folder.objects.filter(project_id=X, parent__isnull=True)` — compound query, no compound index
- `HydrofoilAsset.objects.filter(project_id=X, folder__isnull=True)` — same

**Correction**: Django does auto-create indexes on ForeignKey columns. The missing indexes are on `status` (filtered frequently) and compound indexes for common query patterns.

**Fix**: Add to SimulationRun's Meta:
```python
class Meta:
    indexes = [
        models.Index(fields=['project', 'status']),
        models.Index(fields=['asset', 'status']),
    ]
```

#### MEDIUM: 13 Migrations in 25 Days — Should Squash Before Release

12 of the 13 migrations are `AddField` on `SimulationRun`, each adding 1–9 nullable fields. This is fine during rapid development but should be squashed before any release:

```bash
python manage.py squashmigrations api 0001 0013
```

This produces a single migration that creates the final schema, avoiding the 13-step chain on fresh databases.

#### MEDIUM: SQLite ↔ Postgres Divergence

Development uses SQLite. Docker has Postgres running but unused (as noted in Infrastructure). Key behavioural differences:

| Behaviour | SQLite | Postgres |
|-----------|--------|----------|
| `JSONField` | Text blob (no query operators) | Native JSONB (supports `__contains`, `__has_key`) |
| Concurrent writes | Global lock — blocks | Row-level locking — fine |
| `LIKE` case sensitivity | Case-insensitive by default | Case-sensitive |
| `DISTINCT ON` | Not supported | Supported |
| Max connections | 1 writer at a time | Configurable |

If the worker uses `SimulationRun.objects.filter(id=sim_id).update(...)` while the API is also writing, SQLite will occasionally raise `OperationalError: database is locked`.

**Fix**: Use Postgres for all environments, even local dev (via Docker Compose or local install).

#### MEDIUM: JSONField Schema Drift

Three JSONFields store structured data with no schema validation:

| Field | Expected Shape | Validated? |
|-------|---------------|-----------|
| `center_of_gravity` | `[x, y, z]` (3 floats) | ❌ No — accepts any JSON |
| `frame_mapping` | `[{frame_index, time_value, mesh_path, metrics: {Fx, Fy, Fz, ld_ratio}}]` | ❌ No |
| `metrics_series` | `[{frame_index, time_value, Fx, Fy, Fz, ld_ratio}]` | ❌ No |
| `convergence_series` | `[{iteration, time, residual}]` | ❌ No |
| `file_manifest` | `{string: string}` | ❌ No |
| `geometry_dimensions` | `{chord_m, span_m, thickness_m}` | ❌ No |
| `geometry_axes_detected` | `{detected_chord_axis, detected_span_axis, detected_up_axis}` | ❌ No |

The worker can write any shape into these fields. A bug in post-processing can silently store `{"error": "something broke"}` in `frame_mapping`, and the frontend will crash trying to iterate frames.

**Fix**: Add JSON schema validation in the serializer for each JSONField, or use pydantic models for structured validation before save.

#### LOW: `wave_height` Field is Required but Unused

`SimulationRun.wave_height` is a `FloatField` (not null, no default). It's required on creation but never read by the worker — free surface effects aren't implemented (simpleFoam is single-phase, no VOF).

**Fix**: Either add `default=0.0` and `blank=True` (since it's unused), or remove the field entirely until free-surface simulation is implemented.

#### LOW: Model Fields Not on the Model

The worker writes fields directly via ORM:
```python
run_obj.detected_chord_axis = norm_info['axes'].get('detected_chord_axis')
run_obj.chord_m = norm_info['dimensions'].get('chord_m')
```

But `detected_chord_axis`, `chord_m`, `span_m`, `thickness_m` don't appear in `models.py`. These are likely set on the model instance but never saved because `update_fields` lists them explicitly. If the fields don't exist on the model, `save(update_fields=[...])` will raise `ValueError`.

**This needs investigation** — it may be causing silent failures during orientation processing.

---

## Priority Summary — All Four Areas

### P0 — Must Fix (blocks any real deployment)

| # | Area | Issue | Effort |
|---|------|-------|--------|
| 1 | Infra | Add persistent volume for Postgres | 5 min |
| 2 | Infra | Switch Django settings to use Postgres via `DATABASE_URL` | 30 min |
| 3 | Infra | Replace `runserver` with `gunicorn` | 15 min |
| 4 | Infra | Auto-run `migrate` on container start | 15 min |
| 5 | Security | Move `SECRET_KEY` to environment variable | 10 min |
| 6 | Security | Set `DEBUG = False` for production | 10 min |
| 7 | Security | Restrict `CORS_ALLOW_ALL_ORIGINS` | 10 min |
| 8 | Infra | Change worker API URL from `host.docker.internal` to `api` | 5 min |

### P1 — High Value

| # | Area | Issue | Effort |
|---|------|-------|--------|
| 9 | Infra | Add nginx reverse proxy (TLS, static, media) | 2 hours |
| 10 | Infra | Pin all Python dependency versions | 30 min |
| 11 | Infra | Unify Django version across api + worker Dockerfiles | 15 min |
| 12 | Security | Add basic API authentication (token or API key) | 2 hours |
| 13 | Security | Validate file content on upload (magic bytes + trimesh parse) | 2 hours |
| 14 | Testing | Add pure function unit tests (Tier 1) | 4 hours |
| 15 | Database | Squash migrations before release | 15 min |
| 16 | Database | Add index on `(project, status)` | 10 min |

### P2 — Medium Value

| # | Area | Issue | Effort |
|---|------|-------|--------|
| 17 | Infra | Add `.dockerignore` files | 15 min |
| 18 | Infra | Remove Redis port exposure | 5 min |
| 19 | Infra | Add CI pipeline (GitHub Actions) | 2 hours |
| 20 | Security | Validate JSONField schemas in serializer | 2 hours |
| 21 | Testing | Add Django API tests (Tier 2) | 6 hours |
| 22 | Testing | Add Zustand store tests (Tier 3) | 4 hours |
| 23 | Database | Normalise SimulationRun into related tables | 4 hours |
| 24 | Database | Make `wave_height` optional or remove | 10 min |

---

## Relationship to Other Sections

- API URL hardcoding and `host.docker.internal` fragility: [[01 - Backend Audit]], [[02 - User Journey & UX Audit]]
- Django `SECRET_KEY` and `DEBUG` settings affect all endpoints: [[01 - Backend Audit]]
- File upload validation gaps noted in UX: [[02 - User Journey & UX Audit]] Journey 1 Step 2
- Frontend `http://localhost:8000` hardcoding depends on infrastructure choices: [[03 - Frontend & UI Audit]]
- `_run_command` dead import (`http_req`) noted here and in: [[01 - Backend Audit]]
