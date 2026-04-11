# Next Steps — Nereus Roadmap

> A strategic plan for taking Nereus from a working prototype to a product a design team would trust with confidential hydrofoil geometry.

---

## The Core Problem

Nereus works as a single-user localhost demo. But the goal is to hand this to a team — engineers working on proprietary foil designs where the geometry itself is trade secret. Right now, the app has no concept of "who is using it." Every endpoint is open, every file is plaintext, every record is globally visible, and a single bad API call can destroy the entire dataset. That's the gap between where we are and where we need to be.

This document lays out the work in the order it should be done. Each phase builds on the last.

---

## Phase 1 — Trustworthy Foundation

> Goal: A team member can log in, see only their team's data, and trust that their geometry isn't leaking.

This is non-negotiable before giving the app to anyone outside your own machine.

### 1.1 Authentication & User Accounts

**Why first**: Everything else (authorization, audit trails, team scoping) depends on knowing *who* is making a request. Until auth exists, nothing else can be meaningfully secured.

**What to build**:
- Django `User` model (use the built-in one or extend with `AbstractUser`)
- `Team` / `Organisation` model — users belong to teams
- DRF token or JWT authentication (`djangorestframework-simplejwt`)
- Frontend login/logout flow — protected routes via a `<RequireAuth>` wrapper
- Worker authentication — the worker needs a service account token for PATCHing results back to Django, not anonymous HTTP

**Scope**: ~2-3 days. Most of the Django plumbing is built-in. The frontend login page is simple — the hard part is threading the token through every API call (which also forces you to fix [[Hardcoded API URLs]] as a side effect).

### 1.2 Data Ownership & Isolation

**Why**: Without ownership, auth is just a door with no walls.

**What to build**:
- `owner` FK on `Project` → `User` (or `Team`)
- `Project` scopes everything: a project's assets and simulation runs are only visible to the owning team
- DRF permission class: `IsOwnerOrTeamMember` that filters querysets by `project__team__members`
- Worker results go to the correct project because the `SimulationRun` FK chain already leads to a project — just enforce the permission boundary

**What this fixes**:
- `GET /api/projects/` only returns your team's projects
- `DELETE /api/assets/1/` returns 403 if you don't own it
- `PATCH /api/runs/1/` with fake results → 403 unless you're the worker service account

### 1.3 Secrets & Configuration

**Why**: Hardcoded `SECRET_KEY`, `DEBUG=True`, and `CORS_ALLOW_ALL_ORIGINS` mean that even with auth, the security model has holes.

**What to build**:
- `django-environ` or `python-decouple` for settings from environment variables
- `SECRET_KEY` from env (generate on first deploy, never commit)
- `DEBUG` from env (default `False`)
- `CORS_ALLOWED_ORIGINS` from env (explicit whitelist)
- `ALLOWED_HOSTS` from env
- Frontend: `VITE_API_URL` env var replacing all hardcoded `localhost:8000`

**Scope**: ~half a day. This is mostly search-and-replace + adding a `.env.example` file.

### 1.4 TLS & Reverse Proxy

**Why**: Without TLS, authentication tokens travel in plaintext. On a shared network, anyone can sniff credentials and geometry data.

**What to build**:
- Nginx or Caddy as a reverse proxy in front of Django
- TLS termination (Let's Encrypt or self-signed for internal networks)
- Replace `python manage.py runserver` with `gunicorn` behind nginx
- Secure cookie flags: `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_HTTPONLY`, `CSRF_COOKIE_SECURE`
- Network isolation in Docker Compose: Redis and Postgres on an internal network, only nginx exposed

**Scope**: ~1 day. There are well-documented Nginx + Gunicorn + Docker Compose patterns.

---

## Phase 2 — Physics Correctness

> Goal: When the solver produces results, they are physically meaningful. A designer can trust the lift and drag numbers.

This is where Nereus's credibility as a CFD tool lives. A pretty UI showing wrong numbers is worse than no tool at all.

### 2.1 Fix Critical Solver Bugs

These are existing bugs that produce incorrect results today:

| Bug | Impact | Fix | Details |
|-----|--------|-----|---------|
| [[BlockMesh Bug]] | Mesh may not exist or be stale | Add explicit `blockMesh` step before `snappyHexMesh` | ~30 min |
| [[Walls Boundary Condition Bug]] | Artificial drag from domain boundaries | Change `walls` BC from `noSlip` to `slip` | ~30 min |
| Domain sizing too tight | Poor solution accuracy at far-field | Increase to 5× upstream, 10× downstream, 5× lateral | ~1 hour |
| Hardcoded `L_ref = 0.1` | Wrong turbulence intensity | Calculate from actual chord length | ~30 min |

**Scope**: ~half a day for all four. These are template-level changes in `simulation_worker/template_manager.py`.

### 2.2 Mesh Quality Validation

**Why**: `snappyHexMesh` can produce degenerate cells that cause solver divergence. The user has no visibility into mesh quality.

**What to build**:
- Run `checkMesh` after `snappyHexMesh` and parse the output
- Extract key quality metrics: non-orthogonality, skewness, aspect ratio
- Fail early with a meaningful error if mesh quality is below threshold
- Surface the mesh quality summary in the frontend (a small table in the analysis panel)

### 2.3 Input Validation with Physical Bounds

**Why**: The API accepts any float for velocity, AoA, density, etc. A user can submit `velocity = -5` or `mass = 0` and get meaningless results with no warning.

**What to build**:
- Model-level or serializer-level validators: `velocity > 0`, `0 < water_density < 2000`, `-90 < AoA < 90`, `mass > 0`
- Frontend form validation that mirrors the backend constraints
- Clear error messages: "Velocity must be positive" not "400 Bad Request"

---

## Phase 3 — Operational Reliability

> Goal: The system stays up, recovers from failures, and doesn't silently lose data.

### 3.1 Database Persistence & Backups

**Why**: Postgres has no persistent volume. `docker compose down` destroys the database. The API actually runs SQLite anyway, which can't handle concurrent writes from the polling frontend and the patching worker.

**What to build**:
- Named Docker volume for Postgres data
- Update `settings.py` to actually use Postgres (it's configured in compose but ignored)
- Automated backup script (daily `pg_dump` to a mounted volume or S3)
- Migration on container startup (`python manage.py migrate` in the API entrypoint)

### 3.2 Simulation Resilience

**Why**: A hung `simpleFoam` process blocks the worker indefinitely. A failed simulation leaks gigabytes of mesh data on disk. There's no retry for transient failures.

**What to build**:
- `soft_time_limit` and `time_limit` on the Celery task (e.g., 30 min soft, 35 min hard)
- `subprocess.Popen` timeout per command (prevent hanging mesh or solve steps)
- Cleanup hook: on failure, archive or delete the case directory
- Dead-letter queue for permanently failed tasks
- Worker health check in Docker Compose

### 3.3 Worker–API Communication

**Why**: The worker writes to the database via *two* paths — Django ORM directly (`SimulationRun.objects.filter().update()`) and HTTP PATCH to the API. This dual-write creates consistency risks and bypasses the serializer entirely on the ORM path.

**What to build**:
- Pick one path. ORM is faster but bypasses all API-level validation and auth. HTTP PATCH is cleaner but slower. Recommendation: **use ORM only** (since the worker runs inside the trusted boundary) and remove the HTTP PATCH path.
- If keeping HTTP: add a service account token so the worker authenticates.
- Remove the serializer's `update()` bypass of `read_only_fields` — use a dedicated internal serializer for worker updates.

### 3.4 Monitoring & Observability

**Why**: When a simulation fails or the worker hangs, there's no way to know unless someone checks `docker compose logs`.

**What to build**:
- Structured logging (JSON format) for Django and Celery
- Health check endpoints: `GET /api/health/` (Django + DB + Redis connectivity)
- Celery Flower or a lightweight dashboard for queue monitoring
- Error tracking (Sentry or similar) — catch unhandled exceptions before users report them

---

## Phase 4 — Design Team Workflows

> Goal: The app supports how CFD engineers actually work — iteratively, comparatively, and collaboratively.

This is where Nereus goes from "a tool that runs simulations" to "a tool that accelerates design."

### 4.1 Parameter Sweeps & Batch Runs

**What designers actually do**: They don't run one simulation. They run 20 — sweeping AoA from -5° to 15° in 1° increments, or testing 3 mesh densities × 4 velocities. The current UI requires clicking "Run" 20 times and manually changing one parameter each time.

**What to build**:
- Sweep definition: pick a parameter, set a range and step count
- Batch creation: one click creates N simulation runs
- Queue management: runs execute sequentially or with configurable concurrency
- Summary view: table/chart of all sweep results (e.g., Cl vs AoA polar plot)

### 4.2 Run Comparison & Design History

**What designers actually do**: They compare configurations side-by-side. "Does the modified trailing edge reduce drag at 8 knots?" The current comparison page only handles 2 runs with manual selection.

**What to build**:
- N-run comparison with overlay charts (Cl, Cd, L/D vs. operating condition)
- Configuration diff: show what changed between two runs (highlighted table)
- Run tagging/labeling: "baseline", "v2 trailing edge", "high-mesh validation"
- Design timeline: chronological view of runs per asset with annotations

### 4.3 Report Export

**What designers actually do**: They take CFD results to a design review. They need PDFs, CSVs, screenshots.

**What to build**:
- CSV export of convergence, metrics, and force histories (partially exists in `AnalysisPanel`)
- Screenshot capture of the VTK viewport at current camera angle
- PDF report generation: auto-assembled summary with config, mesh stats, convergence, force breakdown, and viewport screenshots
- Shareable run link (requires auth — viewer gets read-only access to a specific run)

### 4.4 Asset Versioning

**What designers actually do**: They iterate on geometry. Version 1, tweak the leading edge, version 2, adjust the span, version 3. Currently, each upload is a disconnected record.

**What to build**:
- Asset revision chain: uploading a new version of an existing asset creates a linked revision, not a new record
- Visual diff: overlay two geometries in the VTK viewport to see what changed
- Run association: runs link to a specific revision, not just the latest asset

---

## Phase 5 — Production Deployment

> Goal: The app runs in a hosted environment that a team can access without running Docker locally.

### 5.1 Infrastructure

- CI/CD pipeline: GitHub Actions or similar; lint → test → build → deploy
- Container registry: push built images instead of building on the host
- Managed Postgres (RDS, Cloud SQL, or similar) — no more ephemeral containers
- Managed Redis (ElastiCache, Memorystore) — or at minimum, persistent Redis with a password
- S3-compatible object storage for geometry files and simulation results (replace bind-mount)
- DNS + TLS certificate management

### 5.2 Scalability Considerations

- Multiple Celery workers for concurrent simulations (currently 1 worker = 1 sim at a time)
- Worker autoscaling based on queue depth
- Frontend CDN deployment (Vercel, Cloudflare Pages, S3+CloudFront)
- API horizontal scaling behind a load balancer (requires moving session state to Redis)

---

## Execution Order

The phases are sequenced so each one is useful on its own. You don't need to reach Phase 5 to start getting value.

```
Phase 1 (Foundation)      ██████████████░░░░░░░░░░░░  ~1 week
  └─ Auth, ownership, secrets, TLS

Phase 2 (Physics)         ████████░░░░░░░░░░░░░░░░░░  ~2-3 days
  └─ Solver bugs, mesh validation, input bounds

Phase 3 (Reliability)     ████████████░░░░░░░░░░░░░░  ~1 week
  └─ DB persistence, task resilience, monitoring

Phase 4 (Workflows)       ████████████████░░░░░░░░░░  ~2-3 weeks
  └─ Sweeps, comparison, export, versioning

Phase 5 (Deployment)      ████████████████████░░░░░░  ~1-2 weeks
  └─ CI/CD, cloud infra, scaling
```

Phases 1 and 2 can be done in parallel if you have two people — they don't overlap in files.

---

## What Not to Do Yet

Tempting work that should wait:

| Temptation | Why Wait |
|-----------|----------|
| Refactor the [[God Table Problem]] into separate models | The flat model works. Breaking it up before auth is in place means doing a migration twice. |
| Split the [[God Store Problem]] into multiple Zustand stores | Same reasoning — the store works. Auth and API URL centralisation will touch the store anyway; refactor after. |
| Add WebSocket streaming for live solver output | Polling works adequately for MVP. WebSockets add complexity (channels, deployment, reconnection logic) for marginal UX gain at this stage. |
| Build a custom meshing UI (interactive mesh refinement zones) | This is a rabbit hole. The default mesh settings get 80% of designs close enough. Invest here only after the core workflow is solid. |
| Support transient solvers (interFoam, pimpleFoam) | steadyState simpleFoam covers the primary use case. Transient adds enormous complexity (time stepping, VOF, free surface tracking). |

---

## References

- [[00 - Audit Overview]] — Full audit index
- [[Data Flow Walkthrough]] — Trace a request through the system
- [[No Authentication]] — The most critical gap
- [[BlockMesh Bug]] / [[Walls Boundary Condition Bug]] — Physics correctness
- [[Hardcoded API URLs]] — Deployment blocker
- [[God Table Problem]] / [[God Store Problem]] — Technical debt (defer)
