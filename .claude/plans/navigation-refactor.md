# Navigation Refactor: Photoshop-style Sidebar + Contextual Top Toolbar

## Current State
- `main.tsx` has two independent routes: `/` → `App`, `/comparison` → `RunComparisonPage`
- Each page renders its own `TopNavbar` independently (duplicated)
- `SideNav` component exists but is orphaned/unused — has `NavLink` items
- `Sidebar` component (assets/runs list) is embedded in App.tsx
- `TopNavbar` uses raw `<a>` tags (causes full-page reloads)

## Target Architecture

```
┌─────────────────────────────────────────────────┐
│  TopToolbar  (page-specific actions + brand)    │
├───────┬─────────────────────────────────────────┤
│       │                                         │
│ Side  │  Page Content (via <Outlet />)          │
│ Nav   │                                         │
│       │  - "/" renders SimulationPage content    │
│ icons │  - "/comparison" renders RunComparison  │
│   +   │                                         │
│ labels│                                         │
│       │                                         │
└───────┴─────────────────────────────────────────┘
```

- **SideNav** (left): Always visible, icon+label navigation links to pages. Slim (~64px icon-only or ~200px with labels).
- **TopToolbar** (top): Shows brand on the left, then **page-specific actions** injected by each page via a React context. For example:
  - On `/` (Simulation): Upload button, refresh, simulation status badge
  - On `/comparison`: Run A/B selectors, Compare button

## Implementation Steps

### Step 1: Create `TopToolbarContext`
**New file**: `frontend/src/contexts/TopToolbarContext.tsx`

- Create a React context that holds `toolbarContent: ReactNode` and a `setToolbarContent` setter.
- Export a `usePageToolbar(content: ReactNode)` hook that pages call to inject their toolbar items. The hook sets content on mount and clears it on unmount.

### Step 2: Refactor `App.tsx` → Layout wrapper
**Edit**: `frontend/src/App.tsx`

Transform App.tsx from a page into the **shared layout shell**:
- Renders `SideNav` on the left (always visible)
- Renders a `TopToolbar` bar at the top that shows:
  - Brand/logo on the left (NEREUS + CFD Dashboard)
  - `{toolbarContent}` from context (page-specific actions)
- Renders `<Outlet />` for the routed page content
- Wraps everything in `TopToolbarContext.Provider`
- Keeps the polling logic and analysis loader (these are app-level concerns tied to `useSimStore`)

### Step 3: Extract simulation page content
**New file**: `frontend/src/pages/SimulationPage.tsx`

Move the simulation-specific layout from the current App.tsx into a dedicated page:
- The left `Sidebar` (assets/runs list)
- The VTK viewport + log console
- The right config/analysis panel
- Defines its toolbar items via `usePageToolbar()`: Upload button, Refresh button, status badge

### Step 4: Update `SideNav.tsx`
**Edit**: `frontend/src/components/SideNav.tsx`

- Keep only the two routes that actually exist (`/` and `/comparison`), remove dead links
- Remove the `fixed` positioning (layout will handle placement)
- Use `NavLink` from react-router-dom for client-side navigation
- Keep icon + label styling, sized to fit the sidebar slot

### Step 5: Refactor `RunComparisonPage.tsx`
**Edit**: `frontend/src/pages/RunComparisonPage.tsx`

- Remove its own `<TopNavbar />` rendering
- Call `usePageToolbar()` to inject comparison-specific toolbar items into the top bar: Run A selector, Run B selector, Compare button
- The page content becomes just the charts/table/viewport area (no full-page wrapper needed, the layout handles chrome)

### Step 6: Update `main.tsx` routing
**Edit**: `frontend/src/main.tsx`

Switch to a layout route pattern:
```tsx
<Routes>
  <Route element={<App />}>
    <Route path="/" element={<SimulationPage />} />
    <Route path="/comparison" element={<RunComparisonPage />} />
  </Route>
</Routes>
```

### Step 7: Remove/update `TopNavbar.tsx`
**Edit**: `frontend/src/components/TopNavbar.tsx`

Either delete it or strip it down to just the brand section (NEREUS logo + "CFD Dashboard" label), since navigation tabs move to SideNav and page-specific actions are now injected via context.

## Files Changed
1. **New**: `frontend/src/contexts/TopToolbarContext.tsx` — context + hook
2. **New**: `frontend/src/pages/SimulationPage.tsx` — extracted from App.tsx
3. **Edit**: `frontend/src/App.tsx` — becomes layout shell
4. **Edit**: `frontend/src/components/SideNav.tsx` — cleanup, remove dead links, adjust styling
5. **Edit**: `frontend/src/pages/RunComparisonPage.tsx` — use toolbar hook, remove TopNavbar
6. **Edit**: `frontend/src/main.tsx` — layout route pattern
7. **Edit**: `frontend/src/components/TopNavbar.tsx` — strip to brand-only or delete
