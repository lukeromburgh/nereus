import { create } from "zustand";

export type FrameMetrics = {
  Fx: number | null;
  Fy: number | null;
  Fz: number | null;
  ld_ratio: number | null;
};

export type FrameMappingEntry = {
  frame_index: number;
  time_value: number | string | null;
  iteration_number: number | null;
  mesh_path: string;
  pressure_lines_path?: string | null;
  flow_lines_path?: string | null;
  metrics: FrameMetrics;
};

export type MetricsPoint = {
  frame_index: number;
  time_value: number | null;
} & FrameMetrics;

export type ConvergencePoint = {
  iteration: number | null;
  time: number | null;
  residual: number;
};

export type AnalysisPayload = {
  id: number;
  status: string;
  result_sequence_path: string | null;
  frame_mapping: FrameMappingEntry[];
  metrics_series: MetricsPoint[];
  convergence_series: ConvergencePoint[];
};

interface SimulationState {
  activeSimId: number | null;
  status: string;
  logs: string;
  resultMeshPath: string | null;

  // Temporal analysis (playback)
  resultSequencePath: string | null;
  frameMapping: FrameMappingEntry[];
  metricsSeries: MetricsPoint[];
  convergenceSeries: ConvergencePoint[];
  totalFrames: number;
  currentFrame: number;
  isPlaying: boolean;
  playbackSpeed: number; // frames per second
  loopPlayback: boolean;

  setAnalysisData: (payload: AnalysisPayload) => void;
  clearAnalysis: () => void;
  setFrame: (frame: number) => void;
  stepFrame: (delta: number) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (fps: number) => void;
  toggleLoop: () => void;

  // Visualization layers
  showFlowLines: boolean;
  showPressureMap: boolean;
  showVorticity: boolean;
  showStreamlines: boolean;
  toggleFlowLines: () => void;
  togglePressureMap: () => void;
  toggleVorticity: () => void;
  toggleStreamlines: () => void;

  // Scientific colormap
  colormap: "turbo" | "viridis" | "inferno" | "plasma" | "magma" | "coolwarm";
  setColormap: (
    cm: "turbo" | "viridis" | "inferno" | "plasma" | "magma" | "coolwarm",
  ) => void;

  // Foil geometry bounds (set when frame mesh loads)
  foilCenter: [number, number, number];
  foilSize: [number, number, number]; // dx, dy, dz
  setFoilBounds: (
    center: [number, number, number],
    size: [number, number, number],
  ) => void;

  // Centred bounding box written once per result load by the centring effect.
  // FlowDirectionArrow & FoilNoseMarker read this — stable, no per-frame recompute.
  centredFoilBounds: {
    min: [number, number, number];
    max: [number, number, number];
  } | null;
  setCentredFoilBounds: (
    bounds: {
      min: [number, number, number];
      max: [number, number, number];
    } | null,
  ) => void;

  // Incremented once when a new run's result geometry finishes loading.
  // Used as a stable trigger for centring and camera-fit effects.
  geometryLoadedToken: number;
  bumpGeometryLoadedToken: () => void;

  // Scene-level offset applied to centre result geometry at world origin.
  // Components (grid, flow arrow, nose marker) can read this if needed.
  sceneOffset: [number, number, number];
  gridFloorZ: number;
  setSceneOffset: (offset: [number, number, number], floorZ: number) => void;

  // Post-processing
  enableBloom: boolean;
  enableSSAO: boolean;
  toggleBloom: () => void;
  toggleSSAO: () => void;

  // MVP Project/Asset context
  projectId: number;
  selectedAssetId: number | null;
  selectedAssetName: string | null;
  selectedAssetFileUrl: string | null;
  setSelectedAssetId: (id: number | null) => void;
  setSelectedAsset: (
    asset: { id: number; name?: string | null; file?: string | null } | null,
  ) => void;

  // Simulation Inputs
  velocity: number;
  aoa: number;
  waterDensity: number;
  meshDensity: number;
  sliceAxis: "x" | "y" | "z";
  submersionDepth: number;
  mass: number;
  payloadWeight: number;
  centerOfGravity: [number, number, number];
  setVelocity: (val: number) => void;
  setAoA: (val: number) => void;
  setWaterDensity: (val: number) => void;
  setMeshDensity: (val: number) => void;
  setSliceAxis: (axis: "x" | "y" | "z") => void;
  setSubmersionDepth: (val: number) => void;
  setMass: (val: number) => void;
  setPayloadWeight: (val: number) => void;
  setCenterOfGravity: (val: [number, number, number]) => void;

  // Orientation correction — values in degrees.
  // The backend (trimesh euler_matrix) expects degrees and converts internally.
  // The frontend converts to radians only for the Three.js live preview rotation.
  pitch: number;
  roll: number;
  yaw: number;
  setPitch: (val: number) => void;
  setRoll: (val: number) => void;
  setYaw: (val: number) => void;

  // Orientation preview (from backend)
  orientationPreviewUrl: string | null;
  geometryDimensions: {
    chord_m?: number;
    span_m?: number;
    thickness_m?: number;
  } | null;
  geometryAxesDetected: {
    detected_chord_axis?: string;
    detected_span_axis?: string;
    detected_up_axis?: string;
  } | null;
  setOrientationPreview: (data: {
    orientation_preview_url?: string;
    geometry_dimensions?: {
      chord_m?: number;
      span_m?: number;
      thickness_m?: number;
    };
    geometry_axes_detected?: {
      detected_chord_axis?: string;
      detected_span_axis?: string;
      detected_up_axis?: string;
    };
  }) => void;

  startNewSim: (id: number) => void;
  selectSim: (id: number) => void;
  updateSim: (data: any) => void;
}

export const useSimStore = create<SimulationState>((set) => ({
  activeSimId: null,
  status: "IDLE",
  logs: "",
  resultMeshPath: null,

  resultSequencePath: null,
  frameMapping: [],
  metricsSeries: [],
  convergenceSeries: [],
  totalFrames: 0,
  currentFrame: 0,
  isPlaying: false,
  playbackSpeed: 8,
  loopPlayback: true,

  setAnalysisData: (payload) =>
    set(() => {
      const frameMapping = payload.frame_mapping || [];
      const totalFrames = frameMapping.length;
      return {
        resultSequencePath: payload.result_sequence_path ?? null,
        frameMapping,
        metricsSeries: payload.metrics_series || [],
        convergenceSeries: payload.convergence_series || [],
        totalFrames,
        currentFrame: totalFrames > 0 ? 0 : 0,
        isPlaying: false,
      };
    }),
  clearAnalysis: () =>
    set(() => ({
      resultSequencePath: null,
      frameMapping: [],
      metricsSeries: [],
      convergenceSeries: [],
      totalFrames: 0,
      currentFrame: 0,
      isPlaying: false,
    })),
  setFrame: (frame) =>
    set((state) => {
      const total = state.totalFrames;
      if (total <= 0) return { currentFrame: 0 };
      const clamped = Math.max(0, Math.min(total - 1, Math.floor(frame)));
      return { currentFrame: clamped };
    }),
  stepFrame: (delta) =>
    set((state) => {
      const total = state.totalFrames;
      if (total <= 0) return { currentFrame: 0 };

      const next = state.currentFrame + delta;
      if (state.loopPlayback) {
        const wrapped = ((next % total) + total) % total;
        return { currentFrame: wrapped };
      }

      return { currentFrame: Math.max(0, Math.min(total - 1, next)) };
    }),
  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaybackSpeed: (fps) =>
    set(() => ({ playbackSpeed: Math.max(0.25, Math.min(60, fps)) })),
  toggleLoop: () => set((state) => ({ loopPlayback: !state.loopPlayback })),

  showFlowLines: false,
  showPressureMap: true,
  showVorticity: false,
  showStreamlines: false,
  toggleFlowLines: () =>
    set((state) => ({ showFlowLines: !state.showFlowLines })),
  togglePressureMap: () =>
    set((state) => ({ showPressureMap: !state.showPressureMap })),
  toggleVorticity: () =>
    set((state) => ({ showVorticity: !state.showVorticity })),
  toggleStreamlines: () =>
    set((state) => ({ showStreamlines: !state.showStreamlines })),

  foilCenter: [0, 0, 0],
  foilSize: [0.1, 0.1, 0.1],
  setFoilBounds: (center, size) =>
    set(() => ({ foilCenter: center, foilSize: size })),

  centredFoilBounds: null,
  setCentredFoilBounds: (bounds) => set(() => ({ centredFoilBounds: bounds })),

  geometryLoadedToken: 0,
  bumpGeometryLoadedToken: () =>
    set((state) => ({ geometryLoadedToken: state.geometryLoadedToken + 1 })),

  sceneOffset: [0, 0, 0],
  gridFloorZ: 0,
  setSceneOffset: (offset, floorZ) =>
    set(() => ({ sceneOffset: offset, gridFloorZ: floorZ })),

  colormap: "turbo",
  setColormap: (cm) => set({ colormap: cm }),

  enableBloom: true,
  enableSSAO: true,
  toggleBloom: () => set((state) => ({ enableBloom: !state.enableBloom })),
  toggleSSAO: () => set((state) => ({ enableSSAO: !state.enableSSAO })),

  projectId: 1,
  selectedAssetId: null,
  selectedAssetName: null,
  selectedAssetFileUrl: null,
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),
  setSelectedAsset: (asset) =>
    set(() => ({
      selectedAssetId: asset?.id ?? null,
      selectedAssetName: asset?.name ?? null,
      selectedAssetFileUrl: asset?.file ?? null,
    })),

  velocity: 10,
  aoa: 5,
  waterDensity: 1025,
  meshDensity: 1.0,
  sliceAxis: "y",
  submersionDepth: 0.5,
  mass: 100,
  payloadWeight: 50,
  centerOfGravity: [0, 0, 0],
  setVelocity: (val) => set({ velocity: val }),
  setAoA: (val) => set({ aoa: val }),
  setWaterDensity: (val) => set({ waterDensity: val }),
  setMeshDensity: (val) => set({ meshDensity: val }),
  setSliceAxis: (axis) => set({ sliceAxis: axis }),
  setSubmersionDepth: (val) => set({ submersionDepth: val }),
  setMass: (val) => set({ mass: val }),
  setPayloadWeight: (val) => set({ payloadWeight: val }),
  setCenterOfGravity: (val) => set({ centerOfGravity: val }),
  setSliceAxis: (axis) => set({ sliceAxis: axis }),

  // Orientation correction — degrees (sent as-is in the launch payload)
  pitch: 0,
  roll: 0,
  yaw: 0,
  setPitch: (val) => set({ pitch: val }),
  setRoll: (val) => set({ roll: val }),
  setYaw: (val) => set({ yaw: val }),

  // Orientation preview
  orientationPreviewUrl: null,
  geometryDimensions: null,
  geometryAxesDetected: null,
  setOrientationPreview: (data) =>
    set(() => ({
      orientationPreviewUrl: data.orientation_preview_url ?? null,
      geometryDimensions: data.geometry_dimensions ?? null,
      geometryAxesDetected: data.geometry_axes_detected ?? null,
    })),

  startNewSim: (id) =>
    set({
      activeSimId: id,
      status: "PENDING",
      logs: "Request sent to server...",
      resultMeshPath: null,
      resultSequencePath: null,
      frameMapping: [],
      metricsSeries: [],
      convergenceSeries: [],
      totalFrames: 0,
      currentFrame: 0,
      isPlaying: false,
      centredFoilBounds: null,
    }),
  selectSim: (id) =>
    set({
      activeSimId: id,
      status: "LOADING",
      logs: "Loading run...",
      resultMeshPath: null,
      resultSequencePath: null,
      frameMapping: [],
      metricsSeries: [],
      convergenceSeries: [],
      totalFrames: 0,
      currentFrame: 0,
      isPlaying: false,
      centredFoilBounds: null,
    }),
  updateSim: (data) =>
    set(() => ({
      status: data.status,
      logs: data.current_logs || "",
      resultMeshPath: data.result_mesh_path || null,
      resultSequencePath: data.result_sequence_path || null,
      orientationPreviewUrl: data.orientation_preview_url || null,
      geometryDimensions: data.geometry_dimensions || null,
      geometryAxesDetected: data.geometry_axes_detected || null,
    })),
}));
