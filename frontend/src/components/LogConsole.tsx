import { useEffect, useMemo, useRef } from "react";
import { Terminal, Download, Circle } from "lucide-react";
import { useSimStore } from "../store/useSimStore";
import {
  parseAllResiduals,
  extractSeries,
  RESIDUAL_COLORS,
} from "../lib/residuals";

function toPolyline(points: number[], width: number, height: number) {
  if (points.length < 2) return "";

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
    .join(" ");
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

  const residualEntries = useMemo(() => parseAllResiduals(logs), [logs]);
  const parsedPSeries = useMemo(
    () => extractSeries(residualEntries, "p"),
    [residualEntries],
  );
  const parsedUxSeries = useMemo(
    () => extractSeries(residualEntries, "Ux"),
    [residualEntries],
  );

  const pSeries = (
    convergenceSeries?.length
      ? convergenceSeries.map((p) => p.residual)
      : parsedPSeries
  ).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const uxSeries = parsedUxSeries;

  const plotW = 260;
  const plotH = 100;
  const pPolyline = useMemo(() => toPolyline(pSeries, plotW, plotH), [pSeries]);
  const uxPolyline = useMemo(
    () => toPolyline(uxSeries, plotW, plotH),
    [uxSeries],
  );

  const resultUrl = resultMeshPath
    ? `http://localhost:8000${resultMeshPath}`
    : null;

  const statusConfig = {
    COMPLETED: {
      color: "text-accent-emerald",
      bg: "bg-accent-emerald/15",
      border: "border-accent-emerald/20",
      label: "COMPLETED",
    },
    FAILED: {
      color: "text-accent-rose",
      bg: "bg-accent-rose/15",
      border: "border-accent-rose/20",
      label: "FAILED",
    },
    RUNNING: {
      color: "text-accent-glow",
      bg: "bg-accent/15",
      border: "border-accent/20",
      label: "RUNNING",
    },
    MESHING: {
      color: "text-accent-cyan",
      bg: "bg-accent-cyan/15",
      border: "border-accent-cyan/20",
      label: "MESHING",
    },
    PENDING: {
      color: "text-accent-amber",
      bg: "bg-accent-amber/15",
      border: "border-accent-amber/20",
      label: "PENDING",
    },
  } as Record<
    string,
    { color: string; bg: string; border: string; label: string }
  >;

  const sc = statusConfig[status] || {
    color: "text-slate-500",
    bg: "bg-slate-800/50",
    border: "border-slate-700/30",
    label: status,
  };

  return (
    <div className="h-full flex flex-col p-3 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-slate-500" />
          <span className="hud-label">Solver Output</span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium border ${sc.bg} ${sc.color} ${sc.border}`}
        >
          <Circle
            className={`h-1.5 w-1.5 fill-current ${status === "RUNNING" || status === "MESHING" ? "animate-pulse" : ""}`}
          />
          {sc.label}
        </span>
      </div>

      {/* Content area */}
      <div className="flex-1 flex gap-3 overflow-hidden">
        {/* Log stream */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto rounded-lg border border-hud-border bg-black/60 p-2.5 whitespace-pre-wrap text-[11px] leading-relaxed text-emerald-400/80 scrollbar-dark"
        >
          {logs || "Waiting for simulation to start..."}
        </div>

        {/* Metrics sidebar */}
        <div className="w-[300px] shrink-0 flex flex-col gap-2 overflow-y-auto scrollbar-dark">
          {/* Residual plot */}
          <div className="glass-panel rounded-lg p-2.5 flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="hud-label">Residuals</span>
              <div className="flex items-center gap-3 text-2xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: RESIDUAL_COLORS.p }}
                  />
                  p
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: RESIDUAL_COLORS.Ux }}
                  />
                  Ux
                </span>
              </div>
            </div>
            {pSeries.length + uxSeries.length < 4 ? (
              <div className="flex items-center justify-center h-20 text-2xs text-slate-600">
                Awaiting residual data…
              </div>
            ) : (
              <svg
                width={plotW}
                height={plotH}
                viewBox={`0 0 ${plotW} ${plotH}`}
                className="block"
              >
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map((f) => (
                  <line
                    key={f}
                    x1={0}
                    y1={plotH * f}
                    x2={plotW}
                    y2={plotH * f}
                    stroke="rgba(148, 163, 184, 0.06)"
                    strokeDasharray="2 4"
                  />
                ))}
                <polyline
                  points={pPolyline}
                  fill="none"
                  stroke={RESIDUAL_COLORS.p}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <polyline
                  points={uxPolyline}
                  fill="none"
                  stroke={RESIDUAL_COLORS.Ux}
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                  opacity="0.7"
                />
              </svg>
            )}
          </div>

          {/* Download */}
          <div className="glass-panel rounded-lg p-2.5">
            <span className="hud-label">Result</span>
            {resultUrl ? (
              <a
                href={resultUrl}
                className="mt-2 flex items-center justify-center gap-2 w-full rounded-md border border-hud-border bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 transition-all duration-200"
                download
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-3.5 w-3.5" />
                Download Mesh
              </a>
            ) : (
              <div className="mt-1.5 text-2xs text-slate-600">
                No result mesh yet
              </div>
            )}
            {resultMeshPath && (
              <div className="mt-1.5 text-2xs text-slate-700 break-all font-mono">
                {resultMeshPath}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
