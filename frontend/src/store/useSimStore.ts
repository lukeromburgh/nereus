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
  q_criterion_isosurface_path?: string | null;
};

interface SimulationState {
  activeSimId: number | null;
  status: string;
  logs: string;
  resultMeshPath: string | null;

  // Temporal analysis (playback)
  resultSequencePath: string | null;
  qCriterionPath: string | null;
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

  // VTK scene bounds [xMin, xMax, yMin, yMax, zMin, zMax] set when geometry loads.
  vtkSceneBounds: [number, number, number, number, number, number] | null;
  setVtkSceneBounds: (
    bounds: [number, number, number, number, number, number] | null,
  ) => void;

  // Post-processing (kept as UI toggles; currently no-ops with VTK.js renderer)
  enableBloom: boolean;
  enableSSAO: boolean;
  toggleBloom: () => void;
  toggleSSAO: () => void;

  // MVP Project/Asset context
  projectId: number;
  setProjectId: (id: number) => void;
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

  // Advanced mode toggle
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;

  // Orientation correction — values in degrees.
  // The backend (trimesh euler_matrix) expects degrees and converts internally.
  // VTK.js applies these directly via actor.setOrientation().
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

  // Transform gizmo mode
  gizmoMode: "none" | "translate" | "rotate" | "scale";
  setGizmoMode: (mode: "none" | "translate" | "rotate" | "scale") => void;

  resetForNewRun: () => void;
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
  qCriterionPath: null,
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
        qCriterionPath: payload.q_criterion_isosurface_path ?? null,
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
      qCriterionPath: null,
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

  colormap: "turbo",
  setColormap: (cm) => set({ colormap: cm }),

  vtkSceneBounds: null,
  setVtkSceneBounds: (bounds) => set({ vtkSceneBounds: bounds }),

  enableBloom: true,
  enableSSAO: true,
  toggleBloom: () => set((state) => ({ enableBloom: !state.enableBloom })),
  toggleSSAO: () => set((state) => ({ enableSSAO: !state.enableSSAO })),

  projectId: 1,
  setProjectId: (id) =>
    set(() => ({
      projectId: id,
      selectedAssetId: null,
      selectedAssetName: null,
      selectedAssetFileUrl: null,
    })),
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

  // Advanced mode toggle
  showAdvanced: false,
  setShowAdvanced: (show) => set({ showAdvanced: show }),

  // Transform gizmo
  gizmoMode: "none",
  setGizmoMode: (mode) => set({ gizmoMode: mode }),

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

  resetForNewRun: () =>
    set({
      activeSimId: null,
      status: "IDLE",
      logs: "",
      resultMeshPath: null,
      resultSequencePath: null,
      qCriterionPath: null,
      frameMapping: [],
      metricsSeries: [],
      convergenceSeries: [],
      totalFrames: 0,
      currentFrame: 0,
      isPlaying: false,
    }),
  startNewSim: (id) =>
    set({
      activeSimId: id,
      status: "PENDING",
      logs: "Request sent to server...",
      resultMeshPath: null,
      resultSequencePath: null,
      qCriterionPath: null,
      frameMapping: [],
      metricsSeries: [],
      convergenceSeries: [],
      totalFrames: 0,
      currentFrame: 0,
      isPlaying: false,
    }),
  selectSim: (id) =>
    set({
      activeSimId: id,
      status: "LOADING",
      logs: "Loading run...",
      resultMeshPath: null,
      resultSequencePath: null,
      qCriterionPath: null,
      frameMapping: [],
      metricsSeries: [],
      convergenceSeries: [],
      totalFrames: 0,
      currentFrame: 0,
      isPlaying: false,
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
