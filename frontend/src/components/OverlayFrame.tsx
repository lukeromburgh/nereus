import { useEffect, useRef, useState } from "react";
import { BufferGeometry, DoubleSide } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export type OverlayFrameProps = {
  url: string | null;
  color: string;
  opacity?: number;
};

export function OverlayFrame({
  url,
  color,
  opacity = 0.95,
}: OverlayFrameProps) {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  const geometryRef = useRef<BufferGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      try {
        geometryRef.current?.dispose();
      } catch {
        // ignore
      }
      geometryRef.current = null;
      setGeometry(null);
      return;
    }

    const loader = new STLLoader();
    loader.load(
      url,
      (geom) => {
        if (cancelled) {
          try {
            geom.dispose();
          } catch {
            // ignore
          }
          return;
        }
        try {
          geom.computeVertexNormals();
        } catch {
          // ignore
        }
        try {
          geom.computeBoundingBox();
          geom.computeBoundingSphere();
        } catch {
          // ignore
        }
        // Debug: Log bounding box min/max and sphere
        if (geom.boundingBox && geom.boundingSphere) {
          // eslint-disable-next-line no-console
          console.log("OverlayFrame: geometry loaded", url, {
            boundingBox: geom.boundingBox,
            boundingBoxMin: geom.boundingBox.min,
            boundingBoxMax: geom.boundingBox.max,
            boundingSphere: geom.boundingSphere,
            boundingSphereCenter: geom.boundingSphere.center,
            boundingSphereRadius: geom.boundingSphere.radius,
            vertexCount: geom.getAttribute("position")?.count,
          });
        } else {
          // eslint-disable-next-line no-console
          console.log("OverlayFrame: geometry loaded (no bounds)", url, geom);
        }
        try {
          geometryRef.current?.dispose();
        } catch {
          // ignore
        }
        geometryRef.current = geom;
        setGeometry(geom);
        // Camera fit: trigger after overlay loads
        if (typeof window !== "undefined" && window.dispatchEvent) {
          // Custom event to signal overlay loaded
          window.dispatchEvent(
            new CustomEvent("overlay-fit-request", { detail: { url } }),
          );
        }
      },
      undefined,
      (err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("OverlayFrame: failed to load STL", url, err);
        try {
          geometryRef.current?.dispose();
        } catch {
          // ignore
        }
        geometryRef.current = null;
        setGeometry(null);
      },
    );

    return () => {
      cancelled = true;
      try {
        geometryRef.current?.dispose();
      } catch {
        // ignore
      }
      geometryRef.current = null;
    };
  }, [url]);

  if (!url || !geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={10} frustumCulled={false}>
      <meshStandardMaterial
        color={color}
        side={DoubleSide}
        transparent
        opacity={opacity}
        depthWrite={false}
        emissive={color}
        emissiveIntensity={0.6}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}
