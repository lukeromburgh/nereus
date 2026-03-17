import { useEffect, useMemo, useRef } from 'react';
import { useSimStore } from '../store/useSimStore';

type ResidualPoint = {
  p?: number;
  Ux?: number;
};

function parseResiduals(logs: string, maxPoints = 120): ResidualPoint[] {
  const points: ResidualPoint[] = [];
  const lines = (logs || '').split('\n');

  for (const line of lines) {
    // Examples:
    // smoothSolver:  Solving for Ux, Initial residual = 0.00585878, Final residual = ...
    // GAMG:  Solving for p, Initial residual = 0.175101, Final residual = ...
    const pMatch = line.match(/Solving for p, Initial residual = ([0-9.eE+-]+)/);
    if (pMatch) {
      const value = Number(pMatch[1]);
      if (Number.isFinite(value)) points.push({ p: value });
      continue;
    }

    const uxMatch = line.match(/Solving for Ux, Initial residual = ([0-9.eE+-]+)/);
    if (uxMatch) {
      const value = Number(uxMatch[1]);
      if (Number.isFinite(value)) points.push({ Ux: value });
    }
  }

  return points.slice(-maxPoints);
}

function toPolyline(points: number[], width: number, height: number) {
  if (points.length < 2) return '';

  // log10 scale for residuals; clamp to avoid -inf
  const safe = points.map((v) => Math.max(v, 1e-12));
  const logs = safe.map((v) => Math.log10(v));
  const minY = Math.min(...logs);
  const maxY = Math.max(...logs);
  const span = Math.max(maxY - minY, 1e-6);

  return logs
    .map((lv, i) => {
      const x = (i / (logs.length - 1)) * width;
      const y = height - ((lv - minY) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function LogConsole() {
  const logs = useSimStore((state) => state.logs);
  const status = useSimStore((state) => state.status);
  const resultMeshPath = useSimStore((state) => state.resultMeshPath);
  const convergenceSeries = useSimStore((state) => state.convergenceSeries);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  const residualPoints = useMemo(() => parseResiduals(logs), [logs]);
  const parsedPSeries = residualPoints
    .map((p) => p.p)
    .filter((v): v is number => typeof v === 'number');
  const parsedUxSeries = residualPoints
    .map((p) => p.Ux)
    .filter((v): v is number => typeof v === 'number');

  // Prefer the persisted convergence series once available (completed runs),
  // since streamed logs may be truncated.
  const pSeries = (convergenceSeries?.length ? convergenceSeries.map((p) => p.residual) : parsedPSeries).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  const uxSeries = parsedUxSeries;

  const plotW = 280;
  const plotH = 110;
  const pPolyline = useMemo(() => toPolyline(pSeries, plotW, plotH), [pSeries]);
  const uxPolyline = useMemo(() => toPolyline(uxSeries, plotW, plotH), [uxSeries]);

  const resultUrl = resultMeshPath ? `http://localhost:8000${resultMeshPath}` : null;

  return (
    <div className="h-full flex flex-col p-3 font-mono text-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="text-slate-400 font-bold uppercase tracking-wider">Console Output</span>
        <span className={`px-2 py-1 rounded text-xs font-bold ${
          status === 'COMPLETED' ? 'bg-green-900/50 text-green-400' :
          status === 'FAILED' ? 'bg-orange-900/50 text-orange-400' :
          status === 'RUNNING' ? 'bg-blue-900/50 text-blue-400' :
          'bg-slate-800 text-slate-400'
        }`}>
          {status}
        </span>
      </div>

      <div className="flex-1 flex gap-3 overflow-hidden">
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto bg-black rounded border border-slate-800 p-2 whitespace-pre-wrap text-green-500"
        >
          {logs || 'Waiting for simulation to start...'}
        </div>

        <div className="w-[320px] shrink-0 rounded border border-slate-800 bg-slate-950/50 p-2">
          <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Metrics</div>

          <div className="rounded border border-slate-800 bg-black p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-400">Residuals (log scale)</div>
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />p</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-200" />Ux</span>
              </div>
            </div>
            {pSeries.length + uxSeries.length < 4 ? (
              <div className="text-xs text-slate-500">No residuals yet.</div>
            ) : (
              <svg width={plotW} height={plotH} viewBox={`0 0 ${plotW} ${plotH}`} className="block">
                <polyline points={pPolyline} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
                <polyline points={uxPolyline} fill="none" stroke="#e2e8f0" strokeWidth="1.2" opacity="0.9" />
              </svg>
            )}
          </div>

          <div className="mt-2 rounded border border-slate-800 bg-black p-2">
            <div className="text-xs text-slate-400 mb-1">Result</div>
            {resultUrl ? (
              <a
                href={resultUrl}
                className="inline-flex items-center justify-center w-full rounded border border-slate-700 bg-slate-900/60 hover:bg-slate-900 px-2 py-1.5 text-xs font-bold text-slate-100 transition-colors"
                download
                target="_blank"
                rel="noreferrer"
              >
                Download Mesh
              </a>
            ) : (
              <div className="text-xs text-slate-500">No result mesh yet.</div>
            )}
            {resultMeshPath ? (
              <div className="mt-1 text-[10px] text-slate-500 break-all">{resultMeshPath}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
