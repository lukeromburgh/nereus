import { useEffect, useState } from 'react';
import axios from 'axios';
import { Sidebar } from './components/Sidebar';
import { TopNavbar } from './components/TopNavbar';
import { Viewport } from './components/Viewport';
import { ConfigPanel } from './components/ConfigPanel';
import { LogConsole } from './components/LogConsole';
import { AnalysisPanel } from './components/AnalysisPanel';
import { useSimStore } from './store/useSimStore';

export default function App() {
  const { activeSimId, status, updateSim, setAnalysisData, clearAnalysis } = useSimStore();
  const [refreshNonce, setRefreshNonce] = useState(0);

  // The Observer: Polling Hook natively integrated into the Layout
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (activeSimId && (status === 'PENDING' || status === 'RUNNING' || status === 'MESHING')) {
      interval = setInterval(async () => {
        try {
          const { data } = await axios.get(`http://localhost:8000/api/runs/${activeSimId}/`);
          updateSim(data);
          
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
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
      if (status !== 'COMPLETED') {
        clearAnalysis();
        return;
      }

      try {
        const { data } = await axios.get(`http://localhost:8000/api/runs/${activeSimId}/analysis/`);
        if (!cancelled) setAnalysisData(data);
      } catch (err) {
        console.error('Failed to load analysis payload', err);
        if (!cancelled) clearAnalysis();
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeSimId, status, setAnalysisData, clearAnalysis]);

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-mono flex-col">
      <header>
        <TopNavbar onRefresh={() => setRefreshNonce((n) => n + 1)} />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 1. Left Sidebar: Assets + Run History */}
        <aside className="w-72 border-r border-slate-800 bg-slate-900/40 overflow-y-auto">
          <Sidebar refreshNonce={refreshNonce} />
        </aside>

        {/* 2. Center: The 3D Physics Engine */}
        <main className="flex-1 relative flex flex-col">
          <div className="flex-1 bg-black">
            <Viewport />
          </div>

          {/* Bottom: The Log Stream we built in Django */}
          <div className="h-56 border-t border-slate-800 bg-black/80">
            <LogConsole />
          </div>
        </main>

        {/* 3. Right: Simulation Controls */}
        <aside className="w-80 border-l border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
          {status === 'COMPLETED' ? <AnalysisPanel /> : <ConfigPanel />}
        </aside>
      </div>
    </div>
  );
}
