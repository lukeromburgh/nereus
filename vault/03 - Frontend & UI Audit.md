# 03 — Frontend & UI Audit

> Component architecture, 3D visualisation (VTK.js), state management, styling, bundle strategy, and code quality.

---

## Technology Stack

| Layer | Choice | Version | Notes |
|-------|--------|---------|-------|
| **Framework** | React | 19.2 | Latest; concurrent features available but unused |
| **Build** | Vite | 8.0 | Fast HMR; manual chunk splitting configured |
| **Language** | TypeScript | 5.9 | Strict mode enabled (`noUnusedLocals`, `noFallthroughCases`) |
| **State** | Zustand | 5.0 | Single atom store (`useSimStore`) + asset store |
| **3D Engine** | VTK.js (@kitware/vtk.js) | 35.3 | Low-level OpenGL render pipeline, not React Three Fiber |
| **Charts** | Recharts | 3.2 | Used in some places; hand-rolled SVG in others |
| **Styling** | Tailwind CSS | 3.4 | Dark theme, glass-morphic design tokens |
| **Animation** | Framer Motion | 12.38 | Panel transitions, modals, overlays |
| **Routing** | React Router | 7.13 | 3 routes, lazy-loaded |
| **Tree view** | react-arborist | 3.4 | Drag-and-drop folder tree in asset manager |
| **HTTP** | Axios | 1.13 | No shared instance — raw calls scattered across files |
| **Icons** | Lucide React | 0.577 | Consistent icon set throughout |
| **Linting** | ESLint 9 | Flat config | TS + React Hooks + React Refresh rules |

### What's Good About the Stack
- **VTK.js** is the right choice for CFD visualisation. It handles VTP polydata natively, supports colormapping scalars, and scales to large meshes far better than Three.js or R3F would.
- **Zustand** is lightweight and avoids the boilerplate of Redux. Selector pattern (`useSimStore(s => s.field)`) prevents unnecessary re-renders.
- **Vite 8** with manual chunks means VTK.js (~1.5 MB gzipped) only loads when the simulation page is reached.
- **Tailwind + glass-morphic tokens** gives the app a polished, cohesive dark-mode aesthetic without CSS-in-JS overhead.
- **TypeScript strict mode** catches a class of bugs at compile time.

### What's Concerning
- **React 19** is used but no concurrent features (transitions, Suspense for data, `useOptimistic`) are leveraged. This is fine — just noting it's available.
- **No test files anywhere** in `src/`. Vitest is configured but empty. The `../tests/` directory has Python and one TypeScript file (`test_scene_transforms.ts`) — no component or integration tests.
- **No error boundary** wrapping the VTK canvas. A WebGL context loss or VTK exception will crash the entire app with a white screen.

---

## Routing & Layout

### Structure

```
main.tsx                          ← BrowserRouter + 3 lazy routes
  └─ AppShell                     ← Layout shell (SideNav + TopNavbar + Outlet)
      ├─ /           → App.tsx    ← "SimulationPage" (VTK viewport + config + logs)
      ├─ /assets     → AssetManagerPage
      └─ /comparison → RunComparisonPage
```

`AppShell` provides:
- **SideNav** (56 px left rail): logo, three nav links, "NEW RUN" button
- **TopNavbar** (header bar): brand + dynamic toolbar content injected per-page via `ToolbarContext`
- **`<Outlet />`**: page content

Each route is wrapped in `<Suspense>` with a spinner fallback. `AppShell` loads synchronously (correct — shell must paint immediately).

### Issues

#### MEDIUM: No 404 / Catch-All Route

If a user navigates to `/settings` or any non-existent path, React Router renders nothing inside the `<Outlet>`. There's no `<Route path="*">` — the user sees SideNav + TopNavbar + blank content.

**Fix**: Add a `<Route path="*" element={<NotFoundPage />} />` inside the `<Route element={<AppShell />}>` block.

#### MEDIUM: Route-Based State Isolation Missing

All three pages share the same `useSimStore`. Navigating from `/` to `/assets` and back preserves simulation state (good), but if the asset manager deletes an asset that's currently selected in the simulation page, the VTK scene will try to fetch a deleted URL on return.

**Fix**: Add a listener in `useSimStore` that clears `selectedAsset*` if the asset is deleted from `useAssetStore`.

#### LOW: No URL Parameters

Runs and assets are not addressable by URL. You cannot link to `/run/42` or `/assets/folder/5`. Everything is ephemeral Zustand state. A page refresh loses all context.

---

## Component Architecture

### File Organisation

```
components/
├── 20 top-level files           ← Mixed concerns: panels, HUDs, forms, overlays
├── VTK/                         ← VTK-specific overlay components (6 files)
└── assets/                      ← Asset manager sub-components (5 files)
```

There is no component index file (barrel export) at the top level. Imports are direct path imports:
```typescript
import { Sidebar } from "./components/Sidebar";
import { VtkViewport } from "./components/VTK/VtkViewport";
```

### Component Hierarchy (Simulation Page)

```
SimulationPage (App.tsx)
├── Sidebar                    ← Assets list + Runs list (prop: refreshNonce)
├── VtkViewport                ← VTK.js canvas + all overlays
│   ├── StatusBadge            ← Run status (top-left)
│   ├── GizmoToolbar           ← Transform mode selector (top-center)
│   ├── MetricHUD              ← Forces + coefficients (top-right)
│   ├── LayerManager           ← Overlay toggles (left-side)
│   ├── ColorbarLegend         ← Pressure scale (right)
│   ├── LDHistoryChart         ← Sparkline (bottom-left)
│   └── TimelineController     ← Playback scrubber (bottom)
├── LogConsoleCompact           ← Bottom panel (streaming logs)
├── ConfigPanel OR AnalysisPanel ← Right column (mode-switched)
│   └── (AnimatePresence swap)
└── ToastContainer             ← Bottom-right notifications
```

### Component Sizing

| Component | Lines | Complexity | Notes |
|-----------|-------|-----------|-------|
| `App.tsx` (SimulationPage) | ~400 | HIGH | Upload, polling, drag-drop, layout — too many concerns |
| `useVtkScene.ts` | ~800 | VERY HIGH | Scene graph management, data loading, rotation, camera |
| `useTransformGizmo.ts` | ~500 | HIGH | Full 3D gizmo implementation with picking + drag |
| `AnalysisPanel.tsx` | ~300 | MEDIUM | Metric cards, charts, exports |
| `AssetManagerPage.tsx` | ~300 | MEDIUM | Full CRUD file manager |
| `RunComparisonPage.tsx` | ~300 | MEDIUM | Comparison table + charts |
| `ConfigPanel.tsx` | ~200 | MEDIUM | Form with sliders |
| `Sidebar.tsx` | ~200 | MEDIUM | Tree + runs list |
| `TimelineController.tsx` | ~250 | MEDIUM | Playback transport + scrubber |
| `OrientationPanel.tsx` | ~200 | MEDIUM | Pitch/roll/yaw correction |
| `LayerManager.tsx` | ~200 | MEDIUM | Toggle panels with previews |

### Anti-Patterns

#### HIGH: App.tsx is a God Component

`App.tsx` handles: file validation, file upload (with progress), simulation polling (with exponential backoff), post-run analysis loading, drag-and-drop file ingestion, collapsible sidebar panel, toolbar injection, and the entire page layout. These are at least 4 distinct concerns.

**Recommendation**: Extract:
1. `useFileUpload()` hook → handles validation, FormData POST, progress tracking
2. `useSimulationPoller()` hook → manages polling lifecycle (already partially exists as logic in `useEffect`)
3. `useAnalysisLoader()` hook → fetches analysis payload on COMPLETED
4. Keep layout + composition in `SimulationPage`

#### HIGH: useVtkScene.ts is Too Large (800+ lines)

This single hook manages: STL/VTP loading, geometry caching, polydata smoothing + normals, synthetic pressure generation, data-level Euler rotation, helper actors (axes, flow arrow, nose/tail cones), camera fitting, pressure coloring, flow line loading, colormap application, layer visibility, and scene cleanup.

**Recommendation**: Split into composable hooks:
- `useGeometryLoader()` — fetch, parse, smooth, cache
- `useSceneActors()` — create/update VTK actors from loaded geometry
- `useSceneRotation()` — Euler rotation on vertex data
- `useSceneCamera()` — fit, reset, elevation/azimuth
- `useSceneLayers()` — visibility toggles, colormap application

#### MEDIUM: Duplicated Formatting Logic

`formatNumber()` is defined independently in:
- `AnalysisPanel.tsx`
- `VTK/MetricHUD.tsx`
- `RunComparisonPage.tsx`

Status color config objects are duplicated across:
- `LogConsole.tsx`
- `VTK/StatusBadge.tsx`
- `StatusPill.tsx`
- `App.tsx` (SimulationToolbar)

**Fix**: Move to `lib/format.ts` and `lib/statusConfig.ts`.

#### MEDIUM: No Error Boundary

There is no `<ErrorBoundary>` component anywhere. A VTK.js crash (WebGL context loss, malformed VTP, out-of-memory) propagates to React's default handler — blank white screen with console error.

**Fix**: Wrap `<VtkViewport>` in an error boundary that shows a recovery UI: "3D rendering failed. [Reload viewport]".

#### LOW: Mixed Overlay Strategy

The VTK viewport uses `pointer-events-none` on a container div, with `pointer-events-auto` on each interactive child. This works but creates a fragile layering system — any new overlay element that forgets `pointer-events-auto` will be unclickable. The z-index stack is implicit.

---

## State Management

### Architecture

Two Zustand stores:

| Store | Slice Count | Lines | Scope |
|-------|------------|-------|-------|
| `useSimStore` | ~50 fields, ~30 actions | 370 | Everything: simulation lifecycle, config inputs, orientation, visualization, playback, project/asset context |
| `useAssetStore` | ~10 fields, ~5 actions | 90 | Asset folder tree, expanded state, CRUD operations |

Plus one React Context:
- `ToolbarContext` — lets pages inject JSX into the `TopNavbar`

### What Works

- **Selector pattern** used consistently: `useSimStore(s => s.velocity)` — prevents cascading re-renders.
- **Action co-location**: setters live next to state, no separate action files.
- **Reset functions**: `resetForNewRun()` clears all transient state in one call.
- **No unnecessary abstraction**: No middleware, no persistence, no devtools — keeps it simple.

### Issues

#### HIGH: God Store → [[God Store Problem]]

`useSimStore` mixes 5 unrelated domains into one atom:

1. **Simulation lifecycle** — `activeSimId`, `status`, `logs`, result paths
2. **Simulation config** — `velocity`, `aoa`, `waterDensity`, `meshDensity`, etc.
3. **Visualization** — `showFlowLines`, `showPressureMap`, `colormap`, `enableBloom`
4. **Playback** — `frameMapping`, `currentFrame`, `isPlaying`, `playbackSpeed`
5. **Orientation** — `pitch`, `roll`, `yaw`, `geometryDimensions`, `geometryAxesDetected`

Any subscriber to one domain gets re-render notifications from all others (mitigated by selectors, but the conceptual coupling remains).

**Recommendation**: Split into focused stores:
```
useSimLifecycle()    → id, status, logs, results
useSimConfig()       → velocity, aoa, density, mesh, advanced params
useVisualization()   → layers, colormap, bloom, SSAO
usePlayback()        → frames, current, speed, loop
useOrientation()     → pitch, roll, yaw, detected axes
```

Each can be a separate Zustand `create()` call. Cross-store reads use `getState()`.

#### HIGH: No State Persistence

Refreshing the page loses everything:
- Selected asset
- Selected simulation run
- All config values (velocity, AoA, etc.)
- Active run polling reference
- UI state (panel open/closed, advanced mode)

For a tool where a designer spends 30+ minutes waiting for a run, losing context on refresh is a significant UX failure.

**Fix**: Use Zustand's `persist` middleware for at minimum:
- `activeSimId` → resume polling on refresh
- `selectedAssetId` → reload geometry
- `projectId` → maintain project context
- Config values → preserve between runs

#### MEDIUM: Hardcoded `projectId: 1`

The store initialises `projectId: 1`. There is no project picker. The `Project` model and API exist, but the frontend is single-project only.

#### LOW: `updateSim` Uses `any`

```typescript
updateSim: (data: any) => void;
```

The poll response is not typed. A backend schema change (e.g., renaming `current_logs` → `logs`) would silently break without a compile error.

**Fix**: Type the poll response as `SimulationRunPollResponse`.

---

## VTK.js Integration

### Architecture

The VTK integration happens through 4 layered hooks:

```
VtkViewport.tsx
  └─ useVtkRenderer()      ← WebGL pipeline: RenderWindow, Renderer, Interactor, lights, resize
       └─ useVtkScene()     ← Scene graph: geometry loading, actors, rotation, coloring, camera
            └─ useVtkPlayback()   ← requestAnimationFrame loop, frame stepping
            └─ useTransformGizmo() ← Interactive 3D gizmo (translate/rotate/scale)
```

### What's Technically Impressive

1. **Direct VTK.js instantiation** — Bypasses the factory pattern to work around Vite pre-bundling:
   ```typescript
   import vtkOpenGLRenderWindow from "@kitware/vtk.js/Rendering/OpenGL/RenderWindow";
   const oglRW = vtkOpenGLRenderWindow.newInstance();
   ```
   This is necessary because Vite isolates CJS modules into separate chunks, breaking the `VIEW_CONSTRUCTORS` registry that `vtkFullScreenRenderWindow` relies on. The workaround is correct and well-commented.

2. **Geometry Profile import** — Ensures the OpenGL backend's ClassMapping is populated before any actor is created:
   ```typescript
   import "@kitware/vtk.js/Rendering/Profiles/Geometry";
   ```
   Without this, actors silently fail to render. This is a common VTK.js/Vite pitfall — good that it's handled.

3. **Data-level rotation** — Orientation correction mutates vertex positions (Float32Array) rather than setting actor transforms. This ensures VTK's scalar mapping, normals, and bounds all reflect the rotated geometry. The "pristine copy" pattern (storing original positions for re-rotation) is correct.

4. **Mesh smoothing pipeline** — Windowed-sinc filter (0.1 passband, 20 iterations) followed by PolyDataNormals (featureAngle=60°, splitting disabled). This produces smooth lighting on STL meshes that would otherwise look faceted.

5. **Custom transform gizmo** — Full implementation of translate/rotate/scale handles with cell picking, hover highlighting, snap-to-grid (Shift key), and drag accumulation. This is ~500 lines of careful coordinate math.

### Issues

#### CRITICAL: No WebGL Error Handling

If the user's browser doesn't support WebGL2, or the GPU driver crashes, or the WebGL context is lost (common on macOS after sleep/wake), the app silently fails. The VTK canvas goes black or white, with no recovery path.

**Fix**:
1. Check `canvas.getContext('webgl2')` on init → show "WebGL not supported" fallback
2. Listen for `webglcontextlost` event on the canvas → show recovery UI
3. Wrap the VTK hook tree in an error boundary

#### HIGH: Memory Leak — No Geometry Eviction → [[VTK Memory Leak]]

`useVtkScene` caches geometry by URL:
```typescript
const geoCache = useRef<Map<string, CachedGeo>>(new Map());
```

This map grows indefinitely. Each VTP frame (with pressure scalars) can be 2–10 MB of vertex data. Loading 10 frames across 5 runs = 50–500 MB of cached geometry that's never released.

**Fix**: Add LRU eviction (e.g., max 20 entries, or max 200 MB). On eviction, call `polyData.delete()` to release VTK-allocated memory.

#### HIGH: STL Parsing on Main Thread

STL and VTP fetching + parsing happens in `useEffect` on the main thread:
```typescript
const arrayBuffer = await fetch(url).then(r => r.arrayBuffer());
reader.parseAsArrayBuffer(arrayBuffer);
```

For large meshes (50+ MB STL), this blocks the UI for several seconds. The user sees a frozen viewport with no feedback.

**Fix**: Move parsing to a Web Worker. VTK.js supports transferable ArrayBuffers. Alternatively, show a progress indicator during parsing.

#### MEDIUM: Synthetic Pressure Fallback

When an STL has no pressure data, `useVtkScene` generates a fake gradient:
```typescript
// x-coordinate as mock pressure
const xCoord = points[i * 3];
scalars.push(xCoord);
```

This produces a left-to-right color gradient that looks like a real CFD result but is entirely fake. There is no visual indicator that the pressure coloring is synthetic.

**Fix**: Either disable pressure coloring for raw STL uploads, or add a clear "Preview only — no simulation data" label on the colorbar.

#### MEDIUM: OrientationMarkerWidget (Axes Gizmo)

The orientation marker widget (corner axes indicator) is created but the code comment notes it may not be visible. The `viewportCorner` and `viewportSize` settings determine placement.

#### LOW: Hardcoded Lighting

Two lights (headlight + fill) with fixed intensities. No environment map or HDR probe. The foil surface doesn't look physically realistic — it's better than flat shading but far from PBR.

For MVP this is acceptable. For a polished product, consider an HDR environment map for metallic surface appearance.

---

## Styling & Design System

### Approach

The app uses a **layered dark-theme design system**:

1. **CSS custom properties** (`globals.css`) — Define color palette, shadows, typography tokens
2. **Tailwind config** (`tailwind.config.js`) — Maps tokens into Tailwind utility classes
3. **Tailwind component layer** (`index.css`) — Defines `.glass-panel`, `.hud-*`, `.slider-aerospace` reusable classes
4. **Tailwind plugins** (inline in config) — Adds `.scrollbar-dark`, `.btn-primary`, `.input-base`

### What Works Well

- **Consistency**: The palette is cohesive — zinc-based grays (09090b through fafafa), blue accent (#3b82f6), status colors (emerald/amber/rose/cyan). All status colors have verified WCAG AA contrast ratios on dark backgrounds (annotated in the tailwind config).
- **Glass-morphic panels**: The `glass-panel` component class (`bg-surface`, `backdrop-blur`, `border-hud-border`, `shadow-glass`) gives the UI a premium, cockpit-instrument feel that's appropriate for an aerospace/marine engineering tool.
- **Typography**: Inter (UI) + JetBrains Mono (data/logs). Inter's tabular-nums feature for metric displays prevents layout jitter as numbers change.
- **No CSS-in-JS**: Zero runtime cost for styles. All resolved at build time by Tailwind's JIT compiler.
- **Custom slider** (`.slider-aerospace`): Styled range input with glow effect — fits the dark aesthetic.
- **Scanlines utility**: Subtle effect for cockpit/HUD authenticity. A nice touch.

### Issues

#### HIGH: Duplicate Style Definitions

`globals.css` and `index.css` both define glass-panel, HUD, and base styles. They are not identical:
- `globals.css` uses raw CSS with `var(--...)` references
- `index.css` uses Tailwind `@apply` directives

Both are imported (via different paths), which means:
- The `@layer components` blocks compete — the last-imported wins
- Some tokens differ (e.g., `globals.css` defines `--shadow-glass` inline; `index.css` uses `@apply shadow-glass` which maps to the Tailwind config)

**Fix**: Delete one. Keep `index.css` (with Tailwind directives) as the single source. Move the CSS custom properties block from `globals.css` into the Tailwind plugin's `addBase()` (already partially done in the config).

#### HIGH: Design Tokens System Unused

`lib/designTokens.ts` reads CSS variables from `:root` at runtime and exports a typed `DesignTokens` object with refresh capability. However, **no component imports or uses `designTokens`**. Every component uses Tailwind classes directly or hardcoded hex values.

**Fix**: Either:
- Use the design tokens (e.g., for VTK.js scene background colour, chart colours, programmatic styling)
- Remove the file to reduce dead code

#### MEDIUM: Tailwind Config is Overly Detailed

The Tailwind config is 200+ lines with:
- Component classes (`.btn-primary`, `.btn-secondary`, `.input-base`, `.input`) defined in the plugin
- Duplicate input styling (`.input-base` and `.input` are nearly identical)
- Custom font stacks that duplicate the CSS variable definitions

This isn't wrong, but it splits the design system across 3 files (config, `globals.css`, `index.css`) when it could be one.

#### LOW: No Responsive Breakpoints Used

The Tailwind config doesn't define custom breakpoints (uses defaults). No component uses `md:`, `lg:`, or `xl:` responsive prefixes. The layout is fixed-width columns:
- SideNav: 56 px (collapsed) / 240 px (expanded)
- Right panel: 320 px (`w-80`)
- Viewport: flex-1

On screens < 1200 px, the viewport gets crushed. On ultra-wide monitors, the viewport has excessive empty space.

For a desktop CFD tool this is acceptable, but the SideNav should at least collapse on < 1024 px.

---

## Bundle & Performance

### Chunk Strategy

```
vite.config.ts → manualChunks:
  vtk   → @kitware/vtk.js              (~1.5 MB gzipped)
  vendor → react, react-dom, router, zustand  (~50 KB gzipped)
  (implicit)  → app code + components    (~100 KB gzipped, estimated)
```

Routes are lazy-loaded (`React.lazy()`), so VTK.js only loads when the simulation page (`/`) is visited. This is correct.

VTK.js sub-paths are pre-bundled via `optimizeDeps.include` (20+ entries). This solves the CJS-in-ESM import issue and avoids on-the-fly conversion during dev.

### Performance Concerns

#### HIGH: No Loading State for VTK Geometry

When a geometry URL changes, `useVtkScene` fetches the ArrayBuffer, parses it, applies smoothing + normals, builds actors, and adds them to the renderer. For a 20 MB STL:
1. Network: 2–5 seconds
2. Parsing: 1–3 seconds
3. Smoothing + normals: 1–2 seconds
4. Render: < 100 ms

Total: 4–10 seconds of frozen viewport. No spinner, no progress bar, no skeleton.

**Fix**: Set a `loading` flag in the store when fetch starts. Show a spinner overlay on the viewport. Clear on completion.

#### MEDIUM: 60 fps Render Loop Always Running

`useVtkPlayback` runs a `requestAnimationFrame` loop that calls `renderFn()` every tick — even when:
- No animation is playing
- No interaction is happening
- The viewport is not visible (on `/assets` or `/comparison` page)

This burns CPU/GPU cycles continuously.

**Fix**: Only run rAF when `isPlaying` is true or during interaction (mouse down). Use VTK.js's `renderWindow.render()` manually for one-shot renders after state changes.

#### MEDIUM: Recharts + Hand-Rolled SVG Charts Coexist

The `RunComparisonPage` draws SVG polyline charts manually (calculating viewBox, scaling coordinates, drawing paths). Meanwhile, `LDHistoryChart` and the AnalysisPanel convergence plot use Recharts.

**Fix**: Standardise on Recharts everywhere. It's already a dependency — the manual SVG code (~80 lines in comparison page) adds maintenance cost for no benefit.

#### LOW: Google Fonts Loaded via CSS Import

```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600&...");
```

This is a render-blocking request. The browser must download the CSS from Google before painting text.

**Fix**: Use `<link rel="preconnect">` + `<link rel="preload">` in `index.html`, or self-host the fonts in `public/`.

---

## Code Quality

### Type Safety

TypeScript strict mode is on. However:

| Pattern | Occurrences | Risk |
|---------|-------------|------|
| `any` in `updateSim(data: any)` | Store action | Backend response untyped |
| `any` in VTK hook refs (`useRef<any>`) | Several in `useVtkScene` | VTK.js has incomplete types |
| `// @ts-ignore` | Not observed | Good — no suppressions |
| `as` type assertions | Minimal | Used appropriately for VTK objects |

The `types/vtk.d.ts` ambient declaration file (150+ lines) fills the type gap for VTK.js modules. This is necessary because `@kitware/vtk.js` doesn't ship complete `.d.ts` files for its deep sub-path imports.

### Error Handling

| Layer | Pattern | Assessment |
|-------|---------|-----------|
| **File upload** | try/catch, error state, toast | Good |
| **API polling** | try/catch, console.error, retry | OK — errors are swallowed |
| **Analysis fetch** | try/catch, clearAnalysis on error | OK |
| **VTK geometry** | No error handling | Bad — fetch failures produce blank viewport |
| **Asset manager** | try/catch, toast on CRUD errors | Good |

### Dead Code

| File | Status |
|------|--------|
| `VtkViewport-DEPRECATED.tsx` | Dead — imported only by `RunComparisonPage` but renders incorrectly (React Three Fiber, not VTK.js) |
| `lib/designTokens.ts` | Dead — exported but never imported |
| `MetricHUD.tsx` (top-level) | Likely shadowed by `VTK/MetricHUD.tsx` — check if anything imports the top-level one |
| `LogConsole.tsx` (top-level) | Partially dead — `LogConsoleCompact` is the active version |

### Testing

**Zero frontend tests exist.** Vitest is configured, test scripts are in `package.json`, but there are no `.test.ts` or `.spec.ts` files under `src/`.

The `../tests/` directory contains Python tests and one TypeScript file (`test_scene_transforms.ts`) that tests coordinate rotation math — not a component test.

**Priority test targets** (highest value-per-effort):
1. `lib/coefficients.ts` — Pure math, easy to unit test, critical correctness
2. `lib/residuals.ts` — Regex parsing, testable with fixture strings
3. `lib/exportCSV.ts` — Pure data transform, testable
4. `useSimStore` actions — State transitions (reset, startNew, update, setFrame)
5. `VtkViewport` smoke test — Render without crash (mock VTK context)

---

## Comparison Page — Special Concerns

`RunComparisonPage` has unique issues beyond the general architecture:

1. **Uses `VtkViewport-DEPRECATED`** — The old React Three Fiber viewport, not the VTK.js one. This is a dead code path. The component likely doesn't render correctly since the rest of the app uses VTK.js data formats.

2. **Manual chart rendering** — SVG polylines with hand-computed scaling:
   ```typescript
   const xScale = (i: number) => PAD + (i / (maxLen - 1)) * CHART_W;
   const yScale = (v: number) => PAD + CHART_H - ((v - yMin) / yRange) * CHART_H;
   ```
   This duplicates what Recharts does with proper axis labels, tooltips, and responsive sizing.

3. **Synthesis note** — An auto-generated summary paragraph ("Run A had higher L/D...") is computed in-component via string template. This is a useful feature but the text generation is fragile (hardcoded conditions, no edge case handling for NaN metrics).

4. **No config comparison** — The comparison shows metric deltas but doesn't show what parameters each run used (velocity, AoA, mesh density). A designer can't tell if the improvement came from design changes or just running at different conditions.

---

## Architectural Recommendations — Priority Order

### P0 — Blocks Production Use

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | **Centralise API URL** — Replace all `http://localhost:8000` with `import.meta.env.VITE_API_URL` or a shared `lib/config.ts` constant. Currently in 7+ files. | 1 hour | Deployment blocker |
| 2 | **Add Error Boundary** around `<VtkViewport>` with recovery UI | 30 min | Prevents white-screen crashes |
| 3 | **Add WebGL capability check** on mount — show message if unsupported | 30 min | Prevents silent failure |
| 4 | **Persist critical state** (`activeSimId`, `selectedAssetId`, config values) via Zustand persist middleware | 2 hours | Prevents data loss on refresh |
| 5 | **Delete dead code** — `VtkViewport-DEPRECATED.tsx`, unused `designTokens.ts`, duplicate `globals.css` definitions | 30 min | Reduces confusion |

### P1 — High-Value Improvements

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 6 | **Extract hooks from App.tsx** — `useFileUpload`, `useSimPoller`, `useAnalysisLoader` | 2 hours | Maintainability |
| 7 | **Split useVtkScene** into composable hooks (loader, actors, rotation, camera, layers) | 4 hours | Maintainability |
| 8 | **Loading states for VTK** — Spinner during geometry fetch/parse | 1 hour | UX |
| 9 | **Type the poll response** — Replace `updateSim(data: any)` with typed interface | 1 hour | Safety |
| 10 | **Geometry memory eviction** — LRU cache in useVtkScene with polyData.delete() | 2 hours | Stability |
| 11 | **Standardise on Recharts** — Replace manual SVG in comparison page | 2 hours | Consistency |
| 12 | **Consolidate duplicate code** — `formatNumber()`, status configs, into shared libs | 1 hour | Maintainability |

### P2 — Quality & Polish

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 13 | **Stop rAF when idle** — Only run render loop during playback or interaction | 1 hour | Performance |
| 14 | **Self-host fonts** — Eliminate render-blocking Google Fonts import | 30 min | First-paint speed |
| 15 | **Add 404 route** | 15 min | Polish |
| 16 | **Unit tests** for pure utility functions (coefficients, residuals, CSV, store actions) | 4 hours | Reliability |
| 17 | **Move STL parsing to Web Worker** for large meshes | 4 hours | UX for large files |
| 18 | **Split Zustand store** into domain-specific atoms | 3 hours | Architecture clarity |

---

## Relationship to Other Sections

- Hardcoded API URLs and backend response shapes: [[01 - Backend Audit]]
- User-facing friction from missing loading states, no persistence, no validation feedback: [[02 - User Journey & UX Audit]]
- The VTK.js data pipeline is tightly coupled to the worker's post-processing output format (VTP with Cp/p scalars, VTP flow lines, frame manifests): [[01 - Backend Audit]] Phase 5
