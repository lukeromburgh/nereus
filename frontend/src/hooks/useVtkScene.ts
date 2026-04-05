/**
 * useVtkScene — Manages all VTK actors for the hydrofoil CFD viewport.
 *
 * Architecture:
 *  - Geometry loading is decoupled from visual property updates (colormap,
 *    pressure toggle, orientation) to avoid race conditions.
 *  - Each load uses a monotonic generation counter so stale async results
 *    are discarded.
 *  - Supports both VTP (with scalar arrays like Cp, Cf) and plain STL.
 *  - For STL without scalar data, a synthetic x-coordinate based pressure
 *    gradient is generated when the pressure overlay is active.
 */
import { useEffect, useRef, useCallback } from "react";
import type { RefObject } from "react";

import vtkXMLPolyDataReader from "@kitware/vtk.js/IO/XML/XMLPolyDataReader";
import vtkSTLReader from "@kitware/vtk.js/IO/Geometry/STLReader";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkArrowSource from "@kitware/vtk.js/Filters/Sources/ArrowSource";
import vtkConeSource from "@kitware/vtk.js/Filters/Sources/ConeSource";
import vtkTubeFilter from "@kitware/vtk.js/Filters/General/TubeFilter";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkPolyDataNormals from "@kitware/vtk.js/Filters/Core/PolyDataNormals";
import vtkWindowedSincPolyDataFilter from "@kitware/vtk.js/Filters/General/WindowedSincPolyDataFilter";

import type { VtkContext } from "./useVtkRenderer";
import { useSimStore } from "../store/useSimStore";
import { createVtkLookupTable } from "../lib/vtkColormaps";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActorMap {
  foilSurface?: any;
  pressureLines?: any;
  flowLines?: any;
  axisX?: any;
  axisY?: any;
  axisZ?: any;
  flowArrow?: any;
  noseMarker?: any;
  tailMarker?: any;
  vorticity?: any;
  streamlines?: any;
}

interface CacheEntry {
  lastUsed: number;
  polyData: any;
  /** Pristine copy of vertex positions before any orientation rotation. */
  originalPoints: Float32Array;
  /** Pristine copy of vertex normals before any orientation rotation. */
  originalNormals: Float32Array | null;
  /** Geometric center of the unrotated geometry (rotation pivot). */
  center: [number, number, number];
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

async function fetchPolyData(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const arrayBuffer = await response.arrayBuffer();

  const clean = url.toLowerCase().replace(/\?.*$/, "");
  const isStl = clean.endsWith(".stl");

  let polyData: any;

  if (isStl) {
    const reader = vtkSTLReader.newInstance();
    reader.parseAsArrayBuffer(arrayBuffer);
    polyData = reader.getOutputData(0);
    if (!polyData || polyData.getNumberOfPoints() === 0)
      throw new Error("STLReader produced empty polydata");

    // ── Smooth geometry (Laplacian / windowed-sinc) ──────────────────
    // Reduces staircase artifacts on coarse STL surfaces before normals
    // are computed. passband=0.1 is a gentle low-pass; increase toward
    // 1.0 for stronger smoothing (more deviation from original shape).
    const smoother = vtkWindowedSincPolyDataFilter.newInstance();
    smoother.setInputData(polyData);
    smoother.setNumberOfIterations(20);
    smoother.setPassBand(0.1);           // 0 = max smooth, 1 = no smooth
    smoother.setBoundarySmoothing(false); // preserve sharp leading/trailing edges
    smoother.setFeatureEdgeSmoothing(false);
    smoother.setNonManifoldSmoothing(false);
    smoother.update();
    polyData = smoother.getOutputData();

  } else {
    // VTP (XML PolyData) — parse as-is; CFD solver output already has topology
    const reader = vtkXMLPolyDataReader.newInstance();
    reader.parseAsArrayBuffer(arrayBuffer);
    polyData = reader.getOutputData(0);
    if (!polyData || polyData.getNumberOfPoints() === 0)
      throw new Error("XMLPolyDataReader produced empty polydata");
  }

  // ── Compute smooth per-vertex normals ──────────────────────────────
  // This is the single biggest visual improvement: interpolated normals
  // enable Phong shading to produce a smooth silhouette even on a coarse
  // mesh. featureAngle=60° preserves hard edges (LE/TE) while smoothing
  // the bulk surface. setSplitting(false) avoids duplicating vertices at
  // sharp features, which keeps scalar arrays intact for pressure mapping.
  const normals = vtkPolyDataNormals.newInstance();
  normals.setInputData(polyData);
  normals.setComputePointNormals(true);
  normals.setComputeCellNormals(false);

  if (typeof normals.setSplitting === "function") {
    normals.setSplitting(false); // keep topology — scalars stay aligned
  }
  if (typeof normals.setFeatureAngle === "function") {
    normals.setFeatureAngle(60); // degrees: below → smooth, above → crease
  }
  if (typeof normals.setConsistency === "function") {
    normals.setConsistency(true); // fix flipped winding order
  }
  if (typeof normals.setAutoOrientNormals === "function") {
    normals.setAutoOrientNormals(true); // ensure outward-facing normals
  }
  if (typeof normals.setNonManifoldTraversal === "function") {
    normals.setNonManifoldTraversal(false);
  }

  normals.update();

  const out = normals.getOutputData();
  if (!out || out.getNumberOfPoints() === 0)
    throw new Error("PolyDataNormals produced empty output");

  return out;
}

/**
 * Inject a synthetic scalar array based on the x-coordinate so that
 * STL meshes (which carry no field data) can still display a pressure-like
 * gradient along the chord.
 */
function ensureScalarArray(
  polyData: any,
): { name: string; range: [number, number] } | null {
  const pd = polyData.getPointData?.();
  // Prefer real CFD arrays
  for (const name of ["Cp", "p"]) {
    const arr = pd?.getArrayByName?.(name);
    if (arr) return { name, range: arr.getRange() as [number, number] };
  }

  // Synthesise from x-coordinate
  const nPts = polyData.getNumberOfPoints();
  if (nPts === 0) return null;

  const pts = polyData.getPoints().getData(); // Float32/64Array [x0,y0,z0, x1,…]
  const values = new Float32Array(nPts);
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < nPts; i++) {
    const x = pts[i * 3];
    values[i] = x;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  // Normalise to [0,1] to mimic Cp range
  const span = hi - lo || 1;
  for (let i = 0; i < nPts; i++) values[i] = (values[i] - lo) / span;

  const pointData = polyData.getPointData?.();
  if (!pointData) return null;

  const da = vtkDataArray.newInstance({ name: "x_pressure", values });
  pointData.addArray(da);
  return { name: "x_pressure", range: [0, 1] };
}

// ─── Helper actors ───────────────────────────────────────────────────────────

/**
 * Build coloured world-axis lines (Red=X, Green=Y, Blue=Z) centred on the
 * foil.  These stay world-fixed so the user always sees the reference frame.
 */
function buildAxisLineActors(bounds: number[]): { x: any; y: any; z: any } {
  const chord = Math.max(bounds[1] - bounds[0], 0.01);
  const len = chord * 2.5;
  const cx = (bounds[0] + bounds[1]) / 2;
  const cy = (bounds[2] + bounds[3]) / 2;
  const cz = (bounds[4] + bounds[5]) / 2;

  function makeLine(
    dx: number[], color: [number, number, number],
  ): any {
    const pts = new Float32Array([
      cx - dx[0] * len, cy - dx[1] * len, cz - dx[2] * len,
      cx + dx[0] * len, cy + dx[1] * len, cz + dx[2] * len,
    ]);
    const lineIds = new Uint32Array([2, 0, 1]);
    const pd = vtkPolyData.newInstance();
    pd.getPoints().setData(pts, 3);
    pd.getLines().setData(lineIds);
    const tube = vtkTubeFilter.newInstance();
    tube.setInputData(pd);
    tube.setRadius(chord * 0.004);
    tube.setNumberOfSides(6);
    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(tube.getOutputPort());
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(...color);
    actor.getProperty().setAmbient(0.9);
    actor.getProperty().setDiffuse(0.1);
    actor.getProperty().setLighting(false);
    actor.getProperty().setOpacity(0.45);
    actor.setPickable(false);
    return actor;
  }

  return {
    x: makeLine([1, 0, 0], [0.85, 0.15, 0.15]),
    y: makeLine([0, 1, 0], [0.15, 0.75, 0.15]),
    z: makeLine([0, 0, 1], [0.20, 0.40, 0.90]),
  };
}

function buildFlowArrowActor(bounds: number[]): any {
  const chord = Math.max(bounds[1] - bounds[0], 0.01);
  const src = vtkArrowSource.newInstance();
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(src.getOutputPort());
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setColor(0.376, 0.647, 0.98);
  actor.setPosition(
    bounds[0] - chord * 1.5,
    (bounds[2] + bounds[3]) / 2,
    (bounds[4] + bounds[5]) / 2,
  );
  actor.setScale(chord * 0.8, chord * 0.08, chord * 0.08);
  return actor;
}

function buildMarkerActors(bounds: number[]): { nose: any; tail: any } {
  const chord = Math.max(bounds[1] - bounds[0], 0.01);
  const r = Math.max(chord / 20, 0.005);
  const h = Math.max(chord / 10, 0.01);
  const cy = (bounds[2] + bounds[3]) / 2;
  const cz = (bounds[4] + bounds[5]) / 2;

  const noseSrc = vtkConeSource.newInstance({
    radius: r,
    height: h,
    resolution: 16,
    direction: [-1, 0, 0],
  });
  const noseMapper = vtkMapper.newInstance();
  noseMapper.setInputConnection(noseSrc.getOutputPort());
  const noseActor = vtkActor.newInstance();
  noseActor.setMapper(noseMapper);
  noseActor.getProperty().setColor(0.133, 0.773, 0.369);
  noseActor.setPosition(bounds[0], cy, cz);

  const tailSrc = vtkConeSource.newInstance({
    radius: r * 0.7,
    height: h * 0.7,
    resolution: 16,
    direction: [1, 0, 0],
  });
  const tailMapper = vtkMapper.newInstance();
  tailMapper.setInputConnection(tailSrc.getOutputPort());
  const tailActor = vtkActor.newInstance();
  tailActor.setMapper(tailMapper);
  tailActor.getProperty().setColor(0.937, 0.267, 0.267);
  tailActor.setPosition(bounds[1], cy, cz);

  return { nose: noseActor, tail: tailActor };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeRemoveActor(renderer: any, actor: any) {
  if (!actor || !renderer) return;
  try {
    renderer.removeActor(actor);
  } catch {
    /* already removed */
  }
  try {
    actor.delete();
  } catch {
    /* already deleted */
  }
}

// ─── Data-level rotation ─────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;

/**
 * Rotate polyData vertex positions (and normals) in-place from pristine
 * originals.  This transforms the actual geometry rather than the actor,
 * so that getBounds(), markers, and gizmos all reflect the true rotated
 * shape.
 *
 * Rotation order: Y(yaw) → X(pitch) → Z(roll) — matches the previous
 * actor-level convention that the simulation worker also uses.
 */
function applyDataRotation(
  polyData: any,
  origPts: Float32Array,
  origNorms: Float32Array | null,
  cx: number,
  cy: number,
  cz: number,
  pitchDeg: number,
  rollDeg: number,
  yawDeg: number,
) {
  const pts = polyData.getPoints().getData() as Float32Array;
  const nPts = origPts.length / 3;

  // Identity — fast path: just copy originals back
  if (pitchDeg === 0 && rollDeg === 0 && yawDeg === 0) {
    pts.set(origPts);
    if (origNorms) {
      const norms = polyData.getPointData()?.getNormals?.()?.getData?.();
      if (norms) (norms as Float32Array).set(origNorms);
    }
    polyData.getPoints().modified();
    polyData.modified();
    return;
  }

  const yRad = yawDeg * DEG_TO_RAD;
  const pRad = pitchDeg * DEG_TO_RAD;
  const rRad = rollDeg * DEG_TO_RAD;
  const cosY = Math.cos(yRad), sinY = Math.sin(yRad);
  const cosP = Math.cos(pRad), sinP = Math.sin(pRad);
  const cosR = Math.cos(rRad), sinR = Math.sin(rRad);

  for (let i = 0; i < nPts; i++) {
    const idx = i * 3;
    // Center-relative coordinates
    const x = origPts[idx] - cx;
    const y = origPts[idx + 1] - cy;
    const z = origPts[idx + 2] - cz;

    // Ry(yaw)
    const x1 = x * cosY + z * sinY;
    const y1 = y;
    const z1 = -x * sinY + z * cosY;

    // Rx(pitch)
    const x2 = x1;
    const y2 = y1 * cosP - z1 * sinP;
    const z2 = y1 * sinP + z1 * cosP;

    // Rz(roll)
    pts[idx]     = x2 * cosR - y2 * sinR + cx;
    pts[idx + 1] = x2 * sinR + y2 * cosR + cy;
    pts[idx + 2] = z2 + cz;
  }

  // Rotate normals (same matrix, no translation)
  if (origNorms) {
    const norms = polyData.getPointData()?.getNormals?.()?.getData?.();
    if (norms) {
      for (let i = 0; i < nPts; i++) {
        const idx = i * 3;
        const nx = origNorms[idx];
        const ny = origNorms[idx + 1];
        const nz = origNorms[idx + 2];

        const nx1 = nx * cosY + nz * sinY;
        const ny1 = ny;
        const nz1 = -nx * sinY + nz * cosY;

        const nx2 = nx1;
        const ny2 = ny1 * cosP - nz1 * sinP;
        const nz2 = ny1 * sinP + nz1 * cosP;

        (norms as Float32Array)[idx]     = nx2 * cosR - ny2 * sinR;
        (norms as Float32Array)[idx + 1] = nx2 * sinR + ny2 * cosR;
        (norms as Float32Array)[idx + 2] = nz2;
      }
    }
  }

  polyData.getPoints().modified();
  polyData.modified();
}

// ─── Main hook ───────────────────────────────────────────────────────────────

export function useVtkScene(
  contextRef: RefObject<VtkContext | null>,
  contextReady?: boolean,
) {
  const actorsRef = useRef<ActorMap>({});
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const cameraFittedRef = useRef(false);
  const loadedRunRef = useRef<number | null>(null);
  const lastFoilUrlRef = useRef<string | null>(null);
  // Monotonic generation counter to discard stale async loads
  const genRef = useRef(0);
  // Store the loaded polyData for the foil so coloring can be updated independently
  const foilPolyRef = useRef<any>(null);
  // Pristine copies of vertex data for data-level rotation
  const originalPointsRef = useRef<Float32Array | null>(null);
  const originalNormalsRef = useRef<Float32Array | null>(null);
  const originalCenterRef = useRef<[number, number, number]>([0, 0, 0]);

  // ── Store selectors ──────────────────────────────────────────────────────
  const activeSimId = useSimStore((s) => s.activeSimId);
  const resultMeshPath = useSimStore((s) => s.resultMeshPath);
  const totalFrames = useSimStore((s) => s.totalFrames);
  const currentFrame = useSimStore((s) => s.currentFrame);
  const frameMapping = useSimStore((s) => s.frameMapping);
  const selectedAssetFileUrl = useSimStore((s) => s.selectedAssetFileUrl);

  const showPressureMap = useSimStore((s) => s.showPressureMap);
  const showFlowLines = useSimStore((s) => s.showFlowLines);
  const showVorticity = useSimStore((s) => s.showVorticity);
  const showStreamlines = useSimStore((s) => s.showStreamlines);
  const colormap = useSimStore((s) => s.colormap);

  const pitch = useSimStore((s) => s.pitch);
  const roll = useSimStore((s) => s.roll);
  const yaw = useSimStore((s) => s.yaw);

  const setVtkSceneBounds = useSimStore((s) => s.setVtkSceneBounds);

  const baseUrl = "http://localhost:8000";

  // ── Render helper ────────────────────────────────────────────────────────
  const render = useCallback(() => {
    contextRef.current?.renderWindow?.render();
  }, [contextRef]);

  // ── Remove a named actor ─────────────────────────────────────────────────
  const removeActor = useCallback(
    (key: keyof ActorMap) => {
      const ctx = contextRef.current;
      if (!ctx) return;
      const actor = actorsRef.current[key];
      if (actor) {
        safeRemoveActor(ctx.renderer, actor);
        actorsRef.current[key] = undefined;
      }
    },
    [contextRef],
  );

  // ── Clear all actors ─────────────────────────────────────────────────────
  const clearAllActors = useCallback(() => {
    for (const key of Object.keys(actorsRef.current) as (keyof ActorMap)[]) {
      removeActor(key);
    }
    foilPolyRef.current = null;
  }, [removeActor]);

  // ────────────────────────────────────────────────────────────────────────
  //  Derive URLs from store
  // ────────────────────────────────────────────────────────────────────────
  const activeFramePath =
    totalFrames > 0 ? (frameMapping[currentFrame]?.mesh_path ?? null) : null;
  const activeFrameUrl = activeFramePath
    ? `${baseUrl}${activeFramePath}`
    : null;
  const fallbackUrl = resultMeshPath ? `${baseUrl}${resultMeshPath}` : null;
  const assetPreviewUrl = selectedAssetFileUrl || null;
  const foilUrl = activeFrameUrl ?? fallbackUrl ?? assetPreviewUrl;

  // Pressure iso-surface lines (large STL from OpenFOAM sampling)
  const pressureLinesPath =
    totalFrames > 0
      ? (frameMapping[currentFrame]?.pressure_lines_path ?? null)
      : null;
  const pressureLinesUrl =
    showPressureMap && pressureLinesPath
      ? `${baseUrl}${pressureLinesPath}`
      : null;

  // Flow lines
  const flowLinesPath =
    totalFrames > 0
      ? (frameMapping[currentFrame]?.flow_lines_path ?? null)
      : null;
  const flowLinesUrl =
    showFlowLines && flowLinesPath ? `${baseUrl}${flowLinesPath}` : null;

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 1: Load foil surface geometry (ONLY when URL changes)
  //  Colormap / pressure toggle are handled separately in Effect 3.
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx) {
      console.warn("[useVtkScene] Effect 1: no VTK context yet");
      return;
    }

    if (!contextReady) {
      console.warn(
        "[useVtkScene] Effect 1: contextReady=false, deferring load",
      );
      return;
    }

    if (!foilUrl) {
      console.info("[useVtkScene] Effect 1: foilUrl is null, clearing actors");
      clearAllActors();
      render();
      return;
    }

    console.info("[useVtkScene] Effect 1: loading foil from", foilUrl);

    const lower = foilUrl.toLowerCase();
    if (!lower.endsWith(".vtp") && !lower.endsWith(".stl")) return;

    if (foilUrl !== lastFoilUrlRef.current) {
      cameraFittedRef.current = false;
    }

    const gen = ++genRef.current;

    (async () => {
      // ── Fetch / cache ────────────────────────────────────────────────
      let polyData: any;
      const cached = cacheRef.current.get(foilUrl);
      if (cached) {
        cached.lastUsed = Date.now();
        polyData = cached.polyData;
        originalPointsRef.current = cached.originalPoints;
        originalNormalsRef.current = cached.originalNormals;
        originalCenterRef.current = cached.center;
      } else {
        try {
          polyData = await fetchPolyData(foilUrl);
          // Save pristine geometry copies before any rotation
          const rawPts = polyData.getPoints().getData() as Float32Array;
          const rawNorms = polyData.getPointData()?.getNormals?.()?.getData?.() as Float32Array | undefined;
          const rawBounds: number[] = polyData.getBounds();
          const center: [number, number, number] = [
            (rawBounds[0] + rawBounds[1]) / 2,
            (rawBounds[2] + rawBounds[3]) / 2,
            (rawBounds[4] + rawBounds[5]) / 2,
          ];
          const origPts = new Float32Array(rawPts);
          const origNorms = rawNorms ? new Float32Array(rawNorms) : null;
          cacheRef.current.set(foilUrl, {
            lastUsed: Date.now(),
            polyData,
            originalPoints: origPts,
            originalNormals: origNorms,
            center,
          });
          originalPointsRef.current = origPts;
          originalNormalsRef.current = origNorms;
          originalCenterRef.current = center;
        } catch (err) {
          console.error("[useVtkScene] Failed to load foil:", foilUrl, err);
          return;
        }
      }

      // Stale-check after async gap
      if (gen !== genRef.current) {
        console.warn(
          "[useVtkScene] Skipping stale foil load",
          foilUrl,
          "gen",
          gen,
          "current",
          genRef.current,
        );
        return;
      }

      const { renderer } = ctx;

      // ── Remove old foil actor ──────────────────────────────────────
      removeActor("foilSurface");
      removeActor("axisX");
      removeActor("axisY");
      removeActor("axisZ");
      removeActor("flowArrow");
      removeActor("noseMarker");
      removeActor("tailMarker");

      // ── Build mapper + actor ───────────────────────────────────────
      const mapper = vtkMapper.newInstance();
mapper.setInterpolateScalarsBeforeMapping(true);
      mapper.setInputData(polyData);
      foilPolyRef.current = polyData;

      // ── Apply orientation by rotating geometry data ────────────────
      // This MUST happen before getBounds() so markers/gizmo reflect the
      // rotated shape.  Results are already oriented by the solver.
      const { pitch: p, yaw: y, roll: r } = useSimStore.getState();
      const isAssetPreview = foilUrl === assetPreviewUrl && !activeFrameUrl && !fallbackUrl;
      const effectiveP = isAssetPreview ? p : 0;
      const effectiveR = isAssetPreview ? r : 0;
      const effectiveY = isAssetPreview ? y : 0;

      if (originalPointsRef.current) {
        const [ocx, ocy, ocz] = originalCenterRef.current;
        applyDataRotation(
          polyData, originalPointsRef.current, originalNormalsRef.current,
          ocx, ocy, ocz, effectiveP, effectiveR, effectiveY,
        );
      }

      // Determine scalar coloring — will be refined by Effect 3
      const scalarInfo = ensureScalarArray(polyData);
      const { showPressureMap: pressure, colormap: cm } =
        useSimStore.getState();

      if (scalarInfo && pressure) {
        const lut = createVtkLookupTable(cm, scalarInfo.range);
        mapper.setLookupTable(lut);
        mapper.setScalarRange(...scalarInfo.range);
        mapper.setColorByArrayName(scalarInfo.name);
        mapper.setScalarModeToUsePointFieldData();
        mapper.setScalarVisibility(true);
      } else {
        mapper.setScalarVisibility(false);
      }

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      const prop = actor.getProperty();
      if (!scalarInfo || !pressure) {
        prop.setColor(0.58, 0.64, 0.72);
        prop.setOpacity(0.95);
      }
      prop.setAmbient(0.15);
      prop.setDiffuse(0.75);
      prop.setSpecular(0.35);
      prop.setSpecularPower(32);
      prop.setInterpolationToPhong();
      // Render both sides of thin geometry (foils)
      prop.setBackfaceCulling(false);
      prop.setFrontfaceCulling(false);

      actorsRef.current.foilSurface = actor;
      renderer.addActor(actor);

      // ── Bounds-derived helper actors ───────────────────────────────
      // Rotated bounds — used for gizmo sizing and nose/tail markers
      const bounds: number[] = polyData.getBounds();
      setVtkSceneBounds(
        bounds as [number, number, number, number, number, number],
      );

      // Original (unrotated) bounds — used for fixed-environment actors
      // (axis lines, flow arrow) that represent the world reference frame.
      const origPts = originalPointsRef.current;
      let origBounds = bounds; // fallback
      if (origPts) {
        let xMin = Infinity, xMax = -Infinity;
        let yMin = Infinity, yMax = -Infinity;
        let zMin = Infinity, zMax = -Infinity;
        for (let i = 0; i < origPts.length; i += 3) {
          const x = origPts[i], y = origPts[i + 1], z = origPts[i + 2];
          if (x < xMin) xMin = x; if (x > xMax) xMax = x;
          if (y < yMin) yMin = y; if (y > yMax) yMax = y;
          if (z < zMin) zMin = z; if (z > zMax) zMax = z;
        }
        origBounds = [xMin, xMax, yMin, yMax, zMin, zMax];
      }

      // Axis lines & flow arrow use ORIGINAL bounds — fixed reference frame
      const axisActors = buildAxisLineActors(origBounds);
      actorsRef.current.axisX = axisActors.x;
      actorsRef.current.axisY = axisActors.y;
      actorsRef.current.axisZ = axisActors.z;
      renderer.addActor(axisActors.x);
      renderer.addActor(axisActors.y);
      renderer.addActor(axisActors.z);

      const arrowActor = buildFlowArrowActor(origBounds);
      actorsRef.current.flowArrow = arrowActor;
      renderer.addActor(arrowActor);

      // Nose/tail markers use ROTATED bounds — they track the foil
      const { nose, tail } = buildMarkerActors(bounds);
      actorsRef.current.noseMarker = nose;
      actorsRef.current.tailMarker = tail;
      renderer.addActor(nose);
      renderer.addActor(tail);

      // ── Camera fit (on new run / new geometry URL) ──────────────────
      if (!cameraFittedRef.current || loadedRunRef.current !== activeSimId) {
        renderer.resetCamera();
        const cam = renderer.getActiveCamera();
        cam.elevation(25);
        cam.azimuth(-35);

        const foilBounds = polyData.getBounds();
        const diagonal = Math.sqrt(
          Math.pow(foilBounds[1] - foilBounds[0], 2) +
            Math.pow(foilBounds[3] - foilBounds[2], 2) +
            Math.pow(foilBounds[5] - foilBounds[4], 2),
        );
        const nearClip = Math.max(diagonal * 0.001, 0.0001);
        const farClip = Math.max(diagonal * 200, 200);
        cam.setClippingRange(nearClip, farClip);

        cameraFittedRef.current = true;
        loadedRunRef.current = activeSimId;
      }

      // Track latest URL that completed (important when the first load is old asset + second is sim dataset)
      lastFoilUrlRef.current = foilUrl;

      const actorCount = renderer.getActors().length;
      const visibleBounds = renderer.computeVisiblePropBounds();
      const cam = renderer.getActiveCamera();

      render();
      console.info(
        `[useVtkScene] Foil loaded: ${polyData.getNumberOfPoints()} pts, ` +
          `${polyData.getNumberOfCells()} cells, bounds=[${bounds.map((b: number) => b.toFixed(3)).join(", ")}]`,
      );
      console.info(
        "[useVtkScene] Debug: actors=",
        actorCount,
        "bounds=",
        visibleBounds,
        "cam.pos=",
        cam.getPosition(),
        "clip=",
        cam.getClippingRange(),
      );
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foilUrl, activeSimId, contextReady]);

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 2: Load / remove flow lines (only when URL or toggle changes)
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    if (!flowLinesUrl) {
      removeActor("flowLines");
      render();
      return;
    }

    (async () => {
      try {
        const polyData = await fetchPolyData(flowLinesUrl);

        // Determine tube radius from foil bounds
        const foilBounds = foilPolyRef.current?.getBounds?.();
        const chord = foilBounds
          ? Math.max(foilBounds[1] - foilBounds[0], 0.01)
          : 1;
        const tubeRadius = chord * 0.003;

        // Only apply TubeFilter if the mesh contains line cells.
        // STL flow-line files are triangle surfaces; piping them through
        // TubeFilter produces empty output whose getPointData() is
        // undefined, which crashes the mapper during render.
        // Also verify the raw lines array is non-null to avoid TubeFilter crash.
        const numLines2 = polyData.getNumberOfLines?.() ?? 0;
        const linesArr2 = polyData.getLines?.()?.getData?.() ?? null;
        const hasLines = numLines2 > 0 && linesArr2 !== null && linesArr2.length > 0;

        const mapper = vtkMapper.newInstance();

        if (hasLines) {
          const tube = vtkTubeFilter.newInstance();
          tube.setInputData(polyData);
          tube.setRadius(tubeRadius);
          tube.setNumberOfSides(8);
          mapper.setInputConnection(tube.getOutputPort());
        } else {
          mapper.setInputData(polyData);
        }

        // Color by Cf if available
        const cfArray = polyData.getPointData?.()?.getArrayByName?.("Cf");
        if (cfArray) {
          const range = cfArray.getRange();
          const cm = useSimStore.getState().colormap;
          const lut = createVtkLookupTable(cm, [range[0], range[1]]);
          mapper.setLookupTable(lut);
          mapper.setScalarRange(range[0], range[1]);
          mapper.setColorByArrayName("Cf");
          mapper.setScalarModeToUsePointFieldData();
        } else {
          mapper.setScalarVisibility(false);
        }

        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        if (!cfArray) {
          actor.getProperty().setColor(0.376, 0.51, 0.98);
          actor.getProperty().setOpacity(0.85);
        }
        actor.getProperty().setAmbient(0.3);
        actor.getProperty().setDiffuse(0.7);
        // For triangle-surface flow lines, show as wireframe
        if (!hasLines) {
          actor.getProperty().setRepresentation(1); // wireframe
        }

        // Flow lines are simulation results; they ALREADY have the orientation applied
        actor.setOrientation(0, 0, 0);

        removeActor("flowLines");
        actorsRef.current.flowLines = actor;
        ctx.renderer.addActor(actor);
        render();
        console.info(
          `[useVtkScene] Flow lines loaded: ${polyData.getNumberOfPoints()} pts`,
        );
      } catch (err) {
        console.error(
          "[useVtkScene] Failed to load flow lines:",
          flowLinesUrl,
          err,
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowLinesUrl]);

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 2b: Load / remove pressure iso-surface lines
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    if (!pressureLinesUrl) {
      removeActor("pressureLines");
      render();
      return;
    }

    (async () => {
      try {
        const polyData = await fetchPolyData(pressureLinesUrl);

        const mapper = vtkMapper.newInstance();
        mapper.setInputData(polyData);

        // Try to color by pressure arrays
        const pArr =
          polyData.getPointData?.()?.getArrayByName?.("Cp") ??
          polyData.getPointData?.()?.getArrayByName?.("p") ??
          null;
        if (pArr) {
          const range = pArr.getRange();
          const cm = useSimStore.getState().colormap;
          const lut = createVtkLookupTable(cm, [range[0], range[1]]);
          mapper.setLookupTable(lut);
          mapper.setScalarRange(range[0], range[1]);
          mapper.setColorByArrayName(pArr.getName());
          mapper.setScalarModeToUsePointFieldData();
        } else {
          mapper.setScalarVisibility(false);
        }

        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        actor.getProperty().setOpacity(0.6);
        actor.getProperty().setAmbient(0.3);
        actor.getProperty().setDiffuse(0.7);
        if (!pArr) {
          actor.getProperty().setColor(0.376, 0.647, 0.98);
        }

        // Pressure lines are simulation results - already oriented correctly from backend
        // No additional orientation needed

        removeActor("pressureLines");
        actorsRef.current.pressureLines = actor;
        ctx.renderer.addActor(actor);
        render();
        console.info(
          `[useVtkScene] Pressure lines loaded: ${polyData.getNumberOfPoints()} pts`,
        );
      } catch (err) {
        console.error(
          "[useVtkScene] Failed to load pressure lines:",
          pressureLinesUrl,
          err,
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressureLinesUrl]);

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 2c: Load / remove vorticity iso-surface (Q-criterion)
  //  Uses the file_manifest from the store if available.
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    if (!showVorticity) {
      removeActor("vorticity");
      render();
      return;
    }

    const simId = useSimStore.getState().activeSimId;
    if (!simId) return;

    const qPath = useSimStore.getState().qCriterionPath;
    if (!qPath) {
      console.warn("[useVtkScene] No Q-criterion isosurface available for this run");
      removeActor("vorticity");
      render();
      return;
    }

    const vtpUrl = `${baseUrl}${qPath}`;

    (async () => {
      try {
        let polyData = await fetchPolyData(vtpUrl);
        if (!polyData || polyData.getNumberOfPoints() === 0) {
          console.warn("[useVtkScene] Q-criterion isosurface is empty");
          removeActor("vorticity");
          render();
          return;
        }

        // ── 1. Compute smooth normals for the isosurface ──────────────
        const normals = vtkPolyDataNormals.newInstance();
        normals.setInputData(polyData);
        normals.setComputePointNormals(true);
        normals.setComputeCellNormals(false);
        if (typeof normals.setSplitting === "function") {
          normals.setSplitting(false);
        }
        if (typeof normals.setFeatureAngle === "function") {
          normals.setFeatureAngle(30);
        }
        if (typeof normals.setConsistency === "function") {
          normals.setConsistency(true);
        }
        if (typeof normals.setAutoOrientNormals === "function") {
          normals.setAutoOrientNormals(true);
        }
        normals.update();
        polyData = normals.getOutputData();

        const mapper = vtkMapper.newInstance();
        mapper.setInputData(polyData);

        // Prefer vorticity magnitude for coloring, fall back to x-component
        const vortMagArr = polyData.getPointData?.()?.getArrayByName?.("vorticity_mag");
        const vortXArr   = polyData.getPointData?.()?.getArrayByName?.("vorticity_x");
        const colorArr   = vortMagArr ?? vortXArr;

        if (colorArr) {
          const range = colorArr.getRange();
          const cm = useSimStore.getState().colormap;
          const lut = createVtkLookupTable(cm, [range[0], range[1]]);
          mapper.setLookupTable(lut);
          mapper.setScalarRange(range[0], range[1]);
          mapper.setColorByArrayName(colorArr.getName());
          mapper.setScalarModeToUsePointFieldData();
          mapper.setScalarVisibility(true);
        } else {
          mapper.setScalarVisibility(false);
        }

        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        const prop = actor.getProperty();
        prop.setOpacity(0.45);
        prop.setAmbient(0.2);
        prop.setDiffuse(0.8);
        prop.setSpecular(0.15);
        prop.setSpecularPower(16);
        prop.setInterpolationToPhong();
        prop.setBackfaceCulling(false);  // Show both sides of isosurface
        if (!colorArr) prop.setColor(0.5, 0.1, 0.9);

        // Results are already simulated using the rotated bounds

        actor.setOrientation(0, 0, 0);




        removeActor("vorticity");
        actorsRef.current.vorticity = actor;
        ctx.renderer.addActor(actor);
        render();
        console.info(`[useVtkScene] Q-criterion loaded: ${polyData.getNumberOfPoints()} pts`);
      } catch (err) {
        console.error("[useVtkScene] Failed to load Q-criterion:", vtpUrl, err);
        removeActor("vorticity");
        render();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVorticity, activeSimId]);

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 2d: Load / remove streamlines (skin friction lines)
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    if (!showStreamlines) {
      removeActor("streamlines");
      render();
      return;
    }

    const simId = useSimStore.getState().activeSimId;
    if (!simId) return;

    const vtpUrl = `${baseUrl}/media/simulations/${simId}/skin_friction_lines.vtp`;

    (async () => {
      try {
        const polyData = await fetchPolyData(vtpUrl);
        if (!polyData || polyData.getNumberOfPoints() === 0) {
          console.warn("[useVtkScene] Skin friction lines are empty");
          removeActor("streamlines");
          render();
          return;
        }

        // Skin friction lines are line cells - apply tube filter for visibility.
        // Guard: TubeFilter crashes if the lines connectivity array is null,
        // so verify both the count AND the raw array before using it.
        const numLines = polyData.getNumberOfLines?.() ?? 0;
        const linesArr = polyData.getLines?.()?.getData?.() ?? null;
        const hasLines = numLines > 0 && linesArr !== null && linesArr.length > 0;

        const mapper = vtkMapper.newInstance();

        if (hasLines) {
          // Get foil bounds for tube radius
          const foilBounds = foilPolyRef.current?.getBounds?.();
          const chord = foilBounds
            ? Math.max(foilBounds[1] - foilBounds[0], 0.01)
            : 1;
          const tubeRadius = chord * 0.002;

          const tube = vtkTubeFilter.newInstance();
          tube.setInputData(polyData);
          tube.setRadius(tubeRadius);
          tube.setNumberOfSides(8);
          mapper.setInputConnection(tube.getOutputPort());
        } else {
          mapper.setInputData(polyData);
        }

        // Color by velocity magnitude if available
        const uArr = polyData.getPointData?.()?.getArrayByName?.("U");
        if (uArr) {
          const range = uArr.getRange();
          const cm = useSimStore.getState().colormap;
          const lut = createVtkLookupTable(cm, [range[0], range[1]]);
          mapper.setLookupTable(lut);
          mapper.setScalarRange(range[0], range[1]);
          mapper.setColorByArrayName("U");
          mapper.setScalarModeToUsePointFieldData();
          mapper.setScalarVisibility(true);
        } else {
          mapper.setScalarVisibility(false);
        }

        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        const prop = actor.getProperty();
        prop.setOpacity(0.85);
        prop.setAmbient(0.3);
        prop.setDiffuse(0.7);
        if (!uArr) {
          prop.setColor(0.376, 0.647, 0.98);  // Flow blue
        }

        // Results are already simulated using the rotated bounds

        actor.setOrientation(0, 0, 0);




        removeActor("streamlines");
        actorsRef.current.streamlines = actor;
        ctx.renderer.addActor(actor);
        render();
        console.info(`[useVtkScene] Streamlines loaded: ${polyData.getNumberOfPoints()} pts, lines=${polyData.getNumberOfLines?.() || 0}`);
      } catch (err) {
        console.error("[useVtkScene] Failed to load streamlines:", vtpUrl, err);
        removeActor("streamlines");
        render();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStreamlines, activeSimId]);

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 3: Update pressure colormap / toggle (no geometry reload)
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const actor = actorsRef.current.foilSurface;
    if (!actor) return;

    const mapper = actor.getMapper();
    if (!mapper) return;

    const polyData = foilPolyRef.current ?? mapper.getInputData?.();
    if (!polyData) return;

    // Guard: if the polyData was .delete()'d its internals are nullified
    if (!polyData.getPointData?.()) return;

    const scalarInfo = ensureScalarArray(polyData);

    if (scalarInfo && showPressureMap) {
      const lut = createVtkLookupTable(colormap, scalarInfo.range);
      mapper.setLookupTable(lut);
      mapper.setScalarRange(...scalarInfo.range);
      mapper.setColorByArrayName(scalarInfo.name);
      mapper.setScalarModeToUsePointFieldData();
      mapper.setScalarVisibility(true);
      actor.getProperty().setColor(1, 1, 1);
      actor.getProperty().setOpacity(1.0);
    } else {
      mapper.setScalarVisibility(false);
      actor.getProperty().setColor(0.58, 0.64, 0.72);
      actor.getProperty().setOpacity(0.95);
    }

    actor.getProperty().setAmbient(0.15);
    actor.getProperty().setDiffuse(0.75);
    actor.getProperty().setSpecular(0.35);
    actor.getProperty().setSpecularPower(32);

    render();
  }, [showPressureMap, colormap, render]);

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 4: Orientation changes — rotate geometry data, reposition markers
  //
  //  Instead of rotating the VTK actor (which doesn't affect getBounds()),
  //  we rotate the actual vertex positions so that bounds, markers, and
  //  gizmo rings all reflect the true rotated shape.
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!foilPolyRef.current || !originalPointsRef.current) return;
    const ctx = contextRef.current;
    if (!ctx) return;

    const isAssetPreview = foilUrl === assetPreviewUrl && !activeFrameUrl && !fallbackUrl;
    const effectiveP = isAssetPreview ? pitch : 0;
    const effectiveR = isAssetPreview ? roll : 0;
    const effectiveY = isAssetPreview ? yaw : 0;

    const polyData = foilPolyRef.current;
    const [ocx, ocy, ocz] = originalCenterRef.current;

    // Rotate vertex positions + normals from pristine originals
    applyDataRotation(
      polyData, originalPointsRef.current, originalNormalsRef.current,
      ocx, ocy, ocz, effectiveP, effectiveR, effectiveY,
    );

    // Re-derive bounds & update store (gizmo tracks this)
    const bounds: number[] = polyData.getBounds();
    setVtkSceneBounds(
      bounds as [number, number, number, number, number, number],
    );

    // Flow arrow stays FIXED — it represents the oncoming flow direction.
    // The whole point of rotation is to orient the foil relative to this
    // fixed flow reference.

    // Reposition nose / tail markers to actual rotated extremes
    const noseActor = actorsRef.current.noseMarker;
    if (noseActor) {
      noseActor.setPosition(
        bounds[0],
        (bounds[2] + bounds[3]) / 2,
        (bounds[4] + bounds[5]) / 2,
      );
    }
    const tailActor = actorsRef.current.tailMarker;
    if (tailActor) {
      tailActor.setPosition(
        bounds[1],
        (bounds[2] + bounds[3]) / 2,
        (bounds[4] + bounds[5]) / 2,
      );
    }

    render();
  }, [
    pitch,
    yaw,
    roll,
    render,
    foilUrl,
    assetPreviewUrl,
    activeFrameUrl,
    fallbackUrl,
    setVtkSceneBounds,
    contextRef,
  ]);

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 5: Reset camera flag on run change + cache eviction
  //  IMPORTANT: clear actors BEFORE deleting cached polyData so no mapper
  //  in the scene still references a .delete()'d object.
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    cameraFittedRef.current = false;
    foilPolyRef.current = null;
    originalPointsRef.current = null;
    originalNormalsRef.current = null;
    originalCenterRef.current = [0, 0, 0];
    clearAllActors();
    for (const [url, entry] of cacheRef.current.entries()) {
      try {
        entry.polyData.delete();
      } catch {
        /* */
      }
      cacheRef.current.delete(url);
    }
    contextRef.current?.renderWindow?.render();
  }, [activeSimId, clearAllActors, contextRef]);

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 6: Cleanup on unmount
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const currentCacheRef = cacheRef.current;
    return () => {
      clearAllActors();
      for (const entry of currentCacheRef.values()) {
        try {
          entry.polyData.delete();
        } catch {
          /* */
        }
      }
      currentCacheRef.clear();
    };
  }, [clearAllActors]);
}
