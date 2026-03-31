# NEREUS DASHBOARD REDESIGN STRATEGY
## From Current State to Human-Centered CFD Interface

**Version**: 1.0 | **Date**: March 25, 2026 | **Audience**: Design & Engineering Team

---

## EXECUTIVE SUMMARY

Your current dashboard is **technically solid** but feels **clinical and overwhelming**. The visual hierarchy is flat, feedback loops are implicit, and the user's cognitive load is high. This audit identifies 12 high-impact improvements that can be implemented incrementally without breaking existing code, keeping you within your established Tailwind/Lucide/Zustand stack.

**Key insight**: The 3D foil visualizer is your hero element—currently buried. Redesign orbits around **elevating that as the central narrative**.

---

## PART 1: CURRENT STATE AUDIT

### ✅ What Works Well

1. **Dark theme consistency** — Your `bg-[#0d1518]` + accent system is cohesive and easy on the eyes
2. **Clear sections** — Assets, Runs, Config panels are logically separated
3. **Status indicators** — Color-coded run states (green/amber/red) are scannable
4. **3D visualization** — VTK.js integration is impressive; users see real results
5. **Real-time polling** — Non-blocking UI updates feel responsive

### ❌ What Feels Clinical / Overwhelming

1. **No visual hierarchy between actions**
   - "Run Simulation" button is same visual weight as mesh density controls
   - Users don't know *what to do first*

2. **Dense information density**
   - 6 config sections crammed into right panel
   - No progressive disclosure (show advanced controls only when needed)
   - No affordance for "quick start" vs "fine-tuning"

3. **Passive feedback**
   - Log console at bottom is reactive; users miss it
   - No inline hints or contextual help at the right moment
   - Status = IDLE is plain text; unclear what "ready" means

4. **Spatial confusion**
   - Assets list, Runs list, and 3D view all compete for attention
   - Left sidebar is cramped (long truncated names)
   - No visual anchoring — which asset is *active*?

5. **Config panel is overwhelming**
   - 24+ fields with no grouping narrative
   - Sliders for Velocity + Submersion Depth have no relationship-showing
   - Advanced options (Cavitation, PID) are hidden; users forget they exist

6. **Analysis view is disconnected**
   - Forces readout (Fx, Fy, Fz) shown after simulation
   - No predictive UI (show expected lift/drag *before* running)
   - Colorbar legend is small and peripheral; pressure field is the payload but underemphasized

7. **No onboarding or confidence-building**
   - New user has no sense of "what does a good hydrofoil look like?"
   - No guidance on parameter ranges ("Velocity 5–15 m/s typical")
   - No example runs or templates

---

## PART 2: HIGH-IMPACT IMPROVEMENTS (Prioritized)

### **TIER 1: Visual Hierarchy & Information Architecture** (2–3 days)

#### 1.1 Create a Two-Tier Config Panel
**Problem**: All controls feel equally important.  
**Solution**: Split into *Quick Controls* (top) and *Advanced* (collapsible).

```
┌─────────────────────────────────────────┐
│ QUICK CONTROLS                          │
├─────────────────────────────────────────┤
│ 🌊 Velocity:        [===========●] 10   │
│ 📐 Angle of Attack: [===●] 5°           │
│ 🏗️  Mesh Density:   [========●] 1.0x   │
│ ▼ Show Advanced (5 more controls)       │
└─────────────────────────────────────────┘
```

**Why**: Users scanning the UI see the 3 knobs that matter most. Muscle memory forms faster.

**Implementation** (2 hours):
- Add `showAdvanced` toggle to `useSimStore`
- Group fields via a `<ConfigSection>` wrapper component
- Use `max-h-0 overflow-hidden transition-all` for collapse animation

---

#### 1.2 Redesign Runs List as a Timeline
**Problem**: Vertical list of runs with dates is dense and non-visual.  
**Solution**: Show runs as a horizontal timeline or card grid with key metrics inline.

```
┌──────────────────────────────────────────────┐
│ YOUR RUNS                              71    │
├──────────────────────────────────────────────┤
│  #71 ✓ 2h ago      │  #70 ✓ 4h ago         │
│  L/D: 4.2          │  L/D: 3.8              │
│  V: 10 m/s         │  V: 12 m/s             │
│  Drag: 245 N       │  Drag: 310 N           │
└──────────────────────────────────────────────┘
```

**Why**: Metrics *inline* with runs make scan-and-compare instant. Users naturally spot outliers.

**Implementation** (3 hours):
- Replace list layout with `grid grid-cols-auto-fit`
- Add tiny sparkline or trend indicator (lucide `TrendingUp`)
- Keep click-to-load behavior unchanged
- Add hover highlight: `hover:bg-accent/10 border-l-2 border-accent-glow`

---

#### 1.3 Visual Status States (Not Just Colors)
**Problem**: "IDLE" text doesn't feel like an actionable state.  
**Solution**: Pair color + icon + subtle animation + hint text.

```
IDLE                               COMPLETED
◯ · Waiting for input              ◉ ✓ Ready to analyze
(click to configure)               (results loaded)

MESHING                            FAILED
◉ Mesh phase...                    ◯ ✗ Review error log
(12% complete)                     (click to details)
```

**Why**: Users instantly *feel* the state, not just read it. Removes ambiguity.

**Implementation** (2 hours):
- Create `<StatusPill>` component (replaces inline circle + text)
- Maps `status` to icon, color, subtext, and animation
- Renders consistently in Sidebar + Config panel

---

### **TIER 2: Cognitive Load Reduction** (3–4 days)

#### 2.1 Add Progressive Disclosure for Config Fields
**Problem**: Users scroll past fields they don't understand.  
**Solution**: Show inline help icons with tooltip hints.

```
Velocity [========●] 10 m/s  [?]
          ↓ hover reveals tooltip below field
        "Speed of water flow. 5–15 m/s typical for 
         small hydrofoils. Higher = faster, but 
         drag increases quadratically."
```

**Why**: Learning happens passively, without breaking flow.

**Implementation** (2 hours):
- Create `<FieldWithHint label="..." hint="...">` wrapper
- Icon from lucide `HelpCircle`
- Tooltip via headless library or custom Popper.js
- Store hints in a `fieldDescriptions` object

Example:
```tsx
const fieldDescriptions = {
  velocity: "Speed of water flow. Typical range: 5–15 m/s.",
  yPlusTarget: "Wall refinement. 1 = resolve boundary layer (expensive), 30 = use wall functions.",
  turbulenceIntensity: "Fraction of kinetic energy lost to turbulence. Typical: 0.5–5%.",
};
```

---

#### 2.2 Link Parameters Visually (Show Consequences)
**Problem**: Changing Submersion Depth has no visual feedback until next run.  
**Solution**: Show a **live preview** of foil position + estimated pressure field.

```
Submersion Depth: [===●] 0.50 m
                  ↓
          (3D viewport shows foil moving live)
          (Pressure colorbar updates as estimate)
```

**Why**: Removes the "wait-and-see" penalty. Users build intuition faster.

**Implementation** (4 hours):
- On slider `onMouseUp`, call `useSimStore.setPreviewMode(true)`
- Apply CSS `transform: translateZ(...)` to foil actor in VTK
- Update colorbar legend with "estimated" badge
- Reset to final state on Run Simulation

---

#### 2.3 Simplify Log Console Output
**Problem**: Raw OpenFOAM logs are noise; users miss the important messages.  
**Solution**: Summarize logs; highlight *just* the milestones.

```
Instead of:
  simpleFoam -overwrite
  SIMPLE: field smoothing iteration 1
  SIMPLE: field smoothing iteration 2
  ...
  smoothSolver: solving for Ux, Initial residual = 0.001...
  smoothSolver: solving for p, Initial residual = 0.0001...

Show:
  ▶ 1 Extracting features...
  ▶ 2 Building mesh... (124k cells)
  ◀ 3 Solving (simpleFoam)... [████████████░░░░░░░░░ 60%]
  ◀ 4 Analyzing results...
```

**Why**: Reduces cognitive load; users trust progress without parsing logs.

**Implementation** (3 hours):
- Parse `log.simpleFoam` for key phrases: `SIMPLE finished`, `PIMPLE finished`, `Iteration`, `Finalizing`
- Emit structured events: `{ phase: 'MESHING', progress: 0.3, message: 'Adding boundary layers...' }`
- Render as a progress bar + phase list in LogConsole, not raw text

---

### **TIER 3: Feedback & Confidence Building** (3–5 days)

#### 3.1 Add Inline Validation with Warnings
**Problem**: User sets invalid parameters and doesn't know until simulation fails.  
**Solution**: Validate on change; show yellow warnings or red blocks.

```
Velocity: 50 m/s  ⚠️ Unusually high; cavitation likely
                  💡 Tip: Reduce to < 15 m/s, or enable cavitation model

Mesh Density: 0.2x  ⚠️ Very coarse; results unreliable
               💡 Recommend: ≥ 0.8x

Angle of Attack: 30°  ❌ Out of range (max 15°)
```

**Why**: Users *learn* the valid parameter space. Fewer failed runs.

**Implementation** (3 hours):
- Create `validateField(fieldName, value): { valid, warning?, message? }`
- Map in each `NumberInput` as `error` state
- Render `<Warning>` component below field
- Disable "Run Simulation" if any errors exist

---

#### 3.2 Show Expected Results (Predictive UI)
**Problem**: Users have no sense of what to expect.  
**Solution**: After clicking "Run Simulation", show a *predicted* result card.

```
ESTIMATED RESULTS
┌─────────────────────────┐
│ Based on 2,847 similar  │
│ runs in your history:   │
│                         │
│ Lift Force:  ~320 N     │
│ Drag Force:  ~85 N      │
│ L/D Ratio:   ~3.8       │
│                         │
│ ⏱️  Estimated time: 3m  │
└─────────────────────────┘
```

**Why**: Sets expectations; reduces anxiety during long waits. Builds confidence if actual > predicted.

**Implementation** (5 hours):
- Build a simple regression model on your historical run data
- Given (velocity, aoa, mesh_density, asset), predict (lift, drag, ld)
- Render as a `<PredictionCard>` below "Run Simulation" button
- Show confidence interval (±20%)
- Store in Django as a cached JSON model trained offline

---

#### 3.3 Add a "Gallery" of Example Runs
**Problem**: New users don't know what "good" looks like.  
**Solution**: Curate 5–10 reference runs with annotations.

```
GALLERY
┌───────────────────┬───────────────────┬───────────────────┐
│ High-Speed        │ Efficient         │ Stable (Low Drag) │
│ Rider             │ Cruiser           │ Barge             │
│                   │                   │                   │
│ V: 18 m/s         │ V: 8 m/s          │ V: 5 m/s          │
│ L/D: 2.1          │ L/D: 6.2          │ L/D: 8.4          │
│ [3D preview]      │ [3D preview]      │ [3D preview]      │
│                   │                   │                   │
│ Copy parameters   │ Copy parameters   │ Copy parameters   │
└───────────────────┴───────────────────┴───────────────────┘
```

**Why**: Lowers friction for first-time users. Instant starting template.

**Implementation** (2 hours):
- Create `gallery_runs` fixture in Django (5 hardcoded SimulationRun objects)
- Endpoint: `/api/gallery/`
- Frontend: New "Gallery" tab in Assets sidebar
- Click → auto-populate Config panel + load 3D preview

---

### **TIER 4: Hero Element Elevation** (2–3 days)

#### 4.1 Redesign Layout: 3D Viewer as the Center
**Problem**: 3D foil is cramped; Config dominates.  
**Solution**: Flip the layout. Viewport = center/largest. Config = right sidebar (80% → 40% width).

**Before**:
```
┌─────────────┬──────────────────────────────────┐
│ Assets/     │ [3D Viewer - cramped]            │
│ Runs        │                                  │
│ (list)      ├──────────────────────────────────┤
│             │ [Config Panel - dense]           │
│             │ (6 sections, 24+ fields)         │
│             │                                  │
└─────────────┴──────────────────────────────────┘
```

**After**:
```
┌──────────┬────────────────────────────────┬──────────────┐
│ Assets/  │  [3D Viewport - centered,      │ Config Panel │
│ Runs     │   full height, interactive]    │ (Quick mode) │
│ (compact)│                                │              │
│          │  [Metrics HUD overlay]         │              │
│          │                                │              │
└──────────┴────────────────────────────────┴──────────────┘
```

**Why**: CFD is visual. Users should *see the foil*, not scroll to find it.

**Implementation** (2 hours):
- Update top-level `grid-cols` from 3-col to 4-col
- Adjust flex proportions: sidebar 10%, viewport 50%, config 40%
- Move metrics/colorbar into viewport as overlay (not separate panel)

---

#### 4.2 Highlight the Pressure Field as the Hero Result
**Problem**: After simulation, users see forces text; pressure visualization is secondary.  
**Solution**: On completion, auto-focus viewport on foil with pressure colormap active.

```
SIMULATION COMPLETED ✓
[Automatically rotates to best view]
[Pressure field ON]
[Colorbar legend prominent in corner]
[Forces summary: L=320N | D=85N | L/D=3.8]
```

**Why**: Visual impact. Pressure field *is* the result.

**Implementation** (2 hours):
- On `status === COMPLETED`:
  - Call `useVtkScene.enablePressureMap(true)`
  - Call `camera.resetCamera()` + `camera.azimuth(-35)` (best viewing angle)
  - Flash a green pulse border around viewport

---

### **TIER 5: Micro-Interactions & Polish** (2–3 days)

#### 5.1 Slider Input Refinements
**Problem**: Sliders are generic; users don't know what value change means.  
**Solution**: Show live units, instant numeric input, and related fields.

```
Velocity
[====●====] 10.5 m/s  [input-field: 10.5]  [m/s]
            ↓
       (as you drag, foil preview moves live in 3D)
```

**Implementation** (2 hours):
- Wrap sliders in `<SliderWithInput>` component
- Allow click-to-edit the numeric value
- Show units as a badge
- Emit preview update on change

---

#### 5.2 Animated Transitions Between States
**Problem**: Panel/modal changes are jarring.  
**Solution**: Smooth transitions using Framer Motion.

```
Config panel → Analysis panel:
[Slide in from right, fade config out over 0.3s]

Run state IDLE → RUNNING:
[Status pill animates pulse, log console slides up]

Simulation completes:
[Foil glow effect + pressure overlay crossfade]
```

**Why**: Makes the interface feel *intentional*, not reactive.

**Implementation** (2 hours):
- Use Framer Motion's `AnimatePresence` + `motion.div`
- Consistent easing: `easeInOut` for panel slides, `easeOut` for entry
- Duration: 0.25–0.4s (fast, not distracting)

---

#### 5.3 Add Micro-Feedback for Every Action
**Problem**: Users don't get confirmation that clicks registered.  
**Solution**: Toast notifications + button feedback.

```
Run Simulation [clicked]
  → Button shows spinner: [⚙ Running...]
  → Toast appears: "✓ Simulation started. ETA: 3 min"
  → On completion: Toast: "✓ Results ready. Pressure field loaded."

Copy Parameters [clicked]
  → Toast: "✓ Parameters copied to clipboard"
```

**Why**: Removes uncertainty. Users trust the interface.

**Implementation** (2 hours):
- Use a toast library (e.g., `react-hot-toast` or custom `<Toast>` component)
- Trigger on API calls, parameter changes, copy actions
- Auto-dismiss after 2–3 seconds

---

## PART 3: IMPLEMENTATION ROADMAP

### Sprint 1 (Week 1): Tier 1 + Tier 5a
**Goal**: Visual hierarchy + micro-interactions.  
**Deliverables**:
- Two-tier Config panel (Quick/Advanced toggle)
- Redesigned Runs list (card grid + inline metrics)
- Status pills (icon + color + animation)
- Slider input refinements
- Toast notifications

**Effort**: ~2–3 days developer time  
**Impact**: HIGH — Users immediately *know where to look* and feel more control.

---

### Sprint 2 (Week 2): Tier 2 + Tier 4a
**Goal**: Cognitive load reduction + layout redesign.  
**Deliverables**:
- Inline help tooltips on config fields
- 4-column layout (sidebar, viewport, config, results)
- Live preview of foil position on submersion change
- Simplified log console with progress tracking

**Effort**: ~3–4 days  
**Impact**: VERY HIGH — UX feels less overwhelming; users learn faster.

---

### Sprint 3 (Week 3): Tier 3 + Tier 4b
**Goal**: Confidence building + hero element elevation.  
**Deliverables**:
- Inline validation + warnings
- Predictive UI (estimated results)
- Gallery of example runs
- Auto-focus on pressure field after completion
- Animated transitions

**Effort**: ~4–5 days (most of this is ML model + fixtures)  
**Impact**: VERY HIGH — Users run simulations with confidence; first-run success rate ↑.

---

### Sprint 4 (Week 4): Polish + Testing
**Goal**: Edge cases, responsive design, performance.  
**Deliverables**:
- Mobile/tablet responsive layout
- Error state handling
- Accessibility audit (WCAG 2.1 AA)
- Load testing (multiple concurrent simulations)

**Effort**: ~2–3 days  
**Impact**: MEDIUM — Robustness.

---

## PART 4: COMPONENT SPECS (Code-Ready)

### A. ConfigSection Component

```tsx
// frontend/src/components/ConfigSection.tsx
import React from 'react';
import { ChevronDown } from 'lucide-react';

interface ConfigSectionProps {
  title: string;
  isAdvanced?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const ConfigSection: React.FC<ConfigSectionProps> = ({
  title,
  isAdvanced = false,
  defaultOpen = !isAdvanced,
  children,
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="border-b border-hud-border pb-3 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-left text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors duration-200"
      >
        <span className="hud-label flex items-center gap-2">
          {title}
          {isAdvanced && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-accent/10 text-accent-cyan">
              Advanced
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? 'max-h-screen mt-2' : 'max-h-0'
        }`}
      >
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
};
```

---

### B. FieldWithHint Component

```tsx
// frontend/src/components/FieldWithHint.tsx
import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface FieldWithHintProps {
  label: string;
  hint: string;
  children: React.ReactNode;
}

export const FieldWithHint: React.FC<FieldWithHintProps> = ({
  label,
  hint,
  children,
}) => {
  const [showHint, setShowHint] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-300">{label}</label>
        <button
          type="button"
          onMouseEnter={() => setShowHint(true)}
          onMouseLeave={() => setShowHint(false)}
          className="text-slate-500 hover:text-accent-cyan transition-colors"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {showHint && (
        <div className="text-2xs text-slate-400 bg-accent/5 border border-accent/15 rounded px-2 py-1.5 animate-in fade-in duration-200">
          {hint}
        </div>
      )}

      {children}
    </div>
  );
};
```

---

### C. StatusPill Component

```tsx
// frontend/src/components/StatusPill.tsx
import React from 'react';
import { Circle, Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

type Status = 'IDLE' | 'PENDING' | 'MESHING' | 'SOLVING' | 'COMPLETED' | 'FAILED';

const statusConfig: Record<Status, {
  icon: React.ReactNode;
  color: string;
  label: string;
  subtext: string;
  animate: boolean;
}> = {
  IDLE: {
    icon: <Circle className="h-2 w-2" />,
    color: 'text-slate-500',
    label: 'Idle',
    subtext: 'Ready to run',
    animate: false,
  },
  PENDING: {
    icon: <Loader2 className="h-2 w-2" />,
    color: 'text-accent-glow',
    label: 'Pending',
    subtext: 'Queued...',
    animate: true,
  },
  MESHING: {
    icon: <Loader2 className="h-2 w-2" />,
    color: 'text-accent-glow',
    label: 'Meshing',
    subtext: 'Building mesh...',
    animate: true,
  },
  SOLVING: {
    icon: <Loader2 className="h-2 w-2" />,
    color: 'text-accent-glow',
    label: 'Solving',
    subtext: 'Computing...',
    animate: true,
  },
  COMPLETED: {
    icon: <CheckCircle2 className="h-2 w-2" />,
    color: 'text-accent-emerald',
    label: 'Completed',
    subtext: 'Ready to analyze',
    animate: false,
  },
  FAILED: {
    icon: <XCircle className="h-2 w-2" />,
    color: 'text-accent-rose',
    label: 'Failed',
    subtext: 'Review error log',
    animate: false,
  },
};

interface StatusPillProps {
  status: Status;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`${config.color} ${config.animate ? 'animate-spin' : ''}`}>
        {config.icon}
      </div>
      <div>
        <div className="text-xs font-medium text-slate-100">{config.label}</div>
        <div className="text-2xs text-slate-400">{config.subtext}</div>
      </div>
    </div>
  );
};
```

---

### D. SliderWithInput Component

```tsx
// frontend/src/components/SliderWithInput.tsx
import React, { useState } from 'react';

interface SliderWithInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  onLivePreview?: (value: number) => void;
}

export const SliderWithInput: React.FC<SliderWithInputProps> = ({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  onChange,
  onLivePreview,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));

  const handleSliderChange = (newValue: number) => {
    onChange(newValue);
    onLivePreview?.(newValue);
  };

  const handleInputBlur = () => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed);
      setIsEditing(false);
    } else {
      setEditValue(String(value));
      setIsEditing(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-300">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
          className="flex-1 h-1 bg-accent/20 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
        />
        <div className="w-16 flex items-center gap-1">
          {isEditing ? (
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleInputBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleInputBlur()}
              autoFocus
              className="text-xs bg-accent/10 border border-accent/25 rounded px-1.5 py-1 text-slate-100 w-full"
            />
          ) : (
            <button
              onClick={() => {
                setIsEditing(true);
                setEditValue(String(value));
              }}
              className="text-xs font-mono text-slate-200 hover:text-slate-100 cursor-text text-right flex-1"
            >
              {value.toFixed(2)}
            </button>
          )}
          {unit && <span className="text-2xs text-slate-500">{unit}</span>}
        </div>
      </div>
    </div>
  );
};
```

---

## PART 5: STYLING UPDATES (Tailwind)

### Global Enhancements (in your config)

```ts
// tailwind.config.ts additions

module.exports = {
  theme: {
    extend: {
      // Existing tokens are good; add these:
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'slide-up': {
          'from': { transform: 'translateY(10px)', opacity: '0' },
          'to': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [
    // Your existing plugins
  ],
};
```

---

## PART 6: MIGRATION STRATEGY (No Breaking Changes)

### Phase 1: Add Components (1–2 days)
- ✅ Create new components in `frontend/src/components/` (don't delete old ones)
- ✅ Leave existing panels unchanged
- ✅ Add new store slices (`showAdvanced`, `previewMode`) to `useSimStore`

### Phase 2: Integrate Gradually (2–3 days)
- ✅ Update ConfigPanel to use `ConfigSection` wrapper (opt-in per section)
- ✅ Replace Runs list with new card layout
- ✅ Swap status text for `StatusPill` in Sidebar + Config header
- ✅ Add toast system to API calls

### Phase 3: Layout Refinement (1–2 days)
- ✅ Adjust grid proportions (viewport gets more space)
- ✅ Move metrics overlay into VTK viewport
- ✅ Test responsiveness on small screens

### Phase 4: Feature Enhancements (ongoing)
- ✅ Validation + warnings
- ✅ Predictive UI
- ✅ Gallery fixture
- ✅ Animated transitions

**Zero breakage**: Old components coexist until you're confident in replacements.

---

## PART 7: METRICS & SUCCESS CRITERIA

### UX Metrics to Track
- **First-time user success rate**: % of users who complete first simulation without errors
- **Task completion time**: Time from page load → "Run Simulation" click (target: < 2 min)
- **Error recovery**: % of failed runs that user re-runs successfully
- **Feature discovery**: % of users who toggle advanced options
- **Pressure field usage**: % of runs where user views pressure visualization

### Code Health
- No TypeScript errors
- Accessibility audit (WCAG 2.1 AA, auto via axe)
- Lighthouse performance > 80
- Component test coverage > 80%

### Success Definition
✅ New user can run a simulation with guidance in < 3 min  
✅ Interface feels "intentional", not clinical  
✅ Users discover advanced options organically  
✅ Error states are clear and actionable  

---

## PART 8: QUESTIONS TO VALIDATE

Before you implement, ask yourself:

1. **Visual Hierarchy**: Can someone who's never seen this app run a simulation in 2 minutes?
2. **Feedback Loops**: Does every action feel acknowledged?
3. **Cognitive Load**: Are there any fields users need but aren't looking at?
4. **Hero Element**: What's the visual star? (Pressure field should be.)
5. **Onboarding**: Do new users know what "good results" look like?
6. **Error Culture**: When something fails, is the path to recovery clear?

---

## APPENDIX: Design Tokens Summary

Your existing Tailwind setup is solid. Reference:

| Token                    | Use Case                              | Example Class              |
| ------------------------ | ------------------------------------- | -------------------------- |
| `bg-[#0d1518]`           | Page background                       | Default                    |
| `bg-accent/5, /10, /15`  | Component surfaces, hover states      | Container backgrounds      |
| `text-accent-cyan`       | Primary accent (icons, headers)       | Active state, primary info  |
| `text-accent-glow`       | Active/running state                  | Status indicators           |
| `text-accent-emerald`    | Success state                         | Completed status            |
| `text-accent-rose`       | Error/failed state                    | Failed status               |
| `hud-label`              | Section headers (custom utility)      | Section titles              |
| `hud-border`             | Dividers, hover borders (custom)      | Subtle lines, hover effects |
| `scrollbar-dark`         | Custom scrollbar (custom)             | Scrollable containers       |

---

## CLOSING THOUGHTS

Your dashboard is *technically* solid but *emotionally* distant. The improvements above aren't about flashy animations—they're about **respecting the user's time and intelligence**. 

The pressure field is your hero. The 3D foil is the story. Everything else is supporting cast. By redesigning with this in mind, you'll move from a "tool that works" to a "tool that feels great."

Start with Tier 1. Ship in 3–5 days. Measure impact. Iterate.

Good luck. 🚀