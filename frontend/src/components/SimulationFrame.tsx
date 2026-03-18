import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  Texture,
} from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type CachedFrame =
  | {
      kind: "stl";
      geometry: BufferGeometry;
    }
  | {
      kind: "gltf";
      scene: Group;
    };

function disposeMaterial(mat: Material) {
  const anyMat = mat as unknown as Record<string, unknown>;
  for (const key of Object.keys(anyMat)) {
    const val = anyMat[key];
    if (val && typeof val === "object") {
      const maybeTexture = val as Texture;
      if (typeof maybeTexture.dispose === "function") {
        // Heuristic: only dispose Texture-like objects.
        if (
          "isTexture" in (maybeTexture as unknown as Record<string, unknown>)
        ) {
          maybeTexture.dispose();
        }
      }
    }
  }
  mat.dispose();
}

function disposeGLTFScene(scene: Group) {
  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.geometry) {
      try {
        mesh.geometry.dispose();
      } catch {
        // ignore
      }
    }
    const material = (mesh as unknown as { material?: Material | Material[] })
      .material;
    if (material) {
      const mats = Array.isArray(material) ? material : [material];
      for (const mat of mats) {
        try {
          disposeMaterial(mat);
        } catch {
          // ignore
        }
      }
    }
  });
}

function loadFrame(url: string): Promise<CachedFrame> {
  const lower = url.toLowerCase();
  if (lower.endsWith(".stl")) {
    return new Promise((resolve, reject) => {
      const loader = new STLLoader();
      loader.load(
        url,
        (geometry) => {
          geometry.computeVertexNormals();
          try {
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
          } catch {
            // ignore
          }
          // Debug: Log bounding box and sphere
          if (geometry.boundingBox && geometry.boundingSphere) {
            // eslint-disable-next-line no-console
            console.log("SimulationFrame: main mesh geometry loaded", url, {
              boundingBox: geometry.boundingBox,
              boundingBoxMin: geometry.boundingBox.min,
              boundingBoxMax: geometry.boundingBox.max,
              boundingSphere: geometry.boundingSphere,
              boundingSphereCenter: geometry.boundingSphere.center,
              boundingSphereRadius: geometry.boundingSphere.radius,
              vertexCount: geometry.getAttribute("position")?.count,
            });
          } else {
            // eslint-disable-next-line no-console
            console.log(
              "SimulationFrame: main mesh geometry loaded (no bounds)",
              url,
              geometry,
            );
          }
          resolve({ kind: "stl", geometry });
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        resolve({ kind: "gltf", scene: gltf.scene });
      },
      undefined,
      (err) => reject(err),
    );
  });
}

export type SimulationFrameProps = {
  activeUrl: string | null;
  neighborUrls: string[];
  showPressureMap: boolean;
  onActiveLoaded?: () => void;
};

export function SimulationFrame({
  activeUrl,
  neighborUrls,
  showPressureMap: _showPressureMap,
  onActiveLoaded,
}: SimulationFrameProps) {
  const cacheRef = useRef(
    new Map<string, { lastUsed: number; frame: CachedFrame }>(),
  );
  const [activeFrame, setActiveFrame] = useState<CachedFrame | null>(null);

  const keepSet = useMemo(
    () => new Set(neighborUrls.filter(Boolean)),
    [neighborUrls],
  );

  useEffect(() => {
    let cancelled = false;

    async function ensure(url: string) {
      const now = Date.now();
      const cached = cacheRef.current.get(url);
      if (cached) {
        cached.lastUsed = now;
        return cached.frame;
      }

      const frame = await loadFrame(url);
      cacheRef.current.set(url, { lastUsed: now, frame });
      return frame;
    }

    async function run() {
      if (!activeUrl) {
        setActiveFrame(null);
        return;
      }

      try {
        // Load active first for responsiveness.
        const frame = await ensure(activeUrl);
        if (cancelled) return;
        setActiveFrame(frame);
        onActiveLoaded?.();

        // Preload neighbors.
        await Promise.all(
          neighborUrls.filter((u) => !!u).map((u) => ensure(u)),
        );
        if (cancelled) return;

        // Evict everything not in the neighborhood (LRU-like, but deterministic for MVP).
        for (const [url, entry] of cacheRef.current.entries()) {
          if (!keepSet.has(url)) {
            try {
              if (entry.frame.kind === "stl") {
                entry.frame.geometry.dispose();
              } else {
                disposeGLTFScene(entry.frame.scene);
              }
            } catch {
              // ignore
            }
            cacheRef.current.delete(url);
          }
        }
      } catch {
        // eslint-disable-next-line no-console
        console.error("SimulationFrame: failed to load frame", activeUrl);
        if (!cancelled) setActiveFrame(null);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [activeUrl, neighborUrls, keepSet, onActiveLoaded]);

  if (!activeUrl || !activeFrame) return null;

  if (activeFrame.kind === "gltf") {
    return <primitive object={activeFrame.scene} />;
  }

  return (
    <mesh geometry={activeFrame.geometry}>
      <meshStandardMaterial
        color="#94a3b8"
        metalness={0.4}
        roughness={0.35}
        side={DoubleSide}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}
