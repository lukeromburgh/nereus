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
      ? "bg-[rgba(0,212,255,0.08)] text-nereus-accent border-[rgba(0,212,255,0.2)]"
      : status === "FAILED"
        ? "bg-[rgba(255,107,53,0.08)] text-nereus-orange border-[rgba(255,107,53,0.2)]"
        : status === "RUNNING" || status === "MESHING"
          ? "bg-[rgba(0,212,255,0.08)] text-nereus-accent border-[rgba(0,212,255,0.2)] animate-pulse-slow"
          : status === "PENDING"
            ? "bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.45)] border-[rgba(255,255,255,0.1)]"
            : "bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.35)] border-[rgba(255,255,255,0.08)]";

  return (
    <div className="h-10 flex items-center justify-between px-3 border-b border-[rgba(255,255,255,0.06)] bg-[#0d0f14]">
      {/* Brand + Nav */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Waves className="h-[14px] w-[14px] text-nereus-accent" />
          <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-[rgba(255,255,255,0.5)]">
            NEREUS
          </span>
        </div>
        <div className="h-3.5 w-px bg-[rgba(255,255,255,0.08)]" />
        <span className="text-[10px] text-[rgba(255,255,255,0.25)] tracking-[0.1em] uppercase">
          CFD Dashboard
        </span>
        {/* Nav Tabs */}
        <nav className="flex items-center gap-1.5 ml-4">
          <a
            href="/"
            className="text-[11px] font-medium px-2.5 py-1 border-b-2 border-transparent text-[rgba(255,255,255,0.5)] hover:text-nereus-accent hover:border-nereus-accent transition-colors duration-150"
          >
            Home
          </a>
          <a
            href="/comparison"
            className="text-[11px] font-medium px-2.5 py-1 border-b-2 border-transparent text-[rgba(255,255,255,0.5)] hover:text-nereus-accent hover:border-nereus-accent transition-colors duration-150"
          >
            Run Comparison
          </a>
        </nav>
        {status !== "IDLE" && (
          <>
            <div className="h-3.5 w-px bg-[rgba(255,255,255,0.08)]" />
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border ${statusColor}`}
              style={{ borderRadius: '2px' }}
            >
              <span className="h-1.5 w-1.5 bg-current" style={{ borderRadius: '1px' }} />
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
          className={`inline-flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-medium transition-all duration-200 ${
            uploadState === "uploading"
              ? "bg-nereus-panel text-[rgba(255,255,255,0.25)] cursor-not-allowed border border-[rgba(255,255,255,0.07)]"
              : "bg-[rgba(0,212,255,0.08)] text-nereus-accent hover:bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.2)] hover:border-[rgba(0,212,255,0.35)]"
          }`}
          style={{ borderRadius: '2px' }}
        >
          <Upload className="h-[14px] w-[14px]" />
          {uploadState === "uploading" ? "Uploading…" : "Upload"}
        </button>

        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1 px-2 h-7 text-[11px] font-medium border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] transition-all duration-200"
          style={{ borderRadius: '2px' }}
        >
          <RefreshCw className="h-[14px] w-[14px]" />
        </button>

        {uploadState === "error" && (
          <span className="text-[10px] text-nereus-orange ml-1">Upload failed</span>
        )}
      </div>
    </div>
  );
}
