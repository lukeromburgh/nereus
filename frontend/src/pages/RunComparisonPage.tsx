import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { useSimStore } from "../store/useSimStore";
import { VtkViewport } from "../components/VtkViewport-DEPRECATED";
import { ColorbarLegend } from "../components/ColorbarLegend";
import { MetricHUD } from "../components/MetricHUD";
import { useToolbar } from "../hooks/useToolbar";

// ─── Types ────────────────────────────────────────────────────────────────────

type SimulationRun = {
  id: number;
  project: number;
  asset: number | null;
  status: string;
  created_at: string;
};

type RunMetrics = {
  ldSeries: number[];
  fySeries: number[]; // lift
  fxSeries: number[]; // drag
};

// ─── Metric Utilities ─────────────────────────────────────────────────────────

function getPeak(arr: number[]): number {
  return arr.length ? Math.max(...arr) : 0;
}

function getMean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function getStallFrame(ldArr: number[]): number {
  if (!ldArr.length) return 0;
  const max = getPeak(ldArr);
  for (let i = 0; i < ldArr.length; i++) {
    if (ldArr[i] < max * 0.8) return i;
  }
  return ldArr.length - 1;
}

function getDelta(a: number, b: number): number {
  return b - a;
}

function getPercentChange(a: number, b: number): number {
  if (a === 0) return 0;
  return ((b - a) / Math.abs(a)) * 100;
}

function formatDelta(val: number, isBetter: boolean) {
  const color = isBetter ? "text-[#bef500]" : "text-[#ff4d4d]";
  const sign = val > 0 ? "+" : "";
  return <span className={color}>{sign + val.toFixed(3)}</span>;
}

function formatPercent(val: number, isBetter: boolean) {
  const color = isBetter ? "text-[#bef500]" : "text-[#ff4d4d]";
  const sign = val > 0 ? "+" : "";
  return <span className={color}>{sign + val.toFixed(1)}%</span>;
}

function getSynthesisNote(a: RunMetrics, b: RunMetrics): string {
  const ldImproved = getMean(b.ldSeries) > getMean(a.ldSeries);
  const liftImproved = getPeak(b.fySeries) > getPeak(a.fySeries);
  const dragReduced = getPeak(b.fxSeries) < getPeak(a.fxSeries);

  const ldDelta = (getMean(b.ldSeries) - getMean(a.ldSeries)).toFixed(2);
  const winner = ldImproved ? "Run B" : "Run A";

  const parts = [
    `${winner} shows superior overall performance with a mean L/D delta of ${ldImproved ? "+" : ""}${ldDelta}.`,
    liftImproved
      ? "Peak lift is higher in Run B, indicating improved foil loading."
      : "Peak lift is higher in Run A — Run B trades lift for reduced drag.",
    dragReduced
      ? "Drag coefficient is reduced in Run B, consistent with the L/D gain."
      : "Drag is higher in Run B; further geometry refinement is recommended.",
  ];

  return parts.join(" ");
}

// ─── SVG Chart Path ───────────────────────────────────────────────────────────

function getLinePath(
  series: number[],
  color: string,
  width = 520,
  height = 220,
  allValues: number[],
) {
  if (!series.length) return null;
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 1);
  const padX = 24;
  const padY = 24;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  // Only use the correct calculation for y (no padH)
  const pts = series.map((v, i) => {
    const x = padX + (i / Math.max(series.length - 1, 1)) * plotW;
    const y = height - padY - ((v - minVal) / (maxVal - minVal || 1)) * plotH;
    return `${x},${y}`;
  });

  return (
    <polyline
      points={pts.join(" ")}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity={0.9}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const RunComparisonPage: React.FC = () => {
  const { projectId } = useSimStore();
  const { setToolbarContent } = useToolbar();

  // Run selection
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [runAId, setRunAId] = useState<number | null>(null);
  const [runBId, setRunBId] = useState<number | null>(null);
  const [compared, setCompared] = useState(false);

  // Metrics per run (derived from frame_mapping)
  const [metricsA, setMetricsA] = useState<RunMetrics | null>(null);
  const [metricsB, setMetricsB] = useState<RunMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  // Chart hover
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);

  // Load all completed runs for dropdowns
  useEffect(() => {
    axios
      .get<SimulationRun[]>("http://localhost:8000/api/runs/")
      .then(({ data }) => {
        const completed = data
          .filter((r) => r.project === projectId && r.status === "COMPLETED")
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setRuns(completed);
      })
      .catch((err) => console.error("Failed to load runs", err));
  }, [projectId]);

  // Extract metrics series from a run payload
  const extractMetrics = (data: any): RunMetrics => {
    const frames: any[] = data.frame_mapping ?? [];
    return {
      ldSeries: frames.map((f) => f.metrics?.ld_ratio ?? 0),
      fySeries: frames.map((f) => f.metrics?.Fy ?? 0),
      fxSeries: frames.map((f) => f.metrics?.Fx ?? 0),
    };
  };

  const handleCompare = useCallback(async () => {
    if (!runAId || !runBId) return;
    setLoading(true);
    setCompared(false);
    try {
      const [{ data: dataA }, { data: dataB }] = await Promise.all([
        axios.get(`http://localhost:8000/api/runs/${runAId}/`),
        axios.get(`http://localhost:8000/api/runs/${runBId}/`),
      ]);
      setMetricsA(extractMetrics(dataA));
      setMetricsB(extractMetrics(dataB));
      setCompared(true);
    } catch (err) {
      console.error("Failed to load comparison data", err);
    } finally {
      setLoading(false);
    }
  }, [runAId, runBId]);

  // Derived chart data
  const ldA = metricsA?.ldSeries ?? [];
  const ldB = metricsB?.ldSeries ?? [];
  const allLd = [...ldA, ...ldB];
  const maxFrames = Math.max(ldA.length, ldB.length, 1);

  const runA = runs.find((r) => r.id === runAId) ?? null;
  const runB = runs.find((r) => r.id === runBId) ?? null;

  // Delta table rows
  const tableRows = useMemo(() => {
    if (!metricsA || !metricsB) return [];

    const peakLyA = getPeak(metricsA.fySeries);
    const peakLyB = getPeak(metricsB.fySeries);
    const peakDragA = getPeak(metricsA.fxSeries);
    const peakDragB = getPeak(metricsB.fxSeries);
    const meanLdA = getMean(metricsA.ldSeries);
    const meanLdB = getMean(metricsB.ldSeries);
    const peakLdA = getPeak(metricsA.ldSeries);
    const peakLdB = getPeak(metricsB.ldSeries);
    const stallA = getStallFrame(metricsA.ldSeries);
    const stallB = getStallFrame(metricsB.ldSeries);

    return [
      {
        label: "Peak Lift (Fy)",
        a: peakLyA.toFixed(3),
        b: peakLyB.toFixed(3),
        delta: getDelta(peakLyA, peakLyB),
        pct: getPercentChange(peakLyA, peakLyB),
        higherIsBetter: true,
        better: peakLyB > peakLyA,
      },
      {
        label: "Peak Drag (Fx)",
        a: peakDragA.toFixed(3),
        b: peakDragB.toFixed(3),
        delta: getDelta(peakDragA, peakDragB),
        pct: getPercentChange(peakDragA, peakDragB),
        higherIsBetter: false,
        better: peakDragB < peakDragA,
      },
      {
        label: "L/D Max",
        a: peakLdA.toFixed(3),
        b: peakLdB.toFixed(3),
        delta: getDelta(peakLdA, peakLdB),
        pct: getPercentChange(peakLdA, peakLdB),
        higherIsBetter: true,
        better: peakLdB > peakLdA,
      },
      {
        label: "L/D Mean",
        a: meanLdA.toFixed(3),
        b: meanLdB.toFixed(3),
        delta: getDelta(meanLdA, meanLdB),
        pct: getPercentChange(meanLdA, meanLdB),
        higherIsBetter: true,
        better: meanLdB > meanLdA,
      },
      {
        label: "Stall Frame",
        a: String(stallA),
        b: String(stallB),
        delta: getDelta(stallA, stallB),
        pct: getPercentChange(stallA, stallB),
        higherIsBetter: true,
        better: stallB > stallA,
      },
    ];
  }, [metricsA, metricsB]);

  const canCompare = runAId !== null && runBId !== null && runAId !== runBId;

  // ── Inject comparison-specific toolbar ────────────────────────────────────
  useEffect(() => {
    setToolbarContent(
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="hud-label text-accent-cyan text-2xs">RUN A</span>
          <select
            value={runAId ?? ""}
            onChange={(e) => setRunAId(Number(e.target.value) || null)}
            className="bg-[#181f22] border border-hud-border text-slate-300 rounded-md px-2 py-1 text-xs w-48 focus:outline-none focus:border-accent-cyan transition-colors appearance-none"
          >
            <option value="">Select Run</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} — {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-label text-accent-emerald text-2xs">RUN B</span>
          <select
            value={runBId ?? ""}
            onChange={(e) => setRunBId(Number(e.target.value) || null)}
            className="bg-[#181f22] border border-hud-border text-slate-300 rounded-md px-2 py-1 text-xs w-48 focus:outline-none focus:border-accent-emerald transition-colors appearance-none"
          >
            <option value="">Select Run</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} — {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCompare}
          disabled={!canCompare || loading}
          className={`px-4 py-1 text-xs font-bold rounded-md transition-all duration-200 uppercase tracking-widest ${
            canCompare && !loading
              ? "bg-accent-cyan text-[#0d1518] hover:opacity-90 border border-accent-cyan"
              : "bg-[#181f22] border border-hud-border text-slate-600 cursor-not-allowed"
          }`}
        >
          {loading ? "Loading…" : "Compare"}
        </button>
      </div>
    );
    return () => setToolbarContent(null);
  }, [setToolbarContent, runs, runAId, runBId, canCompare, loading, handleCompare]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0d1518] text-slate-300 overflow-y-auto">
      <main className="flex-1 px-8 py-6 max-w-screen-2xl mx-auto w-full">

        {/* ── Section 02: L/D CHART + SYNTHESIS ───────────────────────────── */}
        <div className="grid grid-cols-12 gap-6 mb-8">
          <div className="col-span-8 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="hud-label text-accent-cyan">
                Lift-to-Drag Ratio (L/D) over Frames
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-px bg-[#c3f5ff]" />
                  <span className="text-2xs text-slate-500 font-mono">
                    Run A #{runAId ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-px bg-[#bef500]" />
                  <span className="text-2xs text-slate-500 font-mono">
                    Run B #{runBId ?? "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative bg-accent/5 border border-hud-border rounded-md h-[240px] w-full overflow-hidden">
              {!compared ? (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                  Select two runs and click Compare to plot
                </div>
              ) : (
                <>
                  {/* Grid lines */}
                  <svg
                    className="absolute inset-0 w-full h-full"
                    preserveAspectRatio="none"
                  >
                    {[0.25, 0.5, 0.75].map((t) => (
                      <line
                        key={t}
                        x1="0"
                        y1={`${t * 100}%`}
                        x2="100%"
                        y2={`${t * 100}%`}
                        stroke="#3b494c"
                        strokeWidth="1"
                        strokeDasharray="4,4"
                        opacity="0.3"
                      />
                    ))}
                  </svg>

                  {/* Data lines */}
                  <svg
                    width={520}
                    height={220}
                    className="absolute left-0 top-0"
                  >
                    {getLinePath(ldA, "#c3f5ff", 520, 220, allLd)}
                    {getLinePath(ldB, "#bef500", 520, 220, allLd)}

                    {/* Hover dots */}
                    {hoverFrame !== null &&
                      (() => {
                        const minVal = Math.min(...allLd, 0);
                        const maxVal = Math.max(...allLd, 1);
                        const px =
                          24 +
                          (hoverFrame / Math.max(maxFrames - 1, 1)) *
                            (520 - 48);
                        const pyA =
                          220 -
                          24 -
                          (((ldA[hoverFrame] ?? 0) - minVal) /
                            (maxVal - minVal || 1)) *
                            (220 - 48);
                        const pyB =
                          220 -
                          24 -
                          (((ldB[hoverFrame] ?? 0) - minVal) /
                            (maxVal - minVal || 1)) *
                            (220 - 48);
                        return (
                          <g>
                            {ldA[hoverFrame] !== undefined && (
                              <circle
                                cx={px}
                                cy={pyA}
                                r={5}
                                fill="#c3f5ff"
                                stroke="#10151a"
                                strokeWidth={2}
                              />
                            )}
                            {ldB[hoverFrame] !== undefined && (
                              <circle
                                cx={px}
                                cy={pyB}
                                r={5}
                                fill="#bef500"
                                stroke="#10151a"
                                strokeWidth={2}
                              />
                            )}
                            <line
                              x1={px}
                              y1={24}
                              x2={px}
                              y2={196}
                              stroke="#3b494c"
                              strokeWidth={1}
                              strokeDasharray="3,3"
                            />
                          </g>
                        );
                      })()}
                  </svg>

                  {/* Scrub overlay */}
                  <div
                    className="absolute inset-0"
                    onMouseMove={(e) => {
                      const rect = (
                        e.currentTarget as HTMLDivElement
                      ).getBoundingClientRect();
                      const x = e.clientX - rect.left - 24;
                      const frame = Math.round(
                        (x / (520 - 48)) * (maxFrames - 1),
                      );
                      setHoverFrame(
                        frame >= 0 && frame < maxFrames ? frame : null,
                      );
                    }}
                    onMouseLeave={() => setHoverFrame(null)}
                  />

                  {/* Tooltip */}
                  {hoverFrame !== null &&
                    (ldA[hoverFrame] !== undefined ||
                      ldB[hoverFrame] !== undefined) && (
                      <div
                        className="absolute top-2 bg-surface-container border border-hud-border rounded-md px-3 py-2 text-xs pointer-events-none z-10"
                        style={{
                          left: Math.min(
                            24 +
                              (hoverFrame / Math.max(maxFrames - 1, 1)) *
                                (520 - 48) -
                              50,
                            440,
                          ),
                        }}
                      >
                        <div className="hud-label text-slate-500 mb-1">
                          Frame {hoverFrame + 1}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span>
                            A:{" "}
                            <span className="font-mono text-[#c3f5ff]">
                              {ldA[hoverFrame]?.toFixed(3) ?? "—"}
                            </span>
                          </span>
                          <span>
                            B:{" "}
                            <span className="font-mono text-[#bef500]">
                              {ldB[hoverFrame]?.toFixed(3) ?? "—"}
                            </span>
                          </span>
                          {ldA[hoverFrame] !== undefined &&
                            ldB[hoverFrame] !== undefined && (
                              <span>
                                Δ:{" "}
                                <span
                                  className={`font-mono ${
                                    ldB[hoverFrame] > ldA[hoverFrame]
                                      ? "text-[#bef500]"
                                      : "text-[#ff4d4d]"
                                  }`}
                                >
                                  {(ldB[hoverFrame] - ldA[hoverFrame] > 0
                                    ? "+"
                                    : "") +
                                    (ldB[hoverFrame] - ldA[hoverFrame]).toFixed(
                                      3,
                                    )}
                                </span>
                              </span>
                            )}
                        </div>
                      </div>
                    )}

                  {/* X axis labels */}
                  <div className="absolute bottom-1 left-6 right-6 flex justify-between">
                    <span className="text-2xs font-mono text-slate-600">0</span>
                    <span className="text-2xs font-mono text-slate-600">
                      {maxFrames}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Synthesis card */}
          <div className="col-span-4">
            <div className="bg-accent/5 border border-hud-border rounded-md p-5 h-full flex flex-col gap-3">
              <div className="hud-label text-accent-emerald border-l-2 border-accent-emerald pl-2">
                Model Synthesis
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {compared && metricsA && metricsB
                  ? getSynthesisNote(metricsA, metricsB)
                  : "Select two runs and compare to see summary."}
              </p>
              {compared && metricsA && metricsB && (
                <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-hud-border">
                  <div className="flex justify-between items-center">
                    <span className="text-2xs text-slate-600 uppercase font-bold tracking-widest">
                      Mean L/D — A
                    </span>
                    <span className="font-mono text-xs text-[#c3f5ff]">
                      {getMean(ldA).toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xs text-slate-600 uppercase font-bold tracking-widest">
                      Mean L/D — B
                    </span>
                    <span className="font-mono text-xs text-[#bef500]">
                      {getMean(ldB).toFixed(3)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="h-px bg-hud-border mb-8" />

        {/* ── Section 03: DELTA METRICS TABLE ─────────────────────────────── */}
        {compared && tableRows.length > 0 && (
          <>
            <div className="mb-4">
              <span className="hud-label text-accent-cyan">
                Comparative Metrics Matrix
              </span>
            </div>

            <div className="bg-accent/5 border border-hud-border rounded-md overflow-hidden mb-8">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-hud-border bg-surface-container">
                    <th className="text-left px-4 py-3 hud-label text-slate-500">
                      Metric
                    </th>
                    <th className="text-left px-4 py-3 hud-label text-[#c3f5ff]">
                      Run A #{runAId}
                    </th>
                    <th className="text-left px-4 py-3 hud-label text-[#bef500]">
                      Run B #{runBId}
                    </th>
                    <th className="text-left px-4 py-3 hud-label text-slate-500">
                      Δ
                    </th>
                    <th className="text-left px-4 py-3 hud-label text-slate-500">
                      % Change
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hud-border">
                  {tableRows.map((row) => (
                    <tr
                      key={row.label}
                      className="hover:bg-accent/5 transition-colors duration-150"
                    >
                      <td className="px-4 py-3 text-slate-400 truncate max-w-[160px]">
                        {row.label}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#c3f5ff]">
                        {row.a}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#bef500]">
                        {row.b}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {typeof row.delta === "number"
                          ? formatDelta(
                              row.delta,
                              row.higherIsBetter ? row.better : !row.better,
                            )
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {typeof row.pct === "number"
                          ? formatPercent(
                              row.pct,
                              row.higherIsBetter ? row.better : !row.better,
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="h-px bg-hud-border mb-8" />
          </>
        )}

        {/* ── Section 04: FRAME SYNC VIEWER ───────────────────────────────── */}
        {compared && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-6 flex flex-col gap-2">
              <span className="hud-label text-[#c3f5ff] border-l-2 border-[#c3f5ff] pl-2">
                Run A — #{runAId}
              </span>
              <div className="bg-accent/5 border border-hud-border rounded-md overflow-hidden">
                {runA && <VtkViewport />}
                <div className="flex items-center justify-between px-4 py-2 border-t border-hud-border">
                  <ColorbarLegend />
                  <MetricHUD />
                </div>
              </div>
            </div>

            <div className="col-span-6 flex flex-col gap-2">
              <span className="hud-label text-[#bef500] border-l-2 border-[#bef500] pl-2">
                Run B — #{runBId}
              </span>
              <div className="bg-accent/5 border border-hud-border rounded-md overflow-hidden">
                {runB && <VtkViewport />}
                <div className="flex items-center justify-between px-4 py-2 border-t border-hud-border">
                  <ColorbarLegend />
                  <MetricHUD />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default RunComparisonPage;
