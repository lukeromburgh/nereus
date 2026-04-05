# Nereus Development Guide

## Project Overview

**Nereus** is a browser-based CFD (Computational Fluid Dynamics) platform for simulating and analyzing hydrofoil performance. Users upload 3D geometry, configure flow conditions, and launch OpenFOAM simulations with real-time streaming output and interactive 3D post-processing via a React dashboard.

### Core Features
- Upload and manage 3D hydrofoil geometry (STL/GLB/GLTF/OBJ)
- Configure vehicle parameters, operating conditions, and flow properties
- Real-time simulation monitoring with streamed solver logs
- Interactive 3D visualization with temporal playback
- Convergence charts and aerodynamic performance metrics

---

## Tech Stack

### Frontend (React 19 + TypeScript)
- **Framework**: React 19 via Vite
- **3D Engine**: Three.js (v0.183) + React Three Fiber + Drei
- **State Management**: Zustand (single `useSimStore` atom)
- **Styling**: Tailwind CSS 3 + PostCSS
- **HTTP Client**: Axios
- **Charts**: Recharts (convergence & L/D plots)
- **Icons**: Lucide React
- **Linting**: ESLint 9

### Backend (Django + DRF)
- **API**: Django 5 + Django REST Framework
- **Task Queue**: Celery + Redis broker
- **Database**: SQLite (dev) / PostgreSQL 15 (Docker)
- **CORS**: django-cors-headers
- **Media**: Django MEDIA_URL → `/data/media` volume

### Simulation Worker
- **CFD Solver**: OpenFOAM 11 (blockMesh → snappyHexMesh → simpleFoam)
- **Turbulence**: k-ω SST (RANS)
- **Post-processing**: PyVista
- **Geometry**: Trimesh (format conversion to STL)
- **Templates**: Jinja2 (OpenFOAM dictionary generation)

### Infrastructure
- **Orchestration**: Docker Compose (4 services: `db`, `redis`, `api`, `worker`)
- **Shared Storage**: Docker named volume (`shared_data`) at `/data`

---

## Directory Structure

```
nereus/
├── frontend/                  # React app (Vite + React Three Fiber)
│   ├── src/
│   │   ├── components/        # React UI components
│   │   ├── pages/            # Route pages
│   │   ├── store/            # Zustand state (useSimStore)
│   │   ├── lib/              # Utilities, API clients, helpers
│   │   ├── hooks/            # Custom React hooks
│   │   ├── types/            # TypeScript interfaces
│   │   ├── styles/           # Global styles
│   │   ├── App.tsx           # Root component + router
│   │   └── main.tsx          # Vite entry point
│   ├── public/               # Static assets
│   ├── vite.config.ts        # Vite configuration
│   └── tsconfig.app.json     # TypeScript config
│
├── backend/                   # Django REST API
│   ├── api/
│   │   ├── models.py         # Django ORM models (Project, HydrofoilAsset, SimulationRun)
│   │   ├── serializers.py    # DRF serializers
│   │   ├── views.py          # DRF viewsets
│   │   ├── urls.py           # API routes
│   │   ├── tasks.py          # Celery task definitions
│   │   └── migrations/       # Database migrations
│   ├── nereus_core/
│   │   ├── settings.py       # Django settings
│   │   ├── urls.py           # Root URL config
│   │   ├── wsgi.py          # WSGI app
│   │   └── celery.py        # Celery config
│   ├── media/               # Uploaded files (symlink to /data/media)
│   ├── manage.py           # Django CLI
│   ├── requirements.txt    # Python dependencies
│   └── db.sqlite3         # Development database
│
├── simulation_worker/        # OpenFOAM simulation orchestrator
│   ├── worker.py            # Celery task handler
│   ├── case_setup.py        # OpenFOAM case builder
│   ├── post_processor.py    # PyVista post-processing
│   └── templates/           # Jinja2 OpenFOAM dict templates
│
├── data/                    # Shared Docker volume mount
│   └── media/              # Generated simulation results & uploads
│
├── docker-compose.yml      # Multi-container orchestration
├── readme.md              # Full project documentation
└── claude.md             # This file
```

---

## Data Model

### Core Django Models (backend/api/models.py)
```
Project
├── name, description, created_at, updated_at

HydrofoilAsset
├── project (FK)
├── name, file_path, file_type (STL/OBJ/GLTF/GLB)
├── created_at, updated_at

SimulationRun
├── asset (FK to HydrofoilAsset)
├── status (PENDING/MESHING/RUNNING/COMPLETED/FAILED)
├── vehicle_config (mass, payload, CoG)
├── operating_conditions (velocity, AoA)
├── environment (water density, wave height)
├── meshing (mesh density multiplier)
├── post_processing (slice axis: X/Y/Z)
├── results (logs, mesh_path, frame_map, metrics_series, convergence_series)
├── created_at, updated_at
```

---

## Simulation Pipeline (Worker)

When a `SimulationRun` is created:

1. **Pre-flight** → Validate STL (watertight), convert non-STL → STL, auto-scale if needed
2. **Domain derivation** → PyVista reads bounding box, generates proportional blockMesh domain
3. **Template generation** → Jinja2 renders all OpenFOAM dictionaries from UI parameters
4. **Meshing** → `blockMesh` + `snappyHexMesh`, stream output to Django
5. **Solving** → `simpleFoam` (steady-state RANS), monitor for divergence
6. **Post-processing** → Extract last 10 frames: foil surface STL, pressure contours, streamlines, metrics
7. **Completion** → PATCH all results back to Django; frontend polls and updates

---

## Key Conventions & Patterns

### Frontend
- **State management**: Use `useSimStore(state => state.field)` for accessing Zustand store
- **Component naming**: PascalCase files matching component names (e.g., `Viewport.tsx`)
- **3D scene**: Three.js rendering via React Three Fiber in `<Canvas>` components
- **Styling**: Tailwind CSS utility classes; dark theme defaults (`bg-slate-950`)
- **Type safety**: Always use TypeScript interfaces for props and API responses

### Backend
- **Serializer pattern**: Each model has a corresponding serializer with nested relations
- **Viewset pattern**: Use DRF `ModelViewSet` or `ViewSet` for CRUD operations
- **Task dispatch**: Use Celery tasks for long-running ops (meshing, solving, post-processing)
- **Status tracking**: Simulations follow `PENDING → MESHING → RUNNING → COMPLETED | FAILED` lifecycle
- **Media serving**: Static/media files from `/data` volume (configured in `settings.py`)

### Git Workflow
- **Active branches**:
  - `master` — stable, ready-to-deploy
  - `feature/ui-work` — **current active work** (UI improvements, vtkScene integration)
  - `feature/plumbing` — older branch (1 commit behind)
- **Commit style**: Imperative, descriptive titles; link to feature/bug numbers when relevant
- **PR policy**: Use PRs from feature branches to `master`; require review before merge

---

## Frontend Architecture

### Layout (App.tsx)
The dashboard is a full-screen grid split into:
- **TopNavbar**: Project/simulation selector, controls
- **Sidebar** (272px): Navigation, project tree, simulation queue
- **Viewport** (flex): 3D canvas with React Three Fiber
- **Right Panel** (320px): Graphs, metrics, simulation logs

### 3D Visualization (Viewport Component)
- **Canvas**: React Three Fiber `<Canvas>` with adjustable camera/controls
- **Models**: Loaded via Drei (`useGLTF`, `useSTL`) from results paths
- **Interactivity**: OrbitControls for camera, Gizmo for orientation
- **Mesh visualization**: Foil surface, pressure contours, streamlines rendered as buffered geometries

### State Management (useSimStore)
Single Zustand atom manages:
- Current project & simulation selection
- Viewport camera state
- Layer visibility toggles (foil, pressure, streamlines)
- Playback controls (frame index, animation speed)

### API Integration (lib/api.ts / lib/client.ts)
- Axios instances pre-configured for Django REST endpoints
- Auto-polling for simulation status updates
- Streaming log handlers via WebSocket or chunked HTTP

### Current Work (feature/ui-work)
- VTK scene integration (vtkScene changes)
- Enhanced 3D visualization with better geometry handling
- Improved layer management and overlay system

---

## Backend API Endpoints

All endpoints follow REST conventions under `/api/`:

### Projects
- `GET /api/projects/` — List projects
- `POST /api/projects/` — Create project
- `GET /api/projects/{id}/` — Retrieve project
- `PATCH /api/projects/{id}/` — Update project
- `DELETE /api/projects/{id}/` — Delete project

### HydrofoilAssets
- `GET /api/assets/` — List uploaded geometries
- `POST /api/assets/` — Upload new asset (multipart/form-data)
- `GET /api/assets/{id}/` — Retrieve asset metadata
- `DELETE /api/assets/{id}/` — Delete asset

### SimulationRuns
- `GET /api/simulations/` — List all simulation runs
- `POST /api/simulations/` — Create new simulation run
- `GET /api/simulations/{id}/` — Retrieve simulation details & results
- `PATCH /api/simulations/{id}/` — Update simulation status/logs (used by worker)

---

## Common Development Tasks

### Installing Dependencies

**Frontend**:
```bash
cd frontend
npm install
npm run dev          # Start Vite dev server on :5173
npm run build        # Build for production
npm run lint         # Run ESLint
```

**Backend**:
```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
python manage.py migrate
python manage.py runserver
```

**Docker**:
```bash
docker-compose up -d  # Start all services (api, worker, redis, db)
docker-compose logs -f worker  # Stream worker logs
```

### Database Migrations
```bash
cd backend
python manage.py makemigrations api
python manage.py migrate
```

### Running Tests
```bash
cd backend
python manage.py test api
```

### Debugging a Simulation
1. Check worker logs: `docker-compose logs worker`
2. Inspect simulation status in Django admin: `python manage.py shell`
3. Check `/data` volume for case directories & logs
4. Review OpenFOAM output in simulation run JSON (`logs` field)

### Adding a New Frontend Component
1. Create file in `frontend/src/components/ComponentName.tsx`
2. Define TypeScript interface for props
3. Use Tailwind for styling (avoid inline CSS)
4. Export from component's index if in a subdirectory
5. Import and use in parent component

### Adding a New Backend Endpoint
1. Extend `api/serializers.py` with new serializer if needed
2. Add viewset method to `api/views.py`
3. Register route in `api/urls.py`
4. Update frontend API client in `lib/api.ts`

---

## Important Files & Their Roles

### Frontend Critical Files
- `frontend/src/App.tsx` — Root routing & layout structure
- `frontend/src/store/simulationStore.ts` — Zustand state atom
- `frontend/src/lib/api.ts` — Django REST API client
- `frontend/src/components/Viewport.tsx` — 3D canvas (React Three Fiber)
- `frontend/src/components/RightPanel.tsx` — Metrics & logs display

### Backend Critical Files
- `backend/api/models.py` — ORM model definitions
- `backend/api/views.py` — DRF viewsets
- `backend/api/tasks.py` — Celery task definitions
- `backend/nereus_core/settings.py` — Django configuration
- `backend/nereus_core/urls.py` — Root URL dispatcher

### Worker Critical Files
- `simulation_worker/worker.py` — Celery task execution
- `simulation_worker/case_setup.py` — OpenFOAM case builder
- `simulation_worker/post_processor.py` — PyVista post-processing
- `simulation_worker/templates/` — Jinja2 OpenFOAM dictionaries

---

## Code Style & Standards

### TypeScript / React
- Use strict TypeScript (no `any` unless unavoidable)
- Functional components with hooks preferred
- Export types/interfaces separately for reusability
- Props destructuring in function signatures
- Tailwind classes for styling (no inline `style` props)
- Use React Query / Axios for async data (or Zustand for polls)

### Python / Django
- Follow PEP 8 (flake8 & black)
- Docstrings for all models, viewsets, and public functions
- Use type hints (`from typing import ...`)
- Django ORM over raw SQL (unless performance critical)
- Validate user input at serializer level

### Git Commits
- Imperative mood: "Add feature", "Fix bug", "Update docs"
- First line < 50 chars; detailed explanation in body if needed
- Reference issue numbers: "Fix #123" or "Closes #456"
- Avoid meaningless commits like "wip" or "save state" (squash if needed before PR)

---

## Troubleshooting

### Frontend Build Issues
- Clear `.vite/` cache: `rm -rf frontend/.vite`
- Reinstall node_modules: `rm -rf frontend/node_modules && npm install`
- Check TSC: `npx tsc --noEmit` in `frontend/`

### Backend Errors
- Database locked: Ensure no other Django process running; delete `db.sqlite3` if dev
- Celery not executing tasks: Check Redis running (`docker-compose ps`)
- Import errors: Verify `.venv` activated and `requirements.txt` installed

### 3D Viewport Not Rendering
- Check browser console for Three.js errors
- Verify assets are being loaded from `/data/media/`
- Test with a simple GLTF model first (not STL)
- Confirm WebGL context available (not in headless env)

### Simulation Status Not Updating
- Check worker container alive: `docker-compose ps worker`
- Inspect worker logs: `docker-compose logs -f worker`
- Verify Redis connectivity: `docker exec redis redis-cli ping`
- Check Django logs for API errors: `docker-compose logs -f api`

---

## Deployment Notes

- **Frontend**: Build via `npm run build` → `dist/` folder deployed to static host
- **Backend**: Docker image built from `Dockerfile` in backend, uses `gunicorn` in production
- **Worker**: Same Docker setup, runs `celery -A nereus_core worker -l info`
- **Database**: PostgreSQL 15 in production (Docker service), migrations managed via `manage.py migrate`
- **Media**: Persistent volume `/data/media` shared between `api` and `worker` containers

---

## Active Development (feature/ui-work)

Currently working on:
- **VTK scene integration** (`vtkScene` changes)
- **Enhanced 3D visualization** with improved geometry rendering
- **Overlay layer system** for pressure contours, streamlines, and geometry
- **Temporal playback** controls and frame synchronization

**Branch**: `feature/ui-work` (3 commits ahead of `master`)
**Related commits**:
- `c7aae19` — vtkScene changes
- `bda1b3c` — vtkScene
- `5fca7c0` — Commit changes

When working on this branch, focus on:
1. **No breaking changes**: Keep API backwards compatible
2. **3D context**: Ensure Three.js objects properly initialized before rendering
3. **Performance**: Decimate meshes for browser performance (target < 100k tris per mesh)
4. **Type safety**: Use TypeScript strictly for new components
