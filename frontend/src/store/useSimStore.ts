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
    }),
  updateSim: (data) =>
    set(() => ({
      status: data.status,
      logs: data.current_logs || "",
      resultMeshPath: data.result_mesh_path || null,
      resultSequencePath: data.result_sequence_path || null,
    })),
}));
