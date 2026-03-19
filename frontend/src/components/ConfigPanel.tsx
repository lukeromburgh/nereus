import axios from "axios";
import { motion } from "framer-motion";
import { Settings, Zap, ChevronDown } from "lucide-react";
import { useSimStore } from "../store/useSimStore";
import { OrientationPanel } from "./OrientationPanel";
import { OrientationWarningBanner } from "./OrientationWarningBanner";

function SliderControl({
  label,
  value,
  display,
  min,
  max,
  step,
  disabled,
  unit,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  display?: string;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  unit?: string;
  onChange: (val: number) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-slate-400 font-sans">
          {label}
        </label>
        <div className="flex items-baseline gap-1">
          <span className="text-xs font-semibold text-accent-glow font-mono tabular-nums">
            {display ?? value}
          </span>
          {unit && <span className="text-2xs text-slate-600">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="slider-aerospace"
      />
      {hint && <div className="text-2xs text-slate-600">{hint}</div>}
    </div>
  );
}

export function ConfigPanel() {
  const {
    velocity,
    aoa,
    waterDensity,
    meshDensity,
    sliceAxis,
    submersionDepth,
    mass,
    payloadWeight,
    centerOfGravity,
    pitch,
    roll,
    yaw,
    setVelocity,
    setAoA,
    setWaterDensity,
    setMeshDensity,
    setSliceAxis,
    setSubmersionDepth,
    setMass,
    setPayloadWeight,
    setCenterOfGravity,
    startNewSim,
    status,
    projectId,
    selectedAssetId,
  } = useSimStore();

  const handleRunSimulation = async () => {
    const payload: Record<string, unknown> = {
      velocity: velocity,
      angle_of_attack: aoa,
      water_density: waterDensity,
      mesh_density: meshDensity,
      slice_axis: sliceAxis,
      submersion_depth: submersionDepth,
      mass: mass,
      payload_weight: payloadWeight,
      center_of_gravity: centerOfGravity,
      pitch: pitch,
      roll: roll,
      yaw: yaw,
      project: projectId,
      wave_height: 0.0,
    };

    if (selectedAssetId) {
      payload.asset = selectedAssetId;
    }

    try {
      const response = await axios.post(
        "http://localhost:8000/api/runs/",
        payload,
      );
      startNewSim(response.data.id);
    } catch (error) {
      console.error("Failed to launch simulation", error);
    }
  };

  const isRunning =
    status === "PENDING" || status === "MESHING" || status === "RUNNING";
  const canRun = !!selectedAssetId && !isRunning;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col gap-4"
    >
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-accent-cyan" />
        <h2 className="text-sm font-semibold text-slate-200 font-sans tracking-wide uppercase">
          Configuration
        </h2>
      </div>

      {/* Parameters */}
      <div className="glass-panel rounded-lg p-3 flex flex-col gap-4">
        <span className="hud-label">Flow Parameters</span>

        <SliderControl
          label="Velocity"
          value={velocity}
          min={1}
          max={50}
          disabled={isRunning}
          unit="m/s"
          onChange={setVelocity}
        />

        <SliderControl
          label="Angle of Attack"
          value={aoa}
          min={-15}
          max={15}
          disabled={isRunning}
          unit="°"
          onChange={setAoA}
        />

        <SliderControl
          label="Water Density"
          value={waterDensity}
          min={900}
          max={1200}
          step={5}
          disabled={isRunning}
          unit="kg/m³"
          onChange={setWaterDensity}
        />

        <SliderControl
          label="Submersion Depth"
          value={submersionDepth}
          display={submersionDepth.toFixed(2)}
          min={0}
          max={5}
          step={0.05}
          disabled={isRunning}
          unit="m"
          onChange={setSubmersionDepth}
          hint="Depth of foil center below surface"
        />
      </div>

      <div className="glass-panel rounded-lg p-3 flex flex-col gap-4">
        <span className="hud-label">Vehicle Config</span>

        <SliderControl
          label="Vehicle Mass"
          value={mass}
          min={10}
          max={5000}
          step={10}
          disabled={isRunning}
          unit="kg"
          onChange={setMass}
        />

        <SliderControl
          label="Payload Weight"
          value={payloadWeight}
          min={0}
          max={2000}
          step={5}
          disabled={isRunning}
          unit="kg"
          onChange={setPayloadWeight}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400 font-sans">
            Center of Gravity (x, y, z)
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <div key={axis} className="flex flex-col gap-0.5">
                <span className="text-2xs text-slate-600 text-center">
                  {axis}
                </span>
                <input
                  type="number"
                  step={0.01}
                  value={centerOfGravity[i]}
                  onChange={(e) => {
                    const next = [...centerOfGravity] as [
                      number,
                      number,
                      number,
                    ];
                    next[i] = Number(e.target.value);
                    setCenterOfGravity(next);
                  }}
                  disabled={isRunning}
                  className="w-full rounded-md border border-hud-border bg-white/[0.03] px-2 py-1.5 text-xs text-slate-200 font-mono text-center focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-colors"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-lg p-3 flex flex-col gap-4">
        <span className="hud-label">Mesh Settings</span>

        <SliderControl
          label="Mesh Density"
          value={meshDensity}
          display={`${meshDensity.toFixed(2)}×`}
          min={0.5}
          max={2.0}
          step={0.05}
          disabled={isRunning}
          onChange={setMeshDensity}
          hint="Higher values refine the base mesh"
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-xs font-medium text-slate-400 font-sans">
              Slice Axis
            </label>
            <span className="text-xs font-semibold text-accent-glow font-mono">
              {sliceAxis.toUpperCase()}
            </span>
          </div>
          <div className="relative">
            <select
              value={sliceAxis}
              onChange={(e) => setSliceAxis(e.target.value as "x" | "y" | "z")}
              disabled={isRunning}
              className="w-full appearance-none rounded-md border border-hud-border bg-white/[0.03] px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-colors"
            >
              <option value="x">X-Axis</option>
              <option value="y">Y-Axis</option>
              <option value="z">Z-Axis</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          </div>
        </div>
      </div>

      {/* Orientation correction */}
      <OrientationPanel />

      {/* Warning banner */}
      <OrientationWarningBanner />

      {/* Run button */}
      <button
        onClick={handleRunSimulation}
        disabled={!canRun}
        className={`group relative overflow-hidden rounded-lg py-2.5 px-4 text-sm font-semibold font-sans transition-all duration-300 ${
          !canRun
            ? "bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-700/30"
            : "bg-accent text-white hover:bg-blue-500 border border-accent/50 hover:shadow-glow-blue"
        }`}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          <Zap className={`h-4 w-4 ${isRunning ? "animate-pulse" : ""}`} />
          {isRunning
            ? "Computing…"
            : selectedAssetId
              ? "Run Simulation"
              : "Select an Asset"}
        </span>
      </button>
    </motion.div>
  );
}
