/**
 * MetricHUD — Clean, minimalist metrics display for VTK viewport.
 *
 * Shows:
 * - L/D Ratio as hero metric (top-right)
 * - Secondary forces (Lift, Drag, Side) in horizontal layout
 * - Aerodynamic coefficients (Cl, Cd, Cs) in compact grid
 * - L/D History sparkline (left side)
 *
 * Redesigned for minimal visual clutter, maximum data clarity.
 */
import { useMemo } from "react";
import { useSimStore } from "../../store/useSimStore";
import { computeCoefficients } from "../../lib/coefficients";
import { CompactMetric } from "./CompactMetric";
import { LDHistoryChart } from "./LDHistoryChart";
import { getPerformanceColor } from "../../lib/performanceColor";

function formatNumber(val: number | null | undefined, digits = 2) {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return Number(val).toFixed(digits);
}

export function MetricHUD() {
  const currentFrame = useSimStore((s) => s.currentFrame);
  const totalFrames = useSimStore((s) => s.totalFrames);
  const metricsSeries = useSimStore((s) => s.metricsSeries);
  const frameMapping = useSimStore((s) => s.frameMapping);
  const velocity = useSimStore((s) => s.velocity);
  const waterDensity = useSimStore((s) => s.waterDensity);

  // ── Build metrics data from store ─────────────────────────────────────
  const metricsData = useMemo(() => {
    if (metricsSeries?.length > 0) return metricsSeries;
    return frameMapping.map((f) => ({
      frame_index: f.frame_index,
      time_value: f.time_value,
      ...f.metrics,
    }));
  }, [metricsSeries, frameMapping]);

  // ── Compute aerodynamic coefficients ──────────────────────────────────
  const augmentedData = useMemo(() => {
    return metricsData.map((d) => {
      const c = computeCoefficients(
        d.Fx as number | null,
        d.Fy as number | null,
        d.Fz as number | null,
        velocity,
        waterDensity
      );
      return { ...d, Cl: c.Cl, Cd: c.Cd, Cs: c.Cs };
    });
  }, [metricsData, velocity, waterDensity]);

  // ── Get current frame data ───────────────────────────────────────────
  const current = useMemo(
    () => augmentedData.find((p) => p.frame_index === currentFrame) || null,
    [augmentedData, currentFrame]
  );

  if (totalFrames <= 0 || !current) return null;

  const ldRatio = current.ld_ratio as number;
  const performanceColor = getPerformanceColor(ldRatio);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Main Metrics Panel (Top Right)                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="pointer-events-none absolute right-2.5 top-2.5 z-20 w-72">
        <div className="bg-[rgba(17,19,24,0.9)] border border-[rgba(255,255,255,0.08)] p-3 space-y-3" style={{ borderRadius: '2px' }}>
          {/* Header: "METRICS" + Frame counter */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">METRICS</span>
            <span className="text-[10px] text-[rgba(255,255,255,0.25)] font-mono tabular-nums">
              F{currentFrame}/{totalFrames - 1}
            </span>
          </div>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* Hero: L/D Ratio                                            */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="flex flex-col items-center justify-center py-1.5">
            <div className="text-[10px] text-[rgba(255,255,255,0.35)] font-normal mb-0.5">
              L/D Ratio
            </div>
            <div className={`text-[24px] font-mono tabular-nums font-medium ${performanceColor}`}>
              {formatNumber(ldRatio, 3)}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-[rgba(255,255,255,0.06)]" />

          {/* ─────────────────────────────────────────────────────────── */}
          {/* Secondary Forces (Horizontal)                              */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="flex justify-around gap-4 py-1.5">
            <CompactMetric
              label="Lift"
              value={formatNumber(current.Fz as number, 0)}
              unit="N"
              color="text-nereus-accent"
              size="md"
            />
            <CompactMetric
              label="Drag"
              value={formatNumber(current.Fx as number, 0)}
              unit="N"
              color="text-nereus-orange"
              size="md"
            />
            <CompactMetric
              label="Side"
              value={formatNumber(current.Fy as number, 0)}
              unit="N"
              color="text-[#fbbf24]"
              size="md"
            />
          </div>

          {/* Divider */}
          <div className="h-px bg-[rgba(255,255,255,0.06)]" />

          {/* ─────────────────────────────────────────────────────────── */}
          {/* Coefficients (3-column grid)                               */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3 py-1.5">
            <CompactMetric
              label="Cl"
              value={formatNumber(current.Cl as number, 4)}
              color="text-nereus-accent"
              size="sm"
            />
            <CompactMetric
              label="Cd"
              value={formatNumber(current.Cd as number, 4)}
              color="text-nereus-orange"
              size="sm"
            />
            <CompactMetric
              label="Cs"
              value={formatNumber(current.Cs as number, 4)}
              color="text-[#fbbf24]"
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* L/D History Chart (Left Side, Below Layer Manager)              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="pointer-events-none absolute left-2.5 bottom-14 z-20 w-48">
        <LDHistoryChart
          data={augmentedData as Record<string, unknown>[]}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          color="#00d4ff"
        />
      </div>
    </>
  );
}