import React from 'react';

export function Sidebar() {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4 text-slate-200">Simulation Runs</h2>
      {/* List will go here */}
      <div className="text-sm text-slate-400">Loading runs...</div>
    </div>
  );
}
