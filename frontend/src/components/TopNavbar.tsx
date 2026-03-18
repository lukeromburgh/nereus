import React, { useRef, useState } from "react";
import axios from "axios";
import { Upload, RefreshCw, Waves } from "lucide-react";
import { useSimStore } from "../store/useSimStore";

interface TopNavbarProps {
  onRefresh: () => void;
}

export function TopNavbar({ onRefresh }: TopNavbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { projectId, setSelectedAsset, status } = useSimStore();

  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "error"
  >("idle");

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadState("uploading");

    const form = new FormData();
    form.append("project", String(projectId));

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    form.append("name", baseName || "Hydrofoil");
    form.append("file", file);

    try {
      const { data } = await axios.post(
        "http://localhost:8000/api/assets/",
        form,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      if (typeof data?.id === "number") {
        setSelectedAsset(data);
      }

      setUploadState("idle");
      onRefresh();
    } catch (err) {
      console.error("Asset upload failed", err);
      setUploadState("error");
    } finally {
      e.target.value = "";
    }
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
    <div className="h-11 flex items-center justify-between px-4 border-b border-hud-border bg-surface-solid/90 backdrop-blur-hud">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Waves className="h-4 w-4 text-accent-cyan" />
          <span className="text-sm font-semibold tracking-wide text-slate-100 font-sans">
            NEREUS
          </span>
        </div>
        <div className="h-4 w-px bg-slate-700/50" />
        <span className="text-2xs text-slate-500 font-sans tracking-wider uppercase">
          CFD Dashboard
        </span>
        {status !== "IDLE" && (
          <>
            <div className="h-4 w-px bg-slate-700/50" />
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium border ${statusColor}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {status}
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".stl,.obj,.gltf,.glb"
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
          {uploadState === "uploading" ? "Uploading…" : "Upload"}
        </button>

        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-hud-border bg-surface-raised hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-all duration-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>

        {uploadState === "error" && (
          <span className="text-2xs text-accent-rose ml-1">Upload failed</span>
        )}
      </div>
    </div>
  );
}
