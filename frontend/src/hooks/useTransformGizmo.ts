/**
 * useTransformGizmo — Unity-style Translate / Rotate / Scale gizmo for VTK.js.
 *
 * Creates coloured per-axis handles (rings for rotate, arrows for translate,
 * cubes for scale) and wires up pointer interaction so the user can click-drag
 * directly in the viewport.  Shift = snappy (15° / grid-snap).
 */
import { useEffect, useRef, useCallback } from "react";
import type { RefObject } from "react";

import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkTubeFilter from "@kitware/vtk.js/Filters/General/TubeFilter";
import vtkArrowSource from "@kitware/vtk.js/Filters/Sources/ArrowSource";
import vtkSphereSource from "@kitware/vtk.js/Filters/Sources/SphereSource";
import vtkCellPicker from "@kitware/vtk.js/Rendering/Core/CellPicker";
import vtkCoordinate from "@kitware/vtk.js/Rendering/Core/Coordinate";

import type { VtkContext } from "./useVtkRenderer";
import { useSimStore } from "../store/useSimStore";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Constants ────────────────────────────────────────────────────────────────

type Axis = "x" | "y" | "z";

const AXIS_COLORS: Record<Axis, [number, number, number]> = {
  x: [0.92, 0.22, 0.22], // Red
  y: [0.22, 0.82, 0.22], // Green
  z: [0.30, 0.50, 0.95], // Blue
};

const AXIS_HIGHLIGHT: Record<Axis, [number, number, number]> = {
  x: [1.0, 0.45, 0.45],
  y: [0.45, 1.0, 0.45],
  z: [0.55, 0.72, 1.0],
};

const RING_SEGMENTS = 64;
const SNAP_ANGLE_DEG = 15;
const SNAP_TRANSLATE = 0.05; // world units

// ─── Geometry builders ────────────────────────────────────────────────────────

/** Create a ring (closed polyline → tube) in the plane perpendicular to `axis`. */
function createRingActor(
  axis: Axis,
  radius: number,
  tubeRadius: number,
): any {
  const N = RING_SEGMENTS;
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const θ = (2 * Math.PI * i) / N;
    const c = Math.cos(θ) * radius;
    const s = Math.sin(θ) * radius;
    const idx = i * 3;
    if (axis === "x") {
      pts[idx] = 0;
      pts[idx + 1] = c;
      pts[idx + 2] = s;
    } else if (axis === "y") {
      pts[idx] = c;
      pts[idx + 1] = 0;
      pts[idx + 2] = s;
    } else {
      pts[idx] = c;
      pts[idx + 1] = s;
      pts[idx + 2] = 0;
    }
  }

  // Build closed polyline cell: [N+1, 0, 1, …, N-1, 0]
  const lineIds = new Uint32Array(N + 2);
  lineIds[0] = N + 1; // cell size (N+1 point indices)
  for (let i = 0; i < N; i++) lineIds[i + 1] = i;
  lineIds[N + 1] = 0; // close

  const polyData = vtkPolyData.newInstance();
  polyData.getPoints().setData(pts, 3);
  polyData.getLines().setData(lineIds);

  const tube = vtkTubeFilter.newInstance();
  tube.setInputData(polyData);
  tube.setRadius(tubeRadius);
  tube.setNumberOfSides(8);

  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(tube.getOutputPort());

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  const prop = actor.getProperty();
  prop.setColor(...AXIS_COLORS[axis]);
  prop.setAmbient(0.8);
  prop.setDiffuse(0.2);
  prop.setSpecular(0);
  prop.setLighting(false);
  actor.setPickable(true);

  return actor;
}

/** Create an arrow actor pointing along `axis`. */
function createArrowActor(axis: Axis, length: number, shaftRadius: number): any {
  const src = vtkArrowSource.newInstance();
  src.setTipLength(0.2);
  src.setTipRadius(0.06);
  src.setShaftRadius(0.02);
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(src.getOutputPort());
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  const prop = actor.getProperty();
  prop.setColor(...AXIS_COLORS[axis]);
  prop.setAmbient(0.8);
  prop.setDiffuse(0.2);
  prop.setLighting(false);
  actor.setPickable(true);

  // Scale along the arrow's default direction (+X), then rotate appropriately
  actor.setScale(length, shaftRadius * 8, shaftRadius * 8);

  if (axis === "y") {
    actor.rotateZ(90);
  } else if (axis === "z") {
    actor.rotateY(-90);
  }

  return actor;
}

/** Create a small sphere handle for Scale mode. */
function createScaleHandleActor(axis: Axis, dist: number, handleSize: number): any {
  const src = vtkSphereSource.newInstance();
  src.setRadius(handleSize);
  src.setThetaResolution(12);
  src.setPhiResolution(12);
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(src.getOutputPort());
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  const prop = actor.getProperty();
  prop.setColor(...AXIS_COLORS[axis]);
  prop.setAmbient(0.8);
  prop.setDiffuse(0.2);
  prop.setLighting(false);
  actor.setPickable(true);

  // Position at axis endpoint
  const pos: [number, number, number] = [0, 0, 0];
  if (axis === "x") pos[0] = dist;
  else if (axis === "y") pos[1] = dist;
  else pos[2] = dist;
  actor.setPosition(...pos);

  return actor;
}

// Also create thin axis line for scale mode
function createAxisLineActor(axis: Axis, dist: number, lineRadius: number): any {
  const pts = new Float32Array(6); // 2 points
  if (axis === "x") {
    pts[3] = dist;
  } else if (axis === "y") {
    pts[4] = dist;
  } else {
    pts[5] = dist;
  }
  const lineIds = new Uint32Array([2, 0, 1]);
  const polyData = vtkPolyData.newInstance();
  polyData.getPoints().setData(pts, 3);
  polyData.getLines().setData(lineIds);

  const tube = vtkTubeFilter.newInstance();
  tube.setInputData(polyData);
  tube.setRadius(lineRadius);
  tube.setNumberOfSides(6);

  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(tube.getOutputPort());
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  const prop = actor.getProperty();
  prop.setColor(...AXIS_COLORS[axis]);
  prop.setAmbient(0.8);
  prop.setDiffuse(0.2);
  prop.setLighting(false);
  actor.setPickable(false); // only the handle sphere is pickable

  return actor;
}

// ─── Coordinate projection helper ─────────────────────────────────────────────

function worldToDisplay(
  renderer: any,
  wx: number,
  wy: number,
  wz: number,
): [number, number] {
  const coord = vtkCoordinate.newInstance();
  coord.setCoordinateSystemToWorld();
  coord.setValue([wx, wy, wz]);
  const d = coord.getComputedDisplayValue(renderer);
  return [d[0], d[1]];
}

// ─── Gizmo actor set ─────────────────────────────────────────────────────────

interface GizmoActors {
  xHandle: any;
  yHandle: any;
  zHandle: any;
  extras: any[]; // axis-line actors for scale mode etc.
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useTransformGizmo(
  contextRef: RefObject<VtkContext | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  contextReady: boolean,
) {
  const gizmoActorsRef = useRef<GizmoActors | null>(null);
  const pickerRef = useRef<any>(null);

  // Drag state
  const draggingRef = useRef<{
    axis: Axis;
    startScreenX: number;
    startScreenY: number;
    startValue: number; // pitch/yaw/roll or position component
    centerDisplay: [number, number]; // foil center in screen coords
    accum: number; // accumulated raw value for snapping
  } | null>(null);
  const hoveredAxisRef = useRef<Axis | null>(null);

  // ── Store selectors ─────────────────────────────────────────────────────
  const gizmoMode = useSimStore((s) => s.gizmoMode);
  const vtkSceneBounds = useSimStore((s) => s.vtkSceneBounds);

  // ── Render helper ───────────────────────────────────────────────────────
  const render = useCallback(() => {
    contextRef.current?.renderWindow?.render();
  }, [contextRef]);

  // ── Remove current gizmo actors ─────────────────────────────────────────
  const clearGizmo = useCallback(() => {
    const ctx = contextRef.current;
    const ga = gizmoActorsRef.current;
    if (!ctx || !ga) return;
    const { renderer } = ctx;
    for (const a of [ga.xHandle, ga.yHandle, ga.zHandle, ...ga.extras]) {
      try {
        renderer.removeActor(a);
        a.delete();
      } catch {
        /* already gone */
      }
    }
    gizmoActorsRef.current = null;
  }, [contextRef]);

  // ── Build gizmo actors for current mode & bounds ────────────────────────
  // Only rebuild when gizmoMode changes. Bounds changes just reposition.
  const initialBoundsRef = useRef<[number, number, number, number, number, number] | null>(null);

  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx || !contextReady) return;

    // Always clear old gizmo first
    clearGizmo();

    if (gizmoMode === "none" || !vtkSceneBounds) {
      initialBoundsRef.current = null;
      render();
      return;
    }

    // Capture the bounds at creation time for sizing
    initialBoundsRef.current = vtkSceneBounds;

    const [xMin, xMax, yMin, yMax, zMin, zMax] = vtkSceneBounds;
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const cz = (zMin + zMax) / 2;
    const maxExtent = Math.max(
      xMax - xMin,
      yMax - yMin,
      zMax - zMin,
      0.01,
    );
    const gizmoRadius = maxExtent * 0.75;
    const tubeRadius = maxExtent * 0.015;

    const { renderer } = ctx;
    let xHandle: any, yHandle: any, zHandle: any;
    const extras: any[] = [];

    if (gizmoMode === "rotate") {
      xHandle = createRingActor("x", gizmoRadius, tubeRadius);
      yHandle = createRingActor("y", gizmoRadius, tubeRadius);
      zHandle = createRingActor("z", gizmoRadius, tubeRadius);
      // Position at foil center
      for (const a of [xHandle, yHandle, zHandle]) a.setPosition(cx, cy, cz);
    } else if (gizmoMode === "translate") {
      const arrowLen = gizmoRadius * 1.2;
      xHandle = createArrowActor("x", arrowLen, tubeRadius);
      yHandle = createArrowActor("y", arrowLen, tubeRadius);
      zHandle = createArrowActor("z", arrowLen, tubeRadius);
      for (const a of [xHandle, yHandle, zHandle]) a.addPosition(cx, cy, cz);
    } else {
      // scale
      const dist = gizmoRadius;
      const handleSize = maxExtent * 0.04;
      xHandle = createScaleHandleActor("x", dist, handleSize);
      yHandle = createScaleHandleActor("y", dist, handleSize);
      zHandle = createScaleHandleActor("z", dist, handleSize);
      for (const a of [xHandle, yHandle, zHandle]) a.addPosition(cx, cy, cz);

      // Axis lines
      for (const axis of ["x", "y", "z"] as Axis[]) {
        const line = createAxisLineActor(axis, dist, tubeRadius * 0.5);
        line.addPosition(cx, cy, cz);
        extras.push(line);
        renderer.addActor(line);
      }
    }

    renderer.addActor(xHandle);
    renderer.addActor(yHandle);
    renderer.addActor(zHandle);

    gizmoActorsRef.current = { xHandle, yHandle, zHandle, extras };

    // Create picker if needed
    if (!pickerRef.current) {
      pickerRef.current = vtkCellPicker.newInstance();
      pickerRef.current.setTolerance(0.008);
    }

    render();

    return () => {
      clearGizmo();
      render();
    };
    // Only rebuild gizmo when mode changes or context becomes ready.
    // Bounds changes are handled by the reposition effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gizmoMode, contextReady]);

  // ── Reposition gizmo actors when bounds change (no rebuild) ─────────────
  useEffect(() => {
    const ga = gizmoActorsRef.current;
    if (!ga || !vtkSceneBounds) return;

    const [xMin, xMax, yMin, yMax, zMin, zMax] = vtkSceneBounds;
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const cz = (zMin + zMax) / 2;

    // Reposition all gizmo handles to new center
    for (const a of [ga.xHandle, ga.yHandle, ga.zHandle]) {
      if (a) a.setPosition(cx, cy, cz);
    }
    // Reposition extras (scale mode axis lines)
    for (const a of ga.extras) {
      if (a) a.setPosition(cx, cy, cz);
    }

    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vtkSceneBounds]);

  // ── Pointer interaction ─────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const ctx = contextRef.current;
    if (!container || !ctx || !contextReady) return;

    const { renderer, interactor } = ctx;

    /** Convert DOM pointer position → VTK display coords (bottom-left origin). */
    function toVtkDisplay(e: PointerEvent): [number, number] {
      const rect = container!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = (e.clientX - rect.left) * dpr;
      const y = (rect.height - (e.clientY - rect.top)) * dpr;
      return [x, y];
    }

    /** Pick gizmo actor at screen position. Returns axis or null. */
    function pickGizmo(e: PointerEvent): Axis | null {
      const ga = gizmoActorsRef.current;
      const picker = pickerRef.current;
      if (!ga || !picker) return null;

      const [dx, dy] = toVtkDisplay(e);
      picker.pick([dx, dy, 0], renderer);
      const pickedActors = picker.getActors();
      if (!pickedActors || pickedActors.length === 0) return null;

      const pa = pickedActors[0];
      if (pa === ga.xHandle) return "x";
      if (pa === ga.yHandle) return "y";
      if (pa === ga.zHandle) return "z";
      return null;
    }

    // ── Hover highlighting ────────────────────────────────────────
    function onPointerMove(e: PointerEvent) {
      // During drag, compute delta and apply
      if (draggingRef.current) {
        handleDrag(e);
        return;
      }

      const axis = pickGizmo(e);
      const prev = hoveredAxisRef.current;
      if (axis === prev) return;

      const ga = gizmoActorsRef.current;
      if (!ga) return;

      // Restore previous
      if (prev) {
        const prevActor =
          prev === "x" ? ga.xHandle : prev === "y" ? ga.yHandle : ga.zHandle;
        prevActor?.getProperty()?.setColor(...AXIS_COLORS[prev]);
      }

      // Highlight current
      if (axis) {
        const curActor =
          axis === "x" ? ga.xHandle : axis === "y" ? ga.yHandle : ga.zHandle;
        curActor?.getProperty()?.setColor(...AXIS_HIGHLIGHT[axis]);
        container!.style.cursor = "grab";
      } else {
        container!.style.cursor = "";
      }

      hoveredAxisRef.current = axis;
      render();
    }

    // ── Drag start  ───────────────────────────────────────────────
    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return; // left button only
      const mode = useSimStore.getState().gizmoMode;
      if (mode === "none") return;

      const axis = pickGizmo(e);
      if (!axis) return;

      // Prevent VTK camera interaction
      e.stopPropagation();
      e.preventDefault();

      // Disable the VTK interactor so camera doesn't move
      try {
        interactor.setEnabled(false);
      } catch {
        /* */
      }

      const state = useSimStore.getState();
      let startValue = 0;
      if (mode === "rotate") {
        if (axis === "x") startValue = state.pitch;
        else if (axis === "y") startValue = state.roll;
        else startValue = state.yaw;
      }

      // Get foil center in display
      const bounds = state.vtkSceneBounds;
      const centerDisplay: [number, number] = bounds
        ? worldToDisplay(
            renderer,
            (bounds[0] + bounds[1]) / 2,
            (bounds[2] + bounds[3]) / 2,
            (bounds[4] + bounds[5]) / 2,
          )
        : [0, 0];

      draggingRef.current = {
        axis,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startValue,
        centerDisplay,
        accum: startValue,
      };

      container!.style.cursor = "grabbing";

      // Capture pointer so we get move/up even if mouse leaves
      container!.setPointerCapture(e.pointerId);
    }

    // ── Drag update ───────────────────────────────────────────────
    function handleDrag(e: PointerEvent) {
      const d = draggingRef.current;
      if (!d) return;

      const mode = useSimStore.getState().gizmoMode;
      const shiftHeld = e.shiftKey;

      if (mode === "rotate") {
        // Compute angle from foil center to mouse start vs. current
        const rect = container!.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const cx = d.centerDisplay[0] / dpr;
        // Convert VTK y (bottom-origin) to DOM y (top-origin)
        const canvasH = rect.height;
        const cy = canvasH - d.centerDisplay[1] / dpr;

        const startAngle = Math.atan2(
          d.startScreenY - rect.top - cy,
          d.startScreenX - rect.left - cx,
        );
        const curAngle = Math.atan2(
          e.clientY - rect.top - cy,
          e.clientX - rect.left - cx,
        );

        const deltaDeg = ((curAngle - startAngle) * 180) / Math.PI;

        let newVal = d.startValue + deltaDeg;

        if (shiftHeld) {
          newVal = Math.round(newVal / SNAP_ANGLE_DEG) * SNAP_ANGLE_DEG;
        }

        // Clamp to ±180
        while (newVal > 180) newVal -= 360;
        while (newVal < -180) newVal += 360;

        const store = useSimStore.getState();
        if (d.axis === "x") store.setPitch(newVal);
        else if (d.axis === "y") store.setRoll(newVal);
        else store.setYaw(newVal);
      } else if (mode === "translate") {
        // Simple screen-space translation: pixel delta → world delta
        const dx = e.clientX - d.startScreenX;
        const dy = -(e.clientY - d.startScreenY); // invert Y
        const sensitivity = 0.002;
        const bounds = useSimStore.getState().vtkSceneBounds;
        const maxExtent = bounds
          ? Math.max(
              bounds[1] - bounds[0],
              bounds[3] - bounds[2],
              bounds[5] - bounds[4],
              0.01,
            )
          : 1;
        let delta: number;
        if (d.axis === "x") delta = dx * sensitivity * maxExtent;
        else if (d.axis === "y") delta = dy * sensitivity * maxExtent;
        else delta = dy * sensitivity * maxExtent;

        if (shiftHeld) {
          delta = Math.round(delta / SNAP_TRANSLATE) * SNAP_TRANSLATE;
        }

        // For now, log the delta — translate isn't wired to store yet since
        // the CFD pipeline doesn't support repositioning. Instead we update
        // a CSS feedback element via a custom event.
        console.info(`[Gizmo] translate ${d.axis}: ${delta.toFixed(4)}`);
      }
    }

    // ── Drag end ──────────────────────────────────────────────────
    function onPointerUp(e: PointerEvent) {
      if (!draggingRef.current) return;

      draggingRef.current = null;
      container!.style.cursor = "";
      hoveredAxisRef.current = null;

      // Re-enable VTK camera interaction
      try {
        interactor.setEnabled(true);
      } catch {
        /* */
      }

      try {
        container!.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }

      render();
    }

    // Attach listeners — capture phase so we intercept before VTK
    container.addEventListener("pointerdown", onPointerDown, { capture: true });
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextReady, render]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const setMode = useSimStore.getState().setGizmoMode;
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setMode("translate");
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setMode("rotate");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setMode("scale");
      } else if (e.key === "Escape" || e.key === "q" || e.key === "Q") {
        e.preventDefault();
        setMode("none");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
