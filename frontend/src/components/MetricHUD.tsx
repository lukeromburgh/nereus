import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMemo } from 'react';
import { useSimStore } from '../store/useSimStore';

function formatNumber(val: number | null | undefined, digits = 2) {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return Number(val).toFixed(digits);
}

export function MetricHUD() {
  const currentFrame = useSimStore((s) => s.currentFrame);
  const totalFrames = useSimStore((s) => s.totalFrames);
  const metricsSeries = useSimStore((s) => s.metricsSeries);
  const frameMapping = useSimStore((s) => s.frameMapping);

  // Some backend runs may provide metrics only inside `frame_mapping` (not `metrics_series`).
  // Prefer the explicit metrics_timeseries when available, otherwise fall back to the frame mapping.
  const metricsData = useMemo(() => {
    if (metricsSeries?.length > 0) return metricsSeries;
    return frameMapping.map((f) => ({
      frame_index: f.frame_index,
      time_value: f.time_value,
      ...f.metrics,
    }));
  }, [metricsSeries, frameMapping]);

  const current = useMemo(
    () => metricsData.find((p) => p.frame_index === currentFrame) || null,
    [metricsData, currentFrame]
  );

  if (totalFrames <= 0) return null;

  return (
    <>
      {/* Telemetry (Top Right) */}
      <div className="pointer-events-none absolute right-3 top-3 z-20 w-56 rounded border border-slate-700 bg-slate-950/60 backdrop-blur p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Telemetry</div>
        <div className="mt-2 space-y-1 text-sm text-slate-100">
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">L/D Ratio</span>
            <span className="font-bold">{formatNumber(current?.ld_ratio, 2)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Fz (Lift)</span>
            <span className="font-bold">{formatNumber(current?.Fz, 0)} N</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Fx (Drag)</span>
            <span className="font-bold">{formatNumber(current?.Fx, 0)} N</span>
          </div>
        </div>
      </div>

      {/* Synchronized sparkline (Bottom Right) */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-20 h-28 w-72 rounded border border-slate-700 bg-slate-950/60 backdrop-blur p-2">
        <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-slate-400">L/D (Synced)</div>
        <div className="h-[88px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metricsSeries} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
              <XAxis
                dataKey="frame_index"
                hide
                domain={[0, Math.max(0, totalFrames - 1)]}
                type="number"
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(2, 6, 23, 0.9)',
                  border: '1px solid #334155',
                  color: '#e2e8f0',
                  fontSize: 12,
                }}
                labelFormatter={(v) => `Frame ${v}`}
                formatter={(v) => [formatNumber(v as number, 2), 'L/D']}
              />
              <ReferenceLine x={currentFrame} stroke="#e2e8f0" strokeOpacity={0.65} />
              <Line
                type="monotone"
                dataKey="ld_ratio"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
