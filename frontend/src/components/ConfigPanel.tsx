import axios from "axios";
import { motion } from "framer-motion";
import { Settings, Zap, ChevronDown } from "lucide-react";
import { toast } from "@/lib/toast";
import { useSimStore } from "../store/useSimStore";
import { ConfigSection } from "./ConfigSection";
import { FieldWithHint } from "./FieldWithHint";
import { SliderWithInput } from "./SliderWithInput";
import { OrientationPanel } from "./OrientationPanel";
import { OrientationWarningBanner } from "./OrientationWarningBanner";

export function ConfigPanel() {
  const {
    showAdvanced,
    setShowAdvanced,
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
      const runId = response.data?.id != null ? String(response.data.id).slice(0, 6) : "unknown";
      toast.success(`✓ Simulation started (ID: ${runId})`);
    } catch (error) {
      console.error("Failed to launch simulation", error);
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { detail?: string })?.detail ||
          error.message ||
          "Failed to launch simulation"
        : error instanceof Error
          ? error.message
          : "Failed to launch simulation";
      toast.error(message);
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

      <ConfigSection title="Flow Parameters" defaultOpen>
        <FieldWithHint
          label="Velocity"
          hint="Speed of water flow. Typical range: 5–15 m/s for small foils. Higher speeds increase drag quadratically."
        >
          <SliderWithInput
            value={velocity}
            min={1}
            max={50}
            step={0.1}
            unit="m/s"
            onChange={(v) => setVelocity(v)}
            onLivePreview={(_v) => {
              /* TODO: connect to live preview system */
            }}
          />
        </FieldWithHint>

        <FieldWithHint
          label="Angle of Attack"
          hint="Angle between flow and chord line; small changes have big lift effects."
        >
          <SliderWithInput
            value={aoa}
            min={-15}
            max={15}
            step={0.5}
            unit="°"
            onChange={(v) => setAoA(v)}
            onLivePreview={(_v) => {
              /* TODO: connect to live preview system */
            }}
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
            onChange={(v) => setMeshDensity(v)}
            onLivePreview={(_v) => {
              /* TODO: connect to live mesh previews */
            }}
          />
        </FieldWithHint>
      </ConfigSection>

      <ConfigSection
        title="Advanced Configuration"
        isAdvanced
        defaultOpen={showAdvanced}
      >
        <div className="flex items-center justify-between pb-2">
          <p className="text-xs text-slate-400">Advanced controls</p>
          <button
            type="button"
            className="text-2xs text-accent-cyan hover:text-white"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "Hide" : "Show"}
          </button>
        </div>

        <FieldWithHint
          label="Water Density"
          hint="Water density (kg/m³). 1000 is typical for fresh water."
        >
          <SliderWithInput
            value={waterDensity}
            min={900}
            max={1200}
            step={5}
            unit="kg/m³"
            onChange={(v) => setWaterDensity(v)}
            onLivePreview={(v) => {
              /* TODO: integrate with preview engine */
            }}
          />
        </FieldWithHint>

        <FieldWithHint
          label="Submersion Depth"
          hint="Depth of foil center below surface."
        >
          <SliderWithInput
            value={submersionDepth}
            min={0}
            max={5}
            step={0.05}
            unit="m"
            onChange={(v) => setSubmersionDepth(v)}
            onLivePreview={(v) => {
              /* TODO: integrate with preview engine */
            }}
          />
        </FieldWithHint>

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

        <FieldWithHint
          label="Vehicle Mass"
          hint="Total mass of vehicle including payload."
        >
          <SliderWithInput
            value={mass}
            min={10}
            max={5000}
            step={10}
            unit="kg"
            onChange={(v) => setMass(v)}
            onLivePreview={(v) => {
              /* TODO: integrate with preview engine */
            }}
          />
        </FieldWithHint>

        <FieldWithHint
          label="Payload Weight"
          hint="Extra payload mass on the vehicle."
        >
          <SliderWithInput
            value={payloadWeight}
            min={0}
            max={2000}
            step={5}
            unit="kg"
            onChange={(v) => setPayloadWeight(v)}
            onLivePreview={(v) => {
              /* TODO: integrate with preview engine */
            }}
          />
        </FieldWithHint>

        <FieldWithHint
          label="Center of Gravity"
          hint="X,Y,Z coordinates for center of gravity (m)."
        >
          <div className="flex flex-col gap-1.5">
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
        </FieldWithHint>
      </ConfigSection>

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
