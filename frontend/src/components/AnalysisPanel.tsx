import {
  CartesianGrid,
  Line,
  LineChart,
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

export function AnalysisPanel() {
  const currentFrame = useSimStore((s) => s.currentFrame);
  const metricsSeries = useSimStore((s) => s.metricsSeries);
  const frameMapping = useSimStore((s) => s.frameMapping);
  const convergenceSeries = useSimStore((s) => s.convergenceSeries);

  const metricsData = useMemo(() => {
    if (metricsSeries?.length > 0) return metricsSeries;
    return frameMapping.map((f) => ({
      frame_index: f.frame_index,
      time_value: f.time_value,
      ...f.metrics,
    }));
  }, [metricsSeries, frameMapping]);

  const metrics = metricsData.find((p) => p.frame_index === currentFrame) || null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-slate-200">Investigation</h2>

      <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Telemetry</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded border border-slate-800 bg-black/40 p-2">
            <div className="text-[11px] text-slate-400">L/D Ratio</div>
            <div className="mt-1 text-lg font-bold text-slate-100">
              {formatNumber(metrics?.ld_ratio, 2)}
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-black/40 p-2">
            <div className="text-[11px] text-slate-400">Fz (Lift) [N]</div>
            <div className="mt-1 text-lg font-bold text-slate-100">
              {formatNumber(metrics?.Fz, 0)}
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-black/40 p-2">
            <div className="text-[11px] text-slate-400">Fx (Drag) [N]</div>
            <div className="mt-1 text-lg font-bold text-slate-100">
              {formatNumber(metrics?.Fx, 0)}
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-black/40 p-2">
            <div className="text-[11px] text-slate-400">Frame</div>
            <div className="mt-1 text-lg font-bold text-slate-100">{currentFrame}</div>
          </div>
        </div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs uppercase tracking-wide text-slate-400">Convergence</div>
          <div className="text-xs text-slate-500">Max residual per step</div>
        </div>

        <div className="mt-3 h-40">
          {convergenceSeries.length === 0 ? (
            <div className="text-sm text-slate-500">No residual series available for this run.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={convergenceSeries} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={{ stroke: '#334155' }}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={{ stroke: '#334155' }}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(2, 6, 23, 0.9)',
                    border: '1px solid #334155',
                    color: '#e2e8f0',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="residual"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
