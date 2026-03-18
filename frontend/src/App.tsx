import { useEffect, useState } from "react";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./components/Sidebar";
import { TopNavbar } from "./components/TopNavbar";
import { Viewport } from "./components/Viewport";
import { ConfigPanel } from "./components/ConfigPanel";
import { LogConsole } from "./components/LogConsole";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { useSimStore } from "./store/useSimStore";

export default function App() {
  const { activeSimId, status, updateSim, setAnalysisData, clearAnalysis } =
    useSimStore();
  const [refreshNonce, setRefreshNonce] = useState(0);

  // The Observer: Polling Hook natively integrated into the Layout
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (
      activeSimId &&
      (status === "PENDING" || status === "RUNNING" || status === "MESHING")
    ) {
      interval = setInterval(async () => {
        try {
          const { data } = await axios.get(
            `http://localhost:8000/api/runs/${activeSimId}/`,
          );
          updateSim(data);

          if (data.status === "COMPLETED" || data.status === "FAILED") {
            clearInterval(interval);
          }
        } catch (error) {
          console.error("Polling error fetching run:", error);
        }
      }, 2000);
    }

    // Cleanup loop
    return () => clearInterval(interval);
  }, [activeSimId, status, updateSim]);

  // Post-run analysis loader (Temporal Geometry Pipeline)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeSimId) {
        clearAnalysis();
        return;
      }

      // Only fetch analysis once the run is completed (or if it was already completed when selected).
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
    <div className="flex h-screen w-screen bg-surface text-slate-100 overflow-hidden font-sans flex-col">
      <header>
        <TopNavbar onRefresh={() => setRefreshNonce((n) => n + 1)} />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 1. Left Sidebar: Assets + Run History */}
        <aside className="w-64 border-r border-hud-border bg-surface-solid/60 backdrop-blur-md overflow-y-auto scrollbar-dark">
          <Sidebar refreshNonce={refreshNonce} />
        </aside>

        {/* 2. Center: The 3D Physics Engine */}
        <main className="flex-1 relative flex flex-col">
          <div className="flex-1 bg-black">
            <Viewport />
          </div>

          {/* Bottom: The Log Stream */}
          <div className="h-56 border-t border-hud-border bg-surface-solid/80 backdrop-blur-sm">
            <LogConsole />
          </div>
        </main>

        {/* 3. Right: Simulation Controls */}
        <aside className="w-80 border-l border-hud-border bg-surface-solid/60 backdrop-blur-md overflow-y-auto scrollbar-dark p-4">
          <AnimatePresence mode="wait">
            {status === "COMPLETED" ? (
              <motion.div
                key="analysis"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <AnalysisPanel />
              </motion.div>
            ) : (
              <motion.div
                key="config"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <ConfigPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}
