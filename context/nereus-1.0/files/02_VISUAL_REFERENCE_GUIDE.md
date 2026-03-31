# NEREUS REDESIGN: VISUAL REFERENCE GUIDE
## Wireframes, Component States, and Design Patterns

---

## 1. LAYOUT COMPARISON

### CURRENT LAYOUT (3-COLUMN)
```
┌──────────────┬──────────────────────────────────┬──────────────────┐
│              │                                  │                  │
│  SIDEBAR     │       VTK 3D VIEWPORT            │  CONFIG PANEL    │
│  (20%)       │       (CRAMPED)                  │  (DENSE, 20%)    │
│              │                                  │                  │
│  • Assets    │  ╔═══════════════════════╗       │  Quick Controls  │
│    (10)      │  ║                       ║       │  Mesh Settings   │
│              │  ║   [Pressure Foil]     ║       │  Solver          │
│  • Runs      │  ║                       ║       │  Propulsion      │
│    #71 ✓     │  ║   [Colorbar Legend]   ║       │  Advanced...     │
│    #70 ✓     │  ║                       ║       │                  │
│    #69 ✓     │  ╚═══════════════════════╝       │  Run Simulation  │
│              │                                  │                  │
│              ├──────────────────────────────────┤                  │
│              │  LOG CONSOLE (Raw output)        │                  │
│              │  [scrollable, verbose]           │                  │
│              │                                  │                  │
└──────────────┴──────────────────────────────────┴──────────────────┘
```

**Problems**:
- Foil is cramped & squeezed
- Config is overwhelming (24+ fields in one view)
- Log console noise distracts
- Metrics are post-hoc, not focal

---

### NEW LAYOUT (4-COLUMN + SMART OVERLAYS)
```
┌────────┬─────────────────────────────────────────────────┬──────────────────┐
│        │                                                 │                  │
│SIDEBAR │         VTK 3D VIEWPORT (HERO ELEMENT)          │ CONFIG PANEL     │
│(10%)   │                                                 │ (QUICK MODE, 40%)│
│        │  ╔════════════════════════════════════════╗    │                  │
│ASSETS  │  ║                                        ║    │ QUICK CONTROLS   │
│        │  ║     [Pressure-Colored Foil]          ║    │ ─────────────    │
│  Parts │  ║                                        ║    │ 🌊 Velocity      │
│  Easy_ │  ║                                        ║    │ [====●] 10 m/s   │
│  Rider │  ║     [Orientation Marker]      ╱╱╱    ║    │                  │
│        │  ║                                ║ L:320N║    │ 📐 Angle of Atk  │
│        │  ║                                ║ D: 85N║    │ [===●] 5°        │
│        │  ║                         L/D: 3.8      ║    │                  │
│        │  ║                                        ║    │ 🏗️  Mesh Density │
│  ┌─────┤  ║     ⚪ Color: Pressure [Cp]            ║    │ [========●] 1.0x │
│  │RUNS │  ║                                        ║    │                  │
│  │────│  ╚════════════════════════════════════════╝    │ ▼ Show Advanced  │
│  │    │                                                 │   (5 more)       │
│  │#71 │  ┌─ Log: Solving (simpleFoam)                 │                  │
│  │✓   │  │ [████████████░░░░░░░░░░░░] 60%            │                  │
│  │    │  └─ ETA: 2 min                                │                  │
│  │ ▼  │                                                 │ ┌──────────────┐ │
│  │    │                                                 │ │ PREDICTION   │ │
│  └────┤                                                 │ │              │ │
│       │                                                 │ │ Based on     │ │
│       │                                                 │ │ 2,847 runs:  │ │
│       │                                                 │ │ Lift: ~320 N │ │
│       │                                                 │ │ Drag: ~85 N  │ │
│       │                                                 │ │              │ │
│       │                                                 │ │ ETA: 3 min   │ │
│       │                                                 │ └──────────────┘ │
│       │                                                 │                  │
│       │                                                 │ [Run Simulation] │
│       │                                                 │                  │
└────────┴─────────────────────────────────────────────────┴──────────────────┘
```

**Improvements**:
- Foil takes center stage (50% width, full height)
- Config simplified to 3 quick controls + collapsible advanced
- Metrics HUD overlaid in corner (non-intrusive)
- Log is progress bar + phase indicator (compact)
- Prediction card visible before run (confidence building)

---

## 2. CONFIG PANEL STATES

### QUICK MODE (Default)
```
┌──────────────────────────────────┐
│ ⚙ CONFIGURATION                  │
│                                  │
│ ◉ · Ready to run                 │
│                                  │
│ FLOW PARAMETERS                  │
│                                  │
│ Velocity                          │
│ [====●====] 10.5 m/s [input]    │
│                                  │
│ Angle of Attack                   │
│ [===●] 5° [input] °              │
│                                  │
│ Submersion Depth                  │
│ [====●====] 0.50 m [input]       │
│ Depth of foil center below surface│
│                                  │
│ MESH SETTINGS                    │
│                                  │
│ Mesh Density                      │
│ [========●] 1.0x [input]         │
│                                  │
│ ▼ More Options (5 advanced)      │
│                                  │
│ ┌────────────────────────────┐   │
│ │ PREDICTION                 │   │
│ │ Based on 2,847 similar     │   │
│ │ runs:                      │   │
│ │ Lift: ~320 N               │   │
│ │ Drag: ~85 N                │   │
│ │ L/D: ~3.8                  │   │
│ │ ⏱ 3 min                    │   │
│ └────────────────────────────┘   │
│                                  │
│ [⚙ Running...] Run Simulation    │
└──────────────────────────────────┘
```

### ADVANCED MODE (Expanded)
```
┌──────────────────────────────────┐
│ CONFIGURATION                    │
│ ◉ · Ready to run                 │
│                                  │
│ FLOW PARAMETERS                  │ ← No change
│ Velocity: 10 m/s                 │
│ Angle of Attack: 5°              │
│ Submersion Depth: 0.50 m         │
│                                  │
│ MESH SETTINGS                    │ ← Expanded
│                                  │
│ Mesh Density: 1.0x               │
│                                  │
│ ⌄ Boundary Layers (Advanced)     │ ← New section
│   ☑ Enable boundary layers       │
│   y⁺ Target: [●========] 1.0     │
│     Wall resolution. 1 = sublayer│
│   Layers: [========●] 5          │
│     Number of prism layers       │
│                                  │
│ SOLVER                           │ ← New section
│ ◯ Steady-state (SIMPLE)          │
│ ◯ Transient (PIMPLE)             │
│ ◯ Free-surface (VOF)             │
│                                  │
│ PROPULSION (Advanced)            │ ← New section
│ Propulsion Model                 │
│ [Dropdown: None, Constant, ...]  │
│ Wind Speed: [●] 10 m/s           │
│ Wind Angle: [======●] 45°        │
│                                  │
│ ▲ Hide Advanced                  │
│                                  │
│ [Run Simulation]                 │
└──────────────────────────────────┘
```

---

## 3. COMPONENT STATE EXAMPLES

### Status Pills
```
IDLE                          PENDING
┌─────────────────────────┐   ┌─────────────────────────┐
│ ◯ Idle                  │   │ ⟳ Pending               │
│ Ready to run            │   │ Queued...               │
└─────────────────────────┘   └─────────────────────────┘

MESHING                       SOLVING
┌─────────────────────────┐   ┌─────────────────────────┐
│ ⟳ Meshing               │   │ ⟳ Solving               │
│ Building mesh...        │   │ Computing...            │
└─────────────────────────┘   └─────────────────────────┘
(animated pulse)               (animated pulse)

COMPLETED                     FAILED
┌─────────────────────────┐   ┌─────────────────────────┐
│ ◉ ✓ Completed           │   │ ◯ ✗ Failed              │
│ Ready to analyze        │   │ Review error log        │
└─────────────────────────┘   └─────────────────────────┘
```

### Slider + Input Compound
```
Velocity
┌─────────────────────────────────────┐
│ [========●========] 10.5 [input] m/s│
│  ↑ drag to adjust                    │
│  ↓ click number to edit directly    │
│                                     │
│ As slider moves, live preview in 3D │
└─────────────────────────────────────┘

Help Tooltip
┌─────────────────────────────────────┐
│ Velocity [?]                        │
│         ↓ hover                     │
│ ┌────────────────────────────────┐  │
│ │ Speed of water flow. Typical:  │  │
│ │ 5–15 m/s for small foils.      │  │
│ │ Higher = faster, but drag      │  │
│ │ increases quadratically.       │  │
│ └────────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Inline Validation
```
✅ Valid                       ⚠️  Warning
┌──────────────────────┐      ┌──────────────────────────┐
│ Velocity:            │      │ Velocity:                │
│ [========●] 10 m/s   │      │ [===========●] 50 m/s    │
│ ✓ In range           │      │ ⚠️  Unusually high       │
│                      │      │ 💡 Cavitation likely.    │
│                      │      │    Reduce to < 15 m/s    │
└──────────────────────┘      │    or enable cavitation  │
                              │    model.                │
                              └──────────────────────────┘

❌ Invalid
┌──────────────────────────────┐
│ Angle of Attack:             │
│ [═════════════●═════] 30°    │
│ ❌ Out of range (max 15°)    │
│ 💡 Recommend: ≤ 15°          │
│                              │
│ [Run Simulation] DISABLED    │
└──────────────────────────────┘
```

---

## 4. RUNS LIST EVOLUTION

### Current (List)
```
RUNS                      (71)
──────────────────────────────
#71 COMPLETED  22 Mar, 14:21
#70 COMPLETED  22 Mar, 14:10
#69 COMPLETED  20 Mar, 16:34
#68 COMPLETED  20 Mar, 16:12
#67 COMPLETED  20 Mar, 16:04
```

### New (Card Grid with Inline Metrics)
```
RUNS                                                    (71)
──────────────────────────────────────────────────────────

┌──────────────────────┐  ┌──────────────────────┐
│ #71 ✓ 2h ago        │  │ #70 ✓ 4h ago        │
│                      │  │                      │
│ L/D: 4.2            │  │ L/D: 3.8            │
│ V:   10 m/s         │  │ V:   12 m/s         │
│ Lift: 320 N         │  │ Lift: 310 N         │
│ Drag: 85 N  ✕       │  │ Drag: 95 N   ✕      │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│ #69 ✓ 6d ago        │  │ #68 ✗ 6d ago        │
│                      │  │                      │
│ L/D: 3.2            │  │ Failed               │
│ V:   8 m/s          │  │ Mesh error           │
│ Lift: 280 N         │  │                      │
│ Drag: 110 N  ✕      │  │ [Re-run] [Delete]    │
└──────────────────────┘  └──────────────────────┘
```

---

## 5. TOAST NOTIFICATIONS SYSTEM

### Success Toast
```
┌──────────────────────────────────────────┐
│ ✓ Simulation #a1f2d1 started. ETA: 3 min  │
└──────────────────────────────────────────┘
Position: bottom-right
Duration: 2 sec
Color: bg-accent-emerald/20, border-accent-emerald/50
```

### Error Toast
```
┌────────────────────────────────────────────────────┐
│ ✗ Mesh generation failed. Check STL geometry.      │
│                                                    │
│ Error: Degenerate face detected at vertex (1.2, ..│
└────────────────────────────────────────────────────┘
Position: bottom-right
Duration: 3 sec (auto-extend if user hovers)
Color: bg-accent-rose/20, border-accent-rose/50
```

### Info Toast
```
┌──────────────────────────────────────────┐
│ ⓘ Parameters copied to clipboard         │
└──────────────────────────────────────────┘
Position: bottom-right
Duration: 2 sec
Color: bg-accent-cyan/20, border-accent-cyan/50
```

---

## 6. LOG CONSOLE EVOLUTION

### Current (Raw, Verbose)
```
─────────────────────────────────────────────────
SOLVER OUTPUT
─────────────────────────────────────────────────
simpleFoam -overwrite
foam -case /case/ -parallel
SIMPLE: field smoothing iteration 1
smoothSolver: solving for Ux, iter 0, residual = 0.003
smoothSolver: solving for Uy, iter 0, residual = 0.001
smoothSolver: solving for p, iter 1, residual = 0.0005
...
(scrolls off screen, 100+ lines)
```

### New (Hierarchical, Progress-Driven)
```
┌─────────────────────────────────────────────────┐
│ SOLVER OUTPUT                              ⚙    │
├─────────────────────────────────────────────────┤
│ [MESHING]                                       │
│ [████████████████░░░░░░░░░░░░░░] 62%            │
│                                                 │
│ simpleFoam  (collapsed version)                │
└─────────────────────────────────────────────────┘

Click to expand:
┌─────────────────────────────────────────────────┐
│ SOLVER OUTPUT                              ▲    │
├─────────────────────────────────────────────────┤
│ [MESHING]                                       │
│ [████████████████░░░░░░░░░░░░░░] 62%            │
│ > Extracting features (10s)                    │
│ > Building mesh (45s)                          │
│ > Adding boundary layers (12s)                 │
│                                                 │
│ [SOLVING] (in progress)                         │
│ [████████░░░░░░░░░░░░░░░░░░░░░░░] 25%           │
│ > Initialized pressure solver                  │
│ > Iteration 1: U residual = 0.001              │
│ > Iteration 2: U residual = 0.0005             │
│                                                 │
│ [POST-PROCESSING] (waiting)                     │
│                                                 │
│ Estimated time remaining: 2 min 15 sec         │
└─────────────────────────────────────────────────┘
```

---

## 7. VIEWPORT OVERLAYS

### Metrics HUD (Top-Left)
```
┌─────────────────────────┐
│ FORCES                  │ ← Dim background
│ ─────────────────────── │
│                         │
│ Lift:  320 N  (cyan)    │
│ Drag:  85 N   (glow)    │
│ L/D:   3.8    (green)   │
│                         │
│ ─────────────────────── │
│ Pitch: 2.1 N·m          │
│                         │
└─────────────────────────┘
```

### Colorbar Legend (Bottom-Right)
```
                    ┌───────┐
                    │ PRESSURE (Cp)
                    │
                    │ ▓▓▓▓▓▓▓ 1.0 (high)
                    │ ███████ 0.5
                    │ ░░░░░░░ 0.0
                    │ ▒▒▒▒▒▒▒ -0.5
                    │ ███████ -1.0 (low)
                    │ ▓▓▓▓▓▓▓ -1.5
                    │
                    └───────┘
```

### Orientation Widget (Top-Right)
```
      ↑ Y
      │    (Red = X)
     ╱│   (Green = Y)
    ╱ │   (Blue = Z)
━━━╱  └───→ X
  Z ↙
```

---

## 8. ANIMATIONS & TRANSITIONS

### Panel Slide (Config ← → Analysis)
```
Config Panel                      Analysis Panel
[████████████] opacity 1          [░░░░░░░░░░░░] opacity 0
offset: 0                         offset: +50px (right)

[Time: 300ms, easing: easeInOut]

Result:
[░░░░░░░░░░░░] opacity 0          [████████████] opacity 1
offset: -50px (left)              offset: 0
```

### Status Indicator Animation
```
IDLE (static)              RUNNING (pulse)
◯ · Idle                   ⟳ · Running
text-slate-500             text-accent-glow
(no animation)             animate-pulse (opacity 0.7–1.0, 2s)
```

### Foil Load-In (after simulation completes)
```
[Mesh loading...]
↓
[Mesh fades in, pressure colormap applies]
┌─ Parallax pan to best viewing angle (3 sec)
│
└─ Pressure legend grows from 0% to 100% (0.5 sec)
```

---

## 9. MOBILE RESPONSIVENESS

### Tablet (768px width)
```
┌────────┬─────────────────────────────────────┐
│ ASSETS │                                     │
│        │      VTK VIEWPORT (70%)             │
│ RUNS   │                                     │
│        ├─────────────────────────────────────┤
│        │ CONFIG PANEL (collapsed, 30%)       │
│        │ Quick Controls [scroll v]           │
└────────┴─────────────────────────────────────┘
```

### Mobile (375px width)
```
┌─────────────────────────┐
│ ≡ MENU                  │ ← Hamburger
├─────────────────────────┤
│  VTK VIEWPORT (full)    │
│  [Pressure foil]        │
│  [Metrics HUD]          │
│                         │
├─────────────────────────┤
│ < CONFIGURATION         │ ← Bottom sheet
│                         │
│ Velocity: 10 m/s        │
│ Angle: 5°               │
│ Mesh: 1.0x              │
│                         │
│ [Run Simulation]        │
└─────────────────────────┘

Tap viewport → fullscreen mode
Swipe up → expand config sheet
Swipe down → collapse config sheet
```

---

## 10. COLOR APPLICATIONS

### Status & Feedback
```
✓ Success / Completed
  text-accent-emerald (#10b981)
  bg-accent-emerald/20
  Used: COMPLETED status, successful actions

◉ Active / Running / Pending
  text-accent-glow (#0ea5e9 + glow effect)
  bg-accent-glow/20
  Used: RUNNING, MESHING, PENDING status

⚠️ Warning
  text-accent-cyan (#06b6d4)
  bg-accent-cyan/20
  Used: Unusual parameters, hints

✗ Error / Failed
  text-accent-rose (#f43f5e)
  bg-accent-rose/20
  Used: FAILED status, validation errors
```

### Hierarchy
```
Primary Interactive (CTA)
  bg-blue-600 (0.5–50% opacity, hover: lighter)
  Used: [Run Simulation], [Copy]

Secondary Interactive (Small buttons)
  bg-accent/10 border-accent/25
  Used: [Show Advanced], [Delete]

Tertiary Interactive (Toggle)
  bg-transparent border-hud-border
  Used: [Asset name], [Run #71]

Background Layers (Depth)
  bg-[#0d1518]    (page)
  bg-black/20     (section)
  bg-accent/5     (hover/info)
  bg-accent/10    (selected)
```

---

## 11. INTERACTION FLOWS

### First Run (New User)
```
1. Land on app
   └─ Sidebar: Asset list visible
   └─ Viewport: Empty, "Select an asset"
   └─ Config: Disabled

2. Click asset (e.g., "Easy_Rider")
   └─ Viewport: Loads STL, default orientation
   └─ Config: Enables, quick controls visible
   └─ Toast: "✓ Asset loaded"

3. See prediction card
   └─ "Based on 2,847 similar runs"
   └─ Estimated: Lift 320N, Drag 85N, ETA 3m
   └─ User feels confident

4. Click [Run Simulation]
   └─ Toast: "✓ Simulation started (#a1f2d1)"
   └─ Log console expands with progress
   └─ Viewport shows "Meshing..." indicator

5. Simulation completes
   └─ Toast: "✓ Results ready"
   └─ Pressure field auto-enables
   └─ Metrics HUD appears
   └─ Camera resets to best view angle
   └─ Colorbar legend prominent

6. User explores pressure field
   └─ Toggles [Show Pressure Map] in config
   └─ Adjusts colormap (Turbo, Viridis, etc.)
   └─ Scrolls analysis panel for forces, L/D
```

### Advanced User (Parameter Sweep)
```
1. Click existing run
   └─ Config loads its parameters

2. Click [Show Advanced]
   └─ Propulsion, Solver, Cavitation sections expand

3. Configure parameter sweep
   └─ Mesh Density: 0.5, 1.0, 1.5, 2.0
   └─ Velocity: 8, 10, 12, 15 m/s
   └─ Total: 16 simulations

4. Click [Run Sweep]
   └─ Toast: "✓ 16 jobs queued"
   └─ Runs list shows children with spinner

5. Results aggregate
   └─ Table: Mesh vs Velocity vs L/D ratio
   └─ Heatmap: Visual sweep results
   └─ User exports CSV for plotting
```

---

## 12. DARK MODE & CONTRAST REFERENCE

### Text Color Scale
```
text-slate-100  (brightest, headers, active)           WCAG AAA
text-slate-200  (primary body text)                     WCAG AAA
text-slate-300  (secondary text, labels)                WCAG AAA
text-slate-400  (tertiary, metadata, disabled)          WCAG AA
text-slate-500  (very muted, hints)                     ✗ WCAG (4.26:1)
text-slate-600  (disabled, very subtle)                 ✗ WCAG
```

### Accent Combinations
```
text-accent-cyan on bg-[#0d1518]
  Contrast: 6.5:1  ✓ WCAG AAA

text-accent-glow on bg-[#0d1518]
  Contrast: 5.2:1  ✓ WCAG AA

bg-accent-emerald/20 on bg-[#0d1518]
  Border: border-accent-emerald/50 on bg-[#0d1518]
  Contrast: 4.8:1  ✓ WCAG AA
```

### Always Verify
```bash
# Use tools to verify your actual implemented colors
# https://www.tpgi.com/color-contrast-checker/

# In Figma: View > Enable Accessibility Settings
# Toggle: Show Contrast Issues
```

---

## APPENDIX: COMPONENT LIBRARY INVENTORY

| Component          | State Count | Key Props                      | Tier |
| ------------------ | ----------- | ------------------------------ | ---- |
| ConfigSection      | 2 (open/closed) | title, isAdvanced, defaultOpen | 1    |
| FieldWithHint      | 2 (hover)   | label, hint, children          | 1    |
| SliderWithInput    | 3 (drag/input/focus) | value, min, max, unit, onChange | 1    |
| StatusPill         | 6 (statuses) | status                         | 1    |
| RunsCardGrid       | N (list)    | runs, onSelect, onDelete       | 1    |
| MetricsHUD         | 2 (visible/hidden) | activeRun                   | 2    |
| ColorbarLegend     | 2 (colormap) | colormap, range                | 2    |
| LogConsoleCompact  | 2 (expand/collapsed) | entries, isRunning        | 2    |
| ToastContainer     | N (stack)   | toasts (from hook)             | 2    |
| PredictionCard     | 2 (loaded/loading) | run, prediction                | 3    |
| ValidationTooltip  | 1           | error, message                 | 1    |
| ConfigPanel (NEW)  | 1           | (uses sub-components)          | Full |

---

**End of Visual Reference Guide**