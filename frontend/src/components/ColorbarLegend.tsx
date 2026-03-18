import { useMemo } from "react";
import { useSimStore } from "../store/useSimStore";
import { colormapGradientCSS } from "../lib/colormaps";
import { motion } from "framer-motion";

export function ColorbarLegend() {
  const totalFrames = useSimStore((s) => s.totalFrames);
  const showPressureMap = useSimStore((s) => s.showPressureMap);
  const colormap = useSimStore((s) => s.colormap);
  const metricsSeries = useSimStore((s) => s.metricsSeries);
  const currentFrame = useSimStore((s) => s.currentFrame);

  // Derive pressure range from force data (Fx as proxy)
  const { minVal, maxVal } = useMemo(() => {
    if (metricsSeries.length === 0) return { minVal: 0, maxVal: 1 };
    const vals = metricsSeries
      .map((m) => m.Fx)
      .filter((v): v is number => v != null);
    if (vals.length === 0) return { minVal: 0, maxVal: 1 };
    return { minVal: Math.min(...vals), maxVal: Math.max(...vals) };
  }, [metricsSeries]);

  const currentVal = useMemo(() => {
    const m = metricsSeries[currentFrame];
    return m?.Fx ?? null;
  }, [metricsSeries, currentFrame]);

  if (totalFrames <= 0 || !showPressureMap) return null;

  const markerPct =
    currentVal != null && maxVal !== minVal
      ? ((currentVal - minVal) / (maxVal - minVal)) * 100
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="pointer-events-none absolute right-3 top-3 z-20"
    >
      {/* Slim horizontal colorbar, right-anchored */}
      <div className="glass-panel rounded-lg px-2.5 py-1.5 flex items-center gap-2 whitespace-nowrap">
        <span className="hud-label shrink-0">Pressure</span>
        <span className="text-2xs font-mono text-slate-500 tabular-nums shrink-0">
          {minVal.toFixed(0)}
        </span>
        <div className="relative w-24 h-2.5 rounded-sm overflow-hidden border border-hud-border shrink-0">
          <div
            className="absolute inset-0"
            style={{
              background: colormapGradientCSS(colormap, 64).replace(
                "to top",
                "to right",
              ),
            }}
          />
          {markerPct != null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]"
              style={{ left: `${markerPct}%` }}
            />
          )}
        </div>
        <span className="text-2xs font-mono text-slate-500 tabular-nums shrink-0">
          {maxVal.toFixed(0)}
        </span>
        {currentVal != null && (
          <span className="text-2xs font-mono text-accent-cyan font-semibold tabular-nums shrink-0">
            {currentVal.toFixed(0)}N
          </span>
        )}
      </div>
    </motion.div>
  );
}
