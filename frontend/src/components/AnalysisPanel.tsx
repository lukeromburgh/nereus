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
      <span className="inline-flex items-center gap-0.5 text-2xs text-slate-600">
        <Minus className="h-2.5 w-2.5" />
        0.00
      </span>
    );
  }
  const isPositive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-2xs font-medium ${
        isPositive ? "text-accent-emerald" : "text-accent-rose"
      }`}
    >
      {isPositive ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" />
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
    <div className="glass-panel rounded-lg p-3 flex flex-col gap-2">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <div className="hud-label">{label}</div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="hud-value-lg">
              {formatNumber(stats.current, digits)}
            </span>
            {unit && <span className="hud-unit">{unit}</span>}
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
      <div className="flex items-center justify-between text-2xs text-slate-500 font-mono tabular-nums border-t border-hud-border pt-2">
        <span>
          min{" "}
          <span className="text-slate-400">
            {formatNumber(stats.min, digits)}
          </span>
        </span>
        <span>
          avg{" "}
          <span className="text-slate-400">
            {formatNumber(stats.avg, digits)}
          </span>
        </span>
        <span>
          max{" "}
          <span className="text-slate-400">
            {formatNumber(stats.max, digits)}
          </span>
        </span>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "rgba(8, 12, 21, 0.95)",
  border: "1px solid rgba(148, 163, 184, 0.15)",
  borderRadius: "8px",
  color: "#e2e8f0",
  fontSize: 11,
  backdropFilter: "blur(8px)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
};

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
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent-cyan" />
          <h2 className="text-sm font-semibold text-slate-200 font-sans tracking-wide uppercase">
            Analysis
          </h2>
        </div>
        <span className="text-2xs text-slate-600 font-mono tabular-nums">
          F{currentFrame}
        </span>
      </div>

      {/* Orientation auto-correction warning */}
      <OrientationWarningBanner />

      {/* Telemetry metric cards */}
      <MetricCard
        label="L/D Ratio"
        dataKey="ld_ratio"
        digits={3}
        color="#60a5fa"
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
          color="#fb7185"
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
        <div className="glass-panel rounded-lg p-3 flex flex-col justify-between">
          <span className="hud-label">Coefficients</span>
          <div className="mt-2 space-y-1.5">
            {(
              [
                { k: "Cl", color: "text-accent-emerald", label: "Cl (lift)" },
                { k: "Cd", color: "text-accent-rose", label: "Cd (drag)" },
                { k: "Cs", color: "text-accent-amber", label: "Cs (side)" },
              ] as const
            ).map(({ k, color, label }) => {
              const curr = augmentedData.find(
                (d) => d.frame_index === currentFrame,
              );
              const val = curr?.[k];
              return (
                <div key={k} className="flex items-baseline justify-between">
                  <span className="text-2xs text-slate-500">{label}</span>
                  <span
                    className={`text-xs font-semibold font-mono tabular-nums ${color}`}
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
      <div className="glass-panel rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="hud-label">Convergence</span>
          <div className="flex items-center gap-2">
            {RESIDUAL_FIELDS.map((f) => (
              <button
                key={f}
                onClick={() => toggleResidual(f)}
                className={`flex items-center gap-1 text-2xs transition-opacity ${
                  visibleResiduals[f]
                    ? "opacity-100"
                    : "opacity-30 line-through"
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: RESIDUAL_COLORS[f] }}
                />
                <span className="text-slate-400">{f}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="h-44" style={{ minWidth: 100 }}>
          {convergenceSeries.length === 0 && residualEntries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-2xs text-slate-600">
              No residual data available
            </div>
          ) : residualEntries.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={100}>
              <LineChart
                data={residualEntries}
                margin={{ top: 4, right: 8, bottom: 0, left: -8 }}
              >
                <CartesianGrid
                  stroke="rgba(148, 163, 184, 0.06)"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="iteration"
                  tick={{ fill: "#475569", fontSize: 9 }}
                  axisLine={{ stroke: "rgba(148, 163, 184, 0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  scale="log"
                  domain={["auto", "auto"]}
                  tick={{ fill: "#475569", fontSize: 9 }}
                  axisLine={{ stroke: "rgba(148, 163, 184, 0.1)" }}
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
                  stroke="rgba(148, 163, 184, 0.06)"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#475569", fontSize: 9 }}
                  axisLine={{ stroke: "rgba(148, 163, 184, 0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#475569", fontSize: 9 }}
                  axisLine={{ stroke: "rgba(148, 163, 184, 0.1)" }}
                  tickLine={false}
                  width={36}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="residual"
                  stroke="#60a5fa"
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
      <div className="flex gap-2">
        {resultUrl && (
          <a
            href={resultUrl}
            download
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-hud-border bg-white/[0.02] hover:bg-white/[0.05] py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-all duration-200"
          >
            <Download className="h-3.5 w-3.5" />
            Mesh
          </a>
        )}
        <button
          onClick={handleExportMetrics}
          disabled={augmentedData.length === 0}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-hud-border bg-white/[0.02] hover:bg-white/[0.05] py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Metrics CSV
        </button>
        <button
          onClick={handleExportConvergence}
          disabled={convergenceSeries.length === 0}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-hud-border bg-white/[0.02] hover:bg-white/[0.05] py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Residuals CSV
        </button>
      </div>
    </div>
  );
}
