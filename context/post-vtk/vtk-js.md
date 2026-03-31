✅ Overview: VTK/CFD rendering pipeline in your project
Excellent news: your VTK pipeline is already clean, clearly divided, and production-ready.
I mapped all relevant data flows starting from backend output (frame_mapping, metrics_series) through UI state (useSimStore), then into the VTK render path (useVtkScene) and final overlays (ColorbarLegend).
The summary below is tightly focused on final 3D foil rendering, flow/pressure lines, and engineering metrics.

🔧 Key files and their roles
VtkViewport.tsx
Root 3D viewport.
Builds VTK container and overlay components.
Triggers useVtkScene + useVtkRenderer + playback.
useVtkRenderer.ts
Creates VTK render pipeline, lights, camera, interactor, orientation widget.
Handles resize.
Exposes contextRef + contextReady.
useVtkScene.ts
Core actor management and data visualization.
Handles foil, flow lines, pressure lines, vorticity, streamlines.
vtkColormaps.ts
Builds vtkColorTransferFunction from colormap names (turbo, viridis, ...).
useSimStore.ts
Zustand global state and toggles (showPressureMap, showFlowLines, etc.).
Ingests backend analysis payload.
ColorbarLegend.tsx
UI legend / metrics colormap overlay.
Uses metricsSeries (Fx proxy for pressure) to drive indicator.
🧱 Data flow from backend to VTK
Backend simulation extraction (in tasks.py):

Generates frame_mapping[] with:
mesh_path (foil surface VTP/STL)
pressure_lines_path
flow_lines_path
metrics: Fx, Fy, Fz, ld_ratio
Creates result_sequence_path JSON.
Optionally includes vorticity iso-surface (q_criterion_isosurface.vtp) and skin friction streamlines (skin_friction_lines.vtp).
API store:

views.py returns frame_mapping and result_sequence_path.
frontend stores into useSimStore.setAnalysisData.
In useVtkScene:

foilUrl selected by:
frame_mapping[currentFrame].mesh_path
fallback resultMeshPath
selected asset preview (static model)
pressureLinesUrl and flowLinesUrl are constructed similarly and gated by toggles.
🎛️ Final foil rendering (useVtkScene)
Load path (Effect 1)
Triggered on foilUrl, activeSimId, contextReady.
Async fetch + caching (cacheRef), to avoid repeat downloads.
Supported files:
.stl via vtkSTLReader
.vtp via vtkXMLPolyDataReader
Scalar fields / pressure overlay
ensureScalarArray(polyData):
Preferred real fields:
"Cp" or "p".
Fallback for STL (no field data):
built from x-coordinate, normalized to [0,1] as synthetic "x_pressure".
Actor setup
vtkMapper with interpolateScalarsBeforeMapping: true
ensureScalarArray plus showPressureMap:
if true: set colormap via createVtkLookupTable(colormap, scalarInfo.range); set scalar coloring
if false: scalar off; fallback gray color
vtkActor properties:
ambient 0.15, diffuse 0.75, specular 0.35, specularPower 32
double-sided (back/front culling off)
opacity 0.95 (default) or 1 if pressure color
Helpers (in same effect)
buildGridActor (plane grid under foil)
buildFlowArrowActor (upstream flow direction arrow)
buildMarkerActors (nose/tail cones)
Orientation applied to all except grid plane using pitch,yaw,roll from useSimStore
Camera fit:
renderer.resetCamera(), camera.elevation(25), camera.azimuth(-35), clipping range reset.
Scene bounds stored in store via setVtkSceneBounds.
Stale safety
genRef monotonic counter prevents races from overlapped async loads.
clearAllActors and removeActor, plus scene cleanup on run switch/unmount.
🌊 Flow lines (useVtkScene effect 2)
Visible when showFlowLines = true and flow_lines_path exists.
Load frame’s flow_lines_path mesh (VTK/STL)
Tube or wireframe path:
hasLines = polyData.getNumberOfLines?.() > 0
If true: apply vtkTubeFilter (radius based on foil chord)
Else (tubes undefined; maybe surface lines): direct mapping and representation = wireframe
Coloring:
Prefer Cf data
If Cf, configure color map with audio range, scalarVisibility
Else static blue-ish color with 0.85 opacity
🎚️ Pressure iso-surface lines (useVtkScene effect 2b)
Visible when showPressureMap true and pressure_lines_path exists.
Load polydata, apply mapper:
prefer data array Cp or p
scalarRange, color map, scalarMode as point data
fallback static color + opacity 0.6
Mostly for showing geometry of pressure isocontours around foil.
🌀 Vorticity / streamlines (useVtkScene effect 2c)
Controlled by showVorticity / showStreamlines.
Uses static convention:
vorticity: /media/simulations/{id}/q_criterion_isosurface.vtp
streamlines: /media/simulations/{id}/skin_friction_lines.vtp
Color by vorticity_x or Cf, else scalarVisibility false + purple.
Opacity 0.5–0.7.
🔄 Pressure-on/off + colormap update (Effect 3)
On showPressureMap or colormap changes (no URL reload):
re-evaluates existing foil actor and polydata
ensureScalarArray(polyData) each time (pragmatic double check)
toggles scalar mapping on/off; controlling actor properties accordingly
🧭 Orientation updates (Effect 4)
On pitch, yaw, roll change:
applies to all actors in actorsRef, except grid plane.
Ensures orientation preview and actual output stay in sync.
🧹 Reset + cleanup
Effect 5: on activeSimId change:
reset camera fit & run state
clear all actors
delete cached polydata
Effect 6: unmount cleanup does same.
📈 Metrics and overlay links
useSimStore holds:
metricsSeries (from backend)
per-frame Fx, Fy, Fz, ld_ratio
frame_mapping time/iteration and paths for 3D assets.
ColorbarLegend uses Fx as proxy for pressure:
compute min/max from full series
show current frame position as marker
uses CSS gradient from colormapGradientCSS (triangular snippet)
MetricHUD (not shown here) likely renders forces, camber coefficient etc in UI HUD.
📌 Audit (strengths, current issues, potential risk)
Strengths
Separation of concerns:
low-level render (renderer)
scene actors/data (scene hook)
app state + toggles (Zustand)
Supports both UI asset preview and simulation frames.
Good edge-case handling:
no data, missing arrays, STL fallback
stale async abort by generation token
cache + cleanup on run change
Visual quality:
full lighting, orientation marker, double-sided foil rendering
use of scalar transfer function with real colormaps
Known caveats / risk areas
ensureScalarArray recomputes 32-bit x_pressure for each foil, no timestamp, may reallocate each render if toggled heavily.
make sure polyData.getPointData()` object exists continuously; there is a defensive check already.
Flow lines path: existing vtkTubeFilter logic may fail/performance expensive if dataset huge.
pressureLinesUrl load is same as direction Isoline in UI; no specialized contour strength-level adjustments from user.
ColorbarLegend maps hydraulic Fx as "Pressure", but this is proxy; local surface Cp could differ.
VTK pipeline tear-down is thorough, but corner case:
multiple repeated render() calls may happen across effects (minor, but CPU/GPU overhead when toggles change quickly).
Quick action items (if you want next):
Add direct readout of current field Cp/p from scene under cursor (picking).
Add delta/streamline animation speed control via physics time.
Add • pressure_lines` selection of iso value threshold.
Add flow_lines to use actual vector direction field (currently precomputed from postprocess).
Add check that frame_mapping and resultSequencePath are served with correct CORS and fetch with clearer errors.
📎 Mapping to code locations (reference)
final 3D foil: useVtkScene.ts (lines ~269–457)
pressure + color mapping: same file (effect 1 + 3)
flow lines: same file (effect 2, lines ~454–536)
pressure lines: effect 2b (~544–601)
vorticity/streamlines: effect 2c (~638–696)
rendering engine boot: useVtkRenderer.ts
colormaps: vtkColormaps.ts
metrics range UI: ColorbarLegend.tsx
backend generation and frame metadata + forces: tasks.py lines ~2018 onward.
💡 Bottom line
Your VTK/CFD integration is very solid and full-featured.
The main final rendering path is in useVtkScene, using VTK.js pipeline best practices (actors+mapper+lookup table), with robust fallback for STL and explicit pressure/flow/vorticity modes.
Metrics are stored in frame_mapping as Fx/Fy/Fz/ld_ratio, surfaced in HUD/legend, and correlated with VTK layers via frame sync.
