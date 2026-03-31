/**
 * LDHistoryChart — Minimal L/D ratio trend visualization.
 *
 * Shows L/D ratio over time with current frame marker.
 * Extracted from MetricHUD to keep the main component clean.
 */
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LDHistoryChartProps {
  data: Record<string, unknown>[];
  currentFrame: number;
  totalFrames: number;
  color?: string;
}

function formatNumber(val: number | null | undefined, digits = 3) {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return Number(val).toFixed(digits);
}

export function LDHistoryChart({
  data,
  currentFrame,
  totalFrames,
  color = "#60a5fa",
}: LDHistoryChartProps) {
  const current = data.find((p) => p.frame_index === currentFrame);
  const ldRatioValue = current ? (current.ld_ratio as number) : null;

  return (
    <div className="glass-panel-refined rounded-lg p-2 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <span className="hud-label text-slate-400">L/D History</span>
        <span className="text-2xs text-accent-glow font-mono tabular-nums">
          {formatNumber(ldRatioValue, 3)}
        </span>
      </div>

      {/* Chart */}
      <div className="h-12 w-full" style={{ minWidth: 200 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={200}>
          <LineChart
            data={data}
            margin={{ top: 4, right: 6, bottom: 0, left: -12 }}
          >
            <defs>
              <linearGradient id="ldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
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
                background: "rgba(2, 15, 32, 0.95)",
                border: "1px solid rgba(71, 85, 105, 0.2)",
                borderRadius: "6px",
                color: "#e2e8f0",
                fontSize: 11,
                backdropFilter: "blur(8px)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
                padding: "6px 8px",
              }}
              labelFormatter={(v) => `Frame ${v}`}
              formatter={(v) => [formatNumber(Number(v), 3), "L/D"]}
            />
            <ReferenceLine
              x={currentFrame}
              stroke={color}
              strokeOpacity={0.4}
              strokeDasharray="2 2"
            />
            <Line
              type="monotone"
              dataKey="ld_ratio"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}