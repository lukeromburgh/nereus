# NEREUS REDESIGN: IMPLEMENTATION PLAYBOOK
## Code-Ready Recipes for Each Tier

---

## TABLE OF CONTENTS

1. Layout Restructuring
2. Component Library
3. Store Updates
4. API Integration
5. Testing Checklist

---

## 1. LAYOUT RESTRUCTURING

### Current Layout (3-column)
```tsx
// App.tsx (before)
export const App = () => {
  return (
    <div className="flex h-screen bg-[#0d1518]">
      {/* Left: Sidebar 20% */}
      <Sidebar />
      
      {/* Middle: Viewport + Log 60% */}
      <VtkViewport />
      <LogConsole />
      
      {/* Right: Config 20% */}
      <ConfigPanel />
    </div>
  );
};
```

### New Layout (4-column with smart wrapping)
```tsx
// App.tsx (after)
export const App = () => {
  return (
    <div className="flex h-screen bg-[#0d1518]">
      {/* Left Sidebar: 10% - Compact Assets + Runs */}
      <div className="w-1/10 border-r border-hud-border overflow-hidden flex flex-col">
        <SidebarCompact />
      </div>
      
      {/* Center: Viewport + Metrics - 50% */}
      <div className="flex-1 flex flex-col bg-black/20">
        <div className="flex-1 relative">
          <VtkViewport />
          {/* Overlay metrics directly in viewport corner */}
          <MetricsHUD />
          <ColorbarLegend />
        </div>
        {/* Log console at bottom, collapsed by default */}
        <LogConsoleCompact />
      </div>
      
      {/* Right Config: 40% - Tiered controls */}
      <div className="w-2/5 border-l border-hud-border overflow-y-auto scrollbar-dark flex flex-col">
        <ConfigPanelRefactored />
      </div>
    </div>
  );
};
```

### CSS Grid Width Utility
```css
/* In your Tailwind config or global CSS */
@layer utilities {
  .w-1\/10 {
    width: 10%;
  }
  .w-2\/5 {
    width: 40%;
  }
}
```

---

## 2. COMPONENT LIBRARY

### 2.1 ConfigPanel Refactored
```tsx
// frontend/src/components/ConfigPanel/ConfigPanelRefactored.tsx

import React, { useState } from 'react';
import { useSimStore } from '@/store/useSimStore';
import { ConfigSection } from '../ConfigSection';
import { FieldWithHint } from '../FieldWithHint';
import { SliderWithInput } from '../SliderWithInput';
import { StatusPill } from '../StatusPill';
import { Play, Settings } from 'lucide-react';

export const ConfigPanelRefactored: React.FC = () => {
  const {
    activeRun,
    showAdvanced,
    setShowAdvanced,
    updateRunField,
    validateField,
  } = useSimStore();

  const [isRunning, setIsRunning] = useState(false);

  if (!activeRun) {
    return (
      <div className="p-4 text-center text-slate-400">
        <div className="text-2xs">No simulation selected</div>
      </div>
    );
  }

  const handleRunSimulation = async () => {
    setIsRunning(true);
    // API call to backend
    try {
      // const result = await api.runs.create(activeRun);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with status */}
      <div className="p-4 border-b border-hud-border">
        <div className="hud-label text-accent-cyan flex items-center gap-2 mb-3">
          CONFIGURATION
        </div>
        <StatusPill status={activeRun.status || 'IDLE'} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-dark p-4 space-y-4">
        {/* TIER 1: Quick Controls */}
        <ConfigSection title="FLOW PARAMETERS" defaultOpen={true}>
          <FieldWithHint
            label="Velocity"
            hint="Speed of water flow. Typical range: 5–15 m/s for small foils. Higher speeds increase drag quadratically."
          >
            <SliderWithInput
              value={activeRun.velocity}
              min={0.5}
              max={30}
              step={0.1}
              unit="m/s"
              onChange={(v) => updateRunField('velocity', v)}
              onLivePreview={(v) => {
                // Trigger live preview in VTK viewport
                useSimStore.setState({ previewMode: true, previewVelocity: v });
              }}
            />
          </FieldWithHint>

          <FieldWithHint
            label="Angle of Attack"
            hint="Pitch angle of foil relative to water flow. Range: -15° to +15°. Too high = stall and cavitation."
          >
            <SliderWithInput
              value={activeRun.angle_of_attack}
              min={-15}
              max={15}
              step={0.5}
              unit="°"
              onChange={(v) => updateRunField('angle_of_attack', v)}
            />
          </FieldWithHint>

          <FieldWithHint
            label="Submersion Depth"
            hint="How deep the foil center sits below water surface. Higher = more buoyancy assistance, but drag increases."
          >
            <SliderWithInput
              value={activeRun.submersion_depth}
              min={0.05}
              max={2.0}
              step={0.05}
              unit="m"
              onChange={(v) => updateRunField('submersion_depth', v)}
              onLivePreview={(v) => {
                useSimStore.setState({ previewMode: true, previewSubmersion: v });
              }}
            />
          </FieldWithHint>
        </ConfigSection>

        {/* TIER 2: Mesh & Advanced (collapsed by default) */}
        <ConfigSection
          title="MESH SETTINGS"
          isAdvanced={false}
          defaultOpen={true}
        >
          <FieldWithHint
            label="Mesh Density"
            hint="1.0x = baseline. Higher = finer mesh, more accurate, slower. Recommend 0.8x–1.5x."
          >
            <SliderWithInput
              value={activeRun.mesh_density}
              min={0.3}
              max={3.0}
              step={0.1}
              unit="x"
              onChange={(v) => updateRunField('mesh_density', v)}
            />
          </FieldWithHint>

          {/* Boundary layer section (gated by advanced toggle) */}
          <details className="group">
            <summary className="cursor-pointer text-2xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
              ▶ Boundary Layers (Advanced)
            </summary>
            <div className="mt-2 space-y-2 ml-2 border-l border-hud-border pl-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableLayers"
                  checked={activeRun.enable_layers}
                  onChange={(e) => updateRunField('enable_layers', e.target.checked)}
                  className="w-3 h-3 rounded bg-accent/20 border border-accent/50 cursor-pointer"
                />
                <label
                  htmlFor="enableLayers"
                  className="text-xs text-slate-400 cursor-pointer"
                >
                  Enable boundary layers
                </label>
              </div>

              {activeRun.enable_layers && (
                <>
                  <FieldWithHint
                    label="y⁺ Target"
                    hint="Wall resolution: 1 = resolve sublayer (expensive), 30 = use wall functions (faster)."
                  >
                    <SliderWithInput
                      value={activeRun.y_plus_target}
                      min={0.5}
                      max={30}
                      step={0.5}
                      onChange={(v) => updateRunField('y_plus_target', v)}
                    />
                  </FieldWithHint>

                  <FieldWithHint
                    label="Number of Layers"
                    hint="How many prism layers to add. Higher = smoother transition. 5–10 typical."
                  >
                    <SliderWithInput
                      value={activeRun.n_surface_layers}
                      min={3}
                      max={15}
                      step={1}
                      onChange={(v) => updateRunField('n_surface_layers', v)}
                    />
                  </FieldWithHint>
                </>
              )}
            </div>
          </details>
        </ConfigSection>

        {/* TIER 3: Solver options */}
        <ConfigSection title="SOLVER" isAdvanced={true} defaultOpen={false}>
          <div className="text-2xs text-slate-400 space-y-2">
            <label className="block">
              <input
                type="radio"
                name="solver"
                value="simpleFoam"
                checked={activeRun.solver_type === 'simpleFoam'}
                onChange={(e) => updateRunField('solver_type', e.target.value)}
                className="mr-2"
              />
              <span>Steady-state (SIMPLE) — Faster, equilibrium</span>
            </label>
            <label className="block">
              <input
                type="radio"
                name="solver"
                value="pimpleFoam"
                checked={activeRun.solver_type === 'pimpleFoam'}
                onChange={(e) => updateRunField('solver_type', e.target.value)}
                className="mr-2"
              />
              <span>Transient (PIMPLE) — Slower, dynamics</span>
            </label>
            <label className="block">
              <input
                type="radio"
                name="solver"
                value="interFoam"
                checked={activeRun.solver_type === 'interFoam'}
                onChange={(e) => updateRunField('solver_type', e.target.value)}
                className="mr-2"
              />
              <span>Free-surface (VOF) — Slowest, realistic waves</span>
            </label>
          </div>
        </ConfigSection>

        {/* TIER 4: Propulsion (gated) */}
        <ConfigSection title="PROPULSION" isAdvanced={true} defaultOpen={false}>
          {/* Model selection */}
          <div className="space-y-2">
            <label className="text-2xs text-slate-400">
              <select
                value={activeRun.propulsion_model}
                onChange={(e) => updateRunField('propulsion_model', e.target.value)}
                className="mt-1 w-full bg-accent/10 border border-accent/25 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value="none">No propulsion</option>
                <option value="constant">Constant thrust</option>
                <option value="sail">Sail model</option>
                <option value="kite">Kite model</option>
              </select>
            </label>

            {activeRun.propulsion_model === 'constant' && (
              <FieldWithHint
                label="Thrust Force"
                hint="Constant horizontal force. Typical: 100–500 N."
              >
                <SliderWithInput
                  value={activeRun.thrust_force}
                  min={0}
                  max={1000}
                  step={10}
                  unit="N"
                  onChange={(v) => updateRunField('thrust_force', v)}
                />
              </FieldWithHint>
            )}

            {['sail', 'kite'].includes(activeRun.propulsion_model) && (
              <>
                <FieldWithHint
                  label="Wind Speed"
                  hint="Apparent wind speed. Typical: 5–15 m/s."
                >
                  <SliderWithInput
                    value={activeRun.wind_speed}
                    min={1}
                    max={30}
                    step={0.5}
                    unit="m/s"
                    onChange={(v) => updateRunField('wind_speed', v)}
                  />
                </FieldWithHint>
                <FieldWithHint
                  label="Wind Angle"
                  hint="Relative to foil axis. 0° = head-on, 90° = beam reach."
                >
                  <SliderWithInput
                    value={activeRun.wind_angle}
                    min={-180}
                    max={180}
                    step={5}
                    unit="°"
                    onChange={(v) => updateRunField('wind_angle', v)}
                  />
                </FieldWithHint>
              </>
            )}
          </div>
        </ConfigSection>

        {/* Show advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-2xs text-accent-cyan hover:text-accent-glow transition-colors flex items-center gap-1 mt-4"
        >
          <Settings className="h-3 w-3" />
          {showAdvanced ? '▼ Hide Advanced' : '▶ More Options'}
        </button>
      </div>

      {/* Footer: Run button + prediction card */}
      <div className="p-4 border-t border-hud-border space-y-3">
        {/* Prediction (optional) */}
        {/* <PredictionCard run={activeRun} /> */}

        <button
          onClick={handleRunSimulation}
          disabled={isRunning}
          className="w-full px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-medium text-xs transition-colors duration-200 flex items-center justify-center gap-2"
        >
          <Play className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Running...' : 'Run Simulation'}
        </button>

        <div className="text-2xs text-slate-500 text-center">
          {/* Show estimated time here */}
          Est. time: 3 min
        </div>
      </div>
    </div>
  );
};
```

---

### 2.2 Runs List Refactored (Card Grid)
```tsx
// frontend/src/components/Sidebar/RunsCardGrid.tsx

import React from 'react';
import { SimulationRun } from '@/types';
import { useSimStore } from '@/store/useSimStore';
import { StatusPill } from '../StatusPill';
import { Trash2 } from 'lucide-react';

interface RunsCardGridProps {
  runs: SimulationRun[];
}

export const RunsCardGrid: React.FC<RunsCardGridProps> = ({ runs }) => {
  const { activeRunId, setActiveRunId } = useSimStore();

  return (
    <div className="p-2 space-y-2 overflow-y-auto scrollbar-dark">
      <div className="hud-label text-accent-cyan mb-2">RUNS ({runs.length})</div>

      {runs.length === 0 ? (
        <div className="text-2xs text-slate-500 text-center py-4">
          No simulations yet. Create one above.
        </div>
      ) : (
        <div className="space-y-1.5">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setActiveRunId(run.id)}
              className={`w-full rounded-md border transition-all duration-200 text-left p-2 group ${
                activeRunId === run.id
                  ? 'bg-accent/10 border-accent/25 border-l-2 border-l-accent-cyan'
                  : 'border-transparent hover:bg-white/[0.03] hover:border-hud-border'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  {/* Run ID + Status */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-accent-cyan font-medium">
                      #{run.id.slice(0, 3)}
                    </span>
                    <span className="text-2xs text-slate-500">
                      {formatDistance(new Date(run.created_at), new Date())} ago
                    </span>
                  </div>

                  {/* Key metrics inline */}
                  <div className="grid grid-cols-2 gap-1 text-2xs text-slate-400 mb-2">
                    <div>
                      <span className="text-slate-600">L/D:</span>{' '}
                      <span className="text-slate-200 font-mono">
                        {run.l_d_ratio?.toFixed(1) || '–'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600">V:</span>{' '}
                      <span className="text-slate-200 font-mono">
                        {run.velocity?.toFixed(1) || '–'} m/s
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600">Lift:</span>{' '}
                      <span className="text-slate-200 font-mono">
                        {run.lift_force?.toFixed(0) || '–'} N
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600">Drag:</span>{' '}
                      <span className="text-slate-200 font-mono">
                        {run.drag_force?.toFixed(0) || '–'} N
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <StatusPill status={run.status} />
                </div>

                {/* Delete button (hover) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // handleDelete(run.id)
                  }}
                  className="ml-2 text-slate-600 hover:text-accent-rose opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper
const formatDistance = (date: Date, baseDate: Date) => {
  const seconds = Math.floor((baseDate.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};
```

---

### 2.3 MetricsHUD (Overlay in Viewport)
```tsx
// frontend/src/components/VTK/MetricsHUD.tsx

import React from 'react';
import { useSimStore } from '@/store/useSimStore';

export const MetricsHUD: React.FC = () => {
  const { activeRun } = useSimStore();

  if (!activeRun || !activeRun.lift_force) {
    return null; // Don't show until simulation complete
  }

  return (
    <div className="absolute top-4 left-4 p-3 rounded-md bg-black/40 backdrop-blur-sm border border-accent/20 pointer-events-none z-10">
      <div className="space-y-1.5">
        <div className="text-2xs text-slate-500 font-medium">FORCES</div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-2xs text-slate-600">Lift</div>
            <div className="text-sm font-mono text-accent-cyan">
              {activeRun.lift_force?.toFixed(0) || '—'} N
            </div>
          </div>
          <div>
            <div className="text-2xs text-slate-600">Drag</div>
            <div className="text-sm font-mono text-accent-glow">
              {activeRun.drag_force?.toFixed(0) || '—'} N
            </div>
          </div>
          <div>
            <div className="text-2xs text-slate-600">L/D</div>
            <div className="text-sm font-mono text-accent-emerald">
              {activeRun.l_d_ratio?.toFixed(2) || '—'}
            </div>
          </div>
        </div>

        <div className="h-px bg-hud-border my-1.5" />

        <div className="text-2xs text-slate-500">Moment: {activeRun.pitch_moment?.toFixed(1) || '—'} N·m</div>
      </div>
    </div>
  );
};
```

---

### 2.4 LogConsoleCompact (Bottom, Collapsed)
```tsx
// frontend/src/components/LogConsole/LogConsoleCompact.tsx

import React, { useState } from 'react';
import { ChevronUp } from 'lucide-react';

interface LogEntry {
  phase: string; // 'MESHING', 'SOLVING', 'POST'
  progress: number; // 0–1
  message: string;
}

interface LogConsoleCompactProps {
  entries: LogEntry[];
  isRunning: boolean;
}

export const LogConsoleCompact: React.FC<LogConsoleCompactProps> = ({
  entries,
  isRunning,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const currentPhase = entries[entries.length - 1];

  return (
    <div className="border-t border-hud-border bg-black/20 transition-all duration-300">
      {/* Collapsed header (always visible) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="text-2xs text-slate-500 font-medium">SOLVER OUTPUT</div>
          {isRunning && (
            <div className="h-2 w-2 bg-accent-glow rounded-full animate-pulse" />
          )}
        </div>
        <ChevronUp
          className={`h-4 w-4 text-slate-600 transition-transform ${
            isExpanded ? '' : 'rotate-180'
          }`}
        />
      </button>

      {/* Progress bar (always visible) */}
      {isRunning && currentPhase && (
        <div className="px-4 py-1 space-y-1">
          <div className="text-2xs text-slate-500">{currentPhase.phase}</div>
          <div className="w-full h-1 bg-accent/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-cyan to-accent-glow transition-all duration-300"
              style={{ width: `${currentPhase.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded log view */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-hud-border max-h-64 overflow-y-auto scrollbar-dark bg-black/50">
          <div className="space-y-1 text-2xs font-mono text-slate-400">
            {entries.map((entry, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-slate-600 min-w-fit">[{entry.phase}]</span>
                <span className="flex-1">{entry.message}</span>
                {entry.progress > 0 && entry.progress < 1 && (
                  <span className="text-slate-600 text-right min-w-fit">
                    {Math.round(entry.progress * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

---

## 3. STORE UPDATES

### Zustand Store Additions
```tsx
// frontend/src/store/useSimStore.ts (additions)

interface SimStore {
  // ... existing fields
  
  // UI State
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  
  previewMode: boolean;
  previewVelocity?: number;
  previewSubmersion?: number;
  setPreviewMode: (mode: boolean) => void;
  
  // Field validation
  validateField: (field: string, value: any) => { valid: boolean; error?: string };
  
  // Batch updates
  updateRunField: (field: string, value: any) => void;
}

const validationRules: Record<string, (v: any) => { valid: boolean; error?: string }> = {
  velocity: (v) => {
    if (v < 0.5) return { valid: false, error: 'Minimum 0.5 m/s' };
    if (v > 50) return { valid: true, error: 'Warning: Cavitation likely above 15 m/s' };
    return { valid: true };
  },
  angle_of_attack: (v) => {
    if (v < -15 || v > 15) return { valid: false, error: 'Range: -15° to +15°' };
    return { valid: true };
  },
  mesh_density: (v) => {
    if (v < 0.3 || v > 3) return { valid: false, error: 'Range: 0.3x to 3x' };
    if (v < 0.6) return { valid: true, error: 'Coarse mesh; results may be inaccurate' };
    return { valid: true };
  },
};

export const useSimStore = create<SimStore>((set) => ({
  // ... existing
  
  showAdvanced: false,
  setShowAdvanced: (show) => set({ showAdvanced: show }),
  
  previewMode: false,
  setPreviewMode: (mode) => set({ previewMode: mode }),
  
  validateField: (field, value) => {
    const rule = validationRules[field];
    if (!rule) return { valid: true };
    return rule(value);
  },
  
  updateRunField: (field, value) => {
    set((state) => ({
      activeRun: {
        ...state.activeRun,
        [field]: value,
      },
    }));
  },
}));
```

---

## 4. API INTEGRATION

### Toast System Setup
```tsx
// frontend/src/lib/toast.ts

import React from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

let toastStack: Toast[] = [];
let toastCallback: ((toasts: Toast[]) => void) | null = null;

export const toast = {
  success: (message: string, duration = 2000) => {
    addToast('success', message, duration);
  },
  error: (message: string, duration = 3000) => {
    addToast('error', message, duration);
  },
  info: (message: string, duration = 2000) => {
    addToast('info', message, duration);
  },
};

function addToast(type: ToastType, message: string, duration: number) {
  const id = Math.random().toString();
  const newToast = { id, type, message, duration };
  toastStack = [newToast, ...toastStack];
  toastCallback?.(toastStack);

  setTimeout(() => {
    toastStack = toastStack.filter((t) => t.id !== id);
    toastCallback?.(toastStack);
  }, duration);
}

export const useToasts = () => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    toastCallback = setToasts;
    return () => {
      toastCallback = null;
    };
  }, []);

  return toasts;
};
```

### Toast Container Component
```tsx
// frontend/src/components/ToastContainer.tsx

import React from 'react';
import { useToasts } from '@/lib/toast';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const toasts = useToasts();

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-md px-4 py-2.5 text-sm font-medium flex items-center gap-2 animate-slide-up pointer-events-auto ${
            toast.type === 'success'
              ? 'bg-accent-emerald/20 border border-accent-emerald/50 text-accent-emerald'
              : toast.type === 'error'
              ? 'bg-accent-rose/20 border border-accent-rose/50 text-accent-rose'
              : 'bg-accent-cyan/20 border border-accent-cyan/50 text-accent-cyan'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
          {toast.type === 'error' && <AlertCircle className="h-4 w-4" />}
          {toast.type === 'info' && <Info className="h-4 w-4" />}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
};
```

### API Hooks with Toast Integration
```tsx
// frontend/src/hooks/useRunSimulation.ts

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { api } from '@/lib/api';

export const useRunSimulation = () => {
  const [isLoading, setIsLoading] = useState(false);

  const run = async (runData: any) => {
    setIsLoading(true);
    try {
      const result = await api.post('/api/runs/', runData);
      toast.success(`✓ Simulation started (ID: ${result.id.slice(0, 6)})`);
      return result;
    } catch (error) {
      const message = error?.message || 'Failed to start simulation';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { run, isLoading };
};
```

---

## 5. TESTING CHECKLIST

### Unit Tests
```tsx
// frontend/src/components/__tests__/ConfigSection.test.tsx

import { render, screen } from '@testing-library/react';
import { ConfigSection } from '../ConfigSection';

describe('ConfigSection', () => {
  test('renders title', () => {
    render(<ConfigSection title="Test Section">Content</ConfigSection>);
    expect(screen.getByText('Test Section')).toBeInTheDocument();
  });

  test('toggles content visibility', async () => {
    const { user } = render(
      <ConfigSection title="Test">Hidden content</ConfigSection>
    );
    expect(screen.getByText('Hidden content')).toBeVisible();
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Hidden content')).not.toBeVisible();
  });

  test('shows advanced badge when isAdvanced=true', () => {
    render(
      <ConfigSection title="Test" isAdvanced>
        Content
      </ConfigSection>
    );
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });
});
```

### Integration Tests
```tsx
// frontend/src/components/__tests__/ConfigPanel.integration.test.tsx

import { render, screen, waitFor } from '@testing-library/react';
import { ConfigPanelRefactored } from '../ConfigPanel/ConfigPanelRefactored';
import { useSimStore } from '@/store/useSimStore';

describe('ConfigPanel Integration', () => {
  test('user can modify velocity and see preview', async () => {
    const { user } = render(<ConfigPanelRefactored />);

    // Simulate slider input
    const velocityInput = screen.getByDisplayValue('10');
    await user.clear(velocityInput);
    await user.type(velocityInput, '15');

    await waitFor(() => {
      const store = useSimStore.getState();
      expect(store.previewMode).toBe(true);
      expect(store.activeRun?.velocity).toBe(15);
    });
  });

  test('run simulation button is disabled with invalid params', () => {
    useSimStore.setState({
      activeRun: { velocity: 100 }, // Invalid
    });

    render(<ConfigPanelRefactored />);
    const runButton = screen.getByRole('button', { name: /run simulation/i });
    expect(runButton).toBeDisabled();
  });
});
```

### Accessibility Tests
```bash
# Run axe accessibility checks
npm run test:a11y

# Expected: WCAG 2.1 AA compliance
# - Color contrast ≥ 4.5:1 for text
# - All buttons have aria-label or text
# - Keyboard navigation works (Tab, Enter, Escape)
# - Screen reader announces status changes
```

### Visual Regression Tests
```bash
# Run Cypress visual tests
npx cypress run --spec "cypress/e2e/**/*.cy.ts"

# Checks:
# - Layout matches baseline snapshots
# - Animations execute smoothly
# - Dark theme consistency
```

---

## MIGRATION TIMELINE

### Week 1: Foundation
- Day 1–2: Implement ConfigSection, FieldWithHint, StatusPill, SliderWithInput
- Day 2–3: Integrate into ConfigPanel (keep old version alongside)
- Day 3–4: Create toast system, add to API calls
- Day 5: Deploy, gather feedback

### Week 2: Layout & Metrics
- Day 1–2: Update App.tsx layout (4-column)
- Day 2–3: Refactor Runs card grid
- Day 3–4: Move MetricsHUD into VTK viewport
- Day 5: Deploy, A/B test

### Week 3: Advanced Features
- Day 1–2: Add validation + inline warnings
- Day 2–3: Build prediction model + UI
- Day 3–4: Gallery fixture + component
- Day 5: Deploy premium features

---

## ROLLBACK STRATEGY

Each sprint has a feature flag:

```ts
// Feature flags in useSimStore
const featureFlags = {
  newConfigPanel: true,  // Can flip to false instantly
  newRunsList: true,
  metricsOverlay: true,
  validationUI: true,
};
```

If issues arise, disable the flag and revert to previous UI without code rollback.

---

## MONITORING & ANALYTICS

After deployment, track:

```ts
// frontend/src/lib/analytics.ts

export const analytics = {
  configFieldClicked: (field: string) => { /* ... */ },
  advancedToggled: (show: boolean) => { /* ... */ },
  runSimulationClicked: (runId: string) => { /* ... */ },
  toastDisplayed: (type: string, message: string) => { /* ... */ },
};
```

Dashboard metrics:
- % of users who toggle Advanced
- Time to first Run button click
- Error rate by validation rule
- Conversion: Config → Run → Results

---

**Next**: Start with ConfigSection + StatusPill. Ship in 2 days. Measure impact. 🚀