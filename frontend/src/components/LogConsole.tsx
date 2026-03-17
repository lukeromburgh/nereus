import React from 'react';
import { useSimStore } from '../store/useSimStore';

export function LogConsole() {
  const logs = useSimStore((state) => state.logs);
  const status = useSimStore((state) => state.status);

  return (
    <div className="h-full flex flex-col p-4 font-mono text-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="text-slate-400 font-bold uppercase tracking-wider">Console Output</span>
        <span className={`px-2 py-1 rounded text-xs font-bold ${
          status === 'COMPLETED' ? 'bg-green-900/50 text-green-400' :
          status === 'FAILED' ? 'bg-red-900/50 text-red-400' :
          status === 'RUNNING' ? 'bg-blue-900/50 text-blue-400' :
          'bg-slate-800 text-slate-400'
        }`}>
          {status}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto bg-black rounded border border-slate-800 p-2 whitespace-pre-wrap text-green-500">
        {logs || "Waiting for simulation to start..."}
      </div>
    </div>
  );
}
