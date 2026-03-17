import React from 'react';
import axios from 'axios';
import { useSimStore } from '../store/useSimStore';

export function ConfigPanel() {
  const { velocity, aoa, setVelocity, setAoA, startNewSim, status } = useSimStore();

  const handleRunSimulation = async () => {
    // Basic defaults mapping to the Django ViewSet definitions
    const payload = {
      velocity: velocity,
      angle_of_attack: aoa,
      mass: 100.0,
      payload_weight: 50.0,
      center_of_gravity: [0, 0, 0],
      project: 1, // MVP Assumption: Project ID 1 exists
      wave_height: 0.0 // Added to satisfy model requirement
    };

    try {
      const response = await axios.post('http://localhost:8000/api/runs/', payload);
      startNewSim(response.data.id);
    } catch (error) {
      console.error("Failed to launch simulation", error);
      // Fallback/UI error notification could go here
    }
  };

  const isRunning = status === 'PENDING' || status === 'MESHING' || status === 'RUNNING';

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-slate-200">Configuration</h2>
      
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-slate-400">Velocity (m/s)</label>
            <span className="text-xs text-blue-400 font-mono">{velocity}</span>
        </div>
        <input 
          type="range" min="1" max="50" 
          value={velocity}
          onChange={(e) => setVelocity(Number(e.target.value))}
          disabled={isRunning}
          className="w-full" 
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-slate-400">Angle of Attack (°)</label>
            <span className="text-xs text-blue-400 font-mono">{aoa}</span>
        </div>
        <input 
          type="range" min="-15" max="15" 
          value={aoa}
          onChange={(e) => setAoA(Number(e.target.value))}
          disabled={isRunning}
          className="w-full" 
        />
      </div>

      <button 
        onClick={handleRunSimulation}
        disabled={isRunning}
        className={`mt-4 font-bold py-2 px-4 rounded transition-colors ${
          isRunning 
            ? 'bg-slate-600 text-slate-400 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}>
        {isRunning ? 'Calculating...' : 'Run Simulation'}
      </button>
    </div>
  );
}
