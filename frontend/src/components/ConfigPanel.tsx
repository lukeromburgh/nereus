import axios from 'axios';
import { useSimStore } from '../store/useSimStore';

export function ConfigPanel() {
  const {
    velocity,
    aoa,
    waterDensity,
    meshDensity,
    sliceAxis,
    setVelocity,
    setAoA,
    setWaterDensity,
    setMeshDensity,
    setSliceAxis,
    startNewSim,
    status,
    projectId,
    selectedAssetId,
  } = useSimStore();

  const handleRunSimulation = async () => {
    // Basic defaults mapping to the Django ViewSet definitions
    const payload: Record<string, unknown> = {
      velocity: velocity,
      angle_of_attack: aoa,
      water_density: waterDensity,
      mesh_density: meshDensity,
      slice_axis: sliceAxis,
      mass: 100.0,
      payload_weight: 50.0,
      center_of_gravity: [0, 0, 0],
      project: projectId, // MVP Assumption: Project ID 1 exists
      wave_height: 0.0 // Added to satisfy model requirement
    };

    if (selectedAssetId) {
      payload.asset = selectedAssetId;
    }

    try {
      const response = await axios.post('http://localhost:8000/api/runs/', payload);
      startNewSim(response.data.id);
    } catch (error) {
      console.error("Failed to launch simulation", error);
      // Fallback/UI error notification could go here
    }
  };

  const isRunning = status === 'PENDING' || status === 'MESHING' || status === 'RUNNING';
  const canRun = !!selectedAssetId && !isRunning;

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

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-semibold text-slate-400">Water Density (kg/m³)</label>
          <span className="text-xs text-blue-400 font-mono">{waterDensity}</span>
        </div>
        <input
          type="range"
          min="900"
          max="1200"
          step="5"
          value={waterDensity}
          onChange={(e) => setWaterDensity(Number(e.target.value))}
          disabled={isRunning}
          className="w-full"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-semibold text-slate-400">Mesh Density</label>
          <span className="text-xs text-blue-400 font-mono">{meshDensity.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.05"
          value={meshDensity}
          onChange={(e) => setMeshDensity(Number(e.target.value))}
          disabled={isRunning}
          className="w-full"
        />
        <div className="text-xs text-slate-500">
          Higher values refine the base mesh (capped).
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-semibold text-slate-400">Slice Axis</label>
          <span className="text-xs text-blue-400 font-mono">{sliceAxis.toUpperCase()}</span>
        </div>
        <select
          value={sliceAxis}
          onChange={(e) => setSliceAxis(e.target.value as 'x' | 'y' | 'z')}
          disabled={isRunning}
          className="w-full rounded border border-slate-700 bg-black/30 px-2 py-2 text-slate-100"
        >
          <option value="x">X</option>
          <option value="y">Y</option>
          <option value="z">Z</option>
        </select>
        <div className="text-xs text-slate-500">Axis-aligned slice normal (X/Y/Z).</div>
      </div>

      <button 
        onClick={handleRunSimulation}
        disabled={!canRun}
        className={`mt-4 font-bold py-2 px-4 rounded transition-colors ${
          !canRun 
            ? 'bg-slate-600 text-slate-400 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}>
        {isRunning ? 'Calculating...' : selectedAssetId ? 'Run Simulation' : 'Upload an Asset to Run'}
      </button>
    </div>
  );
}
