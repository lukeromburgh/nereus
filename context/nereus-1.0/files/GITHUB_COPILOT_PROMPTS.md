# NEREUS REDESIGN: GITHUB COPILOT IMPLEMENTATION PROMPTS
## Production-Ready Prompts for Each Sprint & Component

---

## TABLE OF CONTENTS

1. [Sprint 1: Foundation (Week 1)](#sprint-1-foundation)
2. [Sprint 2: Layout & Cognition (Week 2)](#sprint-2-layout--cognition)
3. [Sprint 3: Advanced Features (Week 3)](#sprint-3-advanced-features)
4. [Sprint 4: Polish & Testing (Week 4)](#sprint-4-polish--testing)

---

# SPRINT 1: FOUNDATION (WEEK 1)

## Prompt 1.1: Create ConfigSection Component
**File**: `frontend/src/components/ConfigSection.tsx`

```
Create a React functional component called ConfigSection that wraps config sections with a collapsible header.

Requirements:
- TypeScript with strict null checking
- Props: title (string), isAdvanced (optional boolean, default false), defaultOpen (optional boolean, default !isAdvanced), children (ReactNode)
- Header should display:
  * A hud-label styled title with accent-cyan text
  * A chevron-down icon (from lucide-react) that rotates 180° when section is open
  * If isAdvanced=true, show a blue "Advanced" badge next to title
- Collapse/expand animation:
  * Use overflow-hidden and max-h transitions (300ms duration)
  * When open: max-h-screen
  * When closed: max-h-0
- Border style: border-b border-hud-border, with pb-3 and last:border-b-0 for last section
- Hover state on header: text-slate-400 hover:text-slate-200 with 200ms transition
- Children container: space-y-2 mt-2 when open
- Export as named export

Styling should follow the design system: Tailwind utilities only, no hardcoded hex colors.
Make the click target large enough (py-2 minimum) for accessibility.
```

---

## Prompt 1.2: Create FieldWithHint Component
**File**: `frontend/src/components/FieldWithHint.tsx`

```
Create a React functional component called FieldWithHint that provides inline help for config fields.

Requirements:
- TypeScript with strict null checking
- Props: label (string), hint (string), children (ReactNode)
- Layout:
  * Label row: flex items-center gap-2, label is text-xs font-medium text-slate-300
  * HelpCircle icon (lucide-react, h-3.5 w-3.5) right of label
  * Icon color: text-slate-500 hover:text-accent-cyan transition-colors
  * Icon is a button (type="button") for accessibility
- Hint display:
  * Hidden by default, shown on mouseEnter/mouseLeave
  * Hint container: text-2xs text-slate-400 bg-accent/5 border border-accent/15 rounded px-2 py-1.5
  * Add animate-in fade-in duration-200 Tailwind classes when visible
  * Use local useState for showHint boolean
- Children render below the label row in a <div>
- Spacing: space-y-1 between label row and children

Make sure the hint is accessible (use onMouseEnter/onMouseLeave, not just CSS hover).
```

---

## Prompt 1.3: Create SliderWithInput Component
**File**: `frontend/src/components/SliderWithInput.tsx`

```
Create a React functional component called SliderWithInput that combines a range slider with a numeric input.

Requirements:
- TypeScript with strict null checking
- Props: label (string), value (number), min (number), max (number), step (optional, default 0.1), unit (optional string), onChange (function), onLivePreview (optional function)
- Layout:
  * Label: text-xs font-medium text-slate-300 above the slider
  * Flex row below with: slider (flex-1), numeric display/input (w-16), unit badge (text-2xs text-slate-500)
- Slider:
  * HTML range input with min, max, step, value
  * Styling: h-1 bg-accent/20 rounded-lg appearance-none cursor-pointer accent-accent-cyan
  * On change: call onChange() and onLivePreview() with new value
- Numeric display (right side):
  * Click to edit mode
  * When not editing: show value.toFixed(2), text-xs font-mono, text-slate-200, text-right
  * When editing: replace with input type="number", bg-accent/10 border border-accent/25 rounded px-1.5 py-1
  * On blur or Enter key: validate value is within min/max, call onChange(), exit edit mode
  * If invalid, revert to previous value
- Unit badge: displayed right of input, text-2xs text-slate-500

State management:
- Use useState for isEditing and editValue
- Parse numeric input with parseFloat, validate ranges
- toFixed(2) formatting for display

Make the numeric input clickable and editable for power users.
```

---

## Prompt 1.4: Create StatusPill Component
**File**: `frontend/src/components/StatusPill.tsx`

```
Create a React functional component called StatusPill that displays simulation status with icon, label, and animation.

Requirements:
- TypeScript with strict null checking
- Props: status (enum type: 'IDLE' | 'PENDING' | 'MESHING' | 'SOLVING' | 'COMPLETED' | 'FAILED')
- Configuration object (statusConfig) mapping each status to:
  * icon: ReactNode (Lucide icon, h-2 w-2)
  * color: string (Tailwind text color class, e.g., 'text-slate-500')
  * label: string (e.g., 'Idle')
  * subtext: string (e.g., 'Ready to run')
  * animate: boolean (true for PENDING/MESHING/SOLVING, false otherwise)
- Layout (flex items-center gap-2):
  * Icon container: h-2 w-2, filled Lucide icon (use fill-current for solid fill)
    - Apply color class
    - Add animate-spin if animate=true
  * Text column:
    - Label: text-xs font-medium text-slate-100
    - Subtext: text-2xs text-slate-400
- Icons:
  * IDLE: Circle (unfilled)
  * PENDING/MESHING/SOLVING: Loader2 (with animate-spin)
  * COMPLETED: CheckCircle2 (filled with text-accent-emerald)
  * FAILED: XCircle (filled with text-accent-rose)
- Use lucide-react for all icons
- Export named export

The component should be used wherever run status is displayed (sidebar, config header, run cards).
```

---

## Prompt 1.5: Create Toast System
**File**: `frontend/src/lib/toast.ts`

```
Create a toast notification system (no external dependencies, pure JavaScript + React).

Requirements:
- Module exports:
  * toast object with methods: success(msg, duration?), error(msg, duration?), info(msg, duration?)
  * useToasts hook that returns array of Toast objects
- Toast type definition:
  * interface Toast { id: string, type: 'success'|'error'|'info', message: string, duration?: number }
- Implementation:
  * Global toastStack array to hold active toasts
  * toastCallback function reference (set by useToasts hook)
  * addToast(type, message, duration) function that:
    - Creates unique ID
    - Adds to front of stack
    - Calls toastCallback to update React state
    - Sets timeout to remove toast after duration
    - Filters stack and re-triggers callback
  * toast.success/error/info call addToast with appropriate type
  * Default durations: success=2000ms, error=3000ms, info=2000ms
- useToasts hook:
  * Uses useState to manage toasts array
  * useEffect registers toastCallback on mount, cleans up on unmount
  * Returns toasts array for rendering
  * Must handle concurrent toast additions
- All IDs should be unique (use Math.random().toString() or similar)
- Maintain FIFO order (new toasts appear at bottom, oldest at top)

This will be used by API call wrappers and user actions to provide feedback.
```

---

## Prompt 1.6: Create ToastContainer Component
**File**: `frontend/src/components/ToastContainer.tsx`

```
Create a React component that renders the global toast notification stack.

Requirements:
- TypeScript with strict null checking
- No props (uses useToasts hook internally)
- Position: fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none
- Render each toast with:
  * Container: rounded-md px-4 py-2.5 text-sm font-medium flex items-center gap-2 animate-slide-up pointer-events-auto
  * Conditional styling based on toast.type:
    - success: bg-accent-emerald/20 border border-accent-emerald/50 text-accent-emerald
    - error: bg-accent-rose/20 border border-accent-rose/50 text-accent-rose
    - info: bg-accent-cyan/20 border border-accent-cyan/50 text-accent-cyan
  * Icon before message (right of container):
    - success: CheckCircle2 (lucide-react, h-4 w-4)
    - error: AlertCircle (h-4 w-4)
    - info: Info (h-4 w-4)
  * Message text right of icon
- Animation: animate-slide-up (defined in Tailwind config as: translateY(10px) opacity 0 → translateY(0) opacity 1 over 300ms)
- Use useToasts from @/lib/toast to get toast array

The container should be placed in App.tsx at the top level so it renders globally.
```

---

## Prompt 1.7: Create API Hook with Toast Integration
**File**: `frontend/src/hooks/useRunSimulation.ts`

```
Create a React hook that handles starting a simulation with automatic toast feedback.

Requirements:
- TypeScript with strict null checking
- Hook signature: useRunSimulation() → { run: function, isLoading: boolean }
- run function:
  * Accepts runData parameter (type: any or use SimulationRun type)
  * Sets isLoading to true
  * Makes POST request to /api/runs/ (use axios or fetch)
  * On success:
    - Call toast.success with message: "✓ Simulation started (ID: {result.id.slice(0, 6)})"
    - Return result
  * On error:
    - Extract error message from response or use generic "Failed to start simulation"
    - Call toast.error with the message
    - Re-throw error
  * Finally block: set isLoading to false
- Import toast from @/lib/toast
- Use try-catch-finally pattern
- Handle network errors gracefully (undefined response.data)

Export as named export from hooks/index.ts as well.
```

---

## Prompt 1.8: Integrate Toast System into App.tsx
**File**: `frontend/src/App.tsx`

```
Update App.tsx to include the global ToastContainer component.

Requirements:
- Import ToastContainer from @/components/ToastContainer
- Add <ToastContainer /> as a child of the root App component
- Place it at the end (bottom of JSX tree) so it renders on top
- Ensure it's outside any modal/panel overflow contexts
- No other changes to existing layout or functionality

After this, the toast system is globally available via the toast.success/error/info functions.
```

---

## Prompt 1.9: Create Simple Example: Velocity Slider with Toast
**File**: `frontend/src/components/ConfigPanel/QuickControls.tsx` (new)

```
Create a simple component demonstrating the SliderWithInput and toast integration for the Velocity field.

Requirements:
- TypeScript with strict null checking
- Component name: QuickControls
- Props: none (use useSimStore to get/set values)
- Layout:
  * Container: space-y-3
  * FieldWithHint:
    - label="Velocity"
    - hint="Speed of water flow. Typical range: 5–15 m/s for small foils. Higher speeds increase drag quadratically."
  * SliderWithInput child:
    - value={activeRun?.velocity || 5}
    - min={0.5}, max={30}, step={0.1}
    - unit="m/s"
    - onChange={(v) => updateRunField('velocity', v)}
    - onLivePreview={(v) => {
        toast.info(`Previewing velocity: ${v.toFixed(1)} m/s`);
        // Future: update VTK preview
      }}
- Import useSimStore from @/store/useSimStore (or create mock if needed)
- Import toast from @/lib/toast
- Export as named export

This serves as a template for building the rest of ConfigPanel.
```

---

## Prompt 1.10: Update Tailwind Config with Custom Utilities
**File**: `tailwind.config.ts` (additions only)

```
Add custom Tailwind utilities and animations to support the new components.

Requirements:
- Add to theme.extend.keyframes:
  * pulse-glow: '0%, 100%' { opacity: '1' } → '50%' { opacity: '0.7' }
  * slide-up: 'from' { transform: 'translateY(10px)', opacity: '0' } → 'to' { transform: 'translateY(0)', opacity: '1' }
  * wave: '0%' { transform: 'rotate(0deg)' } → '10%' { transform: 'rotate(14deg)' } → '20%' { transform: 'rotate(-8deg)' } → '30%' { transform: 'rotate(14deg)' } → '40%' { transform: 'rotate(-4deg)' } → '50%' { transform: 'rotate(10deg)' } → '60%' { transform: 'rotate(0deg)' } → '100%' { transform: 'rotate(0deg)' }
- Add to theme.extend.animation:
  * pulse-glow: 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
  * slide-up: 'slide-up 0.3s ease-out'
  * wave: 'wave 2s linear infinite'
- Add to theme.extend.width (in utilities layer):
  * w-1/10: width: 10%
  * w-2/5: width: 40%
- Ensure dark scrollbar plugin is included (your existing scrollbar-dark utility)
- Do NOT modify existing color system (preserve accent-cyan, accent-glow, accent-emerald, accent-rose)

All classes should follow Tailwind conventions and be compatible with the existing design system.
```

---

# SPRINT 2: LAYOUT & COGNITION (WEEK 2)

## Prompt 2.1: Refactor ConfigPanel to Use ConfigSection
**File**: `frontend/src/components/ConfigPanel.tsx` (major refactor)

```
Refactor the existing ConfigPanel to use the new ConfigSection, FieldWithHint, and SliderWithInput components.

Requirements:
- Keep the same file location and exported component name
- TypeScript with strict null checking
- Structure:
  * Header section:
    - hud-label "CONFIGURATION"
    - StatusPill showing current run status
  * Main scrollable content (flex-1 overflow-y-auto scrollbar-dark p-4 space-y-4):
    - ConfigSection "FLOW PARAMETERS" (defaultOpen=true):
      * FieldWithHint + SliderWithInput for velocity
      * FieldWithHint + SliderWithInput for angle_of_attack
      * FieldWithHint + SliderWithInput for submersion_depth
    - ConfigSection "MESH SETTINGS" (defaultOpen=true):
      * FieldWithHint + SliderWithInput for mesh_density
      * <details> dropdown for "Boundary Layers (Advanced)":
        - Checkbox: "Enable boundary layers"
        - If enabled:
          * SliderWithInput for y_plus_target
          * SliderWithInput for n_surface_layers
    - ConfigSection "SOLVER" (isAdvanced=true, defaultOpen=false):
      * Radio buttons for solver_type: simpleFoam, pimpleFoam, interFoam
      * Each with brief description
    - ConfigSection "PROPULSION" (isAdvanced=true, defaultOpen=false):
      * Dropdown for propulsion_model: none, constant, sail, kite
      * Conditional fields based on selection:
        - constant: SliderWithInput for thrust_force
        - sail/kite: SliderWithInput for wind_speed, wind_angle, sail_area/kite_area
  * Footer:
    - [Run Simulation] button (blue-600 bg, hover:bg-blue-500)
    - Show estimated time ("Est. time: 3 min")
    - Optional: PredictionCard (can stub for now)
- Integration:
  * Use useSimStore to get activeRun, updateRunField, setShowAdvanced
  * All sliders call updateRunField on change
  * All sliders call onLivePreview for preview updates
  * Import all new components from @/components
- Remove old code incrementally (keep fallback for missing fields)
- Keep all existing API calls and state management unchanged

This is the centerpiece of the redesign. Quality matters here.
```

---

## Prompt 2.2: Create Runs Card Grid Component
**File**: `frontend/src/components/Sidebar/RunsCardGrid.tsx` (new)

```
Create a new component that displays simulation runs as a compact card grid with inline metrics.

Requirements:
- TypeScript with strict null checking
- Props: runs (SimulationRun[]), onSelect (function), onDelete (optional function)
- Layout:
  * Container: p-2 space-y-2 overflow-y-auto scrollbar-dark
  * Header: hud-label "RUNS ({runs.length})"
  * Empty state: text-2xs text-slate-500 "No simulations yet. Create one above." (centered, py-4)
  * Card grid: space-y-1.5
- Card styling (for each run):
  * Button (w-full, rounded-md, border, transition-all duration-200, text-left, p-2, group):
    - Unselected: border-transparent hover:bg-white/[0.03] hover:border-hud-border
    - Selected: bg-accent/10 border-accent/25 border-l-2 border-l-accent-cyan
  * Content (flex items-start justify-between):
    - Left section (min-w-0 flex-1):
      * Run ID + timestamp row:
        - text-xs font-mono text-accent-cyan "#{run.id.slice(0, 3)}"
        - text-2xs text-slate-500 "{formatDistance(created_at, now)} ago"
      * Metrics grid (grid-cols-2 gap-1, text-2xs text-slate-400, mb-2):
        - "L/D: {l_d_ratio.toFixed(1) || '–'}"
        - "V: {velocity.toFixed(1) || '–'} m/s"
        - "Lift: {lift_force.toFixed(0) || '–'} N"
        - "Drag: {drag_force.toFixed(0) || '–'} N"
      * StatusPill for run.status
    - Right section (ml-2):
      * Delete button (trash icon, h-3 w-3, text-slate-600 hover:text-accent-rose)
      * Opacity 0 by default, opacity-100 on group-hover
      * onClick={(e) => { e.stopPropagation(); onDelete?.(run.id) }}
- Click handler: onClick={() => onSelect(run.id)}
- Helper function: formatDistance(date, baseDate) that returns:
  * "now" if < 60s
  * "{minutes}m" if < 60m
  * "{hours}h" if < 24h
  * "{days}d" otherwise
- Import StatusPill from @/components
- Export as named export

This replaces the old Runs list. Use it in Sidebar.
```

---

## Prompt 2.3: Redesign Sidebar Layout
**File**: `frontend/src/components/Sidebar.tsx` (refactor)

```
Refactor the Sidebar component to use the new RunsCardGrid and adjust for the 10% layout.

Requirements:
- Keep existing file location and component name
- Container: w-1/10 (add to Tailwind config: w-1/10 { width: 10% })
- Layout structure:
  * border-r border-hud-border overflow-hidden flex flex-col
  * Children:
    - Assets section at top (optional collapse):
      * hud-label "ASSETS"
      * Compact list of assets (keep existing or simplify)
      * Each asset: truncate, text-xs, py-1, px-2, border rounded, cursor-pointer
    - Divider: h-px bg-hud-border my-2
    - Runs section (flex-1 min-w-0 overflow-hidden):
      * RunsCardGrid component with runs data
- Width constraint: w-1/10 means width: 10% of parent
- Ensure scrollbar-dark on all scrollable areas
- Import RunsCardGrid from @/components/Sidebar/RunsCardGrid
- No breaking changes to existing asset/run selection logic
- Keep API calls and state management from useSimStore

This redesign focuses on space efficiency so the viewport can expand.
```

---

## Prompt 2.4: Create MetricsHUD Overlay Component
**File**: `frontend/src/components/VTK/MetricsHUD.tsx` (new)

```
Create an overlay component that displays force metrics directly in the 3D viewport.

Requirements:
- TypeScript with strict null checking
- No props (uses useSimStore internally)
- Visibility: only render if activeRun exists AND has lift_force data (simulation complete)
- Position & styling:
  * absolute top-4 left-4 z-10 pointer-events-none
  * p-3 rounded-md bg-black/40 backdrop-blur-sm border border-accent/20
  * space-y-1.5 vertical layout
- Header:
  * text-2xs text-slate-500 font-medium "FORCES"
- Metrics grid (grid-cols-3 gap-3):
  * Each metric: flex flex-col
    - Label: text-2xs text-slate-600
    - Value: text-sm font-mono (color per metric):
      * Lift: text-accent-cyan, format: "{lift_force.toFixed(0)} N"
      * Drag: text-accent-glow, format: "{drag_force.toFixed(0)} N"
      * L/D: text-accent-emerald, format: "{l_d_ratio.toFixed(2)}"
- Divider: h-px bg-hud-border my-1.5
- Moment row:
  * text-2xs text-slate-500 "Moment: {pitch_moment.toFixed(1) || '—'} N·m"
- Import useSimStore from @/store/useSimStore
- Export as named export

Place this component inside VtkViewport, absolutely positioned over the 3D canvas.
The low opacity background ensures it's readable over any foil colors.
```

---

## Prompt 2.5: Create Compact Log Console Component
**File**: `frontend/src/components/LogConsole/LogConsoleCompact.tsx` (new)

```
Create a compact, bottom-docked log console that shows progress instead of raw output.

Requirements:
- TypeScript with strict null checking
- Props: entries (LogEntry[]), isRunning (boolean)
  * LogEntry type: { phase: string, progress: number (0-1), message: string }
- Structure:
  * Container: border-t border-hud-border bg-black/20 transition-all
  * Header (always visible):
    - Button: w-full px-4 py-2 flex items-center justify-between hover:bg-white/[0.02]
    - Left: flex items-center gap-2
      * text-2xs text-slate-500 font-medium "SOLVER OUTPUT"
      * If isRunning: h-2 w-2 bg-accent-glow rounded-full animate-pulse
    - Right: ChevronUp icon (h-4 w-4), rotate-180 when collapsed
  * Progress bar (only if isRunning):
    - px-4 py-1 space-y-1
    - Phase name: text-2xs text-slate-500 (currentPhase.phase)
    - Progress bar: w-full h-1 bg-accent/10 rounded-full overflow-hidden
      * Inner bar: h-full bg-gradient-to-r from-accent-cyan to-accent-glow
      * width: {progress * 100}% with transition-all duration-300
  * Expanded view (when user clicks header):
    - px-4 py-3 border-t border-hud-border max-h-64 overflow-y-auto scrollbar-dark bg-black/50
    - Log entries (vertical flex space-y-1 text-2xs font-mono text-slate-400):
      * Format: "[{entry.phase}] {entry.message} {entry.progress > 0 && entry.progress < 1 ? Math.round(entry.progress * 100) + '%' : ''}"
- State: useState for isExpanded
- Icon: ChevronUp from lucide-react
- Positioning: This component sits below the VTK viewport in the layout

This replaces verbose log output with a clean progress indicator.
```

---

## Prompt 2.6: Update App.tsx Layout (4-Column)
**File**: `frontend/src/App.tsx` (major refactor)

```
Refactor App.tsx layout from 3-column to 4-column with smart overlays.

Requirements:
- Root container: flex h-screen bg-[#0d1518]
- Column layout (no changes to navigation, just reorganize panels):
  * Column 1 (Sidebar): 
    - Component: Sidebar (refactored to use 10%)
    - Width: w-1/10
    - Border: border-r border-hud-border
    - Overflow: overflow-hidden flex flex-col
  * Column 2 (Viewport + Metrics):
    - Width: flex-1 (takes remaining space minus config panel)
    - Actually: Calculate as ~ 50% (can use absolute widths or smart grid)
    - Layout: flex flex-col h-screen
    - Content:
      * VtkViewport (flex-1):
        - RelativePositioning container (relative)
        - VtkViewport canvas inside
        - MetricsHUD absolutely positioned (top-4 left-4)
        - ColorbarLegend absolutely positioned (bottom-right corner)
      * LogConsoleCompact (h-auto):
        - At bottom of viewport column
        - Collapsed by default (just header + progress bar visible)
  * Column 3 (Config Panel):
    - Width: w-2/5 (40%)
    - Border: border-l border-hud-border
    - Overflow: overflow-y-auto scrollbar-dark
    - Content: ConfigPanelRefactored component
- Ensure:
  * All existing functionality preserved
  * APIs and state management unchanged
  * Responsive breakpoints added (adjust widths on tablet/mobile)
  * ToastContainer still renders globally (already in App.tsx)
- Test that:
  * Viewport gets more visual real estate
  * Config panel doesn't overflow
  * Sidebar is compact but readable
  * Scrollbars appear only where needed

This is the visual centerpiece of the redesign.
```

---

## Prompt 2.7: Create Live Preview Hook
**File**: `frontend/src/hooks/useLivePreview.ts` (new)

```
Create a React hook that triggers live 3D preview updates as sliders change (without running full simulation).

Requirements:
- TypeScript with strict null checking
- Hook signature: useLivePreview(previewMode: boolean, previewState: object) → { applyPreview: function, clearPreview: function }
- Functionality:
  * applyPreview function:
    - Takes object with preview updates (e.g., { velocity: 15, submersion: 0.6 })
    - Updates VTK scene without running OpenFOAM:
      * For submersion_depth changes: translate foil actor in Z via transform
      * For velocity/angle changes: update velocity vector visualization
      * For mesh_density changes: (no visual, just state update)
    - Calls useVtkScene to apply these transforms
    - Sets visual indicator (e.g., "PREVIEW" badge on foil)
  * clearPreview function:
    - Resets all preview transforms
    - Removes "PREVIEW" badge
    - Restores original foil position
- State:
  * Access useVtkScene and useSimStore
  * Store preview state (isPreviewActive, originalTransform)
- Usage example:
  * SliderWithInput onLivePreview={(v) => applyPreview({ velocity: v })}
- Implementation:
  * Check if useVtkScene has methods: setTransform, updateVectorField
  * If not, stub them and add TODO comments
  * Keep preview lightweight (no mesh regeneration, no solver calls)
- Export as named export

This makes parameter changes feel instant, building confidence before "Run Simulation".
```

---

## Prompt 2.8: Add Field Validation to Zustand Store
**File**: `frontend/src/store/useSimStore.ts` (additions)

```
Add validation rule definitions and validateField method to useSimStore.

Requirements:
- Add TypeScript type: ValidationResult { valid: boolean, error?: string, warning?: string }
- Create validationRules object (Record<string, (value: any) => ValidationResult>):
  * velocity:
    - Error if < 0.5: "Minimum 0.5 m/s"
    - Error if > 50: "Maximum 50 m/s"
    - Warning if > 15: "Warning: Cavitation likely above 15 m/s"
    - Valid otherwise
  * angle_of_attack:
    - Error if < -15 or > 15: "Range: -15° to +15°"
    - Valid otherwise
  * mesh_density:
    - Error if < 0.3 or > 3: "Range: 0.3x to 3x"
    - Warning if < 0.6: "Coarse mesh; results may be inaccurate"
    - Valid otherwise
  * y_plus_target:
    - Error if < 0.5 or > 30: "Range: 0.5 to 30"
    - Warning if > 10: "High y+; using wall functions (less accurate)"
    - Valid otherwise
  * submersion_depth:
    - Error if < 0.05: "Minimum 0.05 m"
    - Error if > 2.0: "Maximum 2.0 m"
    - Valid otherwise
- Add to store interface:
  * validateField: (fieldName: string, value: any) => ValidationResult
- Implementation in store:
  * validateField looks up validationRules[fieldName]
  * If no rule, returns { valid: true }
  * Calls rule function with value, returns result
- Add optional method:
  * validateAll: () => Record<string, ValidationResult> (validate all fields in activeRun)
  * Returns object with fieldName -> result mapping
- Export validationRules so components can access descriptions

This enables inline validation warnings before attempting to run simulation.
```

---

# SPRINT 3: ADVANCED FEATURES (WEEK 3)

## Prompt 3.1: Add Inline Validation to ConfigPanel
**File**: `frontend/src/components/ConfigPanel.tsx` (update)

```
Add inline validation feedback to the ConfigPanel component.

Requirements:
- Update SliderWithInput integration to include validation state display
- After each SliderWithInput, conditionally render ValidationFeedback component:
  * ValidationFeedback type (props):
    - error (optional string): red/rose text with ❌ icon
    - warning (optional string): yellow/cyan text with ⚠️ icon
    - info (optional string): gray text with 💡 icon
  * Layout: text-2xs px-2 py-1.5 rounded bg-accent/5 border mt-1
  * If error: bg-accent-rose/10 border-accent-rose/20 text-accent-rose
  * If warning: bg-accent-cyan/10 border-accent-cyan/20 text-accent-cyan
  * If info: bg-accent/5 border-accent/15 text-slate-400
- Validation on change:
  * Call useSimStore.validateField(fieldName, newValue) after updateRunField
  * Store validation result in component state (object mapping fieldName -> result)
  * Re-render ValidationFeedback with result.error/warning
- Disable [Run Simulation] button if ANY field has error:
  * Check validationAll() from store
  * If any result.valid === false, disable button with cursor-not-allowed
- Example:
  * User drags Velocity slider to 50 m/s
  * ValidationFeedback appears below slider: "⚠️ Unusually high; cavitation likely. Tip: Reduce to < 15 m/s or enable cavitation model."
  * [Run Simulation] button remains enabled (warning, not error)
  * User drags Angle of Attack to 25°
  * ValidationFeedback: "❌ Out of range (max 15°)"
  * [Run Simulation] button DISABLES with text "Fix validation errors"
- Ensure styling is consistent with design system

This prevents invalid runs and teaches users valid parameter ranges.
```

---

## Prompt 3.2: Create PredictionCard Component
**File**: `frontend/src/components/ConfigPanel/PredictionCard.tsx` (new)

```
Create a card component that shows predicted results based on historical run data.

Requirements:
- TypeScript with strict null checking
- Props: run (SimulationRun), prediction (optional { lift: number, drag: number, ld: number, eta_minutes: number })
- Visibility: only show if prediction is provided and run is not currently running
- Layout:
  * Container: rounded-md border border-accent/25 bg-accent/5 p-3 space-y-2
  * Header: text-2xs text-slate-500 font-medium "ESTIMATED RESULTS"
  * Subheader: text-2xs text-slate-600 "Based on 2,847 similar runs:"
  * Metrics grid:
    - Grid 3 columns, gap-2, text-center
    - Each metric:
      * Label: text-2xs text-slate-600
      * Value: text-sm font-mono text-accent-cyan "~{value.toFixed(1)}"
      * Unit: text-2xs text-slate-500
    - Metrics:
      * Lift: {prediction.lift} N
      * Drag: {prediction.drag} N
      * L/D: {prediction.ld}
  * Footer: text-2xs text-slate-500 "⏱ {prediction.eta_minutes} min"
- Styling:
  * Dim colors, not prominent (confidence interval indicator)
  * Use accent colors but at /5 or /10 opacity
  * Should feel like a "hint", not a guarantee
- Optional confidence indicator:
  * Add small footnote: "(±20% confidence interval)"
- Import from @/components/ConfigPanel
- Export as named export

Prediction data comes from a backend ML model (out of scope for this prompt, but structure for it).
The card builds confidence: "This is what typically happens with these parameters."
```

---

## Prompt 3.3: Create Gallery Component
**File**: `frontend/src/components/Gallery/GalleryPanel.tsx` (new)

```
Create a gallery of example/reference simulations for onboarding new users.

Requirements:
- TypeScript with strict null checking
- No props (fetches gallery data from API)
- Layout:
  * Container: p-4 space-y-4
  * Header: hud-label "GALLERY" text-accent-cyan
  * Description: text-2xs text-slate-500 "Click any example to load parameters →"
  * Card grid: grid-cols-1 gap-3 (or grid-cols-2 on wider screens)
- Example card structure:
  * Each card: rounded-md border border-accent/25 bg-accent/5 p-3 space-y-2 cursor-pointer group hover:bg-accent/10 hover:border-accent/50 transition
  * Header:
    - text-xs font-medium text-slate-200 group-hover:text-accent-cyan
    - Example names: "High-Speed Rider", "Efficient Cruiser", "Stable Barge", etc.
  * 3D Preview:
    - Placeholder image (100x100px) or small VTK preview
    - bg-black/40 rounded h-24 flex items-center justify-center
    - Text: "[3D Preview]" in muted color
  * Metrics inline:
    - Grid 3 cols, text-2xs:
      * "V: 18 m/s" / "L/D: 2.1" / "AoA: 5°"
  * Button: "Copy Parameters" (text-accent-cyan hover:underline, text-2xs)
    - onClick: loadExampleRun(exampleId)
    - Shows toast: "✓ Parameters loaded from gallery"
    - Loads parameters into activeRun
- Data structure:
  * Fetch from /api/gallery/ endpoint (returns array of example runs)
  * If fetch fails, show empty state: "Gallery not available"
  * Cache in Zustand store
- Usage:
  * Add as a tab in Sidebar or as collapsible section
  * Part of onboarding flow for new users
- Export as named export

This lowers friction for first-time users by providing battle-tested starting points.
```

---

## Prompt 3.4: Create Validation Tooltip Component
**File**: `frontend/src/components/ValidationTooltip.tsx` (new)

```
Create a reusable tooltip component for displaying validation errors, warnings, and info messages.

Requirements:
- TypeScript with strict null checking
- Props:
  * type ('error' | 'warning' | 'info')
  * message (string)
  * icon (optional ReactNode, defaults based on type)
- Auto-select icon and color based on type:
  * error: AlertCircle icon, text-accent-rose, bg-accent-rose/10 border-accent-rose/20
  * warning: AlertTriangle icon, text-accent-cyan, bg-accent-cyan/10 border-accent-cyan/20
  * info: Info icon, text-slate-400, bg-accent/5 border-accent/15
- Layout:
  * flex items-start gap-2 rounded px-2 py-1.5 border text-2xs
  * Icon (h-3.5 w-3.5) + message text, flex-wrap
  * Animation: fade-in duration-200
- Icons: use lucide-react (AlertCircle, AlertTriangle, Info, or custom)
- Export as named export

Use this everywhere validation feedback is needed (ConfigPanel, forms, etc).
Keeps validation styling consistent across the app.
```

---

## Prompt 3.5: Create Run Comparison Hook
**File**: `frontend/src/hooks/useRunComparison.ts` (new)

```
Create a React hook for comparing two simulations side-by-side.

Requirements:
- TypeScript with strict null checking
- Hook signature: useRunComparison(runIds: string[]) → { runs: SimulationRun[], metrics: object }
- Functionality:
  * Fetches full run details for each ID
  * Computes differential metrics:
    - Δ Lift: run2.lift - run1.lift (and % change)
    - Δ Drag: run2.drag - run1.drag
    - Δ L/D: run2.ld - run1.ld
  * Returns both runs and computed deltas
- State:
  * isLoading: boolean (shows spinner while fetching)
  * error: optional string (if fetch fails)
- Usage example:
  * const { runs, metrics, isLoading } = useRunComparison(['run-id-1', 'run-id-2'])
- Implementation:
  * Call useSimStore to get runCache or fetch from API
  * Compute deltas locally
  * Handle missing data gracefully (show "—" instead of errors)
- Export as named export

Future: enable users to compare run results to understand parameter sensitivity.
```

---

## Prompt 3.6: Enhance useRunSimulation Hook with Predictions
**File**: `frontend/src/hooks/useRunSimulation.ts` (update)

```
Enhance the useRunSimulation hook to generate and display predictions.

Requirements:
- Keep existing signature: useRunSimulation() → { run: function, isLoading: boolean }
- Add:
  * prediction: optional { lift: number, drag: number, ld: number, eta_minutes: number }
  * setPrediction: function
- Before calling run():
  * Check if run parameters are valid (use validateField)
  * If invalid, don't show prediction
  * If valid:
    - Call /api/predict/ endpoint with { velocity, angle_of_attack, mesh_density, solver_type, ...}
    - Receive prediction object
    - Update prediction state (for PredictionCard)
    - Toast: "info: Prediction loaded"
- Prediction API response structure:
  * { lift: number, drag: number, ld: number, eta_minutes: number, confidence: number }
- After run() call:
  * Clear prediction (set to undefined)
  * Show actual results instead
- Error handling:
  * If prediction API fails, silently skip (don't show prediction)
  * Still allow run to proceed
- Export as named export

This ties predictions to the run button, showing them before user clicks.
```

---

## Prompt 3.7: Create Animated Transition Wrapper
**File**: `frontend/src/components/AnimatedPanel.tsx` (new)

```
Create a wrapper component for smooth panel transitions using Framer Motion.

Requirements:
- TypeScript with strict null checking
- Props:
  * isVisible: boolean (controls whether panel is shown)
  * direction: 'left' | 'right' | 'top' | 'bottom' (slide direction)
  * children: ReactNode
  * duration: number (milliseconds, default 300)
- Dependencies: framer-motion package (ensure it's installed)
- Animation:
  * Initial: opacity 0 + offset based on direction
    - right: x: 50px
    - left: x: -50px
    - top: y: -50px
    - bottom: y: 50px
  * Animate (isVisible true): opacity 1, x/y: 0
  * Exit: reverse initial state
  * Transition: easeInOut, customizable duration
- Layout: width and height should be inherited from children
- Use Framer Motion:
  * motion.div wrapper
  * AnimatePresence for exit animations
  * initial, animate, exit props
- Export as named export

Use this for:
- Config panel ↔ Analysis panel transition
- Advanced section expand/collapse (alternative to CSS)
- Log console slide up
Keeps transitions consistent and smooth.
```

---

## Prompt 3.8: Add Error Boundary Component
**File**: `frontend/src/components/ErrorBoundary.tsx` (new)

```
Create an error boundary component for graceful error handling in critical sections.

Requirements:
- React class component (error boundaries must be class-based)
- TypeScript (or JSDoc if class-based TS is difficult)
- Props:
  * children: ReactNode
  * fallback: (error: Error) => ReactNode (optional custom fallback)
  * onError: (error: Error, errorInfo: ErrorInfo) => void (optional callback)
- Lifecycle:
  * componentDidCatch(error, errorInfo):
    - Log to console and analytics
    - Call onError callback if provided
    - Set state.hasError = true
  * getDerivedStateFromError(error):
    - Return { hasError: true }
- Render:
  * If hasError: show fallback UI
    - Default: Container with error icon (⚠️), message, and [Reload] button
    - bg-accent-rose/10 border border-accent-rose/20 rounded p-4
    - Text: "Something went wrong. Please try again."
    - Button calls location.reload() or parent's reset function
  * If custom fallback: call fallback(error)
  * Otherwise: render children
- Usage locations:
  * Wrap VtkViewport (if rendering fails, don't crash whole app)
  * Wrap ConfigPanel (validation errors)
  * Wrap AnalysisPanel (result parsing errors)
- Export as named export

This prevents a single component crash from breaking the entire app.
```

---

# SPRINT 4: POLISH & TESTING (WEEK 4)

## Prompt 4.1: Add TypeScript Types File
**File**: `frontend/src/types/index.ts` (comprehensive update)

```
Create or update the comprehensive TypeScript types file for the redesigned components.

Requirements:
- Export interfaces for:
  * Toast { id: string, type: ToastType, message: string, duration?: number }
  * ToastType = 'success' | 'error' | 'info'
  * ValidationResult { valid: boolean, error?: string, warning?: string }
  * LogEntry { phase: string, progress: number, message: string }
  * PredictionData { lift: number, drag: number, ld: number, eta_minutes: number, confidence?: number }
  * StatusType = 'IDLE' | 'PENDING' | 'MESHING' | 'SOLVING' | 'COMPLETED' | 'FAILED'
  * ConfigPanelProps { /* none, uses store */ }
  * SliderWithInputProps { label, value, min, max, step?, unit?, onChange, onLivePreview? }
  * FieldWithHintProps { label, hint, children }
  * ConfigSectionProps { title, isAdvanced?, defaultOpen?, children }
  * StatusPillProps { status: StatusType }
  * MetricsHUDProps { /* none, uses store */ }
  * RunsCardGridProps { runs: SimulationRun[], onSelect: (id: string) => void, onDelete?: (id: string) => void }
  * GalleryExampleRun { id: string, name: string, description: string, parameters: Partial<SimulationRun>, metrics: object }
- Re-export existing types (SimulationRun, etc.) from backend models
- Add utility types:
  * Nullable<T> = T | null | undefined
  * Async<T> = Promise<T>
  * ValidationRuleFunc = (value: any) => ValidationResult
- Strict null checking enabled (tsconfig.json: "strictNullChecks": true)
- All exports documented with JSDoc comments

This ensures consistency across the codebase and aids IDE autocomplete.
```

---

## Prompt 4.2: Add Component Tests
**File**: `frontend/src/components/__tests__/ConfigSection.test.tsx` (new)

```
Create comprehensive unit tests for ConfigSection component.

Requirements:
- Test framework: Vitest or Jest (whichever is in project)
- Library: React Testing Library
- Test cases:
  1. "renders title correctly"
     - render <ConfigSection title="Test"> → expect screen.getByText("Test")
  2. "renders children when defaultOpen=true"
     - render with children "Content" → expect getByText("Content").toBeVisible()
  3. "hides children when defaultOpen=false"
     - render defaultOpen={false} → expect getByText("Content").not.toBeVisible()
  4. "toggles visibility on header click"
     - render, click header button, check visibility changes twice
  5. "shows Advanced badge when isAdvanced=true"
     - render isAdvanced={true} → expect screen.getByText("Advanced")
  6. "chevron rotates on toggle"
     - Check className includes rotate-180 when open
  7. "renders multiple sections with correct borders"
     - render 3 sections, check last has no border-b-0
- Setup:
  * beforeEach: import necessary components and Lucide icons
  * Use renderHook or render from React Testing Library
- Assertions:
  * Use expect from Vitest/Jest
  * Check DOM attributes, visibility, text content
  * Use screen.getByRole, screen.getByText, etc.
- Coverage target: 90%+

Test file should be in __tests__ folder parallel to component.
```

---

## Prompt 4.3: Add Integration Tests for ConfigPanel
**File**: `frontend/src/components/__tests__/ConfigPanel.integration.test.tsx` (new)

```
Create integration tests for the full ConfigPanel refactored component.

Requirements:
- Test framework: Vitest
- Library: React Testing Library + @testing-library/user-event
- Mock dependencies:
  * useSimStore: create mock with activeRun, updateRunField, validateField, etc.
  * toast: mock toast.success, toast.error functions
  * useVtkScene: if used in preview, mock setPreviewMode
- Test cases:
  1. "renders all quick control sections"
     - Render ConfigPanel → find "Velocity", "Angle of Attack", "Submersion Depth"
  2. "user can adjust velocity slider and see live preview"
     - Find velocity slider
     - userEvent.slider(slider, 15)
     - Expect updateRunField('velocity', 15) was called
     - Expect onLivePreview was called
  3. "validation error prevents running simulation"
     - Mock activeRun with invalid velocity (100)
     - Render ConfigPanel
     - Expect [Run Simulation] button to be disabled
     - Expect validation error message visible
  4. "clicking Run Simulation button calls API"
     - Mock API call
     - Render with valid parameters
     - userEvent.click("Run Simulation")
     - Expect API was called with correct payload
     - Expect toast.success was called
  5. "Advanced section expands/collapses"
     - Render ConfigPanel
     - Find "Show Advanced" button
     - Click it
     - Expect "SOLVER" section visible
     - Click again
     - Expect "SOLVER" section not visible
  6. "switching solver type shows/hides relevant controls"
     - Select "pimpleFoam" from solver dropdown
     - Expect end_time, delta_t controls visible
     - Switch back to "simpleFoam"
     - Expect those controls hidden
  7. "propulsion model conditional fields"
     - Select propulsion_model "sail"
     - Expect wind_speed, wind_angle, sail_area controls visible
     - Select "none"
     - Expect those controls hidden
- Setup:
  * beforeEach: setup mock store and render ConfigPanel
  * Mock useSimStore with jest.mock or vi.mock
- Coverage target: 85%+

Integration tests verify the full user flow.
```

---

## Prompt 4.4: Add Accessibility Tests
**File**: `frontend/src/components/__tests__/accessibility.test.tsx` (new)

```
Create accessibility tests for all new components using axe-core.

Requirements:
- Test framework: Vitest
- Library: @testing-library/react + jest-axe (or @axe-core/react)
- Components to test:
  * ConfigSection
  * FieldWithHint
  * SliderWithInput
  * StatusPill
  * RunsCardGrid
  * MetricsHUD
  * LogConsoleCompact
- Test cases (per component):
  1. "has no accessibility violations (axe scan)"
     - render component
     - const { container } = render(...)
     - const results = await axe(container)
     - expect(results).toHaveNoViolations()
  2. "keyboard navigation works (for interactive components)"
     - render interactive component
     - Simulate Tab key → check focus changes
     - Simulate Enter key → check action triggers
     - Example for slider: Tab into slider, Arrow keys adjust value
  3. "color contrast meets WCAG AA"
     - Check text-to-background contrast ratios
     - Use getComputedStyle to check colors
     - Verify contrast >= 4.5:1 for normal text, 3:1 for large text
  4. "screen reader announcements"
     - render component
     - Use @testing-library/jest-dom matchers
     - Expect aria-label, aria-describedby, role attributes
     - Example: <button aria-label="Delete run" role="button">
  5. "form fields have associated labels"
     - render SliderWithInput
     - Expect input has <label> with htmlFor matching input id
- Setup:
  * beforeEach: import axe from 'jest-axe'
  * afterEach: consider jest-axe cleanup
- Config:
  * axe options: rules to disable none (strict mode)
  * Report any violations as test failure
- Coverage: All new components tested

Accessibility is non-negotiable. Test WCAG 2.1 AA compliance.
```

---

## Prompt 4.5: Create Visual Regression Test Suite
**File**: `frontend/cypress/e2e/visual-regression.cy.ts` (new)

```
Create visual regression tests using Cypress to catch unintended UI changes.

Requirements:
- Test framework: Cypress
- Visual plugin: cypress-image-diff or similar
- Test cases:
  1. "ConfigPanel quick mode matches baseline"
     - cy.visit('/dashboard')
     - cy.get('[data-testid="config-panel"]').screenshot('configpanel-quick-mode')
     - Compare against baseline
  2. "ConfigPanel advanced mode expanded"
     - Expand advanced section
     - Take screenshot
     - Compare against baseline
  3. "RunsCardGrid with 5 runs matches baseline"
     - Render with mock data
     - Take screenshot
     - Verify grid layout, spacing, fonts
  4. "StatusPill all states"
     - Render all status types (IDLE, PENDING, MESHING, SOLVING, COMPLETED, FAILED)
     - Take screenshot grid
     - Verify colors, animations, text
  5. "MetricsHUD overlay positioning"
     - Render VTK viewport with MetricsHUD
     - Take screenshot
     - Verify metrics box positioned top-left, readable over foil
  6. "Toast notifications all types"
     - Trigger success, error, info toasts
     - Take screenshot
     - Verify positioning, colors, icons
  7. "Dark mode contrast (visual check)"
     - Render all components
     - Screenshot
     - Manual verify text is readable (automated check hard, use for regression)
- Setup:
  * beforeEach: Set viewport to 1920x1080
  * beforeEach: Reset to default state
  * Use data-testid attributes for reliable selectors
- Baseline creation:
  * Run with --record flag to create baseline images
  * Commit baseline images to version control
  * On CI: compare against baseline, fail if diff > 2% pixel difference
- Config (cypress.config.ts):
  * screenshotOnRunFailure: true
  * video: false (keep CI fast)
  * baseUrl: http://localhost:3000

Visual tests prevent CSS drift and unintended layout changes.
```

---

## Prompt 4.6: Add Performance Tests
**File**: `frontend/src/performance.test.ts` (new)

```
Create performance tests to ensure components render efficiently.

Requirements:
- Test framework: Vitest with @testing-library/react
- Measurement library: react-test-renderer or performance API
- Test cases:
  1. "ConfigPanel renders in < 100ms"
     - Measure render time
     - Expect duration < 100
  2. "SliderWithInput re-render on value change < 50ms"
     - Render component
     - Measure time to update when slider value changes
     - Expect < 50ms (no full page re-render)
  3. "RunsCardGrid with 100 runs renders in < 500ms"
     - Mock 100 run objects
     - Render <RunsCardGrid runs={runs} />
     - Measure render time
     - Expect < 500ms
  4. "MetricsHUD updates on activeRun change < 30ms"
     - Render MetricsHUD
     - Update activeRun in Zustand store
     - Measure time to reflect change
     - Expect < 30ms
  5. "Toast system handles 10 concurrent toasts"
     - Fire 10 toast.success() calls rapidly
     - Measure total time
     - Expect all render within 200ms
- Measurement approach:
  * Use performance.now() or perf_hooks
  * Measure from render start to vdom painted
  * Exclude initial setup time
- Benchmarks:
  * Create baseline on main branch
  * CI runs tests and alerts if regression > 20%
- Notes:
  * Component-level perf tests (not E2E)
  * Focus on interaction responsiveness (slider drag, toggle click)
- Export results for monitoring

Performance tests catch regressions before they reach users.
```

---

## Prompt 4.7: Add Responsive Design Tests
**File**: `frontend/cypress/e2e/responsive.cy.ts` (new)

```
Create responsive design tests for multiple screen sizes.

Requirements:
- Test framework: Cypress
- Viewport sizes to test:
  * Desktop: 1920x1080, 1366x768
  * Tablet: 768x1024, 834x1194 (iPad)
  * Mobile: 375x667, 414x896 (iPhone)
- Test cases per viewport:
  1. "Layout does not overflow horizontally"
     - cy.visit('/dashboard')
     - cy.viewport(width, height)
     - cy.window().then(($win) => {
         expect($win.innerWidth).to.equal($win.document.body.scrollWidth)
       })
  2. "Sidebar is visible and not truncated"
     - Check sidebar width (% of viewport)
     - Check asset/run names are readable (not severely truncated)
  3. "VTK viewport is visible and interactive"
     - Check viewport takes up correct space
     - Simulate mouse drag → expect foil rotates
  4. "Config panel is accessible (no horizontal scroll)"
     - On mobile: might be bottom sheet or overlay
     - On tablet: sidebar
     - On desktop: right column
     - No horizontal scrolling needed
  5. "Text is readable (font sizes, line-height)"
     - Check font-size >= 12px on mobile
     - Check line-height >= 1.5
     - Check color contrast still meets WCAG AA
  6. "Touch targets are large enough (mobile)"
     - On mobile viewport, buttons should be >= 44x44px
     - Spacing between buttons >= 8px
     - Check all interactive elements
  7. "Toasts are visible on mobile (not off-screen)"
     - Trigger toast on mobile viewport
     - Verify toast is within viewport bounds
     - Verify not hidden under bottom navigation (if present)
- Setup:
  * beforeEach: cy.viewport(width, height)
  * Iterate over all viewport sizes
  * Use fixtures or mock data for consistent test data
- Assertions:
  * Use cy.should() for visibility and bounds
  * Use getComputedStyle for spacing verification
- Screenshot on each viewport:
  * For manual verification
  * Baseline comparison

Responsive tests ensure usability across device types.
```

---

## Prompt 4.8: Add E2E User Flow Tests
**File**: `frontend/cypress/e2e/user-flows.cy.ts` (new)

```
Create end-to-end tests for critical user flows.

Requirements:
- Test framework: Cypress with fixtures (mock data)
- Flow 1: "New user runs first simulation"
  1. Land on dashboard
  2. Select asset from sidebar ("Easy_Rider")
  3. See default parameters load
  4. See prediction card (Est. 3 min)
  5. Click [Run Simulation]
  6. See toast: "✓ Simulation started"
  7. Watch log console progress
  8. Wait for COMPLETED status
  9. See pressure field auto-enables
  10. See results in MetricsHUD
- Flow 2: "User compares two runs"
  1. Load two runs side-by-side
  2. Switch between them (or use comparison view)
  3. See metrics difference calculated
  4. Understand which has better L/D ratio
- Flow 3: "User browses gallery and loads example"
  1. Click "Gallery" tab in sidebar
  2. See 5 example cards
  3. Click "Copy Parameters" on "Efficient Cruiser"
  4. See parameters load into ConfigPanel
  5. Click [Run Simulation]
  6. Simulation runs with gallery parameters
- Flow 4: "User adjusts parameters and validates"
  1. Set velocity to 50 m/s
  2. See warning: "⚠️ Cavitation likely"
  3. [Run Simulation] still enabled (warning, not error)
  4. Set AoA to 25°
  5. See error: "❌ Out of range"
  6. [Run Simulation] disabled
  7. Reduce AoA to 10°
  8. Error clears, button re-enables
- Flow 5: "User enables advanced features"
  1. Click "Show Advanced"
  2. See propulsion, solver sections expand
  3. Switch solver to "pimpleFoam"
  4. See end_time, delta_t fields appear
  5. Adjust transient parameters
  6. Run simulation
  7. See longer solver time (transient is slower)
- Setup:
  * beforeEach: cy.visit('/dashboard')
  * Mock API calls with cy.intercept()
  * Use fixtures for run data
  * Mock WebSocket for live updates (if applicable)
- Assertions:
  * Visual checks (toast appears, UI updates)
  * Data checks (API called with correct params)
  * State checks (store updated correctly)
- Timeouts:
  * Adjust for realistic simulation times
  * Use cy.wait() for async updates
  * Consider cy.waitFor() alternatives

E2E tests verify complete workflows work end-to-end.
```

---

## Prompt 4.9: Create Storybook Stories
**File**: `frontend/src/components/ConfigSection.stories.ts` (new)

```
Create Storybook stories for ConfigSection and related components.

Requirements:
- Framework: Storybook 7+ with TypeScript
- Story file: ComponentName.stories.ts
- Each component gets stories for all states/variants
- Example: ConfigSection.stories.ts
  * Meta: title, component, args
  * Story 1: "Quick Control (Default Open)"
    - args: { title: "FLOW PARAMETERS", defaultOpen: true, isAdvanced: false }
    - children: SliderWithInput mock
  * Story 2: "Advanced (Collapsed)"
    - args: { title: "PROPULSION", defaultOpen: false, isAdvanced: true }
    - children: form fields
  * Story 3: "Multiple sections"
    - Render array of ConfigSections
- Example: StatusPill.stories.ts
  * Story per status type: IDLE, PENDING, MESHING, SOLVING, COMPLETED, FAILED
  * Show icon, color, animation if applicable
- Example: SliderWithInput.stories.ts
  * Story: "Default velocity"
  * Story: "Angle of attack (negative range)"
  * Story: "User editing numeric input"
  * Story: "Validation error state"
- Example: ValidationTooltip.stories.ts
  * Story: "Error"
  * Story: "Warning"
  * Story: "Info"
- Setup:
  * Install @storybook/react, @storybook/addon-essentials
  * Configure .storybook/main.ts
  * Configure dark theme in .storybook/preview.ts
  * Import Tailwind CSS in preview.ts
- Controls:
  * Use argTypes for interactive controls
  * Allow changing props in Storybook UI
- Accessibility:
  * Use @storybook/addon-a11y
  * Each story auto-scanned with axe
- Documentation:
  * Include JSDoc comments on stories
  * Use docs addon for auto-generated docs

Storybook enables designers to review components in isolation.
```

---

## Prompt 4.10: Create Testing Documentation
**File**: `frontend/TESTING.md` (new)

```
Create comprehensive testing documentation for the project.

Requirements:
- Document sections:
  1. "Test Setup"
     - How to install dependencies (Vitest, Cypress, jest-axe)
     - How to configure test files
     - Running tests locally
  2. "Unit Tests"
     - Where to put tests (__tests__ folder)
     - How to write tests (describe, it, expect patterns)
     - Mocking patterns (useSimStore, APIs)
     - Examples from ConfigSection.test.tsx
  3. "Integration Tests"
     - How to test full component flows
     - Mocking store + APIs
     - User event simulation (userEvent.click, userEvent.type)
     - Examples from ConfigPanel.integration.test.tsx
  4. "E2E Tests"
     - Cypress structure
     - How to write user flows
     - Mocking APIs (cy.intercept)
     - cy.visit, cy.get, cy.click examples
     - Waiting for async operations
  5. "Accessibility Testing"
     - Running axe scans
     - Manual keyboard navigation testing
     - Screen reader testing (NVDA, JAWS, VoiceOver)
     - WCAG 2.1 AA compliance checklist
  6. "Visual Regression Testing"
     - Baseline image generation
     - Running baseline comparisons
     - Updating baselines on intentional changes
     - CI/CD integration
  7. "Performance Testing"
     - Measuring component render times
     - Using React DevTools Profiler
     - Identifying bottlenecks
     - Performance budgets
  8. "Coverage Reports"
     - How to generate coverage reports
     - Coverage targets (90% unit, 80% integration, 100% E2E critical flows)
     - Badge generation for README
- Include:
  * Commands to run:
    - npm run test (all tests)
    - npm run test:watch (watch mode)
    - npm run test:coverage (coverage report)
    - npm run test:a11y (accessibility tests)
    - npm run test:e2e (Cypress tests)
  * Troubleshooting section
  * CI/CD pipeline expectations
  * Pre-commit hooks (husky + lint-staged)
- Format:
  * Markdown with code blocks
  * CLI commands clearly marked
  * Cross-references to test files

This guide helps new contributors write tests confidently.
```

---

## Prompt 4.11: Add Pre-Commit Hooks
**File**: `.husky/pre-commit` and `.lintstagedrc.json` (new)

```
Configure pre-commit hooks to run linting and tests before commits.

Requirements:
- Install: npm install -D husky lint-staged
- Setup: npx husky install
- .husky/pre-commit script:
  * Run lint-staged
  * Exit with error if any checks fail
  * Prevent commit if tests fail
- .lintstagedrc.json config:
  * "**/*.tsx": ["eslint --fix", "prettier --write"]
  * "**/*.ts": ["eslint --fix", "prettier --write"]
  * "**/*.{tsx,ts}": ["vitest run --bail"] (only tests for changed files)
  * "**/*.md": ["prettier --write"]
- package.json scripts (add if not present):
  * "lint": "eslint src/"
  * "lint:fix": "eslint src/ --fix"
  * "format": "prettier --write \"src/**/*.{ts,tsx,css,md}\""
  * "test": "vitest run"
  * "test:watch": "vitest"
  * "test:coverage": "vitest run --coverage"
- CI/CD (.github/workflows/test.yml):
  * Run linting
  * Run tests (all, not just changed files)
  * Run coverage check (fail if < 80%)
  * Run a11y tests
  * Generate coverage badge
- Behavior:
  * Developer runs: git commit -m "..."
  * Pre-commit hook runs: eslint, prettier, vitest
  * If any fail: commit blocked, must fix errors
  * If all pass: commit proceeds
  * Improves code quality and catches bugs early

Pre-commit hooks enforce code standards automatically.
```

---

## Prompt 4.12: Create CI/CD Pipeline Configuration
**File**: `.github/workflows/test.yml` (new)

```
Create GitHub Actions CI/CD pipeline to run all tests on push/PR.

Requirements:
- Trigger: on push to main, on pull_request
- Job 1: Lint & Format Check
  * runs-on: ubuntu-latest
  * node-version: 18.x
  * Install dependencies
  * Run: npm run lint
  * Run: npm run format (and check if files changed)
  * Fail if files not properly formatted
- Job 2: Unit & Integration Tests
  * runs-on: ubuntu-latest
  * Install dependencies
  * Run: npm run test (all Vitest tests)
  * Generate coverage report
  * Upload coverage to Codecov or Coveralls
  * Check coverage threshold (fail if < 80%)
- Job 3: E2E Tests (Cypress)
  * runs-on: ubuntu-latest
  * Start dev server: npm run dev (background)
  * Wait for server ready
  * Run: npm run test:e2e (Cypress)
  * Upload videos/screenshots on failure
  * Generate report
- Job 4: Accessibility Tests
  * runs-on: ubuntu-latest
  * Run: npm run test:a11y
  * Fail if violations found
- Job 5: Build Check
  * runs-on: ubuntu-latest
  * Install dependencies
  * Run: npm run build
  * Check build succeeds
  * Check bundle size (warn if +10% from baseline)
- Job 6: Visual Regression (Optional, slower)
  * runs-on: ubuntu-latest
  * Run baseline Cypress visual tests (or scheduled)
  * Compare against main branch baselines
  * Comment on PR with visual diff summary
- Jobs run in parallel (except visual regression, which is slower)
- On failure:
  * PR shows red ✗
  * Required checks block merge
  * Developers must fix tests before merge
- Notifications:
  * Post summary comment on PR
  * Include coverage badge
  * Link to full reports (Codecov, Cypress dashboard)
- Secrets/Environment:
  * Store CODECOV_TOKEN, CYPRESS_RECORD_KEY as repo secrets
  * CI environment: CI=true

CI/CD ensures every commit is tested before merge.
```

---

## Prompt 4.13: Add Mobile Breakpoint Adjustments
**File**: `frontend/src/components/App.tsx` (responsive update)

```
Add responsive layout adjustments for tablet and mobile viewports.

Requirements:
- Breakpoints (use Tailwind breakpoints):
  * sm: 640px
  * md: 768px
  * lg: 1024px
  * xl: 1280px
- Layout adjustments:
  * xl (desktop, 1280px+): 4-column (sidebar 10%, viewport 50%, config 40%)
  * lg (laptop, 1024px): 4-column same, maybe reduce sidebar to 8%
  * md (tablet, 768px):
    - Sidebar: hidden (hamburger menu triggers modal)
    - Viewport: flex-1
    - Config: overlay sheet from bottom (or right panel, collapsed)
    - Layout: grid-cols-2, viewport full width, config slides in as overlay
  * sm (mobile, < 768px):
    - Sidebar: hamburger menu (Lucide Menu icon)
    - Viewport: full width, takes entire screen
    - Config: bottom sheet (swipe up/down to show/hide)
    - Layout: vertical stack, viewport top (flex-1), config bottom (max-h-1/3 when expanded)
- Implementation:
  * Use Tailwind's responsive classes: hidden md:block, md:w-1/2
  * Use CSS media queries for complex layouts
  * Update App.tsx grid-cols: xl:grid-cols-4 lg:grid-cols-4 md:grid-cols-2
  * Sidebar: hidden md:flex, when hidden add hamburger button in header
- Hamburger menu (mobile):
  * Lucide Menu icon in top-left
  * Click toggles modal with Sidebar content
  * Modal: position fixed, top 0, left 0, w-full, backdrop-blur-sm
  * Closes on selection or click outside
- Bottom sheet config (mobile):
  * Swipe/drag gesture support (library: react-use-gesture or built-in)
  * Drag handle at top (three horizontal lines)
  * Show/hide animation: translate3d(0, 0, 0) to translate3d(0, 100%, 0)
  * When expanded: full height or 80vh max
- Test on actual devices:
  * iPhone SE, 12 Pro, 14 Pro Max
  * iPad Air, Pro
  * Android phones (375px-430px wide)
- Utilities:
  * useMediaQuery hook (if available) to conditionally render mobile-only UI
  * Or use Tailwind breakpoint classes directly

Responsive design ensures usability across all devices.
```

---

# IMPLEMENTATION GUIDE SUMMARY

## How to Use These Prompts

1. **Copy the prompt text exactly** (between the triple backticks)
2. **Paste into GitHub Copilot** (VS Code, comment in file, or Copilot Chat)
3. **Include context**: Open the relevant file or point Copilot to the directory
4. **Review output**: Always review generated code for:
   - TypeScript correctness
   - Tailwind class correctness
   - Import paths correct
   - Component prop compatibility
5. **Run tests**: After each component, run `npm run test` to verify
6. **Commit incrementally**: Don't implement all prompts at once; work sprint by sprint

## Example Workflow

```bash
# Sprint 1, Day 1
# File: frontend/src/components/ConfigSection.tsx
# Copy Prompt 1.1 into Copilot
# Review generated code
git add src/components/ConfigSection.tsx
git commit -m "feat: add ConfigSection component"

# Run tests
npm run test -- ConfigSection

# Next: File: frontend/src/components/FieldWithHint.tsx
# Copy Prompt 1.2
# ...repeat
```

## Sprint Timeline Estimate

- **Sprint 1** (Week 1): 5 days, 13 prompts (1.1–1.10)
- **Sprint 2** (Week 2): 5 days, 8 prompts (2.1–2.8)
- **Sprint 3** (Week 3): 5 days, 8 prompts (3.1–3.8)
- **Sprint 4** (Week 4): 5 days, 13 prompts (4.1–4.13)

**Total: ~40 prompts across 4 weeks, ~1 prompt per developer-day**

Each prompt is designed to be completed in 30–90 minutes with Copilot's help.

---

## Quality Checks After Each Prompt

1. **TypeScript Compilation**: `npx tsc --noEmit`
2. **Linting**: `npm run lint`
3. **Tests**: `npm run test`
4. **Storybook** (for UI components): `npm run storybook`
5. **Visual Check**: Run dev server, inspect in browser

Never commit without these checks passing.

---

**End of GitHub Copilot Prompts Guide**
