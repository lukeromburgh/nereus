import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useSimStore } from "../store/useSimStore";
import { computeCoefficients } from "../lib/coefficients";

function formatNumber(val: number | null | undefined, digits = 2) {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return Number(val).toFixed(digits);
}

/** Tiny inline sparkline for a metric row */
function MiniSparkline({
  data,
  dataKey,
  color,
  currentFrame,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  color: string;
  currentFrame: number;
}) {
  return (
    <div className="h-6 w-16" style={{ minWidth: 40, minHeight: 20 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={40}>
        <AreaChart
          data={data}
          margin={{ top: 1, right: 0, bottom: 1, left: 0 }}
        >
          <defs>
            <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${dataKey})`}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine
            x={currentFrame}
            stroke={color}
            strokeOpacity={0.4}
            strokeWidth={1}
          />
          <XAxis dataKey="frame_index" hide />
          <YAxis hide domain={["auto", "auto"]} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Determine trend direction from last N points */
function useTrend(
  data: Record<string, unknown>[],
  key: string,
  currentFrame: number,
) {
  return useMemo(() => {
    if (data.length < 3) return "flat" as const;
    const idx = data.findIndex((d) => d.frame_index === currentFrame);
    if (idx < 2) return "flat" as const;
    const prev = Number(data[idx - 2]?.[key]) || 0;
    const curr = Number(data[idx]?.[key]) || 0;
    const delta = curr - prev;
    const threshold = Math.abs(prev) * 0.01;
    if (delta > threshold) return "up" as const;
    if (delta < -threshold) return "down" as const;
    return "flat" as const;
  }, [data, key, currentFrame]);
}

function TrendIcon({
  trend,
  positiveIsGood,
}: {
  trend: "up" | "down" | "flat";
  positiveIsGood: boolean;
}) {
  if (trend === "flat") return <Minus className="h-[14px] w-[14px] text-[rgba(255,255,255,0.2)]" />;
  const isGood = (trend === "up") === positiveIsGood;
  const color = isGood ? "text-nereus-accent" : "text-nereus-orange";
  return trend === "up" ? (
    <TrendingUp className={`h-[14px] w-[14px] ${color}`} />
  ) : (
    <TrendingDown className={`h-[14px] w-[14px] ${color}`} />
  );
}

function MetricRow({
  label,
  value,
  unit,
  dataKey,
  color,
  data,
  currentFrame,
  positiveIsGood,
}: {
  label: string;
  value: string;
  unit?: string;
  dataKey: string;
  color: string;
  data: Record<string, unknown>[];
  currentFrame: number;
  positiveIsGood: boolean;
}) {
  const trend = useTrend(data, dataKey, currentFrame);

  return (
    <div className="flex items-center gap-1.5 py-1 border-b border-[rgba(255,255,255,0.06)] last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">{label}</div>
        <div className="flex items-baseline gap-0.5 mt-0.5">
          <span className="text-[14px] font-medium text-white font-mono tabular-nums">{value}</span>
          {unit && <span className="text-[10px] text-[rgba(255,255,255,0.35)] font-mono">{unit}</span>}
        </div>
      </div>
      <MiniSparkline
        data={data}
        dataKey={dataKey}
        color={color}
        currentFrame={currentFrame}
      />
      <TrendIcon trend={trend} positiveIsGood={positiveIsGood} />
    </div>
  );
}

export function MetricHUD() {
  const currentFrame = useSimStore((s) => s.currentFrame);
  const totalFrames = useSimStore((s) => s.totalFrames);
  const metricsSeries = useSimStore((s) => s.metricsSeries);
  const frameMapping = useSimStore((s) => s.frameMapping);
  const velocity = useSimStore((s) => s.velocity);
  const waterDensity = useSimStore((s) => s.waterDensity);
  const status = useSimStore((s) => s.status);

  const metricsData = useMemo(() => {
    if (metricsSeries?.length > 0) return metricsSeries;
    return frameMapping.map((f) => ({
      frame_index: f.frame_index,
      time_value: f.time_value,
      ...f.metrics,
    }));
  }, [metricsSeries, frameMapping]);

  // Augment metrics data with computed coefficients
  const augmentedData = useMemo(() => {
    return metricsData.map((d) => {
      const c = computeCoefficients(
        d.Fx as number | null,
        d.Fy as number | null,
        d.Fz as number | null,
        velocity,
        waterDensity,
      );
      return { ...d, Cl: c.Cl, Cd: c.Cd, Cs: c.Cs };
    });
  }, [metricsData, velocity, waterDensity]);

  const current = useMemo(
    () => augmentedData.find((p) => p.frame_index === currentFrame) || null,
    [augmentedData, currentFrame],
  );

  if (totalFrames <= 0) return null;

  // When the right-side AnalysisPanel is showing (COMPLETED), hide the
  // Forces/Coefficients HUD to avoid duplication. Keep only the L/D sparkline.
  const showFullHUD = status !== "COMPLETED";

  return (
    <>
      {/* ── Telemetry HUD (Top Right) — only when AnalysisPanel is NOT shown ── */}
      {showFullHUD && (
        <div className="pointer-events-none absolute right-2.5 top-2.5 z-20 w-56">
          <div className="bg-[rgba(17,19,24,0.9)] border border-[rgba(255,255,255,0.08)] p-2.5" style={{ borderRadius: '2px' }}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Forces</span>
              <span className="text-[10px] tabular-nums text-[rgba(255,255,255,0.25)] font-mono">
                F{currentFrame}/{totalFrames - 1}
              </span>
            </div>

            <MetricRow
              label="L/D Ratio"
              value={formatNumber(current?.ld_ratio, 3)}
              dataKey="ld_ratio"
              color="#00d4ff"
              data={augmentedData as Record<string, unknown>[]}
              currentFrame={currentFrame}
              positiveIsGood={true}
            />
            <MetricRow
              label="Lift (Fz)"
              value={formatNumber(current?.Fz, 1)}
              unit="N"
              dataKey="Fz"
              color="#00d4ff"
              data={augmentedData as Record<string, unknown>[]}
              currentFrame={currentFrame}
              positiveIsGood={true}
            />
            <MetricRow
              label="Drag (Fx)"
              value={formatNumber(current?.Fx, 1)}
              unit="N"
              dataKey="Fx"
              color="#ff6b35"
              data={augmentedData as Record<string, unknown>[]}
              currentFrame={currentFrame}
              positiveIsGood={false}
            />
            <MetricRow
              label="Side (Fy)"
              value={formatNumber(current?.Fy, 1)}
              unit="N"
              dataKey="Fy"
              color="#fbbf24"
              data={augmentedData as Record<string, unknown>[]}
              currentFrame={currentFrame}
              positiveIsGood={false}
            />
          </div>

          {/* ── Force Coefficients ── */}
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-2.5 mt-1.5" style={{ borderRadius: '2px' }}>
            <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Coefficients</span>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              <div className="text-center">
                <div className="text-[10px] text-[rgba(255,255,255,0.35)]">Cl</div>
                <div className="text-[12px] font-medium text-nereus-accent font-mono tabular-nums">
                  {formatNumber(current?.Cl, 4)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-[rgba(255,255,255,0.35)]">Cd</div>
                <div className="text-[12px] font-medium text-nereus-orange font-mono tabular-nums">
                  {formatNumber(current?.Cd, 4)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-[rgba(255,255,255,0.35)]">Cs</div>
                <div className="text-[12px] font-medium text-[#fbbf24] font-mono tabular-nums">
                  {formatNumber(current?.Cs, 4)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── L/D Sparkline (Left side, docked below LayerManager) ── */}
      <div className="pointer-events-none absolute left-2.5 bottom-14 z-20 w-44">
        <div className="bg-[rgba(17,19,24,0.9)] border border-[rgba(255,255,255,0.08)] p-1.5" style={{ borderRadius: '2px' }}>
          <div className="flex items-center justify-between px-0.5 pb-0.5">
            <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">L/D History</span>
            <span className="text-[10px] text-nereus-accent font-mono tabular-nums">
              {formatNumber(current?.ld_ratio, 3)}
            </span>
          </div>
          <div className="h-14" style={{ minWidth: 80 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={80}>
              <LineChart
                data={augmentedData}
                margin={{ top: 4, right: 6, bottom: 0, left: -12 }}
              >
                <defs>
                  <linearGradient id="ldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="frame_index"
                  hide
                  domain={[0, Math.max(0, totalFrames - 1)]}
                  type="number"
                />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "#111318",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "2px",
                    color: "rgba(255,255,255,0.8)",
                    fontSize: 11,
                    backdropFilter: "none",
                    boxShadow: "none",
                  }}
                  labelFormatter={(v) => `Frame ${v}`}
                  formatter={(v) => [formatNumber(Number(v), 3), "L/D"]}
                />
                <ReferenceLine
                  x={currentFrame}
                  stroke="#00d4ff"
                  strokeOpacity={0.5}
                  strokeDasharray="2 2"
                />
                <Line
                  type="monotone"
                  dataKey="ld_ratio"
                  stroke="#00d4ff"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
