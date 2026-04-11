import axios from "axios";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Settings, Zap, Repeat } from "lucide-react";
import { toast } from "@/lib/toast";
import { useSimStore } from "../store/useSimStore";
import { ConfigSection } from "./ConfigSection";
import { FieldWithHint } from "./FieldWithHint";
import { SliderWithInput } from "./SliderWithInput";
import { OrientationPanel } from "./OrientationPanel";
import { OrientationWarningBanner } from "./OrientationWarningBanner";

/** Derived flow metrics computed from velocity, density, and a characteristic length */
function useDerivedMetrics(velocity: number, density: number) {
  return useMemo(() => {
    const KINEMATIC_VISCOSITY = 1.004e-6; // m²/s for water at ~20°C
    const GRAVITY = 9.81;
    const CHAR_LENGTH = 0.1; // characteristic chord length (m)

    const reynolds = (velocity * CHAR_LENGTH) / KINEMATIC_VISCOSITY;
    const froude = velocity / Math.sqrt(GRAVITY * CHAR_LENGTH);
    const dynamicPressure = 0.5 * density * velocity * velocity;

    return { reynolds, froude, dynamicPressure };
  }, [velocity, density]);
}

function formatSI(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(0);
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
      velocity,
      angle_of_attack: aoa,
      water_density: waterDensity,
      mesh_density: meshDensity,
      slice_axis: sliceAxis,
      submersion_depth: submersionDepth,
      mass,
      payload_weight: payloadWeight,
      center_of_gravity: centerOfGravity,
      project: projectId,
      wave_height: 0.0,
    };

    if (selectedAssetId) {
      payload.asset = selectedAssetId;
    }

    try {
      const response = await axios.post("http://localhost:8000/api/runs/", payload);
      startNewSim(response.data.id);
      const runId = response.data?.id != null ? String(response.data.id).slice(0, 6) : "unknown";
      toast.success(`Simulation started (ID: ${runId})`);
    } catch (error) {
      console.error("Failed to launch simulation", error);
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { detail?: string })?.detail || error.message
        : error instanceof Error ? error.message : "Failed to launch simulation";
      toast.error(message);
    }
  };

  const isRunning = status === "PENDING" || status === "MESHING" || status === "RUNNING";
  const canRun = !!selectedAssetId && !isRunning;

  const { reynolds, froude, dynamicPressure } = useDerivedMetrics(velocity, waterDensity);

  // AoA sweep state
  const [sweepMode, setSweepMode] = useState(false);
  const [sweepStart, setSweepStart] = useState(-2);
  const [sweepEnd, setSweepEnd] = useState(15);
  const [sweepStep, setSweepStep] = useState(1);
  const [sweepRunning, setSweepRunning] = useState(false);

  const sweepCount = sweepStep > 0 ? Math.floor((sweepEnd - sweepStart) / sweepStep) + 1 : 0;

  const handleRunSweep = async () => {
    if (!selectedAssetId || sweepCount <= 0 || sweepCount > 50) return;
    setSweepRunning(true);

    const payload: Record<string, unknown> = {
      aoa_start: sweepStart,
      aoa_end: sweepEnd,
      aoa_step: sweepStep,
      velocity,
      water_density: waterDensity,
      mesh_density: meshDensity,
      slice_axis: sliceAxis,
      submersion_depth: submersionDepth,
      mass,
      payload_weight: payloadWeight,
      center_of_gravity: centerOfGravity,
      project: projectId,
      wave_height: 0.0,
    };
    if (selectedAssetId) payload.asset = selectedAssetId;

    try {
      const response = await axios.post("http://localhost:8000/api/runs/sweep/", payload);
      const count = response.data?.count ?? 0;
      toast.success(`AoA sweep launched: ${count} runs queued`);
      // Select the first run from the sweep
      if (response.data?.created_ids?.length > 0) {
        startNewSim(response.data.created_ids[0]);
      }
    } catch (error) {
      console.error("Failed to launch sweep", error);
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string })?.error || error.message
        : error instanceof Error ? error.message : "Failed to launch sweep";
      toast.error(message);
    } finally {
      setSweepRunning(false);
    }
  };

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
        <Settings className="h-4 w-4 text-foreground-muted" />
        <h2 className="text-sm font-semibold text-foreground font-sans tracking-wide uppercase">
          Configuration
        </h2>
      </div>

      {/* Derived metrics bar */}
      <div className="grid grid-cols-3 gap-2 rounded-md bg-background-elevated border border-border p-2.5">
        <div className="flex flex-col items-center gap-0.5">
          <span className="hud-label">Re</span>
          <span className="text-xs font-semibold tabular-nums text-foreground font-mono">
            {formatSI(reynolds)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="hud-label">Fr</span>
          <span className="text-xs font-semibold tabular-nums text-foreground font-mono">
            {froude.toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="hud-label">q (Pa)</span>
          <span className="text-xs font-semibold tabular-nums text-foreground font-mono">
            {formatSI(dynamicPressure)}
          </span>
        </div>
      </div>

      <ConfigSection title="Flow Parameters" defaultOpen>
        <FieldWithHint
          label="Velocity"
          hint="Speed of water flow. Typical range: 5–15 m/s for small foils."
        >
          <SliderWithInput
            value={velocity}
            min={1}
            max={50}
            step={0.1}
            unit="m/s"
            ticks={[
              { value: 1, label: "1" },
              { value: 25, label: "25" },
              { value: 50, label: "50" },
            ]}
            onChange={(v) => setVelocity(v)}
          />
        </FieldWithHint>

        <FieldWithHint
          label="Angle of Attack"
          hint="Angle between flow and chord line. Positive tilts nose up, increasing lift until stall. Typical hydrofoil range: 0–15°."
        >
          <SliderWithInput
            value={aoa}
            min={-5}
            max={25}
            step={0.5}
            unit="°"
            ticks={[
              { value: -5, label: "-5°" },
              { value: 0, label: "0°" },
              { value: 10, label: "10°" },
              { value: 25, label: "25°" },
            ]}
            onChange={(v) => setAoA(v)}
          />
        </FieldWithHint>
      </ConfigSection>

      <ConfigSection title="Mesh Settings" defaultOpen>
        <FieldWithHint
          label="Mesh Density"
          hint="Higher values refine the base mesh but increase simulation time."
        >
          <SliderWithInput
            value={meshDensity}
            min={0.5}
            max={2.0}
            step={0.05}
            ticks={[
              { value: 0.5, label: "Coarse" },
              { value: 1.0, label: "Medium" },
              { value: 2.0, label: "Fine" },
            ]}
            onChange={(v) => setMeshDensity(v)}
          />
        </FieldWithHint>
      </ConfigSection>

      <ConfigSection title="Advanced" isAdvanced defaultOpen={false}>
        <FieldWithHint label="Water Density" hint="Water density (kg/m³).">
          <SliderWithInput
            value={waterDensity}
            min={900}
            max={1200}
            step={5}
            unit="kg/m³"
            onChange={(v) => setWaterDensity(v)}
          />
        </FieldWithHint>

        <FieldWithHint label="Submersion Depth" hint="Depth of foil center below surface.">
          <SliderWithInput
            value={submersionDepth}
            min={0}
            max={5}
            step={0.05}
            unit="m"
            onChange={(v) => setSubmersionDepth(v)}
          />
        </FieldWithHint>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label className="text-xs font-medium text-foreground-muted">Slice Axis</label>
            <span className="text-xs font-semibold text-foreground font-mono">
              {sliceAxis.toUpperCase()}
            </span>
          </div>
          <div className="relative">
            <select
              value={sliceAxis}
              onChange={(e) => setSliceAxis(e.target.value as "x" | "y" | "z")}
              disabled={isRunning}
              className="select w-full"
            >
              <option value="x">X-Axis</option>
              <option value="y">Y-Axis</option>
              <option value="z">Z-Axis</option>
            </select>
          </div>
        </div>

        <FieldWithHint label="Vehicle Mass" hint="Total mass of vehicle including payload.">
          <SliderWithInput
            value={mass}
            min={10}
            max={5000}
            step={10}
            unit="kg"
            onChange={(v) => setMass(v)}
          />
        </FieldWithHint>

        <FieldWithHint label="Payload Weight" hint="Extra payload mass on the vehicle.">
          <SliderWithInput
            value={payloadWeight}
            min={0}
            max={2000}
            step={5}
            unit="kg"
            onChange={(v) => setPayloadWeight(v)}
          />
        </FieldWithHint>

        <FieldWithHint label="Center of Gravity" hint="X,Y,Z coordinates for center of gravity (m).">
          <div className="grid grid-cols-3 gap-1.5">
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <div key={axis} className="flex flex-col gap-0.5">
                <span className="text-2xs text-foreground-subtle text-center">{axis}</span>
                <input
                  type="number"
                  step={0.01}
                  value={centerOfGravity[i]}
                  onChange={(e) => {
                    const next = [...centerOfGravity] as [number, number, number];
                    next[i] = Number(e.target.value);
                    setCenterOfGravity(next);
                  }}
                  disabled={isRunning}
                  className="input text-center text-xs font-mono"
                />
              </div>
            ))}
          </div>
        </FieldWithHint>
      </ConfigSection>

      <OrientationPanel />
      <OrientationWarningBanner />

      {/* AoA Sweep */}
      <ConfigSection title="AoA Sweep" defaultOpen={sweepMode}>
        <div className="flex items-center justify-between pb-2">
          <p className="text-xs text-foreground-subtle">
            Batch-run across an angle of attack range
          </p>
          <button
            type="button"
            className="text-2xs text-foreground-muted hover:text-foreground transition-colors"
            onClick={() => setSweepMode(!sweepMode)}
          >
            {sweepMode ? "Close" : "Open"}
          </button>
        </div>

        {sweepMode && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-2xs text-foreground-subtle">Start (°)</span>
                <input
                  type="number"
                  step={0.5}
                  value={sweepStart}
                  onChange={(e) => setSweepStart(Number(e.target.value))}
                  disabled={sweepRunning}
                  className="input text-center text-xs font-mono"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-2xs text-foreground-subtle">End (°)</span>
                <input
                  type="number"
                  step={0.5}
                  value={sweepEnd}
                  onChange={(e) => setSweepEnd(Number(e.target.value))}
                  disabled={sweepRunning}
                  className="input text-center text-xs font-mono"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-2xs text-foreground-subtle">Step (°)</span>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  value={sweepStep}
                  onChange={(e) => setSweepStep(Math.max(0.5, Number(e.target.value)))}
                  disabled={sweepRunning}
                  className="input text-center text-xs font-mono"
                />
              </div>
            </div>

            <div className="text-2xs text-foreground-muted text-center">
              {sweepCount > 0 && sweepCount <= 50
                ? `${sweepCount} simulation${sweepCount !== 1 ? "s" : ""} will be queued`
                : sweepCount > 50
                  ? "Too many steps (max 50)"
                  : "Invalid sweep range"}
            </div>

            <button
              onClick={handleRunSweep}
              disabled={!canRun || sweepCount <= 0 || sweepCount > 50 || sweepRunning}
              className={`group relative overflow-hidden rounded-md py-2 px-3 text-xs font-semibold font-sans transition-all duration-300 ${
                !canRun || sweepCount <= 0 || sweepCount > 50 || sweepRunning
                  ? "bg-background-elevated text-foreground-disabled cursor-not-allowed border border-border"
                  : "bg-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/30 border border-accent-cyan/30"
              }`}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Repeat className={`h-3.5 w-3.5 ${sweepRunning ? "animate-spin" : ""}`} />
                {sweepRunning ? "Launching…" : "Run AoA Sweep"}
              </span>
            </button>
          </div>
        )}
      </ConfigSection>

      {/* Run button */}
      <button
        onClick={handleRunSimulation}
        disabled={!canRun}
        className={`group relative overflow-hidden rounded-md py-2.5 px-4 text-sm font-semibold font-sans transition-all duration-200 ${
          !canRun
            ? "bg-background-elevated text-foreground-disabled cursor-not-allowed border border-border"
            : "bg-accent/90 text-white hover:bg-accent border border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        }`}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          <Zap className={`h-4 w-4 ${isRunning ? "animate-pulse" : ""}`} />
          {isRunning ? "Computing…" : selectedAssetId ? "Run Simulation" : "Select an Asset"}
        </span>
      </button>

      
    </motion.div>
  );
}
