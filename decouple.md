# Nereus Django + Worker Decoupling Architecture

---

## **EXECUTIVE SUMMARY**

The Nereus system exhibits **five critical coupling points** between the Django monolith and the Dockerized worker:
1. Worker bootstraps Django ORM at module level
2. OpenFOAM template logic baked into Python code
3. Views handle both file I/O and task dispatch
4. Direct HTTP PATCH back to API (no abstraction layer)
5. File lifecycle ownership is unclear

**Goal**: Decouple into **independent, testable domains** using a Service Layer → Domain Models → Repository Pattern → Event Adapter architecture.

---

## **PHASE 0: PREREQUISITE - SHARED MESSAGE SCHEMA PACKAGE**

### **Critical First Step: Break Message Duplication**

**Problem**: Versions of Pydantic models will diverge between Django and Worker if they both maintain copies.

**Solution**: Create a standalone `nereus-schema` Python package that is versioned and installed as a dependency:

```
nereus-schema/
├── setup.py                    # Version: 1.0.0
├── nereus_schema/
│   ├── __init__.py
│   ├── messages.py             # SimulationJobMessage, SimulationResultMessage
│   ├── enums.py                # Status choices, solver types
│   └── validators.py           # Pydantic validators
```

**Installation**:
```bash
# backend/requirements.txt
nereus-schema==1.0.0

# simulation_worker/requirements.txt
nereus-schema==1.0.0
```

**This ensures**:
- Single source of truth for message contracts
- Version pinning prevents "drift" between components
- Can be published to PyPI for multi-org use
- Clear semantic versioning (breaking changes = major version bump)

**Note**: The Worker should ONLY import `nereus_schema.messages`; nothing else from Django.

---

## **PHASE 1: COMPONENT IDENTIFICATION & DOMAIN MAPPING**

### **Current Monolithic Responsibilities**

| Responsibility | Current Location | Issue |
|---|---|---|
| **Simulation Lifecycle** | Django ORM + Celery tasks | Mixed concerns (state, dispatch, worker) |
| **OpenFOAM Dict Generation** | `template_manager.py` | Jinja2 + hardcoded physics logic |
| **Geometry Conversion** | Worker `_ensure_foil_stl()` | Trimesh logic in task code |
| **File Orchestration** | Views + Worker | No clear ownership; manual copying |
| **Solver Execution** | Worker `tasks.py` | CPU-intensive; risk of I/O bottlenecks |
| **Post-Processing** | Worker `post_processor.py` | RAM/GPU-intensive; couples to solver; single point of failure |
| **Status Synchronization** | HTTP PATCH + Celery | Brittle polling + no events |
| **Serialization** | DRF Serializers | Tightly bound to Django models |

### **Proposed Domain Decomposition**

#### **Domain 1: Simulation Management** (Django API)
**Responsibility**: Orchestration, state persistence, API contracts
**New Components**:
- `SimulationService` — High-level simulation orchestration
- `SimulationRepository` — Query/persist SimulationRun (via Django ORM) — **DJANGO ONLY**
- `SimulationDTO` — Data Transfer Object (JSON-serializable contract)

**Stays in Django**: HTTP endpoint routing, authentication, rate-limiting, database writes

#### **Domain 2: Solver Worker** (Environment-Agnostic Executor)
**Responsibility**: Execute simulation (preflight → mesh → solve), **NO database writes**
**New Components**:
- `WorkerMessageHandler` — Parse incoming `nereus_schema.SimulationJobMessage` (JSON only)
- `SimulationExecutor` — Orchestrate preflight → mesh → solve → emit event
- `ResultEmitter` — Emit `simulation.solver_completed` event to message queue

**Decoupled from Django**:
- ✅ No ORM import, no Django imports at all
- ✅ Receives DTO via message queue only
- ✅ No HTTP calls back to API
- ✅ Outputs results to local scratch space + object storage

#### **Domain 2b: Post-Processing Worker** (Separate, Async Service)
**Responsibility**: Extract VTK/ParaView assets **after** solver completes
**New Components**:
- `PostProcessorMessageHandler` — Listen for `simulation.solver_completed` events
- `VTKPostProcessorPipeline` — PyVista-based extraction (CPU/RAM/GPU intensive)
- `AssetPublisher` — Publish `simulation.assets_ready` event

**Decoupled**:
- ✅ Runs in separate worker pool (can be different container/node)
- ✅ Crash in visualization doesn't re-trigger solver
- ✅ Can be scaled independently (many solvers, few viz workers)
- ✅ No Django knowledge required

#### **Domain 3: OpenFOAM Configuration** (Versioned Templates)
**Responsibility**: Generate and version OpenFOAM dictionaries
**New Components**:
- `OpenFOAMConfigBuilder` — Factory for dict generation (Jinja2 templates in separate files)
- `PhysicsCalculator` — Compute turbulence properties, domain bounds, mesh params
- `ConfigValidator` — Ensure generated dicts are valid

**Versioning**: Store templates in `simulation_worker/templates/openfoam/{solver_version}/` directory

#### **Domain 4: Geometry & Mesh** (Format-Agnostic)
**Responsibility**: Convert, validate, orient geometry
**New Components**:
- `GeometryLoader` — Load STL/OBJ/GLTF/GLB → unified in-memory format
- `GeometryNormalizer` — Orientation, scaling, watertight validation
- `MeshBuilder` — Wrap blockMesh + snappyHexMesh calls

**Decoupled**: No dependency on Django; can be tested with file fixtures

#### **Domain 5: Object Storage Adapter** (S3/MinIO)
**Responsibility**: Persist simulation results to object storage
**New Components**:
- `ObjectStorageClient` — S3/MinIO upload abstraction
- `AssetRegistry` — JSON manifest of uploaded assets with URLs
- `LocalScratchManager` — Manage local `/tmp` disk + safe cleanup

**Decoupled**:
- ✅ Worker treats local disk as ephemeral
- ✅ Results pushed to S3/MinIO after completion
- ✅ Scales to multi-node deployments (ECS, Kubernetes)

#### **Domain 6: Message Bridge** (Event-Driven Communication)
**Responsibility**: Mediate all Django ↔ Worker communication
**New Components**:
- Message schema (in `nereus-schema` package)
- `IEventBroker` interface — Publish/subscribe abstraction (Celery/RabbitMQ/Redis/Webhook)
- `CeleryEventBroker` — Celery implementation
- `RabbitMQEventBroker` — RabbitMQ implementation (for future multi-region)

**Pattern**: Adapter + Facade to hide transport details; **no HTTP calls from Worker**

---

## **PHASE 2: DECOUPLING STRATEGY & PATTERNS**

### **2.1 Service Layer Pattern**

**Before** (tightly coupled):
```python
# views.py
def perform_create(self, serializer):
    instance = serializer.save(status='PENDING')
    # File copying baked into view
    shutil.copy2(source_path, dest_path)
    # Task dispatch baked into view
    run_hydro_simulation.delay(instance.id)
```

**After** (service layer isolation):
```python
# views.py
def perform_create(self, serializer):
    instance = serializer.save()
    service = SimulationService(repo=SimulationRepository())
    service.request_simulation(sim_id=instance.id, config=instance.config_dict())
    # View doesn't care about files, tasks, or async details

# services.py (NEW)
class SimulationService:
    def __init__(self, repo, job_publisher):
        self.repo = repo
        self.publisher = job_publisher

    def request_simulation(self, sim_id, config):
        # 1. Validate config (physics, geometry constraints)
        # 2. Stage geometry (file management)
        # 3. Publish job message (abstraction over Celery/RabbitMQ/HTTP)
        # 4. Update status to MESHING
        job_msg = SimulationJobMessage(
            sim_id=sim_id,
            geometry_path=config['geometry_path'],
            physics=config['physics'],
        )
        self.publisher.publish('simulation.requested', job_msg)
```

### **2.2 ⚠️ Anti-Pattern: Eliminating "Zombie" Repository Dependency**

**CRITICAL**: The Worker should **NEVER** import or use any Repository implementation (even if abstracted).

**Incorrect Approach** (Zombie Dependency):
```python
# ❌ WRONG — Worker still imports Django infrastructure
from api.repositories import DjangoSimulationRepository  # <- Still tight coupling!

def worker_task(job_msg):
    repo = DjangoSimulationRepository()  # Requires django.setup(), DB connection
    run = repo.get_by_id(job_msg.sim_id)  # Fails if DB unreachable
    # ... execution ...
    repo.update_status(job_msg.sim_id, 'COMPLETED')  # Blocking I/O to Django
```

**Why this fails at scale**:
- Worker container needs `django.setup()` at startup → requires settings.py, DB client libraries
- If database is down/slow, entire worker cluster stalls
- Can't move worker to lightweight HPC container (no Python stack)
- Creates a "single point of failure" between compute and database

**Correct Approach** (Environment-Agnostic):
```python
# ✅ CORRECT — Worker receives DTO via message, outputs via event broker
# NO repository import; NO Django imports; NO database access

from nereus_schema.messages import SimulationJobMessage, SimulationResultMessage

def worker_task(job_json: str, event_broker):
    """
    Receives: JSON message (serialized SimulationJobMessage)
    Output: Event to message broker (no blocking database writes)
    """
    job = SimulationJobMessage.model_validate_json(job_json)

    # job contains all needed state: sim_id, geometry_path, config
    # Worker is completely stateless; never queries database

    try:
        # ... execution (preflight, mesh, solve) ...
        result = SimulationResultMessage(
            sim_id=job.sim_id,
            status='SOLVER_COMPLETED',
            logs=openfoam_logs,
            case_dir=case_dir,
        )
    except Exception as e:
        result = SimulationResultMessage(
            sim_id=job.sim_id,
            status='FAILED',
            error_log=str(e),
        )

    # Emit event (async, non-blocking)
    event_broker.publish('simulation.solver_completed', result.model_dump_json())

    # Worker exits; Django listener picks up the event and updates database
```

**Repository Pattern stays in Django only**:
```python
# backend/api/repositories.py (DJANGO ONLY)
class ISimulationRepository(ABC):
    @abstractmethod
    def get_by_id(self, sim_id: int) -> SimulationDTO: pass

    @abstractmethod
    def update_status(self, sim_id: int, status: str) -> None: pass

    @abstractmethod
    def update_results(self, sim_id: int, result: SimulationResultMessage) -> None: pass

class DjangoSimulationRepository(ISimulationRepository):
    """Thin ORM wrapper; only used by Django services."""
    def get_by_id(self, sim_id):
        return SimulationDTO.from_model(SimulationRun.objects.get(id=sim_id))

    def update_status(self, sim_id, status):
        SimulationRun.objects.filter(id=sim_id).update(status=status)

    def update_results(self, sim_id, result):
        SimulationRun.objects.filter(id=sim_id).update(
            status=result.status,
            current_logs=result.logs[-500:],  # Last 500 chars
            # ... populate other fields from result ...
        )

# backend/api/tasks.py (DJANGO LISTENER)
@shared_task(name='tasks.handle_worker_result')
def handle_worker_result(result_json):
    """Triggered by event broker when worker emits 'simulation.solver_completed'."""
    result = SimulationResultMessage.model_validate_json(result_json)
    repo = DjangoSimulationRepository()
    repo.update_results(result.sim_id, result)
```

**Key Principles**:
1. **Worker receives data via message** (job object)
2. **Worker outputs data via event** (result object)
3. **Worker never reads or writes database**
4. **Worker never imports Django**
5. **Django listener consumes events and updates database**
6. This pattern scales to multi-node, multi-region, different compute stacks

### **2.3 Factory Pattern (OpenFOAM Config)**

**Before** (hardcoded physics in template):
```python
# template_manager.py — can't reuse for different solvers
ti = 0.05  # hardcoded turbulence intensity
k_val = 1.5 * (ti * u_mag) ** 2  # hardcoded formula
```

**After** (pluggable physics calculator):
```python
# physics_calculator.py (NEW)
class PhysicsCalculator(ABC):
    def compute_inlet_turbulence(self, velocity: float) -> dict: pass

class KOmegaSSTCalculator(PhysicsCalculator):
    def __init__(self, ti=0.05, l_ref=0.1):
        self.ti = ti
        self.l_ref = l_ref

    def compute_inlet_turbulence(self, velocity):
        return {'k': 1.5 * (self.ti * velocity)**2, 'omega': ...}

# template_manager.py (REFACTORED)
class OpenFOAMConfigBuilder:
    def __init__(self, solver_version='kOmegaSST', physics_calc=None):
        self.solver = solver_version
        self.physics = physics_calc or KOmegaSSTCalculator()

    def build_case(self, config):
        # Load template from file, inject computed physics
        return render_template('controlDict.j2',
                               physics=self.physics.compute_inlet_turbulence(...),
                               ...)
```

### **2.4 Dependency Injection (Worker Decoupling)**

**Before** (hard-wired Django import):
```python
# tasks.py — can't run outside Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nereus_core.settings')
import django
django.setup()
from api.models import SimulationRun  # <- tight coupling
```

**After** (injected repository):
```python
# tasks.py (REFACTORED)
@app.task(name='tasks.run_simulation')
def run_simulation(job_json: str):
    # Parse message (no ORM needed yet)
    job = json.loads(job_json)

    # Dependency injection via env/config
    repo = get_repository(job['repo_type'])  # e.g., 'django', 'mock', 'postgres'
    executor = SimulationExecutor(repo=repo)
    result = executor.run(job)

    # Publish result (abstracted)
    publisher.publish('simulation.completed', result)

def get_repository(repo_type):
    if repo_type == 'django':
        return DjangoSimulationRepository()  # Only imported if needed
    elif repo_type == 'mock':
        return MockSimulationRepository()
```

### **2.5 Adapter Pattern (Message Bridge — No HTTP from Worker)**

**CRITICAL**: The Worker must NEVER make HTTP calls back to Django. All communication is event-driven.

**Incorrect Approach** (❌ Zombie HTTP):
```python
# ❌ WRONG — Worker polls API or makes HTTP PATCH requests
import requests
def patch_django_status(sim_id, status):
    requests.patch(f"http://django-api:8000/api/runs/{sim_id}/",
                   json={'status': status})
    # Blocking; fails if API down; requires network config in worker container
```

**Correct Approach** (✅ Event Broker):
```python
# ✅ CORRECT — Worker emits events to message broker; Django listens

from abc import ABC, abstractmethod
import json as json_lib

class IEventBroker(ABC):
    @abstractmethod
    def publish(self, event_type: str, payload: str) -> None:
        """Emit event asynchronously; never blocks."""
        pass

    @abstractmethod
    def subscribe(self, event_type: str, handler_fn) -> None:
        """Listen for events (Django side only)."""
        pass

class CeleryEventBroker(IEventBroker):
    """Using Celery + Redis for backward compatibility."""
    def __init__(self, celery_app, redis_conn):
        self.app = celery_app
        self.redis = redis_conn

    def publish(self, event_type, payload):
        # Push to Redis as a background job (non-blocking)
        self.redis.lpush(f'event:{event_type}', payload)
        # Trigger listener via Celery
        process_event.delay(event_type, payload)

    def subscribe(self, event_type, handler_fn):
        # Registered in Django task handlers
        @self.app.task(name=f'tasks.handle_{event_type}')
        def _handler(payload_json):
            handler_fn(payload_json)

class RabbitMQEventBroker(IEventBroker):
    """For future multi-region deployments."""
    def __init__(self, amqp_url):
        self.connection = pika.BlockingConnection(pika.URLParameters(amqp_url))
        self.channel = self.connection.channel()

    def publish(self, event_type, payload):
        self.channel.basic_publish(
            exchange='nereus.events',
            routing_key=event_type,
            body=payload.encode(),
            properties=pika.BasicProperties(delivery_mode=2),
        )

# Worker (simulation_worker/tasks.py)
def run_simulation(job_json: str, event_broker: IEventBroker):
    """Worker receives DTO, emits event. NO HTTP calls."""
    job = SimulationJobMessage.model_validate_json(job_json)

    try:
        # ... preflight, mesh, solve ...
        result = SimulationResultMessage(
            sim_id=job.sim_id,
            status='SOLVER_COMPLETED',
            case_dir=case_dir,
        )
        status_code = 'success'
    except Exception as e:
        result = SimulationResultMessage(
            sim_id=job.sim_id,
            status='FAILED',
            error_log=str(e),
        )
        status_code = 'error'

    # Emit event (non-blocking; broker handles delivery)
    event_broker.publish(
        'simulation.solver_completed',
        result.model_dump_json(),
    )
    return status_code

# Django listener (backend/api/tasks.py)
@shared_task(name='tasks.handle_simulation_completed')
def handle_simulation_completed(result_json):
    """Django reacts to worker result event."""
    result = SimulationResultMessage.model_validate_json(result_json)
    repo = DjangoSimulationRepository()
    repo.update_results(result.sim_id, result)
```

**Key Differences**:
- Worker publishes → Event Broker (async, fire-and-forget)
- Django subscribes → Event Broker (passive listener)
- No polling; no blocking HTTP; no REST coupling
- Event broker can be Celery, RabbitMQ, Redis Streams, Kafka, etc.

### **2.6 Environment Agnosticism Checklist**

**Worker must satisfy ALL of these**:

| Criterion | Check |
|---|---|
| No `import django` | ✅ Never at module level or runtime |
| No `os.environ['DJANGO_SETTINGS_MODULE']` | ✅ Settings injected via env vars or config file |
| No `from api.models import ...` | ✅ Never import Django models |
| No `from api.repositories import ...` | ✅ Never import Django infrastructure |
| No HTTP PATCH/POST back to Django API | ✅ Only event broker publish calls |
| Input is JSON message (DTO) | ✅ Receives `SimulationJobMessage` as string |
| Output is event (DTO) + files | ✅ Emits `SimulationResultMessage` + /results/ files |
| Can run in different Python env | ✅ works with Python 3.10, 3.11, 3.12 |
| Can run without database access | ✅ No SQL queries, only local I/O + object storage |
| Worker testable without Docker | ✅ Unit tests with mocked event broker, fixture files |

**Verification**:
```bash
# In worker container, verify no Django imports
python -c "import simulation_worker.tasks; import sys; [print(m) for m in sys.modules if 'django' in m.lower()]"
# Should output: [empty list]
```

---

## **PHASE 3: COMMUNICATION BRIDGE & EVENT-DRIVEN DATA FLOW**

### **3.1 Message Contracts (Versioned in nereus-schema)**

All message contracts stored in **`nereus-schema==1.0.0`** package; versioned independently.

```python
# nereus_schema/messages.py (Published to PyPI)
from pydantic import BaseModel, Field
from typing import Optional, List, Dict

class SimulationJobMessage(BaseModel):
    """
    Job request from Django → Worker.
    Version: 1.0 (backward compatible with future 1.x)
    """
    sim_id: int
    asset_id: int
    asset_s3_path: str  # e.g., s3://nereus-assets/hydrofoil_123.stl
    config: Dict  # Physics + mesh params
    scratch_dir: str  # e.g., /tmp/sim_12345 (local ephemeral disk)
    object_storage_config: Dict  # S3 endpoint, credentials, bucket
    model_config = ConfigDict(json_schema_extra={'version': '1.0'})

class SolverResultMessage(BaseModel):
    """
    Solver completion → Django (and triggers post-processing worker).
    Version: 1.0
    """
    sim_id: int
    status: str  # SOLVER_COMPLETED, SOLVER_FAILED
    case_dir: str  # Location of OpenFOAM case on scratch disk
    logs: Optional[str]  # Last 1000 chars of solver output
    error_log: Optional[str]
    s3_manifest_path: str  # e.g., s3://nereus-results/sim_12345/manifest.json
    model_config = ConfigDict(json_schema_extra={'version': '1.0'})

class PostProcessingJobMessage(BaseModel):
    """
    Post-processing request → VTK Worker (emitted by Django after solver completes).
    Version: 1.0
    """
    sim_id: int
    case_dir: str  # Passed down from solver result
    slice_axis: str  # x, y, z
    extract_pressure: bool = True
    extract_streamlines: bool = True
    num_frames: int = 10
    model_config = ConfigDict(json_schema_extra={'version': '1.0'})

class VTKResultMessage(BaseModel):
    """
    VTK/ParaView completion → Django.
    Version: 1.0
    """
    sim_id: int
    status: str  # VTK_COMPLETED, VTK_FAILED
    asset_registry: Dict  # Catalog of VTP, GLB, frame URLs in S3
    s3_manifest_path: str  # e.g., s3://nereus-results/sim_12345/vtk_manifest.json
    error_log: Optional[str]
    model_config = ConfigDict(json_schema_extra={'version': '1.0'})
```

**Installation**:
```bash
pip install nereus-schema==1.0.0
```

### **3.2 Event-Driven Architecture (Worker → Django → Post-Processor)**

**Before** (blocking, monolithic):
```
Django API  →  (PATCH)/data/media/  ←  Worker
Worker runs solver + VTK in same process; one crash fails everything
```

**After** (event-driven, decoupled workers):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Event Broker (Celery/RabbitMQ)                        │
└─────────────────────────────────────────────────────────────────────────────┘

    1. Django API emits: simulation.requested
                            ↓
    ┌───────────────────────────────┐
    │   SOLVER WORKER               │
    │ (runs preflight, mesh, solve) │
    │  No Django, no DB access      │
    └───────────────────────────────┘
                   ↓ (emits event)
    2. Solver Worker emits: simulation.solver_completed
                            ↓
    ┌──────────────────────┐
    │   DJANGO LISTENER    │
    │ (handle_solver_done) │
    │ Updates DB, checks   │
    │ if post-processing   │
    │ is needed            │
    └──────────────────────┘
                   ↓ (conditional emit)
    3. Django emits: simulation.vtk_requested (if needed)
                            ↓
    ┌───────────────────────────────┐
    │   POST-PROCESSOR WORKER       │
    │ (runs PyVista extraction)     │
    │  No Django, no DB access      │
    │  Separate container/pool      │
    └───────────────────────────────┘
                   ↓ (emits event)
    4. VTK Worker emits: simulation.assets_ready
                            ↓
    ┌──────────────────────┐
    │   DJANGO LISTENER    │
    │ (handle_assets_ready)│
    │ Updates DB with      │
    │ asset URLs; frontend │
    │ can now render VTK   │
    └──────────────────────┘
                   ↓ (event to frontend via SSE/WS)
    5. Django publishes: simulation.ready (frontend polling or WebSocket)
                            ↓
    ┌──────────────────────┐
    │   REACT FRONTEND     │
    │ Receives assets,     │
    │ renders 3D scene     │
    └──────────────────────┘

```

**Key advantages**:
- ✅ Solver crash doesn't block VTK; can retry independently
- ✅ If VTK fails, solver result is preserved; can re-run VTK only
- ✅ Long solver (30 min) doesn't block short VTK (5 min)
- ✅ Different worker scalings (many solvers, few VTK)
- ✅ Can run VTK on GPU-optimized node while solver on CPU-optimized node

---

## **PHASE 4: FILE LIFECYCLE, OBJECT STORAGE & SCALING**

### **4.1 ⚠️ Anti-Pattern: Eliminating Shared Volume Bottleneck**

**Wrong Approach** (Single-node only):
```
┌─────────────────────────────────────────────────┐
│    Docker Compose on Single Host                │
├─────────────────────────────────────────────────┤
│  Shared Docker Volume: /data/simulations/       │
│  ├── sim_001/                                   │
│  ├── sim_002/                                   │
│  └── ... (thousands of small files per sim)     │
└─────────────────────────────────────────────────┘
```

**Problems at scale**:
- NFS/EFS with 100k+ files/sec = timeout, latency
- OpenFOAM writes thousands of small files per time-step
- Lock contention between solver writer + VTK reader
- Disk space on shared volume grows unbounded
- Can't move to multi-node cluster (ECS, Kubernetes)

**Correct Approach** (Object Storage + Local Scratch):
```
┌────────────────────────────────────────────────────────────┐
│  Worker Container (CPU-optimized)                          │
├────────────────────────────────────────────────────────────┤
│  /tmp/sim_12345/  (ephemeral, local NVMe)                  │
│  ├── openfoam/    (write OpenFOAM case here)              │
│  ├── results_tmp/ (temporary post-processing)             │
│  └── [cleanup on exit]                                    │
└────────────────────────────────────────────────────────────┘
              ↓ (async upload after completion)
        ┌──────────────────────────┐
        │  S3 / MinIO (Object      │
        │  Storage)                │
        ├──────────────────────────┤
        │ s3://nereus-results/     │
        │ ├── sim_001/             │
        │ │   ├── manifest.json     │
        │ │   ├── frames/           │
        │ │   ├── overlays/         │
        │ │   └── convergence.json  │
        │ └── sim_002/ ...          │
        └──────────────────────────┘
              ↑ (frontend downloads VTP via signed URL)
        ┌──────────────────────────┐
        │  React Frontend          │
        │  (WebGL viewer)          │
        └──────────────────────────┘
```

### **4.2 Structured File Lifecycle**

#### **Stage 1: Input (API uploads)**
```bash
# Django API orchestrates:
# 1. User uploads hydrofoil.stl
# 2. API stores in S3: s3://nereus-assets/hydrofoil_123.stl
# 3. API creates SimulationRun record
# 4. API publishes: simulation.requested(sim_id=123, asset_s3_path='s3://...')
```

#### **Stage 2: Execution (Solver Worker — Local Scratch)**
```bash
# Worker receives message with asset_s3_path
# Worker scratch dir: /tmp/sim_123/

/tmp/sim_123/
├── input/
│   └── foil.stl  (downloaded from S3)
├── openfoam/
│   ├── constant/
│   │   ├── triSurface/foil.stl
│   │   └── ...
│   ├── system/
│   │   ├── blockMeshDict
│   │   ├── snappyHexMeshDict
│   │   └── ...
│   ├── 0/
│   │   └── ...
│   └── postProcessing/  (OpenFOAM-generated)
│       ├── forces/
│       ├── surfaces/
│       └── ...
└── logs/
    └── openfoam.log

# After solver completes:
# 1. Worker emits: simulation.solver_completed(case_dir='/tmp/sim_123/openfoam')
# 2. Django receives event; updates DB status → SOLVER_COMPLETED
# 3. Django emits: simulation.vtk_requested (if enabled)
# 4. Solver worker cleans up /tmp/sim_123/ (or waits for VTK worker)
```

#### **Stage 3: Post-Processing (VTK Worker — Separate, May Use GPU)**
```bash
# VTK Worker receives: simulation.vtk_requested(sim_id=123, case_dir='...')
# VTK Worker scratch dir: /tmp/vtk_123/

/tmp/vtk_123/
├── openfoam_case/  (copy from solver's S3 checkpoint OR local mount)
├── extracted/
│   ├── frame_0000.glb
│   ├── frame_0001.glb
│   ├── pressure_0000.vtp
│   ├── streamlines_0000.vtp
│   └── ...
├── logs/
│   └── vtk_extraction.log
└── manifest.json  (VTKResultMessage in JSON form)

# Assets uploaded to S3:
s3://nereus-results/sim_123/
├── manifest.json  (VTKResultMessage)
├── frames/
│   ├── frame_0000.glb
│   ├── frame_0001.glb
│   └── ...
├── overlays/
│   ├── pressure_contours_0000.vtp
│   ├── streamlines_0000.vtp
│   └── ...
└── convergence.json (metrics time-series)

# Django listener updates DB with S3 paths
```

### **4.3 Object Storage Client Abstraction**

```python
# simulation_worker/storage.py (NEW)
from abc import ABC, abstractmethod
import boto3
import os

class IObjectStorageClient(ABC):
    @abstractmethod
    def upload_file(self, local_path: str, s3_path: str) -> str:
        """Upload file and return signed URL."""
        pass

    @abstractmethod
    def download_file(self, s3_path: str, local_path: str) -> None:
        """Download file from object storage."""
        pass

    @abstractmethod
    def upload_directory(self, local_dir: str, s3_prefix: str) -> None:
        """Recursively upload directory."""
        pass

class S3ObjectStorageClient(IObjectStorageClient):
    def __init__(self, endpoint_url, bucket, access_key, secret_key):
        self.s3 = boto3.client(
            's3',
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        self.bucket = bucket

    def upload_file(self, local_path, s3_path):
        self.s3.upload_file(local_path, self.bucket, s3_path)
        return f"s3://{self.bucket}/{s3_path}"

    def upload_directory(self, local_dir, s3_prefix):
        """Recursively upload directory to S3."""
        for root, dirs, files in os.walk(local_dir):
            for file in files:
                local_file = os.path.join(root, file)
                rel_path = os.path.relpath(local_file, local_dir)
                s3_key = f"{s3_prefix}/{rel_path}"
                self.upload_file(local_file, s3_key)

# Solver Worker Usage
from nereus_schema.messages import SimulationJobMessage, SolverResultMessage

def run_simulation(job_json: str, storage: IObjectStorageClient, event_broker):
    job = SimulationJobMessage.model_validate_json(job_json)
    scratch_dir = job.scratch_dir  # e.g., /tmp/sim_123

    try:
        # 1. Download asset from S3
        storage.download_file(job.asset_s3_path, f"{scratch_dir}/input/foil.stl")

        # 2. Run OpenFOAM in scratch_dir
        case_dir = os.path.join(scratch_dir, "openfoam")
        run_openfoam(case_dir)

        result = SolverResultMessage(
            sim_id=job.sim_id,
            status='SOLVER_COMPLETED',
            case_dir=case_dir,
            s3_manifest_path=f"s3://nereus-results/sim_{job.sim_id}/solver_manifest.json",
        )

        # 3. Upload solver results to S3
        storage.upload_directory(
            case_dir,
            f"nereus-results/sim_{job.sim_id}/openfoam",
        )

        event_broker.publish('simulation.solver_completed', result.model_dump_json())

    except Exception as e:
        result = SolverResultMessage(
            sim_id=job.sim_id,
            status='SOLVER_FAILED',
            error_log=str(e),
        )
        event_broker.publish('simulation.solver_completed', result.model_dump_json())

    finally:
        # 4. ALWAYS cleanup scratch disk (critical for multi-node)
        import shutil
        shutil.rmtree(scratch_dir, ignore_errors=True)
```

### **4.4 Django Listens & Manages S3 URLs**

```python
# backend/api/tasks.py (DJANGO LISTENER)
@shared_task(name='tasks.handle_solver_completed')
def handle_solver_completed(result_json):
    result = SolverResultMessage.model_validate_json(result_json)
    repo = DjangoSimulationRepository()
    repo.update_results(result.sim_id, result)

    # If post-processing enabled, emit next event
    sim = SimulationRun.objects.get(id=result.sim_id)
    if sim.enable_vtk_extraction:
        job = PostProcessingJobMessage(
            sim_id=sim.id,
            case_dir=result.case_dir,
            slice_axis=sim.slice_axis,
        )
        event_broker.publish(
            'simulation.vtk_requested',
            job.model_dump_json(),
        )

@shared_task(name='tasks.handle_assets_ready')
def handle_assets_ready(result_json):
    result = VTKResultMessage.model_validate_json(result_json)
    repo = DjangoSimulationRepository()

    # Update SimulationRun with S3 asset paths
    SimulationRun.objects.filter(id=result.sim_id).update(
        status='COMPLETED',
        result_mesh_path=result.asset_registry.get('mesh_url'),
        frame_mapping=[
            {
                'index': i,
                'glb_url': f"{result.s3_manifest_path}/frames/frame_{i:04d}.glb",
                'pressure_url': f"{result.s3_manifest_path}/overlays/pressure_{i:04d}.vtp",
            }
            for i in range(len(result.asset_registry.get('frames', [])))
        ],
    )

    # Signed URLs are generated on-the-fly when frontend requests /api/simulations/{id}/analysis
```

### **4.5 Scaling Benefits**

| Scenario | Before (Shared Volume) | After (Object Storage) |
|---|---|---|
| **Single node (dev)** | ✅ Works | ✅ Works (LocalStack S3) |
| **100 simultaneous sims** | ❌ NFS locks, timeout | ✅ Workers scale independently |
| **Multi-region** | ❌ Impossible | ✅ Each region has own S3 bucket, data replicated |
| **Multi-node cluster (ECS/K8s)** | ❌ Requires EFS/NFS setup | ✅ No shared FS needed |
| **Cleanup on crash** | ❌ Orphaned files | ✅ /tmp auto-cleaned; S3 has retention policy |
| **Cost** | ❌ Expensive EFS per GB | ✅ $0.023/GB S3; delete old sims |

---

## **PHASE 5: REFACTORING ROADMAP (3 Phases, Non-Breaking)**

### **Phase 1: Extraction (Weeks 1–2, Non-Breaking)**

**Goal**: Extract service layer + repository pattern; existing code still works.

**Steps**:

1. **Create `backend/api/services/` directory**
   - Add `SimulationService` class (wraps creation logic)
   - Add `GeometryService` class (wraps file staging)
   - No changes to views yet; just extract

2. **Create `backend/api/repositories/` directory**
   - Add `ISimulationRepository` interface
   - Add `DjangoSimulationRepository` implementation (thin ORM wrapper)
   - Implement `get_by_id()`, `update_status()`, `update_results()`

3. **Create `backend/api/messages/` directory**
   - Add Pydantic models: `SimulationJobMessage`, `SimulationResultMessage`
   - Add message serialization utilities

4. **Refactor views to use service layer**
   ```python
   # views.py (CHANGE ONLY THIS)
   def perform_create(self, serializer):
       instance = serializer.save()
       service = SimulationService(
           repo=DjangoSimulationRepository(),
           file_manager=FileManager(),
       )
       service.request_simulation(instance)
       # Simpler, testable
   ```

5. **Keep existing Celery tasks working** (no changes to worker yet)
   - Add adapter: `CeleryJobPublisher` that wraps `run_hydro_simulation.delay()`

**Validation**: All existing tests pass; no behavioral changes.

---

### **Phase 2: Interface Definition (Weeks 3–4, Non-Breaking)**

**Goal**: Define message contracts + adapter interfaces; worker stays untouched.

**Steps**:

1. **Create `backend/api/adapters/` directory**
   - Add `IResultPublisher` interface
   - Add `CeleryResultPublisher` (current direct PATCH behavior)
   - Add `WebhookResultPublisher` (for future HTTP-push events)

2. **Create `simulation_worker/messages/` directory**
   - Move/translate Pydantic models to worker (language-agnostic JSON schema)
   - Worker can parse job messages without importing Django

3. **Create `simulation_worker/executors/` directory**
   - Add `SimulationExecutor` class (orchestrates preflight → mesh → solve)
   - Extract from current task code; **no Django ORM calls**

4. **Add message queue abstraction**
   - Celery remains the broker, but mediated through `IJobPublisher` interface
   - Allows future swap to RabbitMQ/SVG without code changes

5. **Worker can now be tested** (locally, no Docker):
   ```python
   # test_executor.py
   def test_simulation_preflight(tmp_path):
       executor = SimulationExecutor(
           repo=MockRepository(),  # No Django needed
           file_manager=FileManager(tmp_path),
       )
       job = SimulationJobMessage(...)
       result = executor.preflight(job)
       assert result.geometry_path.exists()
   ```

**Validation**: Worker tests pass; integration tests still pass.

---

### **Phase 5c: Full Decoupling & Cleanup (Weeks 5–6, Breaking Changes Localized)**

**Goal**: Remove all blocking HTTP calls; worker is fully environment-agnostic.

**Steps**:

1. **Remove direct HTTP PATCH from worker**
   - Delete `patch_django_status()` function
   - Ensure ALL state updates go through event_broker.publish()

2. **Migrate from shared Docker volume to object storage**
   - Update worker to use `/tmp/{sim_id}/` for scratch disk
   - Upload finalized results to S3
   - Update Django to serve results from S3 (signed URLs)

3. **Remove direct shared volume mounts**
   - Delete `volumes: [shared_data]` from docker-compose.yml
   - Replace with S3/MinIO configuration

4. **Verify worker environment agnosticism**
   ```bash
   # Audit: no Django imports in worker
   grep -r "import django" simulation_worker/
   grep -r "from django" simulation_worker/
   grep -r "DJANGO_SETTINGS_MODULE" simulation_worker/
   # Should all return: [empty]
   ```

5. **Deprecate old HTTP PATCH listener**
   - Soft-deprecate old endpoint
   - Log warning if old endpoint is called
   - Maintain for 1-2 releases (backward compat)

6. **Update frontend**
   - Switch from polling `/api/simulations/{id}/` every 2s
   - Implement WebSocket or Server-Sent Events (SSE)
   - Receive events: `simulation.updated`, `simulation.completed`, `assets.ready`

**Validation**: E2E tests pass; old HTTP PATCH endpoint logs deprecation warnings; new event path works seamlessly.

---

### **Rollout Strategy**

```
Week 1–2: Phase 5a (Schema + Service Layer)
    └─ Code review ✓
    └─ All existing tests pass ✓
    └─ No behavior change ✓

Week 3–4: Phase 5b (Events + Object Storage)
    └─ New code paths coexist with old ✓
    └─ Feature flag: EVENTS_ENABLED=True/False
    └─ Stage events in staging env ✓

Week 5–6: Phase 5c (Cut Over)
    └─ Disable EVENTS_ENABLED=False in prod (rollback switch)
    └─ Convert prod data (S3 migration script) ✓
    └─ Remove HTTP PATCH code ✓
    └─ Decommission shared volume ✓
```

---

---

## **RISK ASSESSMENT: Addressing the 4 Critical Pitfalls**

### **Pitfall 1: Zombie Dependency (Worker Still Imports Django)**

**Risk**: Even with a "Repository Pattern," if Worker imports `DjangoSimulationRepository`, it still has a hard dependency on Django settings, database driver, and ORM.

**Mitigation In Phase 2.2**:
- ✅ Worker **NEVER** imports any repository
- ✅ Worker receives DTO via message (JSON), not via ORM query
- ✅ Worker emits DTO via event (JSON), not via database write
- ✅ All database access stays in Django listeners
- ✅ Verify with: `grep -r "import django\|from django" simulation_worker/` → must return empty

**Audit Checklist**:
- [ ] `simulation_worker/tasks.py` has **zero** Django imports
- [ ] Worker receives `SimulationJobMessage` (from `nereus_schema`)
- [ ] Worker outputs `SolverResultMessage` (to `event_broker`)
- [ ] Worker has no `django.setup()` call
- [ ] All DB queries happen in Django `backend/api/tasks.py` listeners

---

### **Pitfall 2: Shared Volume Performance Bottleneck**

**Risk**: NFS/EFS shared disk withOpenFOAM+ 100k files/sec = lock contention, timeouts, can't scale to multi-node clusters.

**Mitigation In Phase 4**:
- ✅ Worker treats `/tmp/{sim_id}/` as **ephemeral, local scratch**
- ✅ Solver outputs → `/tmp/sim_123/openfoam/`
- ✅ After completion, worker uploads to S3/MinIO
- ✅ Django serves results from S3 (signed URLs)
- ✅ No persistent shared filesystem needed

**Scaling Path**:
| Stage | Deployment | Strategy |
|---|---|---|
| **Dev** | Docker Compose | LocalStack S3 emulation on localhost |
| **Staging** | Single ECS instance | MinIO S3-compatible bucket on same host |
| **Prod** | ECS multi-region | AWS S3 + cross-region replication |
| **HPC** | Kubernetes cluster | S3 from each node; no shared FS |

**Audit Checklist**:
- [ ] Worker writes ONLY to `/tmp/` (ephemeral)
- [ ] Finalized results pushed to S3 via `ObjectStorageClient`
- [ ] Django deletes old S3 buckets on retention policy
- [ ] `docker-compose.yml` has NO `volumes: [shared_data]`

---

### **Pitfall 3: Post-Processing Coupled to Solver (One Crash = Re-run Both)**

**Risk**: If VTK extraction crashes, entire simulation is marked FAILED; must re-run solver too.

**Mitigation In Phase 2b + Phase 3.2**:
- ✅ Separate `PostProcessorMessageHandler` worker
- ✅ Solver emits `simulation.solver_completed` event
- ✅ Django listener receives event, updates DB
- ✅ IF VTK enabled, Django emits `simulation.vtk_requested` event
- ✅ VTK worker runs independently; if it fails, solver result is safe
- ✅ Can re-run VTK without re-running solver (cheaper retry)

**Worker Pools**:
```yaml
# docker-compose.yml
services:
  solver_worker:
    image: nereus/worker:latest
    command: celery -A simulation_worker worker -Q simulation.solver -c 4
    environment:
      WORKER_TYPE: solver  # Focus on CPU-bound tasks

  vtk_worker:
    image: nereus/worker:latest
    command: celery -A simulation_worker worker -Q simulation.vtk -c 2
    environment:
      WORKER_TYPE: vtk  # Can use GPU-optimized instance
```

**Audit Checklist**:
- [ ] `SolverResultMessage` is independent; doesn't require VTK
- [ ] `PostProcessingJobMessage` can be retried separately
- [ ] Standalone workers listen on different Celery queues
- [ ] Failure in VTK doesn't cascade to solver status

---

### **Pitfall 4: Shared Message Library Versioning**

**Risk**: If Django and Worker each maintain their own copy of Pydantic models, they diverge and break compatibility.

**Mitigation In Phase 0**:
- ✅ Create standalone `nereus-schema==1.0.0` package (published to PyPI)
- ✅ Install in both `backend/requirements.txt` and `simulation_worker/requirements.txt`
- ✅ Single source of truth for: `SimulationJobMessage`, `SolverResultMessage`, etc.
- ✅ Version pinning prevents drift (`pip install nereus-schema==1.0.0`)

**Contract Evolution**:
```
nereus-schema==1.0.0
  └─ SimulationJobMessage (fields: sim_id, asset_s3_path, config, ...)
  └─ SolverResultMessage (fields: status, case_dir, s3_manifest_path, ...)

nereus-schema==1.1.0 (future)
  └─ ADD: gpu_enabled bool (backward compatible, default=False)
  └─ ADD: timeout_seconds int
  └─ (can be adopted gradually; old 1.0 clients still work)

nereus-schema==2.0.0 (breaking)
  └─ REMOVE: deprecated_field (major version bump; requires coordinated rollout)
```

**Audit Checklist**:
- [ ] `nereus-schema/messages.py` is single source of truth
- [ ] Both `backend` and `simulation_worker` import FROM `nereus_schema`, not local copies
- [ ] Schema changes bump version number explicitly
- [ ] CI/CD tests verify both Django and Worker can parse all message versions (backward compat)
- [ ] No manual JSON schema duplication in code

---

### **High Risk Summary: Addressed**

| Risk | Addressed? | Phase |
|---|---|---|
| Zombie Django Dependency | ✅ Phase 2.2 | Worker never imports Django |
| Shared Volume Bottleneck | ✅ Phase 4 | Ephemeral local + S3 storage |
| VTK Crash = Solver Re-run | ✅ Phase 2b + 3.2 | Separate event-driven workers |
| Message Library Drift | ✅ Phase 0 | Standalone `nereus-schema` package |

---

### **Medium Risk**

| Risk | Mitigation |
|---|---|
| **S3 costs escalate** | Lifecycle policy: delete old sims after 30 days; archive to Glacier after 90 |
| **Development/test complexity** | Use LocalStack S3 in docker-compose for dev; fixture generators for messages |
| **Debugging distributed execution harder** | Add trace IDs to all messages; structured logging (ELK/Datadog); correlation IDs |
| **Event ordering (race conditions)** | Use message dead-letter queues; idempotent event handlers; version messages |

---

### **Low Risk**

| Risk | Mitigation |
|---|---|
| **Existing frontend breaks** | API maintains backward compatibility; version endpoints |
| **Database schema changes needed** | Only add columns/fields; no deletions during Phase 1–2 |
| **CI/CD pipeline complexity** | Separate build pipelines for `nereus-schema`, `backend`, `simulation_worker` |

---

---

## **IMPLEMENTATION CHECKLIST (Refined)**

### **Phase 0: Shared Schema Package** (Week 0)
- [ ] Create `nereus-schema/` repository with Pydantic models
- [ ] Add `SimulationJobMessage`, `SolverResultMessage`, `PostProcessingJobMessage`, `VTKResultMessage`
- [ ] Version: `1.0.0`; publish to PyPI or internal registry
- [ ] Add `backend/requirements.txt: nereus-schema==1.0.0`
- [ ] Add `simulation_worker/requirements.txt: nereus-schema==1.0.0`
- [ ] Verify both environments can import and validate messages

### **Phase 5a: Service Layer Extraction** (Weeks 1–2)
- [ ] Create `backend/api/services/` with `SimulationService`
- [ ] Create `backend/api/repositories/` with `ISimulationRepository`, `DjangoSimulationRepository`
- [ ] Create `backend/api/adapters/` with `IEventBroker`, `CeleryEventBroker`
- [ ] Create `backend/api/adapters/` with `IObjectStorageClient`, `S3ObjectStorageClient`
- [ ] Refactor views to use `SimulationService`
- [ ] **NO worker changes yet**
- [ ] All existing tests pass; no behavioral changes

### **Phase 5b: Event Bridge + Object Storage** (Weeks 3–4)
- [ ] Create `simulation_worker/adapters/` mirror (no Django imports)
- [ ] Add Django event listeners in `backend/api/tasks.py`:
  - [ ] `handle_solver_completed(result_json)`
  - [ ] `handle_assets_ready(result_json)`
- [ ] Create `simulation_worker/post_processor_tasks.py` (separate worker)
- [ ] Update `simulation_worker/tasks.py` to emit events instead of HTTP PATCH
- [ ] **Verify**: `grep -r "import django\|from django" simulation_worker/` → empty
- [ ] Add LocalStack/MinIO configuration for dev S3
- [ ] Worker tests pass (no Docker)
- [ ] Event system coexists with old HTTP PATCH (feature flag)

### **Phase 5c: Full Decoupling & Cleanup** (Weeks 5–6)
- [ ] Remove `patch_django_status()` function (HTTP PATCH)
- [ ] Remove `/data/simulations/` shared volume mount
- [ ] Update docker-compose.yml to use S3/MinIO
- [ ] Migrate existing results from shared FS to S3
- [ ] Update frontend: polling → WebSocket/SSE
- [ ] Add deprecation warning to old HTTP PATCH endpoint
- [ ] Verify all E2E tests pass
- [ ] Feature flag: disable old mode, keep new event mode

---

## **KEY SUCCESS METRICS (Post-Decoupling)**

After full completion:

1. ✅ **Worker is environment-agnostic**
   - No `import django` anywhere in `simulation_worker/`
   - Can run in Python 3.8+ with just `pip install -r requirements.txt`
   - Works offline (except S3 push at end)

2. ✅ **Message schema is versioned**
   - Single source of truth in `nereus-schema==1.0.0`
   - Schema changes bump version explicitly
   - Backward compatibility documented

3. ✅ **Simulation logic is independent**
   - Solver can run without VTK (one can fail independently)
   - Can invoke from CLI, webhooks, batch jobs, not just REST API
   - Results persist in S3; can be re-processed anytime

4. ✅ **File ownership is clear**
   - API: uploads to S3
   - Solver worker: writes to `/tmp`, upload to S3 at end
   - VTK worker: writes to `/tmp`, upload to S3 at end
   - No manual file copying; no ambiguous ownership

5. ✅ **VTK/ParaView assets explicitly cataloged**
   - `VTKResultMessage.asset_registry` contains all S3 URLs
   - No hard-coded paths; no "magic" directories
   - Frontend gets signed URLs directly from API

6. ✅ **Zero circular dependencies**
   - Worker doesn't know about Django
   - Django doesn't know about OpenFOAM internals
   - All communication via message contracts + S3

7. ✅ **Scales to multi-node**
   - Workers can run on different machines
   - No shared filesystem needed
   - Each node uses local `/tmp`, uploads to S3
   - Can be deployed on ECS, Kubernetes, HPC clusters

---

## **APPENDIX: EXAMPLE SERVICE LAYER (Reference)**

```python
# backend/api/services.py (Phase 1)
from .repositories import ISimulationRepository
from .messages import SimulationJobMessage
from django.core.files.storage import default_storage

class SimulationService:
    def __init__(self, repo: ISimulationRepository, job_publisher=None):
        self.repo = repo
        self.publisher = job_publisher or CeleryJobPublisher()

    def request_simulation(self, sim_id: int):
        """Orchestrate simulation creation workflow."""
        # 1. Fetch from DB
        sim_dto = self.repo.get_by_id(sim_id)

        # 2. Validate asset exists
        if not sim_dto.asset_path or not default_storage.exists(sim_dto.asset_path):
            raise ValueError(f"Asset not found: {sim_dto.asset_path}")

        # 3. Build job message
        job = SimulationJobMessage(
            sim_id=sim_id,
            asset_path=sim_dto.asset_path,
            config=sim_dto.to_foam_config(),
        )

        # 4. Stage geometry files (abstracted)
        self._stage_geometry(job)

        # 5. Publish job (abstracted — could be Celery, HTTP, queue, etc.)
        self.publisher.publish('simulation.requested', job)

        # 6. Update status
        self.repo.update_status(sim_id, 'MESHINGQUEUED')

        # 4. Emit job message to broker (non-blocking)
        self.broker.publish(
            'simulation.requested',
            job.model_dump_json(),
        )

        # 5. Update status in DB
        self.repo.update_status(sim_id, 'PENDING')

    def _asset_exists(self, s3_path: str) -> bool:
        """Check if asset exists in S3."""
        import boto3
        s3 = boto3.client('s3')
        bucket, key = s3_path.replace('s3://', '').split('/', 1)
        try:
            s3.head_object(Bucket=bucket, Key=key)
            return True
        except:
            return False
```

### **Worker: Solver (Phase 5b)**

```python
# simulation_worker/tasks.py
from celery import Celery
import json
from nereus_schema.messages import SimulationJobMessage, SolverResultMessage
from simulation_worker.executor import SimulationExecutor
from simulation_worker.adapters import S3ObjectStorageClient, CeleryEventBroker

# NO Django imports! ✅

app = Celery('simulation_worker')
app.config_from_object('simulation_worker.celery_config')

@app.task(name='tasks.run_simulation')
def run_simulation(job_json: str):
    """
    Execute an OpenFOAM simulation.

    Input: SimulationJobMessage (JSON)
    Output: Emits SolverResultMessage via event broker
    """
    try:
        # 1. Parse job message (from nereus_schema)
        job = SimulationJobMessage.model_validate_json(job_json)

        # 2. Set up object storage (no Django!)
        storage = S3ObjectStorageClient(
            endpoint_url=job.object_storage_config['endpoint'],
            bucket=job.object_storage_config['bucket'],
            access_key='<from-env>',
            secret_key='<from-env>',
        )

        # 3. Execute simulation (STATELESS)
        executor = SimulationExecutor(storage=storage)
        case_dir = executor.run(job)

        # 4. Upload results to S3
        storage.upload_directory(
            case_dir,
            f"sim_{job.sim_id}/openfoam",
        )

        # 5. Build result message
        result = SolverResultMessage(
            sim_id=job.sim_id,
            status='SOLVER_COMPLETED',
            case_dir=case_dir,
            s3_manifest_path=f"s3://nereus-results/sim_{job.sim_id}/manifest.json",
        )

    except Exception as e:
        result = SolverResultMessage(
            sim_id=job.sim_id,
            status='SOLVER_FAILED',
            error_log=str(e),
        )

    finally:
        # 6. Cleanup local scratch disk
        import shutil
        shutil.rmtree(job.scratch_dir, ignore_errors=True)

        # 7. Emit result event (non-blocking)
        broker = CeleryEventBroker(app)
        broker.publish(
            'simulation.solver_completed',
            result.model_dump_json(),
        )
```

### **Django Event Listener (Phase 5b)**

```python
# backend/api/tasks.py
from celery import shared_task
from nereus_schema.messages import SolverResultMessage
from .repositories import DjangoSimulationRepository

@shared_task(name='tasks.handle_solver_completed')
def handle_solver_completed(result_json: str):
    """
    Listen for solver completion events and update Django DB.
    Triggered by: simulation_worker.tasks.run_simulation emit
    """
    result = SolverResultMessage.model_validate_json(result_json)
    repo = DjangoSimulationRepository()
    repo.update_results(result.sim_id, result)

    # If post-processing enabled, emit next event
    sim = SimulationRun.objects.get(id=result.sim_id)
    if sim.enable_vtk_extraction and result.status == 'SOLVER_COMPLETED':
        from nereus_schema.messages import PostProcessingJobMessage
        job = PostProcessingJobMessage(
            sim_id=sim.id,
            case_dir=result.case_dir,
            slice_axis=sim.slice_axis,
            extract_pressure=True,
            extract_streamlines=True,
        )
        broker = CeleryEventBroker(app)
        broker.publish(
            'simulation.vtk_requested',
            job.model_dump_json(),
        )
```

### **Worker: Post-Processor (Phase 5b)**

```python
# simulation_worker/post_processor_tasks.py
from celery import Celery
from nereus_schema.messages import PostProcessingJobMessage, VTKResultMessage
from simulation_worker.post_processor import VTKPostProcessorPipeline

app = Celery('simulation_worker')

@app.task(name='tasks.post_process_simulation')
def post_process_simulation(job_json: str):
    """Extract VTK assets (separate from solver)."""
    try:
        job = PostProcessingJobMessage.model_validate_json(job_json)

        # Run VTK extraction (can be on GPU-optimized machine)
        pipeline = VTKPostProcessorPipeline(
            openfoam_case_dir=job.case_dir,
        )

        asset_registry = {
            'frames': pipeline.extract_frames(num_frames=job.num_frames),
            'pressure_contours': pipeline.extract_pressure(job.slice_axis),
            'streamlines': pipeline.extract_streamlines(),
        }

        result = VTKResultMessage(
            sim_id=job.sim_id,
            status='VTK_COMPLETED',
            asset_registry=asset_registry,
            s3_manifest_path=f"s3://nereus-results/sim_{job.sim_id}/vtk_manifest.json",
        )

    except Exception as e:
        result = VTKResultMessage(
            sim_id=job.sim_id,
            status='VTK_FAILED',
            error_log=str(e),
        )

    finally:
        # Cleanup
        shutil.rmtree(job.scratch_dir, ignore_errors=True)

        # Emit result
        broker = CeleryEventBroker(app)
        broker.publish(
            'simulation.assets_ready',
            result.model_dump_json(),
        )
```

---

## **NEXT STEPS**

1. **Review & Approval** (1 week)
   - Stakeholder review of Phase 0–5 plan
   - Risk assessment sign-off
   - Timeline adjustment based on team capacity

2. **Kickoff Phase 0** (Weeks 0)
   - Create `nereus-schema` repository
   - Define initial message contracts
   - Publish to package registry

3. **Sprint Planning** (Weeks 0–1)
   - Assign engineers (backend, worker, DevOps)
   - Create Jira epics for each phase
   - Establish code review checklist (must verify: no Django imports in worker)

4. **Continuous Validation**
   - Every phase: `grep -r "import django\|from django" simulation_worker/` → must be empty
   - Every phase: run E2E tests with old AND new code paths
   - Feature flags enable safe cutover

---

**Document Version**: 2.0 (Revised with fixes for 4 critical pitfalls)
**Last Updated**: 2026-04-02
**Maintainer**: @architecture-team
