import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useState } from "react";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { useSimStore } from "../store/useSimStore";
import { computeCoefficients } from "../lib/coefficients";
import {
  parseAllResiduals,
  RESIDUAL_FIELDS,
  RESIDUAL_COLORS,
} from "../lib/residuals";
import { downloadCSV, metricsToCSV, convergenceToCSV } from "../lib/exportCSV";
import { OrientationWarningBanner } from "./OrientationWarningBanner";

function formatNumber(val: number | null | undefined, digits = 2) {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return Number(val).toFixed(digits);
}

/** Compute extremes + delta from previous frame */
function useMetricStats(
  data: Record<string, unknown>[],
  key: string,
  currentFrame: number,
) {
  return useMemo(() => {
    const values = data
      .map((d) => Number(d[key]))
      .filter((v) => Number.isFinite(v));
    const curr = data.find((d) => d.frame_index === currentFrame);
    const prev = data.find((d) => d.frame_index === currentFrame - 1);
    const currVal = Number(curr?.[key]) || 0;
    const prevVal = prev ? Number(prev[key]) || 0 : currVal;
    const delta = currVal - prevVal;

    return {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      avg: values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0,
      current: currVal,
      delta,
    };
  }, [data, key, currentFrame]);
}

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.001) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-[rgba(255,255,255,0.25)] font-mono">
        <Minus className="h-[10px] w-[10px]" />
        0.00
      </span>
    );
  }
  const isPositive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium font-mono ${
        isPositive ? "text-nereus-accent" : "text-nereus-orange"
      }`}
    >
      {isPositive ? (
        <TrendingUp className="h-[10px] w-[10px]" />
      ) : (
        <TrendingDown className="h-[10px] w-[10px]" />
      )}
      {isPositive ? "+" : ""}
      {delta.toFixed(2)}
    </span>
  );
}

/** Single telemetry metric card with inline sparkline */
function MetricCard({
  label,
  unit,
  dataKey,
  digits,
  color,
  data,
  currentFrame,
}: {
  label: string;
  unit?: string;
  dataKey: string;
  digits: number;
  color: string;
  data: Record<string, unknown>[];
  currentFrame: number;
}) {
  const stats = useMetricStats(data, dataKey, currentFrame);

  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-2.5 flex flex-col gap-1.5" style={{ borderRadius: '2px' }}>
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">{label}</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[16px] font-medium tabular-nums text-white font-mono">
              {formatNumber(stats.current, digits)}
            </span>
            {unit && <span className="text-[10px] text-[rgba(255,255,255,0.35)] font-mono">{unit}</span>}
          </div>
        </div>
        <DeltaBadge delta={stats.delta} />
      </div>

      {/* Sparkline */}
      <div className="h-10 -mx-1" style={{ minWidth: 60 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={60}>
          <AreaChart
            data={data}
            margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient
                id={`grad-${dataKey}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#grad-${dataKey})`}
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

      {/* Min / Max / Avg stats row */}
      <div className="flex items-center justify-between text-[10px] text-[rgba(255,255,255,0.25)] font-mono tabular-nums border-t border-[rgba(255,255,255,0.06)] pt-1.5">
        <span>
          min{" "}
          <span className="text-[rgba(255,255,255,0.45)]">
            {formatNumber(stats.min, digits)}
          </span>
        </span>
        <span>
          avg{" "}
          <span className="text-[rgba(255,255,255,0.45)]">
            {formatNumber(stats.avg, digits)}
          </span>
        </span>
        <span>
          max{" "}
          <span className="text-[rgba(255,255,255,0.45)]">
            {formatNumber(stats.max, digits)}
          </span>
        </span>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "#111318",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "2px",
  color: "rgba(255,255,255,0.8)",
  fontSize: 11,
  backdropFilter: "none",
  boxShadow: "none",
};

/** Card showing effective AoA, velocity decomposition, and stall detection */
function FlowConditionsCard({
  aoa,
  velocity,
  augmentedData,
}: {
  aoa: number;
  velocity: number;
  augmentedData: Record<string, unknown>[];
}) {
  const aoaRad = (aoa * Math.PI) / 180;
  const ux = velocity * Math.cos(aoaRad);
  const uz = -velocity * Math.sin(aoaRad);

  // Simple stall detection: check if Cl decreases in the last portion of data
  const stallWarning = useMemo(() => {
    if (augmentedData.length < 3) return false;
    const clValues = augmentedData
      .map((d) => Number(d.Cl))
      .filter((v) => Number.isFinite(v));
    if (clValues.length < 3) return false;
    // Compare last third average to middle third average
    const third = Math.max(1, Math.floor(clValues.length / 3));
    const midAvg =
      clValues.slice(third, third * 2).reduce((a, b) => a + b, 0) / third;
    const lastAvg =
      clValues.slice(-third).reduce((a, b) => a + b, 0) / third;
    // If last avg is declining while AoA is > 10°, it may indicate stall
    return aoa > 10 && lastAvg < midAvg * 0.95;
  }, [augmentedData, aoa]);

  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-2.5 flex flex-col gap-1.5" style={{ borderRadius: '2px' }}>
      <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Flow Conditions</span>
      <div className="grid grid-cols-3 gap-1.5 mt-0.5">
        <div className="text-center">
          <div className="text-[10px] text-[rgba(255,255,255,0.35)]">AoA</div>
          <div className="text-[12px] font-medium font-mono text-nereus-accent tabular-nums">
            {aoa.toFixed(1)}°
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-[rgba(255,255,255,0.35)]">U<sub>x</sub></div>
          <div className="text-[12px] font-medium font-mono text-[rgba(255,255,255,0.8)] tabular-nums">
            {ux.toFixed(2)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-[rgba(255,255,255,0.35)]">U<sub>z</sub></div>
          <div className="text-[12px] font-medium font-mono text-[rgba(255,255,255,0.8)] tabular-nums">
            {uz.toFixed(2)}
          </div>
        </div>
      </div>
      {stallWarning && (
        <div className="mt-0.5 px-2 py-1 bg-[rgba(255,107,53,0.08)] border border-[rgba(255,107,53,0.2)] text-[10px] text-nereus-orange text-center" style={{ borderRadius: '2px' }}>
          Possible stall — lift coefficient declining at high AoA
        </div>
      )}
    </div>
  );
}

export function AnalysisPanel() {
  const currentFrame = useSimStore((s) => s.currentFrame);
  const metricsSeries = useSimStore((s) => s.metricsSeries);
  const frameMapping = useSimStore((s) => s.frameMapping);
  const convergenceSeries = useSimStore((s) => s.convergenceSeries);
  const resultMeshPath = useSimStore((s) => s.resultMeshPath);
  const logs = useSimStore((s) => s.logs);
  const velocity = useSimStore((s) => s.velocity);
  const waterDensity = useSimStore((s) => s.waterDensity);
  const activeSimId = useSimStore((s) => s.activeSimId);
  const aoa = useSimStore((s) => s.aoa);

  const [visibleResiduals, setVisibleResiduals] = useState<
    Record<string, boolean>
  >({ p: true, Ux: true, Uy: true, Uz: true });

  const metricsData = useMemo(() => {
    if (metricsSeries?.length > 0) return metricsSeries;
    return frameMapping.map((f) => ({
      frame_index: f.frame_index,
      time_value: f.time_value,
      ...f.metrics,
    }));
  }, [metricsSeries, frameMapping]);

  // Augmented data with coefficients
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

  // Multi-field residuals from logs
  const residualEntries = useMemo(() => parseAllResiduals(logs), [logs]);

  const resultUrl = resultMeshPath
    ? `http://localhost:8000${resultMeshPath}`
    : null;

  const handleExportMetrics = () => {
    const csv = metricsToCSV(augmentedData as Record<string, unknown>[], [
      "Fx",
      "Fy",
      "Fz",
      "ld_ratio",
      "Cl",
      "Cd",
      "Cs",
    ]);
    downloadCSV(`nereus-run-${activeSimId ?? "unknown"}-metrics.csv`, csv);
  };

  const handleExportConvergence = () => {
    const csv = convergenceToCSV(convergenceSeries);
    downloadCSV(`nereus-run-${activeSimId ?? "unknown"}-convergence.csv`, csv);
  };

  const toggleResidual = (field: string) =>
    setVisibleResiduals((prev) => ({ ...prev, [field]: !prev[field] }));

  return (
    <div className="flex flex-col gap-3 scrollbar-dark">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="h-[14px] w-[14px] text-[rgba(255,255,255,0.35)]" />
          <h2 className="text-[10px] font-normal tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">
            Analysis
          </h2>
        </div>
        <span className="text-[10px] text-[rgba(255,255,255,0.25)] font-mono tabular-nums">
          F{currentFrame}
        </span>
      </div>

      {/* Orientation auto-correction warning */}
      <OrientationWarningBanner />

      {/* Flow Conditions — effective AoA and velocity decomposition */}
      {activeSimId && (
        <FlowConditionsCard
          aoa={aoa}
          velocity={velocity}
          augmentedData={augmentedData as Record<string, unknown>[]}
        />
      )}

      {/* Telemetry metric cards */}
      <MetricCard
        label="L/D Ratio"
        dataKey="ld_ratio"
        digits={3}
        color="#00d4ff"
        data={augmentedData as Record<string, unknown>[]}
        currentFrame={currentFrame}
      />

      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Lift (Fz)"
          unit="N"
          dataKey="Fz"
          digits={1}
          color="#34d399"
          data={augmentedData as Record<string, unknown>[]}
          currentFrame={currentFrame}
        />
        <MetricCard
          label="Drag (Fx)"
          unit="N"
          dataKey="Fx"
          digits={1}
          color="#ff6b35"
          data={augmentedData as Record<string, unknown>[]}
          currentFrame={currentFrame}
        />
      </div>

      {/* Side force + Coefficients row */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Side (Fy)"
          unit="N"
          dataKey="Fy"
          digits={1}
          color="#fbbf24"
          data={augmentedData as Record<string, unknown>[]}
          currentFrame={currentFrame}
        />
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-2.5 flex flex-col justify-between" style={{ borderRadius: '2px' }}>
          <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Coefficients</span>
          <div className="mt-1.5 space-y-1">
            {(
              [
                { k: "Cl", color: "text-nereus-accent", label: "Cl (lift)" },
                { k: "Cd", color: "text-nereus-orange", label: "Cd (drag)" },
                { k: "Cs", color: "text-[#fbbf24]", label: "Cs (side)" },
              ] as const
            ).map(({ k, color, label }) => {
              const curr = augmentedData.find(
                (d) => d.frame_index === currentFrame,
              );
              const val = curr?.[k];
              return (
                <div key={k} className="flex items-baseline justify-between">
                  <span className="text-[10px] text-[rgba(255,255,255,0.35)]">{label}</span>
                  <span
                    className={`text-[12px] font-medium font-mono tabular-nums ${color}`}
                  >
                    {formatNumber(val as number | null, 4)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Multi-residual convergence chart */}
      <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-2.5" style={{ borderRadius: '2px' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Convergence</span>
          <div className="flex items-center gap-2">
            {RESIDUAL_FIELDS.map((f) => (
              <button
                key={f}
                onClick={() => toggleResidual(f)}
                className={`flex items-center gap-1 text-[10px] transition-opacity ${
                  visibleResiduals[f]
                    ? "opacity-100"
                    : "opacity-30 line-through"
                }`}
              >
                <span
                  className="h-1.5 w-1.5"
                  style={{ backgroundColor: RESIDUAL_COLORS[f], borderRadius: '1px' }}
                />
                <span className="text-[rgba(255,255,255,0.45)] font-mono">{f}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="h-44" style={{ minWidth: 100 }}>
          {convergenceSeries.length === 0 && residualEntries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[10px] text-[rgba(255,255,255,0.2)]">
              No residual data available
            </div>
          ) : residualEntries.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={100}>
              <LineChart
                data={residualEntries}
                margin={{ top: 4, right: 8, bottom: 0, left: -8 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="iteration"
                  tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickLine={false}
                />
                <YAxis
                  scale="log"
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickLine={false}
                  width={40}
                  allowDataOverflow
                  tickFormatter={(v: number) =>
                    v >= 0.01 ? v.toFixed(2) : v.toExponential(0)
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v) => `Iteration ${v}`}
                />
                {RESIDUAL_FIELDS.map(
                  (f) =>
                    visibleResiduals[f] && (
                      <Line
                        key={f}
                        type="monotone"
                        dataKey={f}
                        stroke={RESIDUAL_COLORS[f]}
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    ),
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={100}>
              <LineChart
                data={convergenceSeries}
                margin={{ top: 4, right: 8, bottom: 0, left: -8 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickLine={false}
                  width={36}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="residual"
                  stroke="#00d4ff"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Export + Download row */}
      <div className="flex gap-1.5">
        {resultUrl && (
          <a
            href={resultUrl}
            download
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] h-8 text-[11px] font-medium text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] transition-all duration-200"
            style={{ borderRadius: '2px' }}
          >
            <Download className="h-[14px] w-[14px]" />
            Mesh
          </a>
        )}
        <button
          onClick={handleExportMetrics}
          disabled={augmentedData.length === 0}
          className="flex-1 flex items-center justify-center gap-1.5 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] h-8 text-[11px] font-medium text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderRadius: '2px' }}
        >
          <FileSpreadsheet className="h-[14px] w-[14px]" />
          Metrics CSV
        </button>
        <button
          onClick={handleExportConvergence}
          disabled={convergenceSeries.length === 0}
          className="flex-1 flex items-center justify-center gap-1.5 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] h-8 text-[11px] font-medium text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderRadius: '2px' }}
        >
          <FileSpreadsheet className="h-[14px] w-[14px]" />
          Residuals CSV
        </button>
      </div>
    </div>
  );
}
