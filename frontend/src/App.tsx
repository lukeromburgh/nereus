import { useEffect, useState } from "react";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./components/Sidebar";
import { TopNavbar } from "./components/TopNavbar";
import { VtkViewport } from "./components/VTK/VtkViewport";
import { ConfigPanel } from "./components/ConfigPanel";
import { LogConsoleCompact } from "./components/VTK/LogConsoleCompact";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { ToastContainer } from "./components/ToastContainer";
import { useSimStore } from "./store/useSimStore";

export default function App() {
  const { activeSimId, status, updateSim, setAnalysisData, clearAnalysis } =
    useSimStore();
  const [refreshNonce, setRefreshNonce] = useState(0);

  // ── Observer: Polling Hook with exponential back-off (2 s → 60 s cap) ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const isActive =
      activeSimId &&
      (status === "PENDING" || status === "RUNNING" || status === "MESHING");

    if (!isActive) return;

    const INITIAL_MS = 2_000;
    const MAX_MS = 60_000;
    let delay = INITIAL_MS;

    async function poll() {
      if (cancelled) return;
      try {
        const { data } = await axios.get(
          `http://localhost:8000/api/runs/${activeSimId}/`,
        );
        if (cancelled) return;
        updateSim(data);

        // Terminal state — stop polling
        if (data.status === "COMPLETED" || data.status === "FAILED") return;
      } catch (error) {
        console.error("Polling error fetching run:", error);
      }

      // Schedule next poll with back-off
      delay = Math.min(delay * 1.5, MAX_MS);
      timer = setTimeout(poll, delay);
    }

    // First poll after the initial delay
    timer = setTimeout(poll, INITIAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeSimId, status, updateSim]);

  // ── Post-run analysis loader (Temporal Geometry Pipeline) ──────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeSimId) {
        clearAnalysis();
        return;
      }

      // Only fetch analysis once the run is completed (or if it was already
      // completed when selected).
      if (status !== "COMPLETED") {
        clearAnalysis();
        return;
      }

      try {
        const { data } = await axios.get(
          `http://localhost:8000/api/runs/${activeSimId}/analysis/`,
        );
        if (!cancelled) setAnalysisData(data);
      } catch (err) {
        console.error("Failed to load analysis payload", err);
        if (!cancelled) clearAnalysis();
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeSimId, status, setAnalysisData, clearAnalysis]);

  return (
    <div className="flex h-screen w-screen bg-[#0d1518] text-slate-100 overflow-hidden font-sans flex-col">
      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* Header Navigation                                                */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <header className="border-b border-hud-border">
        <TopNavbar onRefresh={() => setRefreshNonce((n) => n + 1)} />
      </header>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* Main Layout: 4-Column Grid                                       */}
      {/*                                                                   */}
      {/* Column 1: Sidebar (10%)                                          */}
      {/* Column 2: VTK Viewport (50%)                                     */}
      {/* Column 3: Config Panel (40%)                                     */}
      {/*                                                                   */}
      {/* Below viewport: Log Console (compact)                            */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ───────────────────────────────────────────────────────────── */}
        {/* Column 1: Left Sidebar (240px) — Compact Assets + Run History */}
        {/* ───────────────────────────────────────────────────────────── */}
        <aside className="w-60 border-r border-hud-border bg-slate-950/40 backdrop-blur-sm overflow-y-auto scrollbar-dark flex flex-col flex-shrink-0">
          <Sidebar refreshNonce={refreshNonce} />
        </aside>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* Column 2: Center (Flex 1) — VTK Viewport + MetricsHUD Overlay */}
        {/*           + Log Console Compact                                */}
        {/* ───────────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-h-0 bg-black/20">
          
          {/* VTK Viewport (Hero Element) */}
          <div className="flex-1 relative overflow-hidden min-h-0">
            <VtkViewport />
            
            {/* All overlays (MetricsHUD, StatusBadge, LayerManager, etc.)  */}
            {/* are rendered INSIDE VtkViewport component                   */}
          </div>

          {/* Compact Log Console at Bottom */}
          <div className="border-t border-hud-border bg-slate-950/60 backdrop-blur-sm h-56 flex-shrink-0">
            <LogConsoleCompact />
          </div>
        </main>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* Column 3: Right Panel (320px) — Config or Analysis             */}
        {/* ───────────────────────────────────────────────────────────── */}
        <aside className="w-80 border-l border-hud-border bg-slate-950/40 backdrop-blur-sm overflow-y-auto scrollbar-dark flex flex-col flex-shrink-0 p-4">
          <AnimatePresence mode="wait">
            {status === "COMPLETED" ? (
              <motion.div
                key="analysis"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex-1"
              >
                <AnalysisPanel />
              </motion.div>
            ) : (
              <motion.div
                key="config"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex-1"
              >
                <ConfigPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* Global Toast Notifications                                       */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <ToastContainer />
    </div>
  );
}