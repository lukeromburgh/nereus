import React, { useEffect } from 'react';
import axios from 'axios';
import { Sidebar } from './components/Sidebar';
import { Viewport } from './components/Viewport';
import { ConfigPanel } from './components/ConfigPanel';
import { LogConsole } from './components/LogConsole';
import { useSimStore } from './store/useSimStore';

export default function App() {
  const { activeSimId, status, updateSim } = useSimStore();

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

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-slate-100 overflow-hidden font-mono">

      {/* 1. Left Sidebar: Run History */}
      <aside className="w-64 border-r border-slate-700 bg-slate-800/50">
        <Sidebar />
      </aside>

      {/* 2. Center: The 3D Physics Engine */}
      <main className="flex-1 relative flex flex-col">
        <div className="flex-1 bg-black">
          <Viewport />
        </div>
        
        {/* Bottom: The Log Stream we built in Django */}
        <div className="h-48 border-t border-slate-700 bg-black/80">
          <LogConsole />
        </div>
      </main>

      {/* 3. Right: Simulation Controls */}
      <aside className="w-80 border-l border-slate-700 bg-slate-800/50 p-4">
        <ConfigPanel />
      </aside>
    </div>
  );
}
