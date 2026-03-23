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
import vtkPlaneSource from "@kitware/vtk.js/Filters/Sources/PlaneSource";
import vtkArrowSource from "@kitware/vtk.js/Filters/Sources/ArrowSource";
import vtkConeSource from "@kitware/vtk.js/Filters/Sources/ConeSource";
import vtkTubeFilter from "@kitware/vtk.js/Filters/General/TubeFilter";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";

import type { VtkContext } from "./useVtkRenderer";
import { useSimStore } from "../store/useSimStore";
import { createVtkLookupTable } from "../lib/vtkColormaps";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActorMap {
  foilSurface?: any;
  pressureLines?: any;
  flowLines?: any;
  gridPlane?: any;
  flowArrow?: any;
  noseMarker?: any;
  tailMarker?: any;
  vorticity?: any;
}

interface CacheEntry {
  lastUsed: number;
  polyData: any;
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

async function fetchPolyData(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const arrayBuffer = await response.arrayBuffer();

  const clean = url.toLowerCase().replace(/\?.*$/, "");
  if (clean.endsWith(".stl")) {
    const reader = vtkSTLReader.newInstance();
    reader.parseAsArrayBuffer(arrayBuffer);
    const pd = reader.getOutputData(0);
    if (!pd || pd.getNumberOfPoints() === 0)
      throw new Error("STLReader produced empty polydata");
    return pd;
  }

  // VTP (XML PolyData)
  const reader = vtkXMLPolyDataReader.newInstance();
  reader.parseAsArrayBuffer(arrayBuffer);
  const pd = reader.getOutputData(0);
  if (!pd || pd.getNumberOfPoints() === 0)
    throw new Error("XMLPolyDataReader produced empty polydata");
  return pd;
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

function buildGridActor(bounds: number[]): any {
  const chord = Math.max(bounds[1] - bounds[0], 0.01);
  const plane = vtkPlaneSource.newInstance({
    xResolution: 20,
    yResolution: 20,
  });
  plane.setOrigin(bounds[0] - chord, bounds[2] - chord, bounds[4]);
  plane.setPoint1(bounds[1] + chord * 3, bounds[2] - chord, bounds[4]);
  plane.setPoint2(bounds[0] - chord, bounds[3] + chord, bounds[4]);
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(plane.getOutputPort());
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setRepresentation(1);
  actor.getProperty().setColor(0.2, 0.2, 0.3);
  actor.getProperty().setOpacity(0.4);
  return actor;
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
      } else {
        try {
          polyData = await fetchPolyData(foilUrl);
          cacheRef.current.set(foilUrl, { lastUsed: Date.now(), polyData });
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
      removeActor("gridPlane");
      removeActor("flowArrow");
      removeActor("noseMarker");
      removeActor("tailMarker");

      // ── Build mapper + actor ───────────────────────────────────────
      const mapper = vtkMapper.newInstance({
        interpolateScalarsBeforeMapping: true,
      });
      mapper.setInputData(polyData);
      foilPolyRef.current = polyData;

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
      const bounds: number[] = polyData.getBounds();
      setVtkSceneBounds(
        bounds as [number, number, number, number, number, number],
      );

      const gridActor = buildGridActor(bounds);
      actorsRef.current.gridPlane = gridActor;
      renderer.addActor(gridActor);

      const arrowActor = buildFlowArrowActor(bounds);
      actorsRef.current.flowArrow = arrowActor;
      renderer.addActor(arrowActor);

      const { nose, tail } = buildMarkerActors(bounds);
      actorsRef.current.noseMarker = nose;
      actorsRef.current.tailMarker = tail;
      renderer.addActor(nose);
      renderer.addActor(tail);

      // ── Apply orientation (Three.js → VTK convention fix) ──────────
      const { pitch: p, yaw: y, roll: r } = useSimStore.getState();
      function applyOrientation(
        actor: any,
        pitch: number,
        yaw: number,
        roll: number,
      ) {
        // Reset orientation (VTK rotations are cumulative)
        actor.setOrientation(0, 0, 0);
        // VTK: rotateY (yaw), then rotateX (pitch), then rotateZ (roll)
        actor.rotateY(yaw);
        actor.rotateX(pitch);
        actor.rotateZ(roll);
        // Debug: log world bounds after orientation
        const worldBounds = actor.getBounds();
        console.log("[VTK] Foil world bounds after orientation:", worldBounds);
        if (Math.abs(worldBounds[5] - worldBounds[4]) < 0.0001) {
          console.error(
            "[VTK] Foil has zero Z thickness after transform — rotation is edge-on",
          );
        }
      }
      for (const [k, a] of Object.entries(actorsRef.current)) {
        if (a && k !== "gridPlane") applyOrientation(a, p, y, r);
      }

      // ── Camera fit (on new run / new geometry URL) ──────────────────
      if (!cameraFittedRef.current || loadedRunRef.current !== activeSimId) {
        renderer.resetCamera();
        const cam = renderer.getActiveCamera();
        cam.elevation(25);
        cam.azimuth(-35);

        const visibleBounds = renderer.computeVisiblePropBounds();
        if (visibleBounds && visibleBounds.length === 6) {
          const diagonal = Math.sqrt(
            Math.pow(visibleBounds[1] - visibleBounds[0], 2) +
              Math.pow(visibleBounds[3] - visibleBounds[2], 2) +
              Math.pow(visibleBounds[5] - visibleBounds[4], 2),
          );
          const nearClip = Math.max(diagonal * 0.001, 0.0001);
          const farClip = Math.max(diagonal * 100, 100);
          cam.setClippingRange(nearClip, farClip);
        } else {
          cam.setClippingRange(0.0001, 100);
        }

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
        const hasLines = polyData.getNumberOfLines?.() > 0;

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

        const { pitch: p, yaw: y, roll: r } = useSimStore.getState();
        actor.setOrientation([p, y, r]);

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

        const { pitch: p, yaw: y, roll: r } = useSimStore.getState();
        actor.setOrientation([p, y, r]);

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

    if (!showVorticity && !showStreamlines) {
      removeActor("vorticity");
      render();
      return;
    }

    // Try to find Q-criterion isosurface or skin friction lines from file_manifest
    // These come from the post-processing pipeline and are stored in the run data.
    // For now, check if the run has a q_criterion_isosurface.vtp or skin_friction_lines.vtp
    const simId = useSimStore.getState().activeSimId;
    if (!simId) return;

    const vtpUrl = showVorticity
      ? `${baseUrl}/media/simulations/${simId}/q_criterion_isosurface.vtp`
      : `${baseUrl}/media/simulations/${simId}/skin_friction_lines.vtp`;

    (async () => {
      try {
        const polyData = await fetchPolyData(vtpUrl);

        const mapper = vtkMapper.newInstance();
        mapper.setInputData(polyData);

        // Color by vorticity_x or Cf if present
        const vortArr = polyData
          .getPointData?.()
          ?.getArrayByName?.("vorticity_x");
        const cfArr = polyData.getPointData?.()?.getArrayByName?.("Cf");
        const colorArr = vortArr ?? cfArr;

        if (colorArr) {
          const range = colorArr.getRange();
          const cm = useSimStore.getState().colormap;
          const lut = createVtkLookupTable(cm, [range[0], range[1]]);
          mapper.setLookupTable(lut);
          mapper.setScalarRange(range[0], range[1]);
          mapper.setColorByArrayName(colorArr.getName());
          mapper.setScalarModeToUsePointFieldData();
        } else {
          mapper.setScalarVisibility(false);
        }

        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        actor.getProperty().setOpacity(showVorticity ? 0.5 : 0.7);
        actor.getProperty().setAmbient(0.3);
        actor.getProperty().setDiffuse(0.7);
        if (!colorArr) {
          actor.getProperty().setColor(0.5, 0.1, 0.9);
        }

        const { pitch: p, yaw: y, roll: r } = useSimStore.getState();
        actor.setOrientation([p, y, r]);

        removeActor("vorticity");
        actorsRef.current.vorticity = actor;
        ctx.renderer.addActor(actor);
        render();
        console.info(
          `[useVtkScene] Vorticity/streamlines loaded: ${polyData.getNumberOfPoints()} pts`,
        );
      } catch {
        // VTP not available for this run — expected for older sims
        removeActor("vorticity");
        render();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVorticity, showStreamlines, activeSimId]);

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
  //  EFFECT 4: Orientation changes (apply to existing actors, no reload)
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const orient = [pitch, yaw, roll] as const;
    for (const [key, actor] of Object.entries(actorsRef.current)) {
      if (actor && key !== "gridPlane") {
        actor.setOrientation(orient);
      }
    }
    render();
  }, [pitch, yaw, roll, render]);

  // ────────────────────────────────────────────────────────────────────────
  //  EFFECT 5: Reset camera flag on run change + cache eviction
  //  IMPORTANT: clear actors BEFORE deleting cached polyData so no mapper
  //  in the scene still references a .delete()'d object.
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    cameraFittedRef.current = false;
    foilPolyRef.current = null;
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
    return () => {
      clearAllActors();
      for (const entry of cacheRef.current.values()) {
        try {
          entry.polyData.delete();
        } catch {
          /* */
        }
      }
      cacheRef.current.clear();
    };
  }, [clearAllActors]);
}
