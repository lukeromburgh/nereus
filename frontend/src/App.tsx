import { useCallback, useEffect, useRef, useState } from "react";
import apiClient, { isAxiosError } from "./lib/apiClient";
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
      const { data } = await apiClient.post("/api/assets/", form, {
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
      if (isAxiosError(err) && err.response?.data?.detail) {
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
      ? "bg-[rgba(0,212,255,0.08)] text-nereus-accent border-[rgba(0,212,255,0.2)]"
      : status === "FAILED"
        ? "bg-[rgba(255,107,53,0.08)] text-nereus-orange border-[rgba(255,107,53,0.2)]"
        : status === "RUNNING" || status === "MESHING"
          ? "bg-[rgba(0,212,255,0.08)] text-nereus-accent border-[rgba(0,212,255,0.2)] animate-pulse-slow"
          : status === "PENDING"
            ? "bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.45)] border-[rgba(255,255,255,0.1)]"
            : "bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.35)] border-[rgba(255,255,255,0.08)]";

  return (
    <>
      {status !== "IDLE" && (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border ${statusColor}`} style={{ borderRadius: '2px' }}>
          <span className="h-1.5 w-1.5 bg-current" style={{ borderRadius: '1px' }} />
          {status}
        </span>
      )}

      <div className="h-3.5 w-px bg-[rgba(255,255,255,0.08)]" />

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
        className={`inline-flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-medium transition-all duration-200 ${
          uploadState === "uploading"
            ? "bg-nereus-panel text-[rgba(255,255,255,0.25)] cursor-not-allowed border border-[rgba(255,255,255,0.07)]"
            : "bg-[rgba(0,212,255,0.08)] text-nereus-accent hover:bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.2)] hover:border-[rgba(0,212,255,0.35)]"
        }`}
        style={{ borderRadius: '2px' }}
      >
        <Upload className="h-[14px] w-[14px]" />
        {uploadState === "uploading" ? `${uploadProgress}%` : "Upload"}
      </button>

      <button
        onClick={onRefresh}
        className="inline-flex items-center gap-1 px-2 h-7 text-[11px] font-medium border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] transition-all duration-200"
        style={{ borderRadius: '2px' }}
      >
        <RefreshCw className="h-[14px] w-[14px]" />
      </button>

      {uploadState === "error" && uploadError && (
        <span className="inline-flex items-center gap-1 text-[10px] text-nereus-orange ml-1 max-w-[200px] truncate" title={uploadError}>
          <AlertCircle className="h-[14px] w-[14px] flex-shrink-0" />
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

  // ── Observer: Poll active runs on a steady interval for live logs/residuals ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const isActive =
      activeSimId &&
      (status === "PENDING" || status === "RUNNING" || status === "MESHING");

    if (!isActive) return;

    const POLL_MS = 3_000;

    async function poll() {
      if (cancelled) return;
      try {
        const { data } = await apiClient.get(
          `/api/runs/${activeSimId}/`,
        );
        if (cancelled) return;
        updateSim(data);
        if (data.status === "COMPLETED" || data.status === "FAILED") return;
      } catch (error) {
        console.error("Polling error fetching run:", error);
      }
      timer = setTimeout(poll, POLL_MS);
    }

    timer = setTimeout(poll, POLL_MS);
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
        const { data } = await apiClient.get(
          `/api/runs/${activeSimId}/analysis/`,
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
      const { data } = await apiClient.post("/api/assets/", form, {
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
            className="absolute inset-0 z-50 flex items-center justify-center bg-nereus-base/80"
          >
            <div className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-[rgba(0,212,255,0.4)]" style={{ borderRadius: '2px' }}>
              <Upload className="h-8 w-8 text-nereus-accent" />
              <span className="text-[12px] font-medium text-nereus-accent">Drop geometry file to upload</span>
              <span className="text-[10px] text-[rgba(255,255,255,0.35)]">{ACCEPTED_EXTENSIONS.join(", ")}</span>
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
              className="absolute left-0 top-0 bottom-0 z-30 w-56 border-r border-[rgba(255,255,255,0.06)] bg-[#0d0f14] overflow-y-auto scrollbar-dark flex flex-col"
            >
              {/* Close button inside panel header */}
              <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1">
                <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.25)]">Explorer</span>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-0.5 hover:bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.7)] transition-colors"
                  style={{ borderRadius: '2px' }}
                >
                  <PanelLeftClose className="h-[14px] w-[14px]" />
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
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1.5 px-1 py-2.5 bg-[#0d0f14] border border-l-0 border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.7)] hover:bg-nereus-panel transition-all duration-200"
          style={{ borderRadius: '0 2px 2px 0' }}
          title="Show assets & runs"
        >
          <PanelLeftOpen className="h-[14px] w-[14px]" />
          <span className="text-[9px] font-medium tracking-widest uppercase [writing-mode:vertical-lr]">Assets</span>
        </button>
      )}

      {/* ── Center — VTK Viewport + Log Console ── */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex-1 relative overflow-hidden min-h-0">
          <VtkViewport />
        </div>
        <div className="border-t border-[rgba(255,255,255,0.06)] bg-nereus-base h-56 flex-shrink-0">
          <LogConsoleCompact />
        </div>
      </main>

      {/* ── Column 3: Right Panel — Config or Analysis ── */}
      <aside className="w-72 border-l border-[rgba(255,255,255,0.06)] bg-[#0d0f14] overflow-y-auto scrollbar-dark flex flex-col flex-shrink-0 p-3">
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
