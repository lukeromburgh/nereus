import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import { Upload, RefreshCw, PanelLeftClose, PanelLeftOpen, AlertCircle } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { VtkViewport } from "./components/VTK/VtkViewport";
import { ConfigPanel } from "./components/ConfigPanel";
import { LogConsoleCompact } from "./components/VTK/LogConsoleCompact";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { ToastContainer } from "./components/ToastContainer";
import { useSimStore } from "./store/useSimStore";
import { useToolbar } from "./hooks/useToolbar";

// ── File validation ──────────────────────────────────────────────────────────

const ACCEPTED_EXTENSIONS = [".stl", ".obj", ".gltf", ".glb"];
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

function validateFile(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Unsupported format "${ext}". Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_FILE_SIZE_MB} MB`;
  }
  if (file.size === 0) {
    return "File is empty";
  }
  return null;
}

// ── Simulation Toolbar (injected into the top bar) ───────────────────────────

function SimulationToolbar({ onRefresh }: { onRefresh: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { projectId, setSelectedAsset, status } = useSimStore();
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFile = useCallback(async (file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadState("error");
      setUploadError(error);
      return;
    }

    setUploadState("uploading");
    setUploadError(null);
    setUploadProgress(0);

    const form = new FormData();
    form.append("project", String(projectId));
    form.append("name", file.name.replace(/\.[^/.]+$/, "") || "Hydrofoil");
    form.append("file", file);

    try {
      const { data } = await axios.post("http://localhost:8000/api/assets/", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      if (typeof data?.id === "number") setSelectedAsset(data);
      setUploadState("idle");
      setUploadProgress(0);
      onRefresh();
    } catch (err: unknown) {
      console.error("Asset upload failed", err);
      setUploadState("error");
      let errorMessage = "Upload failed";
      if (axios.isAxiosError(err) && err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setUploadError(errorMessage);
    }
  }, [projectId, setSelectedAsset, onRefresh]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    e.target.value = "";
  };

  const statusColor =
    status === "COMPLETED"
      ? "bg-accent-emerald/20 text-accent-emerald border-accent-emerald/30"
      : status === "FAILED"
        ? "bg-accent-rose/20 text-accent-rose border-accent-rose/30"
        : status === "RUNNING" || status === "MESHING"
          ? "bg-accent/20 text-accent-glow border-accent/30 animate-pulse-slow"
          : status === "PENDING"
            ? "bg-accent-amber/20 text-accent-amber border-accent-amber/30"
            : "bg-slate-800/50 text-slate-500 border-slate-700/50";

  return (
    <>
      {status !== "IDLE" && (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium border ${statusColor}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {status}
        </span>
      )}

      <div className="h-4 w-px bg-slate-700/50" />

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={handleFileSelected}
      />
      <button
        onClick={handleUploadClick}
        disabled={uploadState === "uploading"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
          uploadState === "uploading"
            ? "bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-700/30"
            : "bg-accent/10 text-accent-glow hover:bg-accent/20 border border-accent/20 hover:border-accent/40 hover:shadow-glow-blue"
        }`}
      >
        <Upload className="h-3.5 w-3.5" />
        {uploadState === "uploading" ? `${uploadProgress}%` : "Upload"}
      </button>

      <button
        onClick={onRefresh}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-hud-border bg-surface-raised hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-all duration-200"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>

      {uploadState === "error" && uploadError && (
        <span className="inline-flex items-center gap-1 text-2xs text-accent-rose ml-1 max-w-[200px] truncate" title={uploadError}>
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {uploadError}
        </span>
      )}
    </>
  );
}

// ── Simulation Page ──────────────────────────────────────────────────────────

export default function SimulationPage() {
  const { activeSimId, status, updateSim, setAnalysisData, clearAnalysis, projectId, setSelectedAsset } =
    useSimStore();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const { setToolbarContent } = useToolbar();
  const [panelOpen, setPanelOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // ── Inject simulation-specific toolbar ──
  useEffect(() => {
    setToolbarContent(
      <SimulationToolbar onRefresh={() => setRefreshNonce((n) => n + 1)} />
    );
    return () => setToolbarContent(null);
  }, [setToolbarContent]);

  // ── Observer: Polling Hook with exponential back-off (2 s → 60 s cap) ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const isActive =
      activeSimId &&
      (status === "PENDING" || status === "RUNNING" || status === "MESHING");

    if (!isActive) return;

    const INITIAL_MS = 2_000;
    const MAX_MS = 60_000;
    let delay = INITIAL_MS;

    async function poll() {
      if (cancelled) return;
      try {
        const { data } = await axios.get(
          `http://localhost:8000/api/runs/${activeSimId}/`,
        );
        if (cancelled) return;
        updateSim(data);
        if (data.status === "COMPLETED" || data.status === "FAILED") return;
      } catch (error) {
        console.error("Polling error fetching run:", error);
      }
      delay = Math.min(delay * 1.5, MAX_MS);
      timer = setTimeout(poll, delay);
    }

    timer = setTimeout(poll, INITIAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeSimId, status, updateSim]);

  // ── Post-run analysis loader ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeSimId) { clearAnalysis(); return; }
      if (status !== "COMPLETED") { clearAnalysis(); return; }

      try {
        const { data } = await axios.get(
          `http://localhost:8000/api/runs/${activeSimId}/analysis/`,
        );
        if (!cancelled) setAnalysisData(data);
      } catch (err) {
        console.error("Failed to load analysis payload", err);
        if (!cancelled) clearAnalysis();
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activeSimId, status, setAnalysisData, clearAnalysis]);

  // ── Drag-and-drop handlers ──
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      console.error("Drop rejected:", error);
      return;
    }

    const form = new FormData();
    form.append("project", String(projectId));
    form.append("name", file.name.replace(/\.[^/.]+$/, "") || "Hydrofoil");
    form.append("file", file);

    try {
      const { data } = await axios.post("http://localhost:8000/api/assets/", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (typeof data?.id === "number") setSelectedAsset(data);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      console.error("Drop upload failed", err);
    }
  }, [projectId, setSelectedAsset]);

  return (
    <div
      className="flex h-full w-full overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ── Drag overlay ── */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#0d1518]/80 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-accent-cyan/50 rounded-xl">
              <Upload className="h-10 w-10 text-accent-cyan" />
              <span className="text-sm font-medium text-accent-cyan">Drop geometry file to upload</span>
              <span className="text-2xs text-slate-500">{ACCEPTED_EXTENSIONS.join(", ")}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collapsible Assets Panel (overlay) ── */}
      <AnimatePresence initial={false}>
        {panelOpen && (
          <>
            {/* Scrim — click to dismiss */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-20 bg-black/30"
              onClick={() => setPanelOpen(false)}
            />
            {/* Panel */}
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute left-0 top-0 bottom-0 z-30 w-60 border-r border-hud-border bg-[#0f1619] overflow-y-auto scrollbar-dark flex flex-col shadow-2xl shadow-black/50"
            >
              {/* Close button inside panel header */}
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="hud-label text-slate-500 text-2xs">Explorer</span>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              </div>
              <Sidebar refreshNonce={refreshNonce} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Collapsed tab (slim vertical strip) ── */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 px-1 py-3 rounded-r-md bg-[#161d21]/90 border border-l-0 border-hud-border/60 text-slate-500 hover:text-slate-200 hover:bg-[#1c252a] transition-all duration-200 shadow-lg shadow-black/30"
          title="Show assets & runs"
        >
          <PanelLeftOpen className="h-3 w-3" />
          <span className="text-[9px] font-medium tracking-widest uppercase [writing-mode:vertical-lr]">Assets</span>
        </button>
      )}

      {/* ── Center — VTK Viewport + Log Console ── */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex-1 relative overflow-hidden min-h-0">
          <VtkViewport />
        </div>
        <div className="border-t border-hud-border bg-slate-950/60 backdrop-blur-sm h-56 flex-shrink-0">
          <LogConsoleCompact />
        </div>
      </main>

      {/* ── Column 3: Right Panel — Config or Analysis ── */}
      <aside className="w-80 border-l border-hud-border bg-[#0f1619] overflow-y-auto scrollbar-dark flex flex-col flex-shrink-0 p-4">
        <AnimatePresence mode="wait">
          {status === "COMPLETED" ? (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1"
            >
              <AnalysisPanel />
            </motion.div>
          ) : (
            <motion.div
              key="config"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1"
            >
              <ConfigPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* Global Toast Notifications */}
      <ToastContainer />
    </div>
  );
}
