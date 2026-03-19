import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  PerspectiveCamera,
  Stage,
} from "@react-three/drei";
import { Group, Box3, MathUtils, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useSimStore } from "../store/useSimStore";
import { HydrofoilResults } from "../HydrofoilResults";
import { LayerManager } from "./LayerManager";
import { MetricHUD } from "./MetricHUD";
import { ColorbarLegend } from "./ColorbarLegend";
import { OverlayFrame } from "./OverlayFrame";
import { PressureOverlay } from "./PressureOverlay";
import { SimulationFrame } from "./SimulationFrame";
import { TimelineController } from "./TimelineController";
import { VorticityField } from "./VorticityField";
import { AnimatedStreamlines } from "./AnimatedStreamlines";
import { ScenePostProcessing } from "./ScenePostProcessing";
import { FlowDirectionArrow } from "./FlowDirectionArrow";
import { FoilNoseMarker } from "./FoilNoseMarker";

function PlaybackSyncLoop() {
  const isPlaying = useSimStore((s) => s.isPlaying);
  const playbackSpeed = useSimStore((s) => s.playbackSpeed);
  const currentFrame = useSimStore((s) => s.currentFrame);
  const totalFrames = useSimStore((s) => s.totalFrames);
  const loop = useSimStore((s) => s.loopPlayback);
  const setFrame = useSimStore((s) => s.setFrame);
  const togglePlayback = useSimStore((s) => s.togglePlayback);

  useFrame((_, delta) => {
    if (!isPlaying) return;
    if (totalFrames <= 0) return;

    const nextFrame = currentFrame + delta * playbackSpeed;
    const floored = Math.floor(nextFrame);

    if (loop) {
      const wrapped = ((floored % totalFrames) + totalFrames) % totalFrames;
      setFrame(wrapped);
      return;
    }

    if (floored >= totalFrames - 1) {
      setFrame(totalFrames - 1);
      togglePlayback();
      return;
    }

    setFrame(floored);
  });

  return null;
}

/**
 * Fits the camera to the scene group when geometryLoadedToken changes.
 * Uses a direct bounding box computation + camera positioning for reliability.
 */
function CameraFitter({
  controlsRef,
  sceneGroupRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  sceneGroupRef: React.RefObject<Group | null>;
}) {
  const { camera } = useThree();
  const geometryLoadedToken = useSimStore((s) => s.geometryLoadedToken);

  useEffect(() => {
    if (!geometryLoadedToken) return;
    if (!sceneGroupRef.current) return;

    console.log("[CameraFit] effect triggered, token:", geometryLoadedToken);
    console.log("[CameraFit] sceneGroupRef exists:", !!sceneGroupRef.current);

    const timer = setTimeout(() => {
      const group = sceneGroupRef.current;
      if (!group) return;

      const box = new Box3().setFromObject(group);
      console.log("[CameraFit] computed box:", box);
      console.log("[CameraFit] box isEmpty:", box.isEmpty());

      if (box.isEmpty()) {
        console.warn("[CameraFit] box is empty, geometry not ready");
        return;
      }

      const centre = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // Position camera at 2.5x the largest dimension away,
      // offset to give a 3/4 view (Z-up convention)
      const distance = maxDim * 2.5;
      camera.position.set(
        centre.x - distance * 0.6, // upstream and to the side
        centre.y - distance * 0.3,
        centre.z + distance * 0.5, // above (Z-up)
      );
      camera.lookAt(centre);
      camera.near = 0.001;
      camera.far = Math.max(500, distance * 10);
      camera.updateProjectionMatrix();

      // Set orbit target to geometry centre
      const ctl = controlsRef.current;
      if (ctl) {
        ctl.target.copy(centre);
        ctl.update();
      }

      console.log(
        "[CameraFit] fit complete, centre:",
        centre,
        "distance:",
        distance,
      );
    }, 150);

    return () => clearTimeout(timer);
  }, [geometryLoadedToken, camera, controlsRef, sceneGroupRef]);

  // Also support the manual overlay-fit-request event
  useEffect(() => {
    const handler = () => {
      const group = sceneGroupRef.current;
      if (!group) return;

      const box = new Box3().setFromObject(group);
      if (box.isEmpty()) return;

      const centre = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 2.5;

      camera.position.set(
        centre.x - distance * 0.6,
        centre.y - distance * 0.3,
        centre.z + distance * 0.5,
      );
      camera.lookAt(centre);
      camera.updateProjectionMatrix();

      const ctl = controlsRef.current;
      if (ctl) {
        ctl.target.copy(centre);
        ctl.update();
      }
    };
    window.addEventListener("overlay-fit-request", handler);
    return () => window.removeEventListener("overlay-fit-request", handler);
  }, [camera, controlsRef, sceneGroupRef]);

  return null;
}

/**
 * Positions the infinite grid at the bottom of the geometry's bounding box
 * (gridFloorZ from the store) so it reads as a ground/water plane.
 * OpenFOAM uses Z-up, so the grid lies in the XY plane at z = gridFloorZ.
 */
function DynamicGrid() {
  const gridFloorZ = useSimStore((s) => s.gridFloorZ);
  const bounds = useSimStore((s) => s.centredFoilBounds);

  // Grid sits at the bottom of the foil bounding box.
  // Before geometry loads, show a default ground plane at z = -1.
  const gridZ = bounds
    ? bounds.min[2] - (bounds.max[2] - bounds.min[2]) * 0.05
    : gridFloorZ || -1;

  const chord = bounds ? bounds.max[0] - bounds.min[0] : 5;
  const gridSize = chord * 5;

  return (
    <Grid
      position={[0, 0, gridZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      args={[gridSize, gridSize]}
      cellSize={chord / 8}
      sectionSize={chord}
      fadeDistance={gridSize * 2}
      fadeStrength={1}
      cellColor="#334155"
      sectionColor="#475569"
    />
  );
}

/**
 * Centres the scene group at world origin ONCE per result load.
 *
 * Writes ONLY to sceneGroupRef.current.position — nothing else.
 * Sets centredFoilBounds and gridFloorZ in the store for other components.
 */
function SceneCenterer({
  sceneGroupRef,
}: {
  sceneGroupRef: React.RefObject<Group | null>;
}) {
  const geometryLoadedToken = useSimStore((s) => s.geometryLoadedToken);
  const activeSimId = useSimStore((s) => s.activeSimId);
  const setCentredFoilBounds = useSimStore((s) => s.setCentredFoilBounds);
  const setSceneOffset = useSimStore((s) => s.setSceneOffset);
  const [centred, setCentred] = useState(false);

  // Reset centred flag when run changes so next run re-centres
  useEffect(() => {
    setCentred(false);
  }, [activeSimId]);

  useEffect(() => {
    if (centred) return;
    const group = sceneGroupRef.current;
    if (!group) return;

    // Wait a tick so child meshes are mounted
    const raf = requestAnimationFrame(() => {
      const box = new Box3().setFromObject(group);
      if (box.isEmpty()) return;

      const centre = box.getCenter(new Vector3());

      // Translate the PARENT group so inner content is centred at origin
      group.position.set(-centre.x, -centre.y, -centre.z);

      // Compute centred bounds for FlowDirectionArrow and FoilNoseMarker
      const centredBox = new Box3(
        new Vector3(
          box.min.x - centre.x,
          box.min.y - centre.y,
          box.min.z - centre.z,
        ),
        new Vector3(
          box.max.x - centre.x,
          box.max.y - centre.y,
          box.max.z - centre.z,
        ),
      );

      setCentredFoilBounds({
        min: [centredBox.min.x, centredBox.min.y, centredBox.min.z],
        max: [centredBox.max.x, centredBox.max.y, centredBox.max.z],
      });

      const chordX = centredBox.max.x - centredBox.min.x;
      setSceneOffset(
        [centre.x, centre.y, centre.z],
        centredBox.min.z - chordX * 0.1,
      );

      setCentred(true);
    });

    return () => cancelAnimationFrame(raf);
    // geometryLoadedToken is the stable trigger — only incremented when
    // a new run's results finish loading.
  }, [
    geometryLoadedToken,
    centred,
    sceneGroupRef,
    setCentredFoilBounds,
    setSceneOffset,
  ]);

  return null;
}

/**
 * Applies pitch/roll/yaw rotation to orientationGroupRef ONLY.
 * Uses useEffect (not useFrame) — fires only when orientation values change.
 *
 * Axis/order mapping (must stay in sync with the backend):
 *   Backend:  trimesh.transformations.euler_matrix(roll, pitch, yaw, axes='sxyz')
 *   Frontend: Euler order 'XYZ' →  X = pitch, Y = yaw, Z = roll
 */
function OrientationApplier({
  orientationGroupRef,
}: {
  orientationGroupRef: React.RefObject<Group | null>;
}) {
  const pitch = useSimStore((s) => s.pitch);
  const roll = useSimStore((s) => s.roll);
  const yaw = useSimStore((s) => s.yaw);

  useEffect(() => {
    if (!orientationGroupRef.current) return;
    orientationGroupRef.current.rotation.set(
      MathUtils.degToRad(pitch), // X axis
      MathUtils.degToRad(yaw), // Y axis
      MathUtils.degToRad(roll), // Z axis
      "XYZ",
    );
  }, [pitch, roll, yaw, orientationGroupRef]);

  return null;
}

// ── Debug data bridge: useFrame inside Canvas → DOM overlay outside ──

type DebugData = {
  camPos: string;
  camTarget: string;
  scenePos: string;
  nPoints: string;
};
const debugDataRef = { current: null as DebugData | null };

function DebugProbe({
  sceneGroupRef,
  controlsRef,
}: {
  sceneGroupRef: React.RefObject<Group | null>;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();

  useFrame(() => {
    const sg = sceneGroupRef.current;
    const ctl = controlsRef.current;

    let nPoints = "none";
    if (sg) {
      sg.traverse((child) => {
        const m = child as unknown as {
          geometry?: { attributes?: { position?: { count: number } } };
        };
        if (m.geometry?.attributes?.position) {
          nPoints = String(m.geometry.attributes.position.count);
        }
      });
    }

    debugDataRef.current = {
      camPos: `${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`,
      camTarget: ctl
        ? `${ctl.target.x.toFixed(2)}, ${ctl.target.y.toFixed(2)}, ${ctl.target.z.toFixed(2)}`
        : "n/a",
      scenePos: sg
        ? `${sg.position.x.toFixed(2)}, ${sg.position.y.toFixed(2)}, ${sg.position.z.toFixed(2)}`
        : "n/a",
      nPoints,
    };
  });

  return null;
}

function DebugOverlay() {
  const geometryLoadedToken = useSimStore((s) => s.geometryLoadedToken);
  const centredFoilBounds = useSimStore((s) => s.centredFoilBounds);
  const [data, setData] = useState<DebugData | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setData(debugDataRef.current ? { ...debugDataRef.current } : null);
    }, 200);
    return () => clearInterval(id);
  }, []);

  const b = centredFoilBounds;

  return (
    <div className="pointer-events-none absolute left-3 top-16 z-20 rounded bg-black/80 px-3 py-2 text-[10px] font-mono text-slate-300 leading-relaxed select-none">
      <div>geometryLoadedToken: {geometryLoadedToken}</div>
      <div>
        centredFoilBounds:{" "}
        {b
          ? `${b.min[0].toFixed(2)}, ${b.min[2].toFixed(2)} → ${b.max[0].toFixed(2)}, ${b.max[2].toFixed(2)}`
          : "null"}
      </div>
      <div>sceneGroup position: {data?.scenePos ?? "—"}</div>
      <div>camera position: {data?.camPos ?? "—"}</div>
      <div>camera target: {data?.camTarget ?? "—"}</div>
      <div>n_points loaded: {data?.nPoints ?? "none"}</div>
    </div>
  );
}

export function Viewport() {
  const resultMeshPath = useSimStore((state) => state.resultMeshPath);
  const activeSimId = useSimStore((state) => state.activeSimId);
  const status = useSimStore((state) => state.status);
  const logs = useSimStore((state) => state.logs);
  const selectedAssetFileUrl = useSimStore((s) => s.selectedAssetFileUrl);

  const totalFrames = useSimStore((s) => s.totalFrames);
  const currentFrame = useSimStore((s) => s.currentFrame);
  const frameMapping = useSimStore((s) => s.frameMapping);
  const showPressureMap = useSimStore((s) => s.showPressureMap);
  const showFlowLines = useSimStore((s) => s.showFlowLines);
  const isPlaying = useSimStore((s) => s.isPlaying);
  const bumpGeometryLoadedToken = useSimStore((s) => s.bumpGeometryLoadedToken);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const sceneGroupRef = useRef<Group>(null);
  const orientationGroupRef = useRef<Group>(null);

  const showDebug =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "true";

  // Needs to point to Django's MEDIA_URL
  const baseUrl = "http://localhost:8000";

  const activeFramePath =
    totalFrames > 0 ? (frameMapping[currentFrame]?.mesh_path ?? null) : null;
  const activeFrameUrl = activeFramePath
    ? `${baseUrl}${activeFramePath}`
    : null;

  const pressureLinesPath =
    totalFrames > 0
      ? (frameMapping[currentFrame]?.pressure_lines_path ?? null)
      : null;
  const flowLinesPath =
    totalFrames > 0
      ? (frameMapping[currentFrame]?.flow_lines_path ?? null)
      : null;
  const fallbackUrl = resultMeshPath ? `${baseUrl}${resultMeshPath}` : null;
  const assetPreviewUrl = selectedAssetFileUrl || null;

  const pressureOverlayUrl = showPressureMap
    ? (activeFrameUrl ??
      fallbackUrl ??
      (pressureLinesPath ? `${baseUrl}${pressureLinesPath}` : null))
    : null;
  const flowLinesUrl =
    showFlowLines && flowLinesPath ? `${baseUrl}${flowLinesPath}` : null;

  const neighborUrls = (() => {
    if (totalFrames <= 0) return [];
    const idxs = [currentFrame - 1, currentFrame, currentFrame + 1];
    const urls: string[] = [];
    for (const i of idxs) {
      const wrapped = ((i % totalFrames) + totalFrames) % totalFrames;
      const p = frameMapping[wrapped]?.mesh_path;
      if (p) urls.push(`${baseUrl}${p}`);
    }
    return urls;
  })();

  // Callback for SimulationFrame — bump the geometry loaded token once when
  // a new run's results first appear so centring + camera fit fire.
  const didBumpForRunRef = useRef<number | null>(null);
  const handleActiveLoaded = useCallback(() => {
    if (isPlaying) return;
    if (didBumpForRunRef.current === activeSimId) return;
    didBumpForRunRef.current = activeSimId;
    bumpGeometryLoadedToken();
  }, [isPlaying, activeSimId, bumpGeometryLoadedToken]);

  // Reset bump guard when run changes
  useEffect(() => {
    didBumpForRunRef.current = null;
  }, [activeSimId]);

  const timeLine = (() => {
    const lines = (logs || "").split("\n");
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (line.includes("Time =")) return line.trim();
    }
    return null;
  })();

  return (
    <div className="w-full h-full relative overflow-hidden">
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

      {/* Analysis overlays (Post-Run Investigation) */}
      <MetricHUD />
      <LayerManager />
      <ColorbarLegend />
      {showDebug && <DebugOverlay />}
      <div className="absolute left-3 right-3 bottom-3 z-30">
        <TimelineController />
      </div>

      <Canvas shadows dpr={[1, 2]}>
        <color attach="background" args={["#000000"]} />

        <PerspectiveCamera
          makeDefault
          position={[5, 5, 5]}
          fov={50}
          near={0.001}
          far={500}
        />

        <DynamicGrid />

        <Suspense fallback={null}>
          <Stage intensity={0.5} environment="city" adjustCamera={false}>
            <CameraFitter
              controlsRef={controlsRef}
              sceneGroupRef={sceneGroupRef}
            />

            {/* Two-layer group structure:
                sceneGroupRef  → owns position (centring) ONLY
                orientationGroupRef → owns rotation (pitch/roll/yaw) ONLY */}
            <group ref={sceneGroupRef}>
              <SceneCenterer sceneGroupRef={sceneGroupRef} />

              <group ref={orientationGroupRef}>
                <OrientationApplier orientationGroupRef={orientationGroupRef} />

                {totalFrames > 0 ? (
                  <group>
                    <SimulationFrame
                      activeUrl={activeFrameUrl}
                      neighborUrls={neighborUrls}
                      showPressureMap={showPressureMap}
                      onActiveLoaded={handleActiveLoaded}
                    />
                  </group>
                ) : fallbackUrl ? (
                  <HydrofoilResults
                    url={fallbackUrl}
                    onLoad={handleActiveLoaded}
                  />
                ) : assetPreviewUrl ? (
                  <HydrofoilResults
                    url={assetPreviewUrl}
                    onLoad={handleActiveLoaded}
                  />
                ) : (
                  <mesh>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial color="#334155" wireframe />
                  </mesh>
                )}

                {/* Overlay layers */}
                <PressureOverlay url={pressureOverlayUrl} opacity={0.88} />
              </group>
            </group>

            {/* Overlay + procedural layers outside Bounds so large geometries
                don't push the camera back and lose the foil from view. */}
            <OverlayFrame url={flowLinesUrl} color="#3b82f6" opacity={0.85} />
            <VorticityField />
            <AnimatedStreamlines />
            {/* FlowDirectionArrow and FoilNoseMarker live in world space.
                They read centredFoilBounds from the store — no ref props,
                no per-frame bounding box recompute. */}
            <FlowDirectionArrow />
            <FoilNoseMarker />
          </Stage>
        </Suspense>

        {/* Post-processing effects */}
        <ScenePostProcessing />

        {/* The playback sync-loop lives inside Canvas so it can use useFrame */}
        <PlaybackSyncLoop />
        {showDebug && (
          <DebugProbe sceneGroupRef={sceneGroupRef} controlsRef={controlsRef} />
        )}

        <OrbitControls ref={controlsRef} makeDefault />

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
            labelColor="white"
            labels={["X", "Y", "Z"]}
          />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
