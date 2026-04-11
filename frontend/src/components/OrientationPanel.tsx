import { useCallback, useState } from "react";
import axios from "axios";
import {
  RotateCcw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useSimStore } from "../store/useSimStore";
import { FieldWithHint } from "./FieldWithHint";
import { SliderWithInput } from "./SliderWithInput";

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

  // Derive if we are in asset preview mode (where rotation correction is allowed)
  const resultMeshPath = useSimStore((s) => s.resultMeshPath);
  const totalFrames = useSimStore((s) => s.totalFrames);
  const isAssetPreview = !resultMeshPath && totalFrames === 0;

  const isRunning =
    status === "PENDING" || status === "MESHING" || status === "RUNNING";

  const isDisabled = !isAssetPreview || isRunning;

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
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] overflow-hidden" style={{ borderRadius: '2px' }}>
      {/* Header — toggle collapse */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-[rgba(255,255,255,0.03)] transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-[10px] w-[10px] text-[rgba(255,255,255,0.35)]" />
        ) : (
          <ChevronDown className="h-[10px] w-[10px] text-[rgba(255,255,255,0.35)]" />
        )}
        <RotateCcw className="h-[14px] w-[14px] text-nereus-accent" />
        <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">
          Orientation Correction
        </span>
      </button>

      {!collapsed && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-2">
          {!isAssetPreview && (
            <div className="border border-[rgba(0,212,255,0.15)] bg-[rgba(0,212,255,0.04)] px-2 py-1.5 flex gap-1.5 items-start" style={{ borderRadius: '2px' }}>
              <AlertTriangle className="h-[14px] w-[14px] text-nereus-accent mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-[rgba(0,212,255,0.7)] leading-normal">
                Orientation correction is locked while viewing simulation results. 
                These values are baked into the CFD mesh by the solver.
              </p>
            </div>
          )}

          {/* Sliders */}
          <FieldWithHint
            label="Pitch (Rotate X)"
            hint="Local rotation around the X axis."
          >
            <SliderWithInput
              value={pitch}
              min={-180}
              max={180}
              step={5}
              unit="°"
              disabled={isDisabled}
              onChange={(v) => setPitch(v)}
              onLivePreview={(v) => setPitch(v)}
              onRelease={commitSlider}
            />
          </FieldWithHint>

          <FieldWithHint
            label="Roll (Rotate Y)"
            hint="Local rotation around the Y axis."
          >
            <SliderWithInput
              value={roll}
              min={-180}
              max={180}
              step={5}
              unit="°"
              disabled={isDisabled}
              onChange={(v) => setRoll(v)}
              onLivePreview={(v) => setRoll(v)}
              onRelease={commitSlider}
            />
          </FieldWithHint>

          <FieldWithHint
            label="Yaw (Rotate Z)"
            hint="Local rotation around the Z axis."
          >
            <SliderWithInput
              value={yaw}
              min={-180}
              max={180}
              step={5}
              unit="°"
              disabled={isDisabled}
              onChange={(v) => setYaw(v)}
              onLivePreview={(v) => setYaw(v)}
              onRelease={commitSlider}
            />
          </FieldWithHint>

          {/* Quick-set buttons */}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleQuickSet(0, 0, 180)}
              className="px-2 py-0.5 text-[10px] font-medium border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] hover:border-[rgba(0,212,255,0.3)] transition-colors disabled:opacity-40" style={{ borderRadius: '2px' }}
            >
              Flip 180° (tail-first)
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleQuickSet(0, 90, 0)}
              className="px-2 py-0.5 text-[10px] font-medium border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] hover:border-[rgba(0,212,255,0.3)] transition-colors disabled:opacity-40" style={{ borderRadius: '2px' }}
            >
              Rotate 90° (sideways)
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleQuickSet(0, -90, 0)}
              className="px-2 py-0.5 text-[10px] font-medium border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] hover:border-[rgba(0,212,255,0.3)] transition-colors disabled:opacity-40" style={{ borderRadius: '2px' }}
            >
              Rotate −90° (sideways)
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleQuickSet(0, 0, 0)}
              className="px-2 py-0.5 text-[10px] font-medium border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] hover:border-[rgba(0,212,255,0.3)] transition-colors disabled:opacity-40" style={{ borderRadius: '2px' }}
            >
              Reset
            </button>
          </div>

          {/* Geometry dimensions readout */}
          {geometryDimensions && (
            <div className="border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-2 py-1.5" style={{ borderRadius: '2px' }}>
              <div className="text-[10px] text-[rgba(255,255,255,0.35)] mb-1 font-medium tracking-[0.1em] uppercase">
                Detected Dimensions
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-[10px] text-[rgba(255,255,255,0.35)]">Chord</div>
                  <div className="text-[12px] font-mono text-[rgba(255,255,255,0.8)]">
                    {geometryDimensions.chord_m != null
                      ? `${geometryDimensions.chord_m.toFixed(4)} m`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[rgba(255,255,255,0.35)]">Span</div>
                  <div className="text-[12px] font-mono text-[rgba(255,255,255,0.8)]">
                    {geometryDimensions.span_m != null
                      ? `${geometryDimensions.span_m.toFixed(4)} m`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[rgba(255,255,255,0.35)]">Thickness</div>
                  <div className="text-[12px] font-mono text-[rgba(255,255,255,0.8)]">
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
                  <div className="mt-1 flex items-start gap-1 text-[10px] text-nereus-orange">
                    <AlertTriangle className="h-[14px] w-[14px] flex-shrink-0 mt-0.5" />
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
