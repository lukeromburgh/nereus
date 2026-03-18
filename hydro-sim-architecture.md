# SYSTEM ROLE

You are modifying the Nereus hydrofoil CFD platform.
This document is the authoritative architecture and implementation spec.

# GOALS

- High-fidelity hydrofoil simulation
- Production-ready pipeline
- Physically accurate modeling

# RULES

- Do not break existing pipeline stages
- Extend via template_manager.py and tasks.py
- Keep OpenFOAM compatibility

# IMPLEMENTATION PHASES

## Phase 1

...

## Phase 2

...

# CODE TARGETS

- backend/tasks.py
- backend/template_manager.py
- frontend/ConfigPanel.tsx

# REQUIRED OUTPUT STYLE

- Code changes directly into the active branch
- No pseudocode unless requested

# Nereus CFD Platform — High-Fidelity Upgrade Specification

> Implementation-ready architectural upgrade from MVP steady-state to full design-iteration platform  
> Stack: OpenFOAM 11 · Django · Celery · Docker · PyVista

---

## 1. System Architecture (Post-Upgrade)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND  (React / TypeScript)                     │
│                                                                             │
│  ConfigPanel.tsx                                                            │
│  ├── SolverPanel       (steady / transient / multiphase)                   │
│  ├── PropulsionPanel   (constant thrust / sail / kite)                     │
│  ├── OrientationPanel  (pitch / roll / yaw)                                │
│  ├── PIDPanel          (ride height / pitch / velocity)                    │
│  ├── MeshPanel         (density / layers / y+ target)                      │
│  ├── TurbulencePanel   (TI / L_ref / model)                                │
│  ├── CavitationPanel   (enable / pv_sat)                                   │
│  └── PostProcessPanel  (fields / moments / free surface)                   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ REST  (DRF)
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                        DJANGO BACKEND                                        │
│  models.py   ←── SimulationRun (extended schema — see §3)                  │
│  serializers.py  ←── updated validators                                     │
│  views.py        ←── unchanged (generic CRUD + stream endpoint)            │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ Celery task
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                     CELERY WORKER  (tasks.py)                                │
│                                                                             │
│  Phase 0 ── Pre-flight & propulsion pre-solve                               │
│  Phase 1 ── Feature extraction  (surfaceFeatureExtract)                     │
│  Phase 2 ── blockMesh                                                       │
│  Phase 3 ── snappyHexMesh  (with layers)                                   │
│  Phase 4 ── decomposePar   (parallel prep)                                 │
│  Phase 5 ── Solver dispatch                                                 │
│             ├─ simpleFoam   (steady)                                        │
│             ├─ pimpleFoam   (transient)                                     │
│             └─ interFoam    (free surface)                                  │
│  Phase 6 ── [Optional] PID control outer loop                               │
│  Phase 7 ── Post-processing  (PyVista → VTK/VTP + moments)                 │
│  Phase 8 ── Status update                                                   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ Docker exec / mpirun
┌──────────────────────────────▼──────────────────────────────────────────────┐
│              OPENFOAM 11  DOCKER CONTAINER                                   │
│                                                                             │
│  constant/                                                                  │
│  ├── transportProperties   (nu, surface tension for VOF)                   │
│  ├── turbulenceProperties  (k-ω SST)                                        │
│  ├── dynamicMeshDict       (sixDoFRigidBodyMotion — Phase 4 only)           │
│  ├── g                     (gravity vector)                                 │
│  └── MRFProperties         (optional rotation frame)                       │
│                                                                             │
│  0/                                                                         │
│  ├── U, p_rgh, k, omega, nut                                                │
│  ├── alpha.water            (VOF only)                                      │
│  └── pointDisplacement      (6DOF only)                                     │
│                                                                             │
│  system/                                                                    │
│  ├── controlDict            (solver + forces + fieldAverage)               │
│  ├── fvSchemes / fvSolution                                                 │
│  ├── blockMeshDict                                                          │
│  ├── snappyHexMeshDict      (refinement + addLayers)                       │
│  ├── surfaceFeatureExtractDict                                              │
│  └── decomposeParDict                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Implementation Phases

### Phase 1 — High Impact, Low Complexity

**Targets:** Boundary layers · Feature refinement · Moment extraction · Gravity

### Phase 2 — Solver Depth

**Targets:** Transient solver · Rich VTK post-processing · Turbulence parameter exposure · Parallelisation

### Phase 3 — Multiphysics

**Targets:** Free surface (interFoam) · Propulsion models (Python equilibrium solver)

### Phase 4 — Dynamics

**Targets:** PID control loop · Virtual sensors · 6DOF motion

### Phase 5 — Optimisation Engine

**Targets:** Parameter sweeps · Mesh independence · Cavitation

---

## 3. Data Model Schema Updates (`models.py`)

```python
# models.py — extend SimulationRun

from django.db import models
from django.contrib.postgres.fields import ArrayField
import uuid

class SimulationRun(models.Model):

    # ── existing fields (unchanged) ──────────────────────────────────────────
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4)
    status          = models.CharField(max_length=20, default='PENDING')
    stl_file        = models.FileField(upload_to='stl/')
    velocity        = models.FloatField(default=5.0)
    angle_of_attack = models.FloatField(default=0.0)
    mesh_density    = models.FloatField(default=1.0)
    submersion_depth= models.FloatField(default=1.0)
    vehicle_mass    = models.FloatField(default=100.0)
    cog             = ArrayField(models.FloatField(), size=3, default=list)

    # ── Phase 1: Meshing & Physical Accuracy ─────────────────────────────────
    enable_layers       = models.BooleanField(default=True)
    y_plus_target       = models.FloatField(default=1.0)      # 1 = resolve sublayer
    n_surface_layers    = models.IntegerField(default=5)
    layer_expansion     = models.FloatField(default=1.2)
    turbulence_intensity= models.FloatField(default=0.05)     # fraction, not %
    turbulence_length   = models.FloatField(default=0.1)      # metres
    enable_gravity      = models.BooleanField(default=True)

    # ── Phase 2: Solver Type ──────────────────────────────────────────────────
    SOLVER_CHOICES = [
        ('simpleFoam',  'Steady-state (SIMPLE)'),
        ('pimpleFoam',  'Transient (PIMPLE)'),
        ('interFoam',   'Free-surface VOF'),
    ]
    solver_type         = models.CharField(max_length=20, choices=SOLVER_CHOICES,
                                           default='simpleFoam')
    end_time            = models.FloatField(default=100.0)     # s (transient) or iters (steady)
    delta_t             = models.FloatField(default=0.01)      # s (transient only)
    max_cfl             = models.FloatField(default=0.8)
    n_parallel_cores    = models.IntegerField(default=4)

    # ── Phase 2: Post-processing ──────────────────────────────────────────────
    export_vtk          = models.BooleanField(default=True)
    export_fields       = ArrayField(models.CharField(max_length=20),
                                     default=lambda: ['p','U','k','omega','nut'])
    export_wall_yplus   = models.BooleanField(default=True)
    export_moments      = models.BooleanField(default=True)

    # ── Phase 3: Free Surface ─────────────────────────────────────────────────
    enable_free_surface = models.BooleanField(default=False)
    wave_height         = models.FloatField(default=0.0)       # m
    wave_period         = models.FloatField(default=5.0)       # s

    # ── Phase 3: Propulsion ───────────────────────────────────────────────────
    PROPULSION_CHOICES = [
        ('none',      'No propulsion (velocity prescribed)'),
        ('constant',  'Constant thrust'),
        ('sail',      'Sail force model'),
        ('kite',      'Kite force model'),
    ]
    propulsion_model    = models.CharField(max_length=20, choices=PROPULSION_CHOICES,
                                           default='none')
    thrust_force        = models.FloatField(default=0.0)       # N (constant)
    wind_speed          = models.FloatField(default=10.0)      # m/s apparent
    wind_angle          = models.FloatField(default=45.0)      # deg (sail/kite)
    sail_area           = models.FloatField(default=20.0)      # m²
    kite_area           = models.FloatField(default=30.0)      # m²
    cl_sail             = models.FloatField(default=1.2)
    cd_sail             = models.FloatField(default=0.15)
    drag_area           = models.FloatField(default=1.0)       # hull/above-water m²

    # ── Phase 4: Orientation ──────────────────────────────────────────────────
    pitch               = models.FloatField(default=0.0)       # deg
    roll                = models.FloatField(default=0.0)       # deg
    yaw                 = models.FloatField(default=0.0)       # deg
    enable_6dof         = models.BooleanField(default=False)
    moment_of_inertia   = ArrayField(models.FloatField(), size=6, default=list)
    # Ixx, Iyy, Izz, Ixy, Ixz, Iyz

    # ── Phase 4: PID Control ──────────────────────────────────────────────────
    enable_pid          = models.BooleanField(default=False)
    pid_ride_height_kp  = models.FloatField(default=1.0)
    pid_ride_height_ki  = models.FloatField(default=0.1)
    pid_ride_height_kd  = models.FloatField(default=0.05)
    pid_pitch_kp        = models.FloatField(default=0.5)
    pid_pitch_ki        = models.FloatField(default=0.05)
    pid_pitch_kd        = models.FloatField(default=0.02)
    pid_velocity_kp     = models.FloatField(default=0.2)
    pid_velocity_ki     = models.FloatField(default=0.02)
    pid_velocity_kd     = models.FloatField(default=0.0)
    target_ride_height  = models.FloatField(default=0.5)       # m
    target_pitch        = models.FloatField(default=0.0)       # deg
    target_velocity     = models.FloatField(default=5.0)       # m/s

    # ── Phase 5: Cavitation ───────────────────────────────────────────────────
    enable_cavitation   = models.BooleanField(default=False)
    p_vapour            = models.FloatField(default=2337.0)    # Pa @ 20°C
    n_nuclei            = models.FloatField(default=1.6e13)    # m⁻³ (Schnerr-Sauer)
    bubble_radius       = models.FloatField(default=1e-6)      # m

    # ── Phase 5: Optimisation ─────────────────────────────────────────────────
    is_sweep_job        = models.BooleanField(default=False)
    sweep_parameter     = models.CharField(max_length=50, blank=True)
    sweep_values        = ArrayField(models.FloatField(), default=list)
    parent_run          = models.ForeignKey('self', null=True, blank=True,
                                            on_delete=models.SET_NULL,
                                            related_name='sweep_children')

    # ── Result storage ────────────────────────────────────────────────────────
    equilibrium_velocity= models.FloatField(null=True)         # m/s (propulsion result)
    lift_force          = models.FloatField(null=True)         # N
    drag_force          = models.FloatField(null=True)         # N
    pitch_moment        = models.FloatField(null=True)         # N·m
    roll_moment         = models.FloatField(null=True)         # N·m
    yaw_moment          = models.FloatField(null=True)         # N·m
    l_d_ratio           = models.FloatField(null=True)
    wall_yplus_max      = models.FloatField(null=True)
    wall_yplus_mean     = models.FloatField(null=True)

    class Meta:
        ordering = ['-created_at']
```

---

## 4. OpenFOAM Dictionary Snippets

### 4.1 `constant/g` — Gravity Vector

```cpp
/*--------------------------------*- C++ -*----------------------------------*\
  Nereus: gravity
\*---------------------------------------------------------------------------*/
FoamFile { version 2.0; format ascii; class uniformDimensionedVectorField;
           object g; }
dimensions      [0 1 -2 0 0 0 0];
value           (0 0 -9.81);
```

### 4.2 Enhanced `system/snappyHexMeshDict` — Boundary Layers

Key additions to the existing dict (merge with existing refinement settings):

```cpp
// ── Layer addition (addLayers) ─────────────────────────────────────────────
addLayersControls
{
    relativeSizes       true;   // nSurfaceLayers is relative to local cell size
    expansionRatio      {{ layer_expansion }};
    finalLayerThickness 0.3;    // fraction of local cell size
    minThickness        0.1;
    nGrow               0;
    featureAngle        60;
    nRelaxIter          5;
    nSmoothSurfaceNormals 1;
    nSmoothNormals      3;
    nSmoothThickness    10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedianAxisAngle  90;
    nBufferCellsNoExtrude 0;
    nLayerIter          50;

    layers
    {
        foilSurface         // matches your STL patch name
        {
            nSurfaceLayers  {{ n_surface_layers }};   // 5 typical
        }
    }
}
```

**First-layer thickness calculation** (Python pre-solver, `tasks.py`):

```python
def compute_first_layer_thickness(velocity, nu, char_len, y_plus_target=1.0):
    """
    Uses flat-plate approximation to estimate wall friction velocity.
    Re_L = V * L / nu
    Cf ≈ 0.026 * Re_L^(-1/7)   (turbulent flat plate, Prandtl)
    tau_w = 0.5 * rho * V^2 * Cf
    u_tau = sqrt(tau_w / rho)
    y1 = y_plus_target * nu / u_tau
    """
    rho = 1025.0
    Re_L = velocity * char_len / nu
    Cf = 0.026 * Re_L ** (-1/7)
    tau_w = 0.5 * rho * velocity**2 * Cf
    u_tau = (tau_w / rho) ** 0.5
    y1 = y_plus_target * nu / u_tau
    return y1  # metres — feed into snappyHexMeshDict as firstLayerThickness
```

### 4.3 `system/surfaceFeatureExtractDict`

```cpp
FoamFile { version 2.0; format ascii; class dictionary;
           object surfaceFeatureExtractDict; }

foil.stl    // matches STL filename
{
    extractionMethod    extractFromSurface;
    includedAngle       150;    // deg — detects edges sharper than 30°
    writeObj            yes;
}
```

**New pipeline step** in `tasks.py` — insert before blockMesh:

```python
run_openfoam_cmd(case_dir, ["surfaceFeatureExtract"])
```

Also update `snappyHexMeshDict` features block:

```cpp
geometry
{
    foil.stl { type triSurfaceMesh; name foilSurface; }
}

castellatedMeshControls
{
    features
    (
        { file "foil.eMesh"; level {{ refinement_level_max }}; }
    );
    // ... rest unchanged
}
```

### 4.4 `0/p_rgh` — Pressure with Hydrostatics

When `enable_gravity = True`, switch from `p` to `p_rgh = p - rho*g*h`:

```cpp
FoamFile { version 2.0; format ascii; class volScalarField; object p_rgh; }
dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;

boundaryField
{
    inlet       { type  fixedFluxPressure; gradient uniform 0; value uniform 0; }
    outlet      { type  fixedValue;        value uniform 0; }
    walls       { type  fixedFluxPressure; gradient uniform 0; value uniform 0; }
    foilSurface { type  fixedFluxPressure; gradient uniform 0; value uniform 0; }
    top         { type  totalPressure;     p0 uniform 0; }
}
```

Update `fvSolution` to solve `p_rgh` instead of `p`, and update `fvSchemes` with `buoyancy` grad scheme.

### 4.5 `0/alpha.water` — VOF Phase Field (interFoam)

```cpp
FoamFile { version 2.0; format ascii; class volScalarField; object alpha.water; }
dimensions      [0 0 0 0 0 0 0];
internalField   uniform 1;     // start fully submerged; free surface sets this

boundaryField
{
    inlet       { type  fixedValue;     value uniform 1; }
    outlet      { type  zeroGradient; }
    top         { type  inletOutlet;   inletValue uniform 0; value uniform 0; }
    bottom      { type  zeroGradient; }
    sides       { type  zeroGradient; }
    foilSurface { type  zeroGradient; }
}
```

`constant/transportProperties` for interFoam:

```cpp
phases (water air);
water { transportModel Newtonian; nu 1e-6; rho 1025; }
air   { transportModel Newtonian; nu 1.48e-5; rho 1.2; }
sigma           0.07;   // N/m surface tension
```

### 4.6 `system/controlDict` — pimpleFoam (Transient)

```cpp
application     pimpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         {{ end_time }};
deltaT          {{ delta_t }};
adjustTimeStep  yes;
maxCo           {{ max_cfl }};
maxDeltaT       {{ delta_t * 10 }};
writeControl    adjustableRunTime;
writeInterval   {{ end_time / 50 }};    // 50 output frames
purgeWrite      10;
writePrecision  8;

functions
{
    forces
    {
        type            forces;
        libs            ("libforces.so");
        writeControl    timeStep;
        writeInterval   5;
        patches         (foilSurface);
        rho             rhoInf;
        rhoInf          1025;
        CofR            ({{ cog[0] }} {{ cog[1] }} {{ cog[2] }});
    }

    // ── Wall y+ ───────────────────────────────────────────────────────────
    yPlus
    {
        type            yPlus;
        libs            ("libfieldFunctionObjects.so");
        writeControl    writeTime;
    }

    // ── Field averaging (steady tail for transient) ───────────────────────
    fieldAverage
    {
        type            fieldAverage;
        libs            ("libfieldFunctionObjects.so");
        writeControl    writeTime;
        timeStart       {{ end_time * 0.6 }};
        fields
        (
            U  { mean on; prime2Mean off; base time; }
            p  { mean on; prime2Mean off; base time; }
        );
    }
}
```

### 4.7 `constant/dynamicMeshDict` — 6DOF Rigid Body Motion

```cpp
FoamFile { version 2.0; format ascii; class dictionary;
           object dynamicMeshDict; }

dynamicFvMesh   dynamicMotionSolverFvMesh;
motionSolverLibs ("libsixDoFRigidBodyMotion.so");
motionSolver    sixDoFRigidBodyMotion;

sixDoFRigidBodyMotionCoeffs
{
    patches         (foilSurface);
    innerDistance   0.3;
    outerDistance   1.5;

    mass            {{ vehicle_mass }};
    momentOfInertia ({{ Ixx }} {{ Iyy }} {{ Izz }}
                     {{ Ixy }} {{ Ixz }} {{ Iyz }});
    centreOfMass    ({{ cog[0] }} {{ cog[1] }} {{ cog[2] }});
    velocity        ({{ ux }} 0 {{ uz }});
    angularMomentum (0 0 0);
    orientation     (1 0 0  0 1 0  0 0 1);

    // Constrain to pitch-only (for foil stability studies)
    constraints
    {
        noTranslationX { sixDoFRigidBodyMotionConstraint line; direction (1 0 0); }
        noTranslationY { sixDoFRigidBodyMotionConstraint line; direction (0 1 0); }
    }

    restraints {}

    solver
    {
        type    Newmark;
        gamma   0.5;
        beta    0.25;
    }
}
```

### 4.8 `system/decomposeParDict` — Parallel Decomposition

```cpp
FoamFile { version 2.0; format ascii; class dictionary;
           object decomposeParDict; }

numberOfSubdomains  {{ n_parallel_cores }};
method              scotch;
```

**Pipeline insertion** (tasks.py):

```python
# After snappyHexMesh, before solver:
if run.n_parallel_cores > 1:
    run_openfoam_cmd(case_dir, ["decomposePar", "-copyZero"])
    solver_cmd = ["mpirun", "-np", str(run.n_parallel_cores),
                  solver_binary, "-parallel"]
else:
    solver_cmd = [solver_binary]
```

### 4.9 Cavitation — `constant/transportProperties` (interPhaseChangeFoam)

```cpp
// Schnerr-Sauer cavitation model
phaseChangeTwoPhaseMixture SchnorrSauer;

SchnorrSauerCoeffs
{
    n       {{ n_nuclei }};     // nuclei number density  (m⁻³)
    dNuc    {{ 2 * bubble_radius }};  // nuclei diameter (m)
    Cc      1;
    Cv      1;
}

pSat        {{ p_vapour }};    // vapour pressure (Pa)
```

---

## 5. Governing Equations

### 5.1 Propulsion Equilibrium

At steady state, net horizontal force = 0:

```
F_thrust - F_drag_hydro - F_drag_aero = 0

F_drag_hydro = 0.5 * rho_water * V² * (CD * A_ref)
F_drag_aero  = 0.5 * rho_air   * V² * CD_above * A_above

Sail model:
  F_thrust = 0.5 * rho_air * V_app² * A_sail * CL_sail * cos(beta)
             - 0.5 * rho_air * V_app² * A_sail * CD_sail * sin(beta)
  where V_app = apparent wind speed, beta = apparent wind angle

Kite model (parametric):
  F_thrust = 0.5 * rho_air * V_app² * A_kite * CL_kite * f(elevation, depower)
```

**Python equilibrium solver** (bisection, pre-solver in Phase 0):

```python
def solve_equilibrium_velocity(run, drag_coeff_func):
    """
    drag_coeff_func(V) → (CD, lift) from previous OpenFOAM result or initial guess.
    Returns V_eq where thrust(V) == drag(V).
    """
    from scipy.optimize import brentq

    rho_w = 1025.0
    rho_a = 1.225

    def residual(V):
        CD, _ = drag_coeff_func(V)
        F_drag = 0.5 * rho_w * V**2 * CD * run.reference_area
        if run.propulsion_model == 'constant':
            F_thrust = run.thrust_force
        elif run.propulsion_model == 'sail':
            beta = np.radians(run.wind_angle)
            V_app = np.sqrt(run.wind_speed**2 + V**2 + 2*run.wind_speed*V*np.cos(beta))
            F_thrust = 0.5 * rho_a * V_app**2 * run.sail_area * run.cl_sail
        elif run.propulsion_model == 'kite':
            V_app = run.wind_speed - V  # simplified downwind
            F_thrust = 0.5 * rho_a * V_app**2 * run.kite_area * run.cl_sail
        return F_thrust - F_drag

    try:
        V_eq = brentq(residual, 0.5, 50.0, xtol=0.01)
    except ValueError:
        V_eq = run.velocity   # fallback: use prescribed velocity
    return V_eq
```

### 5.2 PID Control Law

```
e(t)    = setpoint - measurement
u(t)    = Kp * e(t) + Ki * ∫e(t)dt + Kd * de/dt

Discrete (Euler, timestep Δt):
  integral += e * Δt
  derivative = (e - e_prev) / Δt
  u = Kp*e + Ki*integral + Kd*derivative
  e_prev = e

Ride height PID → output: Δ(submersion_depth) [m]  → translate foil in z
Pitch PID      → output: Δ(angle_of_attack)   [deg] → update inlet U decomposition
Velocity PID   → output: Δ(thrust)            [N]   → re-run propulsion solver
```

### 5.3 Virtual Sensor Definitions

| Sensor             | Source                                                         | Update            |
| ------------------ | -------------------------------------------------------------- | ----------------- |
| Ride height        | CoG z from dynamicMeshDict or fixed submersion_depth parameter | Per PID iteration |
| Velocity magnitude | Mean inlet U or from forces.dat total                          | Per iteration     |
| Lift force         | Fz column in `forces.dat` (OpenFOAM output)                    | Per solve         |
| Pitch moment       | My column in `moment.dat`                                      | Per solve         |
| Drag               | Fx column in `forces.dat`                                      | Per solve         |

---

## 6. Celery Pipeline — Extended `tasks.py`

```python
@celery_app.task(bind=True)
def run_hydro_simulation(self, run_id: str):
    run = SimulationRun.objects.get(id=run_id)
    case_dir = prepare_case_directory(run)

    # ── Phase 0: Pre-flight ──────────────────────────────────────────────────
    stl_path = ensure_stl(run)
    validate_stl(stl_path)
    char_len, bbox = compute_bounding_box(stl_path)
    scale_if_needed(stl_path, char_len)
    translate_submersion(stl_path, run.submersion_depth)

    # Propulsion pre-solve (Phase 3+)
    if run.propulsion_model != 'none':
        V_eq = solve_equilibrium_velocity(run, drag_coeff_func=initial_cd_guess)
        run.velocity = V_eq
        run.save(update_fields=['velocity'])

    ux = run.velocity * math.cos(math.radians(run.angle_of_attack))
    uz = -run.velocity * math.sin(math.radians(run.angle_of_attack))

    y1 = compute_first_layer_thickness(run.velocity, 1e-6, char_len, run.y_plus_target)

    # ── Render all templates ─────────────────────────────────────────────────
    solver_type = run.solver_type   # 'simpleFoam' | 'pimpleFoam' | 'interFoam'
    render_templates(case_dir, run, ux, uz, char_len, y1, solver_type)

    # ── Phase 1: Feature extraction ──────────────────────────────────────────
    update_status(run, 'MESHING', 'Extracting surface features...')
    run_of(case_dir, ["surfaceFeatureExtract"])

    # ── Phase 2: blockMesh ───────────────────────────────────────────────────
    run_of(case_dir, ["blockMesh"])

    # ── Phase 3: snappyHexMesh ───────────────────────────────────────────────
    run_of(case_dir, ["snappyHexMesh", "-overwrite"])

    # ── Phase 4: Parallel decomp ─────────────────────────────────────────────
    if run.n_parallel_cores > 1:
        run_of(case_dir, ["decomposePar", "-copyZero"])

    # ── Phase 5: Solver dispatch ─────────────────────────────────────────────
    update_status(run, 'SOLVING', f'Running {solver_type}...')
    solver_map = {
        'simpleFoam': 'simpleFoam',
        'pimpleFoam': 'pimpleFoam',
        'interFoam':  'interFoam',
    }
    solver_bin = solver_map[solver_type]
    if run.n_parallel_cores > 1:
        run_of(case_dir, ["mpirun", "-np", str(run.n_parallel_cores),
                          solver_bin, "-parallel"])
        run_of(case_dir, ["reconstructPar"])
    else:
        run_of(case_dir, [solver_bin])

    # ── Phase 6: PID outer loop (optional) ──────────────────────────────────
    if run.enable_pid:
        forces = parse_forces(case_dir)
        run = pid_control_loop(run, case_dir, forces, max_pid_iterations=10)

    # ── Phase 7: Post-processing ─────────────────────────────────────────────
    update_status(run, 'POST_PROCESSING', 'Extracting results...')
    results = post_process(case_dir, run)
    patch_django(run, results)

    update_status(run, 'COMPLETED')
```

---

## 7. PID Control Loop Pseudocode

```python
def pid_control_loop(run, case_dir, initial_forces, max_pid_iterations=10):
    """
    Outer loop: re-run solver with updated BCs after PID correction.
    This is NOT in-solver coupling — each iteration is a full simpleFoam solve.
    Suitable for quasi-static equilibrium finding.
    """
    dt = 1.0   # virtual timestep for integrator (dimensionless iteration count)

    # Controller states
    ctrl_height = PIDController(run.pid_ride_height_kp,
                                run.pid_ride_height_ki,
                                run.pid_ride_height_kd)
    ctrl_pitch  = PIDController(run.pid_pitch_kp,
                                run.pid_pitch_ki,
                                run.pid_pitch_kd)
    ctrl_vel    = PIDController(run.pid_velocity_kp,
                                run.pid_velocity_ki,
                                run.pid_velocity_kd)

    forces = initial_forces

    for i in range(max_pid_iterations):
        # Read virtual sensors from last solve
        lift       = forces['Fz']
        drag       = forces['Fx']
        pitch_mom  = forces['My']
        velocity   = run.velocity   # from propulsion or prescribed

        # Estimate ride height from lift balance: L = rho*g*(displaced_vol)
        # Simplified: actual_height ≈ target * lift / (rho * g * A_plan * V²)
        buoyancy_est = lift / (1025 * 9.81 * run.reference_area + 1e-9)
        measured_height = run.submersion_depth + buoyancy_est

        # PID outputs
        d_depth = ctrl_height.update(run.target_ride_height, measured_height, dt)
        d_aoa   = ctrl_pitch.update(run.target_pitch,
                                    math.degrees(pitch_mom / (lift + 1e-9)), dt)
        d_vel   = ctrl_vel.update(run.target_velocity, velocity, dt)

        # Clamp corrections
        d_depth = np.clip(d_depth, -0.2, 0.2)    # ±0.2 m per iteration
        d_aoa   = np.clip(d_aoa,   -2.0, 2.0)    # ±2° per iteration
        d_vel   = np.clip(d_vel,   -1.0, 1.0)    # ±1 m/s per iteration

        # Update run parameters
        run.submersion_depth  = max(0.05, run.submersion_depth - d_depth)
        run.angle_of_attack   = np.clip(run.angle_of_attack + d_aoa, -15, 15)
        run.velocity          = max(0.5, run.velocity + d_vel)
        run.save()

        # Convergence check
        if (abs(d_depth) < 0.005 and abs(d_aoa) < 0.1 and abs(d_vel) < 0.05):
            break

        # Re-render BCs and re-run solver
        ux = run.velocity * math.cos(math.radians(run.angle_of_attack))
        uz = -run.velocity * math.sin(math.radians(run.angle_of_attack))
        re_render_velocity_bc(case_dir, ux, uz)
        translate_foil(case_dir, run.submersion_depth)

        run_of(case_dir, ["simpleFoam"])
        forces = parse_forces(case_dir)

    return run


class PIDController:
    def __init__(self, Kp, Ki, Kd):
        self.Kp, self.Ki, self.Kd = Kp, Ki, Kd
        self._integral = 0.0
        self._prev_error = None

    def update(self, setpoint, measured, dt):
        e = setpoint - measured
        self._integral += e * dt
        derivative = (e - self._prev_error) / dt if self._prev_error is not None else 0.0
        self._prev_error = e
        return self.Kp*e + self.Ki*self._integral + self.Kd*derivative
```

---

## 8. Post-Processing Upgrades (`tasks.py`)

```python
def post_process(case_dir, run):
    import pyvista as pv
    import numpy as np

    reader = pv.OpenFOAMReader(str(case_dir / "case.foam"))
    reader.set_active_time_value(reader.time_values[-1])
    mesh = reader.read()

    results = {}

    # ── VTK/VTP export ────────────────────────────────────────────────────────
    if run.export_vtk:
        internal = mesh['internalMesh']
        boundary = mesh['boundary']['foilSurface']

        # Compute derived fields
        U = internal['U']
        internal['Umag'] = np.linalg.norm(U, axis=1)

        if 'p' in internal.array_names:
            p = internal['p']
            # Cp = (p - p_ref) / (0.5 * rho * V^2)
            p_ref = 0.0
            q_inf = 0.5 * 1025 * run.velocity**2
            internal['Cp'] = (p - p_ref) / q_inf

        # Wall y+
        if run.export_wall_yplus:
            yplus_reader = pv.OpenFOAMReader(str(case_dir / "case.foam"))
            yplus_reader.set_active_time_value(reader.time_values[-1])
            yplus_mesh = yplus_reader.read()
            yplus_boundary = yplus_mesh['boundary']['foilSurface']
            if 'yPlus' in yplus_boundary.array_names:
                yp = yplus_boundary['yPlus']
                results['wall_yplus_max']  = float(yp.max())
                results['wall_yplus_mean'] = float(yp.mean())

        # Export all requested fields to VTP
        export_fields = run.export_fields
        foil_fields = {f: boundary[f] for f in export_fields
                       if f in boundary.array_names}
        boundary.save(str(case_dir / "output" / "foil_surface.vtp"))
        internal.save(str(case_dir / "output" / "volume.vtu"))

    # ── Force & moment extraction ─────────────────────────────────────────────
    forces_file = case_dir / "postProcessing/forces/0/forces.dat"
    if forces_file.exists():
        data = parse_forces_dat(forces_file)
        # Average last 20% of iterations
        tail = data[int(len(data) * 0.8):]
        results['lift_force']  = float(np.mean(tail['Fz']))
        results['drag_force']  = float(np.mean(tail['Fx']))
        results['l_d_ratio']   = results['lift_force'] / max(abs(results['drag_force']), 1e-9)

    if run.export_moments:
        moments_file = case_dir / "postProcessing/forces/0/moment.dat"
        if moments_file.exists():
            mdata = parse_forces_dat(moments_file)
            tail  = mdata[int(len(mdata) * 0.8):]
            results['pitch_moment'] = float(np.mean(tail['My']))
            results['roll_moment']  = float(np.mean(tail['Mx']))
            results['yaw_moment']   = float(np.mean(tail['Mz']))

    # ── Free surface contour (interFoam only) ────────────────────────────────
    if run.solver_type == 'interFoam' and run.export_vtk:
        alpha = internal['alpha.water']
        free_surface = internal.contour([0.5], scalars='alpha.water')
        free_surface.save(str(case_dir / "output" / "free_surface.vtp"))

    # ── Residuals ─────────────────────────────────────────────────────────────
    log_name = {'simpleFoam': 'log.simpleFoam',
                'pimpleFoam': 'log.pimpleFoam',
                'interFoam':  'log.interFoam'}[run.solver_type]
    results['convergence_series'] = parse_residuals(case_dir / log_name)

    return results
```

---

## 9. Template Manager Updates (`template_manager.py`)

### New templates to add:

| File                                     | When rendered              | Key variables                            |
| ---------------------------------------- | -------------------------- | ---------------------------------------- |
| `constant/g`                             | `enable_gravity=True`      | Always `(0 0 -9.81)`                     |
| `0/p_rgh`                                | `enable_gravity=True`      | Same BCs as `p`                          |
| `0/alpha.water`                          | `solver_type='interFoam'`  | `submersion_depth` → initial alpha field |
| `constant/dynamicMeshDict`               | `enable_6dof=True`         | mass, inertia, CoG                       |
| `system/surfaceFeatureExtractDict`       | Always (Phase 1+)          | STL filename                             |
| `system/decomposeParDict`                | `n_parallel_cores > 1`     | core count                               |
| `system/controlDict.pimpleFoam`          | `solver_type='pimpleFoam'` | end_time, delta_t, CFL                   |
| `system/controlDict.interFoam`           | `solver_type='interFoam'`  | as above + alpha                         |
| `constant/transportProperties.interFoam` | VOF                        | two-phase properties                     |

### Solver dispatch in `render_templates()`:

```python
def render_templates(case_dir, run, ux, uz, char_len, y1, solver_type):
    ctx = build_context(run, ux, uz, char_len, y1)

    # Always render
    render('blockMeshDict',            case_dir, ctx)
    render('snappyHexMeshDict',        case_dir, ctx)
    render('surfaceFeatureExtractDict',case_dir, ctx)
    render('fvSchemes',                case_dir, ctx)
    render('fvSolution',               case_dir, ctx)
    render('turbulenceProperties',     case_dir, ctx)

    # Gravity-dependent
    if run.enable_gravity:
        render('g',     case_dir, ctx)
        render('p_rgh', case_dir, ctx)
    else:
        render('p',     case_dir, ctx)

    # Solver-specific
    if solver_type == 'simpleFoam':
        render('controlDict.simpleFoam', case_dir, ctx,
               dest='system/controlDict')
        render('transportProperties.single', case_dir, ctx)
        render('U', case_dir, ctx)
    elif solver_type == 'pimpleFoam':
        render('controlDict.pimpleFoam', case_dir, ctx,
               dest='system/controlDict')
        render('transportProperties.single', case_dir, ctx)
        render('U', case_dir, ctx)
    elif solver_type == 'interFoam':
        render('controlDict.interFoam', case_dir, ctx,
               dest='system/controlDict')
        render('transportProperties.interFoam', case_dir, ctx)
        render('alpha.water', case_dir, ctx)
        render('U.interFoam', case_dir, ctx, dest='0/U')

    # 6DOF
    if run.enable_6dof:
        render('dynamicMeshDict', case_dir, ctx)
        render('pointDisplacement', case_dir, ctx)

    # Parallel
    if run.n_parallel_cores > 1:
        render('decomposeParDict', case_dir, ctx)
```

---

## 10. Frontend Changes (`ConfigPanel.tsx`)

```tsx
// New panels to add — each maps directly to model fields

// SolverPanel
<Select label="Solver" field="solver_type"
        options={['simpleFoam','pimpleFoam','interFoam']} />
<NumberInput label="End Time / Iterations" field="end_time" />
<NumberInput label="Max CFL" field="max_cfl" min={0.1} max={2.0} step={0.1}
             disabled={run.solver_type === 'simpleFoam'} />
<NumberInput label="CPU Cores" field="n_parallel_cores" min={1} max={32} />

// MeshPanel additions
<Toggle label="Enable Boundary Layers" field="enable_layers" />
<NumberInput label="y⁺ Target" field="y_plus_target" min={0.5} max={30}
             disabled={!run.enable_layers} />
<NumberInput label="Number of Layers" field="n_surface_layers" min={3} max={15}
             disabled={!run.enable_layers} />

// TurbulencePanel
<NumberInput label="Turbulence Intensity (%)" field="turbulence_intensity"
             min={0.1} max={20} transform={v => v/100} />
<NumberInput label="Reference Length (m)" field="turbulence_length" />

// PropulsionPanel
<Select label="Propulsion Model" field="propulsion_model"
        options={['none','constant','sail','kite']} />
{run.propulsion_model === 'constant' &&
  <NumberInput label="Thrust (N)" field="thrust_force" />}
{['sail','kite'].includes(run.propulsion_model) && <>
  <NumberInput label="Wind Speed (m/s)" field="wind_speed" />
  <NumberInput label="Wind Angle (°)" field="wind_angle" />
  <NumberInput label={run.propulsion_model === 'sail' ? 'Sail Area (m²)' : 'Kite Area (m²)'}
               field={run.propulsion_model === 'sail' ? 'sail_area' : 'kite_area'} />
</>}

// PIDPanel
<Toggle label="Enable PID Control" field="enable_pid" />
{run.enable_pid && <>
  <NumberInput label="Ride Height Kp" field="pid_ride_height_kp" />
  <NumberInput label="Ride Height Ki" field="pid_ride_height_ki" />
  <NumberInput label="Ride Height Kd" field="pid_ride_height_kd" />
  <NumberInput label="Target Ride Height (m)" field="target_ride_height" />
  // ... pitch and velocity controllers similarly
</>}

// OrientationPanel
<NumberInput label="Pitch (°)" field="pitch" min={-20} max={20} />
<NumberInput label="Roll (°)"  field="roll"  min={-15} max={15} />
<NumberInput label="Yaw (°)"   field="yaw"   min={-30} max={30} />
<Toggle label="Enable 6DOF Motion" field="enable_6dof" />

// AdvancedPanel
<Toggle label="Enable Free Surface" field="enable_free_surface" />
<Toggle label="Enable Cavitation"   field="enable_cavitation"
        disabled={!['interFoam'].includes(run.solver_type)} />
<Toggle label="Export VTK Fields"   field="export_vtk" />
<Toggle label="Export Wall y⁺"      field="export_wall_yplus" />
```

---

## 11. Optimisation / Sweep Engine

```python
# tasks.py — sweep launcher

@celery_app.task
def launch_parameter_sweep(parent_run_id: str):
    parent = SimulationRun.objects.get(id=parent_run_id)
    assert parent.is_sweep_job

    child_ids = []
    for val in parent.sweep_values:
        child = SimulationRun.objects.create(
            **{k: getattr(parent, k) for k in COPYABLE_FIELDS},
            **{parent.sweep_parameter: val},
            parent_run=parent,
            is_sweep_job=False,
        )
        run_hydro_simulation.delay(str(child.id))
        child_ids.append(str(child.id))

    # Wait for all children, then aggregate
    chord(
        [run_hydro_simulation.si(cid) for cid in child_ids],
        aggregate_sweep_results.s(parent_run_id)
    ).apply_async()


@celery_app.task
def aggregate_sweep_results(results, parent_run_id: str):
    parent = SimulationRun.objects.get(id=parent_run_id)
    children = parent.sweep_children.order_by('created_at')

    summary = {
        'parameter': parent.sweep_parameter,
        'values': parent.sweep_values,
        'lift':    [c.lift_force   for c in children],
        'drag':    [c.drag_force   for c in children],
        'ld':      [c.l_d_ratio    for c in children],
        'moments': [c.pitch_moment for c in children],
    }
    # Write to parent run results_sequence.json
    save_sweep_summary(parent, summary)
    parent.status = 'COMPLETED'
    parent.save()
```

---

## 12. Mesh Independence Study

```python
@celery_app.task
def run_mesh_independence(base_run_id: str):
    """
    Runs 3 mesh densities (0.5×, 1×, 2×) and reports force convergence.
    """
    base = SimulationRun.objects.get(id=base_run_id)
    densities = [0.5, 1.0, 2.0]
    child_runs = []

    for d in densities:
        child = SimulationRun.objects.create(
            **{k: getattr(base, k) for k in COPYABLE_FIELDS},
            mesh_density=d,
            parent_run=base,
        )
        run_hydro_simulation.delay(str(child.id))
        child_runs.append(child)

    # Convergence criterion: GCI (Grid Convergence Index)
    # Richardson extrapolation on lift between mesh levels
```

---

## 13. Tradeoffs & Risks

| Feature                   | Risk                                                                                                                            | Mitigation                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Boundary layers           | `snappyHexMesh` can fail to add layers on complex geometry, leaving a distorted mesh                                            | Set `nRelaxIter 10`, lower `finalLayerThickness` to 0.1; add a post-layer mesh quality check and fall back to `enable_layers=False` |
| interFoam                 | 5–10× slower than simpleFoam; wave reflections at inlet                                                                         | Add `waveTransmissive` outlet BC; restrict to `run.velocity < 20 m/s`                                                               |
| PID outer loop            | 10 outer iterations × 1 full solve each = very long queue times                                                                 | Limit `max_pid_iterations=5`; expose as premium/async job; cache mesh across PID iterations                                         |
| 6DOF + snappyHexMesh      | `dynamicMeshDict` requires `pointDisplacement` BC and `dynamicMotionSolverFvMesh` — incompatible with static mesh workflow      | Gate 6DOF behind `enable_6dof` flag; use a separate mesh template branch entirely                                                   |
| Cavitation                | Requires `interPhaseChangeFoam`, not `interFoam` — different template set                                                       | Only expose when `solver_type='interFoam'` and add a third solver branch                                                            |
| Parallelisation           | `decomposePar` + reconstruction adds ~30% overhead for small meshes                                                             | Only activate for `n_cells > 500k` or user-selected                                                                                 |
| Propulsion equilibrium    | Bisection assumes monotone drag curve — valid only in sub-cavitation regime                                                     | Add max-iteration guard; flag non-convergence to user                                                                               |
| VOF free surface + layers | `snappyHexMesh` addLayers near a two-phase interface is numerically difficult                                                   | Disable layers when `enable_free_surface=True`; use `y+ ≈ 30` wall functions instead                                                |
| Template bloat            | 3 solver types × gravity on/off × 6DOF on/off = 12 template branches                                                            | Use a single Jinja2 template per file with `{% if %}` blocks rather than separate files per combination                             |
| Moment coefficient sign   | OpenFOAM `forces` function object uses a right-hand coordinate frame; y-axis moment = pitch, but sign depends on CofR placement | Document clearly; validate against known NACA foil coefficients at AoA=5°                                                           |

---

## 14. `fvSchemes` for interFoam / pimpleFoam

```cpp
// system/fvSchemes (transient / VOF)
ddtSchemes    { default Euler; }
gradSchemes   { default Gauss linear; grad(U) Gauss linear; }
divSchemes
{
    default             none;
    div(rhoPhi,U)       Gauss linearUpwind grad(U);
    div(phi,alpha)      Gauss vanLeer;
    div(phirb,alpha)    Gauss linear;
    div(((rho*nuEff)*dev2(T(grad(U))))) Gauss linear;
    div(phi,k)          Gauss upwind;
    div(phi,omega)      Gauss upwind;
}
laplacianSchemes { default Gauss linear corrected; }
interpolationSchemes { default linear; }
snGradSchemes { default corrected; }
```

`fvSolution` additions for interFoam:

```cpp
solvers
{
    "alpha.water.*"
    {
        nAlphaCorr      2;
        nAlphaSubCycles 1;
        cAlpha          1;
        MULESCorr       yes;
        nLimiterIter    3;
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-8;
        relTol          0;
    }
    p_rgh { solver GAMG; smoother GaussSeidel; tolerance 1e-7; relTol 0.01; }
    U     { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-7; relTol 0; }
}

PIMPLE
{
    momentumPredictor   yes;
    nOuterCorrectors    3;
    nCorrectors         2;
    nNonOrthogonalCorrectors 1;
}
```

---

## 15. Phase Execution Summary

| Phase | Features Added                                         | Est. Dev Effort | Simulation Speed Impact     |
| ----- | ------------------------------------------------------ | --------------- | --------------------------- |
| 1     | Layers · Feature edges · Moments · Gravity · y+        | 2 weeks         | +10–20% mesh time           |
| 2     | pimpleFoam · VTK export · Turbulence params · Parallel | 2 weeks         | Transient: 5–20× slower     |
| 3     | interFoam · Propulsion equilibrium                     | 3 weeks         | 5–10× slower                |
| 4     | PID loop · 6DOF                                        | 3 weeks         | 10× slower (N outer iters)  |
| 5     | Sweep engine · Mesh independence · Cavitation          | 3 weeks         | N× (number of sweep points) |
