App.tsx: 405 lines - monolithic page with upload logic, status handling, drag-drop,
    polling, and scene setup all in one file
  - ConfigPanel.tsx: 329 lines - large configuration panel
  - useSimStore.ts: 330+ lines - Zustand store with massive state, but this is a design
    choice (stores can be large)
  - components/ directory is reasonably organized with VTK subfolder
  - lib/ contains smaller utilities - good separation

  Backend (Django)

  - views.py: 219 lines - reasonable
  - models.py: 214 lines - reasonable
  - serializers.py: 162 lines - reasonable
  - nereus_core/settings.py: 144 lines - reasonable

  Simulation Worker (Celery)

  - tasks.py: 2,536 lines - HUGE monolith
  - template_manager.py: 686 lines - reasonable

  Let me identify the files that need modularization the most.

────────────────────────────────────────────────────────────────────────────────────────────

• Based on my analysis, here are the files that most urgently need modularization:

  ———

  ## Critical: Needs Immediate Modularization

  ### simulation_worker/tasks.py — 2,536 lines 🔴

  This is by far the most critical. Single-handedly handles the entire CFD simulation
  pipeline:

  | Concern | Lines | Issue |
  |---------|-------|-------|
  | Celery config + Django bootstrap | ~50 | Should be in separate config module |
  | Status patching helper | ~40 | Extract to status.py |
  | _ensure_foil_stl() | ~40 | File format conversion utility |
  | _parse_forces() | ~100+ | Forces/coefficients parsing |
  | extract_temporal_frames() | ~200+ | Frame extraction logic |
  | run_openfoam_simulation() | ~1500+ | Main task - severely overloaded |
  | OpenFOAM command builders | scattered | Mesh config, solver config, controlDict |

  Recommended splits:

  - tasks.py → task signatures only, delegate to service classes
  - services/mesh.py → mesh generation logic
  - services/solver.py → OpenFOAM configuration
  - services/postprocess.py → result extraction & analysis
  - parsers/forces.py → forces.dat parsing
  - utils/geometry.py → STL conversion helpers

  ———

  ### frontend/src/App.tsx — 405 lines 🟡

  Contains too many responsibilities for a root component:

  - File upload/validation logic
  - SimulationToolbar component (100+ lines) defined inline
  - Polling with exponential backoff logic
  - Drag-and-drop handling
  - Scene initialization

  Recommended splits:

  - Extract SimulationToolbar to components/SimulationToolbar.tsx
  - Extract upload logic to hooks/useFileUpload.ts
  - Extract polling logic to hooks/useSimulationPolling.ts
  - Keep only page composition in App.tsx

  ———

  ### frontend/src/components/ConfigPanel.tsx — 329 lines 🟡

  Large component handling:

  - Simulation parameter inputs
  - Orientation panel
  - Advanced toggles
  - API call to launch simulation

  Recommended splits:

  - Extract orientation controls → components/orientation/OrientationControls.tsx
  - Extract simulation params → components/params/SimulationParams.tsx
  - Extract run button → components/params/RunSimulationButton.tsx

  ———

  ## Moderate: Should Be Refactored

  ### frontend/src/store/useSimStore.ts — 330+ lines 🟠

  Large Zustand store with 40+ state properties. While stores can be large, this crosses a
  threshold where it becomes hard to reason about.

  Consider splitting into:

  - store/simulationStore.ts — simulation params & status
  - store/visualizationStore.ts — layers, colormap, bounds
  - store/playbackStore.ts — temporal playback state

  ### simulation_worker/template_manager.py — 686 lines 🟠

  Template generation logic is reasonable but handles multiple concerns:

  - Template variable substitution
  - OpenFOAM dict parsing (controlDict, fvSchemes, etc.)
  - SHM template management

  Recommended splits:

  - templates/base.py — core template engine
  - parsers/openfoam_dict.py — dict file parsing/serialization

  ———

  ## Files That Are Fine ✅

  | File | Lines | Assessment |
  |------|-------|------------|
  | backend/api/views.py | 219 | Well-scoped |
  | backend/api/models.py | 214 | Well-scoped |
  | backend/api/serializers.py | 162 | Well-scoped |
  | backend/nereus_core/settings.py | 144 | Reasonable Django settings |
  | frontend/src/components/VTK/VtkViewport.tsx | 103 | Good size |
  | frontend/src/lib/* | varies | Small utilities - good pattern |

  ———

  ## Summary Priority

  1. simulation_worker/tasks.py — Highest ROI refactor; could split into 5-6 focused modules
  2. frontend/src/App.tsx — Quick wins by extracting 2-3 components/hooks
  3. frontend/src/components/ConfigPanel.tsx — Logical subcomponent extraction
  4. simulation_worker/template_manager.py — Worth splitting for testability