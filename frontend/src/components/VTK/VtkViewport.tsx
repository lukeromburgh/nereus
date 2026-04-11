/**
 * VtkViewport — Main 3D viewport powered by VTK.js (Updated).
 *
 * Manages a single <div> container that VTK.js renders into.
 * Updated to use the new StatusBadge and redesigned MetricHUD.
 */
import { useCallback, useRef } from "react";
import { useSimStore } from "../../store/useSimStore";
import { useVtkRenderer } from "../../hooks/useVtkRenderer";
import { useVtkScene } from "../../hooks/useVtkScene";
import { useVtkPlayback } from "../../hooks/useVtkPlayback";
import { useTransformGizmo } from "../../hooks/useTransformGizmo";
import { StatusBadge } from "./StatusBadge";
import { GizmoToolbar } from "../GizmoToolbar";
import { LayerManager } from ".././LayerManager";
import { ColorbarLegend } from ".././ColorbarLegend";
import { TimelineController } from ".././TimelineController";

export function VtkViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { contextRef: vtkContext, contextReady } = useVtkRenderer(containerRef);

  // ── Store reads ──────────────────────────────────────────────────────
  const activeSimId = useSimStore((s) => s.activeSimId);
  const status = useSimStore((s) => s.status) as
    | "IDLE"
    | "PENDING"
    | "MESHING"
    | "SOLVING"
    | "COMPLETED"
    | "FAILED";
  const logs = useSimStore((s) => s.logs);

  // ── Extract time line from logs ──────────────────────────────────────
  const timeLine = (() => {
    const lines = (logs || "").split("\n");
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (line.includes("Time =")) {
        // Extract just the time value
        const match = line.match(/Time = ([\d.]+)/);
        return match ? `T = ${match[1]} s` : null;
      }
    }
    return null;
  })();

  // ── Scene management ─────────────────────────────────────────────────
  useVtkScene(vtkContext, contextReady);

  // ── Transform gizmo ─────────────────────────────────────────────────
  useTransformGizmo(vtkContext, containerRef, contextReady);

  // ── Playback loop ────────────────────────────────────────────────────
  const renderVtk = useCallback(() => {
    vtkContext.current?.renderWindow?.render();
  }, [vtkContext.current?.renderWindow]);
  useVtkPlayback(renderVtk);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full relative overflow-hidden bg-nereus-base">
      {/* Fixed CSS grid background — never rotates, like Unity's infinite grid */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px, 20px 20px, 100px 100px, 100px 100px",
          backgroundPosition: "center center",
        }}
      />

      {/* VTK.js canvas container — transparent bg so CSS grid shows through */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-[1]"
        style={{ touchAction: "none" }}
      />

      {/* Status badge (top-left, minimal) */}
      <StatusBadge runId={activeSimId != null ? String(activeSimId) : null} status={status} timeLine={timeLine} />

      {/* Main metrics overlay removed (redundant) */}
      {/* <MetricHUD /> */}

      {/* Transform gizmo toolbar (top center) */}
      <GizmoToolbar />

      {/* Analysis overlays (DOM) */}
      <LayerManager />
      <ColorbarLegend />

      {/* Timeline controller (bottom bar) */}
      <div className="absolute left-2.5 right-2.5 bottom-2.5 z-30">
        <TimelineController />
      </div>
    </div>
  );
}