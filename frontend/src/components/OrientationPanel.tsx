import { useCallback, useState } from "react";
import axios from "axios";
import {
  RotateCcw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useSimStore } from "../store/useSimStore";

function OrientationSlider({
  label,
  value,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (val: number) => void;
  onCommit: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-slate-400 font-sans">
          {label}
        </label>
        <span className="text-xs font-semibold text-accent-glow font-mono tabular-nums">
          {value}°
        </span>
      </div>
      <input
        type="range"
        min={-180}
        max={180}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        disabled={disabled}
        className="slider-aerospace"
      />
    </div>
  );
}

export function OrientationPanel() {
  const {
    pitch,
    roll,
    yaw,
    setPitch,
    setRoll,
    setYaw,
    activeSimId,
    status,
    geometryDimensions,
  } = useSimStore();

  const [collapsed, setCollapsed] = useState(true);

  const isRunning =
    status === "PENDING" || status === "MESHING" || status === "RUNNING";

  /** Persist current orientation to the backend (single fire, not debounced). */
  const patchOrientation = useCallback(
    async (p: number, r: number, y: number) => {
      if (!activeSimId) return;
      try {
        await axios.patch(`http://localhost:8000/api/runs/${activeSimId}/`, {
          pitch: p,
          roll: r,
          yaw: y,
        });
      } catch (err) {
        console.error("Orientation PATCH failed", err);
      }
    },
    [activeSimId],
  );

  /** Called once when the user releases a slider (onPointerUp). */
  const commitSlider = useCallback(() => {
    patchOrientation(
      useSimStore.getState().pitch,
      useSimStore.getState().roll,
      useSimStore.getState().yaw,
    );
  }, [patchOrientation]);

  /** Quick-set buttons: update store + fire immediate PATCH. */
  const handleQuickSet = (p: number, r: number, y: number) => {
    setPitch(p);
    setRoll(r);
    setYaw(y);
    patchOrientation(p, r, y);
  };

  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      {/* Header — toggle collapse */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        )}
        <RotateCcw className="h-3.5 w-3.5 text-accent-cyan" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
          Orientation Correction
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 flex flex-col gap-3">
          {/* Sliders */}
          <OrientationSlider
            label="Pitch (Rotate X)"
            value={pitch}
            disabled={isRunning}
            onChange={setPitch}
            onCommit={commitSlider}
          />
          <OrientationSlider
            label="Roll (Rotate Y)"
            value={roll}
            disabled={isRunning}
            onChange={setRoll}
            onCommit={commitSlider}
          />
          <OrientationSlider
            label="Yaw (Rotate Z)"
            value={yaw}
            disabled={isRunning}
            onChange={setYaw}
            onCommit={commitSlider}
          />

          {/* Quick-set buttons */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => handleQuickSet(0, 0, 180)}
              className="rounded px-2 py-1 text-2xs font-medium border border-hud-border bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:border-accent/40 transition-colors disabled:opacity-40"
            >
              Flip 180° (tail-first)
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => handleQuickSet(0, 90, 0)}
              className="rounded px-2 py-1 text-2xs font-medium border border-hud-border bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:border-accent/40 transition-colors disabled:opacity-40"
            >
              Rotate 90° (sideways)
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => handleQuickSet(0, -90, 0)}
              className="rounded px-2 py-1 text-2xs font-medium border border-hud-border bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:border-accent/40 transition-colors disabled:opacity-40"
            >
              Rotate −90° (sideways)
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => handleQuickSet(0, 0, 0)}
              className="rounded px-2 py-1 text-2xs font-medium border border-hud-border bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:border-accent/40 transition-colors disabled:opacity-40"
            >
              Reset
            </button>
          </div>

          {/* Geometry dimensions readout */}
          {geometryDimensions && (
            <div className="rounded border border-hud-border bg-white/[0.02] px-2 py-1.5">
              <div className="text-2xs text-slate-500 mb-1 font-medium uppercase tracking-wider">
                Detected Dimensions
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-2xs text-slate-500">Chord</div>
                  <div className="text-xs font-mono text-slate-200">
                    {geometryDimensions.chord_m != null
                      ? `${geometryDimensions.chord_m.toFixed(4)} m`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-slate-500">Span</div>
                  <div className="text-xs font-mono text-slate-200">
                    {geometryDimensions.span_m != null
                      ? `${geometryDimensions.span_m.toFixed(4)} m`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-slate-500">Thickness</div>
                  <div className="text-xs font-mono text-slate-200">
                    {geometryDimensions.thickness_m != null
                      ? `${geometryDimensions.thickness_m.toFixed(4)} m`
                      : "—"}
                  </div>
                </div>
              </div>

              {/* Sanity warning: chord should be > span > thickness */}
              {geometryDimensions.chord_m != null &&
                geometryDimensions.span_m != null &&
                geometryDimensions.chord_m < geometryDimensions.span_m && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-2xs text-red-400">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    <span>
                      Chord &lt; Span — the foil may still be sideways. Adjust
                      orientation above.
                    </span>
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
