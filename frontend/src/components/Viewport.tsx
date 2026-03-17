import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  Bounds,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  PerspectiveCamera,
  Stage,
  useBounds,
} from '@react-three/drei';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSimStore } from '../store/useSimStore';
import { HydrofoilResults } from '../HydrofoilResults';
import { LayerManager } from './LayerManager';
import { MetricHUD } from './MetricHUD';
import { OverlayFrame } from './OverlayFrame';
import { SimulationFrame } from './SimulationFrame';
import { TimelineController } from './TimelineController';

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

function FitToContent({
  fitKey,
  controlsRef,
}: {
  fitKey: string;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const bounds = useBounds();

  useEffect(() => {
    // Fit the camera to whatever is currently inside <Bounds>.
    bounds.refresh().fit();

    // Also align OrbitControls pivot to the fitted bounds center.
    try {
      const anyBounds = bounds as unknown as { getCenter?: (out: Vector3) => Vector3 };
      const center = anyBounds.getCenter ? anyBounds.getCenter(new Vector3()) : new Vector3(0, 0, 0);
      const controls = controlsRef.current;
      if (controls) {
        controls.target.copy(center);
        controls.update();
      }
    } catch {
      // ignore
    }

    // Listen for overlay-fit-request event to trigger camera fit
    const handler = () => {
      // eslint-disable-next-line no-console
      console.log('Viewport: overlay-fit-request received, triggering camera fit');
      bounds.refresh().fit();
      try {
        const anyBounds = bounds as unknown as { getCenter?: (out: Vector3) => Vector3 };
        const center = anyBounds.getCenter ? anyBounds.getCenter(new Vector3()) : new Vector3(0, 0, 0);
        const controls = controlsRef.current;
        if (controls) {
          controls.target.copy(center);
          controls.update();
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('overlay-fit-request', handler);
    return () => {
      window.removeEventListener('overlay-fit-request', handler);
    };
  }, [bounds, fitKey, controlsRef]);

  return null;
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

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const [fitNonce, setFitNonce] = useState(0);
  const didFitForKeyRef = useRef<string | null>(null);
  
  // Needs to point to Django's MEDIA_URL
  const baseUrl = 'http://localhost:8000';

  const activeFramePath = totalFrames > 0 ? frameMapping[currentFrame]?.mesh_path ?? null : null;
  const activeFrameUrl = activeFramePath ? `${baseUrl}${activeFramePath}` : null;

  const pressureLinesPath = totalFrames > 0 ? frameMapping[currentFrame]?.pressure_lines_path ?? null : null;
  const flowLinesPath = totalFrames > 0 ? frameMapping[currentFrame]?.flow_lines_path ?? null : null;
  const pressureLinesUrl = showPressureMap && pressureLinesPath ? `${baseUrl}${pressureLinesPath}` : null;
  const flowLinesUrl = showFlowLines && flowLinesPath ? `${baseUrl}${flowLinesPath}` : null;
  const fallbackUrl = resultMeshPath ? `${baseUrl}${resultMeshPath}` : null;
  const assetPreviewUrl = selectedAssetFileUrl || null;

  const initialFitKey = `${activeSimId ?? 'asset'}:${totalFrames}`;

  useEffect(() => {
    // Reset “fit once” guard when switching runs / changing available frames.
    didFitForKeyRef.current = null;
  }, [initialFitKey]);

  // Include overlay urls/toggles so the camera-fit accounts for them when enabled.
  // Otherwise (especially for flow lines) they can load successfully but be entirely off-screen.
  const fitKey = `${activeSimId ?? 'asset'}:${totalFrames}:${currentFrame}:${activeFrameUrl || fallbackUrl || assetPreviewUrl || 'none'}:${showPressureMap ? pressureLinesUrl || 'none' : 'off'}:${showFlowLines ? flowLinesUrl || 'none' : 'off'}:${fitNonce}`;

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

  const timeLine = (() => {
    const lines = (logs || '').split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (line.includes('Time =')) return line.trim();
    }
    return null;
  })();

  return (
    <div className="w-full h-full relative">
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Run</span>
          <span className="font-bold">{activeSimId ?? '—'}</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Status</span>
          <span className="font-bold">{status}</span>
        </div>
        {timeLine ? <div className="mt-1 text-slate-400">{timeLine}</div> : null}
      </div>

      {/* Analysis overlays (Post-Run Investigation) */}
      <MetricHUD />
      <LayerManager />
      <div className="absolute left-3 right-3 bottom-3 z-30">
        <TimelineController />
      </div>

      <Canvas shadows dpr={[1, 2]}>
        <color attach="background" args={['#000000']} />

        <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} near={0.001} far={10000} />

        <Grid
          infiniteGrid
          fadeDistance={50}
          cellColor="#334155"
          sectionColor="#475569"
        />

        <Suspense fallback={null}>
          <Stage intensity={0.5} environment="city" adjustCamera={false}>
            {/* Fit camera ONLY to the main foil geometry (exclude big overlays). */}
            <Bounds observe margin={1.2}>
              <FitToContent fitKey={fitKey} controlsRef={controlsRef} />
              {totalFrames > 0 ? (
                <group>
                  {assetPreviewUrl ? <HydrofoilResults url={assetPreviewUrl} /> : null}
                  <SimulationFrame
                    activeUrl={activeFrameUrl}
                    neighborUrls={neighborUrls}
                    showPressureMap={showPressureMap}
                    onActiveLoaded={() => {
                      if (isPlaying) return;
                      if (didFitForKeyRef.current === initialFitKey) return;
                      didFitForKeyRef.current = initialFitKey;
                      setFitNonce((n) => n + 1);
                    }}
                  />
                </group>
              ) : fallbackUrl ? (
                <HydrofoilResults url={fallbackUrl} />
              ) : assetPreviewUrl ? (
                <HydrofoilResults url={assetPreviewUrl} />
              ) : (
                <mesh>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial color="#334155" wireframe />
                </mesh>
              )}

              {/* Overlay layers (exported by worker as STL tube geometry). */}
              <OverlayFrame url={pressureLinesUrl} color="#ef4444" opacity={0.9} />
              <OverlayFrame url={flowLinesUrl} color="#3b82f6" opacity={0.85} />
            </Bounds>
          </Stage>
        </Suspense>

        {/* The playback sync-loop lives inside Canvas so it can use useFrame */}
        <PlaybackSyncLoop />

        <OrbitControls ref={controlsRef} makeDefault />

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#ef4444', '#22c55e', '#3b82f6']}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
