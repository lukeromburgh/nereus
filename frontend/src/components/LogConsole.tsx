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
      color: "text-nereus-accent",
      bg: "bg-[rgba(0,212,255,0.08)]",
      border: "border-[rgba(0,212,255,0.2)]",
      label: "COMPLETED",
    },
    FAILED: {
      color: "text-nereus-orange",
      bg: "bg-[rgba(255,107,53,0.08)]",
      border: "border-[rgba(255,107,53,0.2)]",
      label: "FAILED",
    },
    RUNNING: {
      color: "text-nereus-accent",
      bg: "bg-[rgba(0,212,255,0.08)]",
      border: "border-[rgba(0,212,255,0.2)]",
      label: "RUNNING",
    },
    MESHING: {
      color: "text-nereus-accent",
      bg: "bg-[rgba(0,212,255,0.08)]",
      border: "border-[rgba(0,212,255,0.2)]",
      label: "MESHING",
    },
    PENDING: {
      color: "text-[rgba(255,255,255,0.45)]",
      bg: "bg-[rgba(255,255,255,0.04)]",
      border: "border-[rgba(255,255,255,0.1)]",
      label: "PENDING",
    },
  } as Record<
    string,
    { color: string; bg: string; border: string; label: string }
  >;

  const sc = statusConfig[status] || {
    color: "text-[rgba(255,255,255,0.35)]",
    bg: "bg-[rgba(255,255,255,0.04)]",
    border: "border-[rgba(255,255,255,0.08)]",
    label: status,
  };

  return (
    <div className="h-full flex flex-col p-2.5 font-mono text-[11px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-[14px] w-[14px] text-[rgba(255,255,255,0.35)]" />
          <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Solver Output</span>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border ${sc.bg} ${sc.color} ${sc.border}`}
          style={{ borderRadius: '2px' }}
        >
          <Circle
            className={`h-1.5 w-1.5 fill-current ${status === "RUNNING" || status === "MESHING" ? "animate-pulse" : ""}`}
          />
          {sc.label}
        </span>
      </div>

      {/* Content area */}
      <div className="flex-1 flex gap-2 overflow-hidden">
        {/* Log stream */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.3)] p-2 whitespace-pre-wrap text-[11px] leading-relaxed text-nereus-accent/80 scrollbar-dark"
          style={{ borderRadius: '2px' }}
        >
          {logs || "Waiting for simulation to start..."}
        </div>

        {/* Metrics sidebar */}
        <div className="w-[300px] shrink-0 flex flex-col gap-1.5 overflow-y-auto scrollbar-dark">
          {/* Residual plot */}
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-2 flex-1" style={{ borderRadius: '2px' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Residuals</span>
              <div className="flex items-center gap-3 text-[10px] text-[rgba(255,255,255,0.35)]">
                <span className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5"
                    style={{ backgroundColor: RESIDUAL_COLORS.p, borderRadius: '1px' }}
                  />
                  p
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5"
                    style={{ backgroundColor: RESIDUAL_COLORS.Ux, borderRadius: '1px' }}
                  />
                  Ux
                </span>
              </div>
            </div>
            {pSeries.length + uxSeries.length < 4 ? (
              <div className="flex items-center justify-center h-20 text-[10px] text-[rgba(255,255,255,0.2)]">
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
                    stroke="rgba(255,255,255,0.04)"
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
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-2" style={{ borderRadius: '2px' }}>
            <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Result</span>
            {resultUrl ? (
              <a
                href={resultUrl}
                className="mt-1.5 flex items-center justify-center gap-1.5 w-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] px-2.5 h-7 text-[11px] font-medium text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)] transition-all duration-200"
                style={{ borderRadius: '2px' }}
                download
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-[14px] w-[14px]" />
                Download Mesh
              </a>
            ) : (
              <div className="mt-1 text-[10px] text-[rgba(255,255,255,0.2)]">
                No result mesh yet
              </div>
            )}
            {resultMeshPath && (
              <div className="mt-1 text-[10px] text-[rgba(255,255,255,0.15)] break-all font-mono">
                {resultMeshPath}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
