/**
 * VtkViewport — Main 3D viewport powered by VTK.js.
 *
 * Replaces the React Three Fiber Viewport component.  Manages a single
 * <div> container that VTK.js renders into, with the same DOM overlay
 * structure (MetricHUD, LayerManager, ColorbarLegend, TimelineController).
 */
import { useCallback, useRef } from "react";
import { useSimStore } from "../store/useSimStore";
import { useVtkRenderer } from "../hooks/useVtkRenderer";
import { useVtkScene } from "../hooks/useVtkScene";
import { useVtkPlayback } from "../hooks/useVtkPlayback";
import { useTransformGizmo } from "../hooks/useTransformGizmo";
import { MetricHUD } from "./MetricHUD";
import { LayerManager } from "./LayerManager";
import { ColorbarLegend } from "./ColorbarLegend";
import { TimelineController } from "./TimelineController";
import { GizmoToolbar } from "./GizmoToolbar";

export function VtkViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { contextRef: vtkContext, contextReady } = useVtkRenderer(containerRef);

  // ── Store reads for the status badge ─────────────────────────────────────
  const activeSimId = useSimStore((s) => s.activeSimId);
  const status = useSimStore((s) => s.status);
  const logs = useSimStore((s) => s.logs);

  const timeLine = (() => {
    const lines = (logs || "").split("\n");
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (line.includes("Time =")) return line.trim();
    }
    return null;
  })();

  // ── Scene management ─────────────────────────────────────────────────────
  useVtkScene(vtkContext, contextReady);

  // ── Transform gizmo ─────────────────────────────────────────────────────
  useTransformGizmo(vtkContext, containerRef, contextReady);

  // ── Playback loop ────────────────────────────────────────────────────────
  const renderVtk = useCallback(() => {
    vtkContext.current?.renderWindow.render();
  }, [vtkContext]);
  useVtkPlayback(renderVtk);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* VTK.js canvas container — z-0 keeps it behind all overlays (z-10+) */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-0"
        style={{ touchAction: "none" }}
      />

      {/* Run status badge */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 glass-panel px-3 py-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">RUN</span>
          <span className="font-bold text-slate-200">{activeSimId ?? "—"}</span>
          <span className="text-hud-border">|</span>
          <span className="text-slate-500">STATUS</span>
          <span className="font-bold text-accent-cyan">{status}</span>
        </div>
        {timeLine ? (
          <div className="mt-1 text-slate-500">{timeLine}</div>
        ) : null}
      </div>

      {/* Analysis overlays (DOM) */}
      <MetricHUD />
      <LayerManager />
      <ColorbarLegend />

      {/* Transform gizmo toolbar (top center) */}
      <GizmoToolbar />

      {/* Timeline controller (bottom bar) */}
      <div className="absolute left-3 right-3 bottom-3 z-30">
        <TimelineController />
      </div>
    </div>
  );
}
