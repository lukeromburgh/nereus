import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { Vector3 } from "three";
import { useSimStore } from "../store/useSimStore";

/**
 * Renders NOSE (green) and TAIL (red) markers at the leading and trailing
 * edges of the foil geometry.
 *
 * Leading edge = most negative X point (flow comes from -X → +X in OpenFOAM).
 * Trailing edge = most positive X point.
 *
 * Reads centredFoilBounds from the store — a stable value set once per result
 * load. No per-frame bounding box recompute, no ref props.
 */
export function FoilNoseMarker() {
  const centredFoilBounds = useSimStore((s) => s.centredFoilBounds);

  const layout = useMemo(() => {
    if (!centredFoilBounds) return null;

    const bMin = new Vector3(...centredFoilBounds.min);
    const bMax = new Vector3(...centredFoilBounds.max);
    const centre = new Vector3().addVectors(bMin, bMax).multiplyScalar(0.5);
    const chord = bMax.x - bMin.x;

    if (chord < 0.001) return null;

    const coneRadius = Math.max(chord / 20, 0.005);
    const coneHeight = Math.max(chord / 10, 0.01);

    return {
      nose: [bMin.x, centre.y, centre.z] as [number, number, number],
      tail: [bMax.x, centre.y, centre.z] as [number, number, number],
      coneRadius,
      coneHeight,
    };
  }, [centredFoilBounds]);

  if (!layout) return null;

  return (
    <>
      {/* NOSE marker — green cone pointing -X (into the flow) */}
      <group position={layout.nose}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[layout.coneRadius, layout.coneHeight, 16]} />
          <meshStandardMaterial
            color="#22c55e"
            emissive="#22c55e"
            emissiveIntensity={0.4}
          />
        </mesh>
        <Html center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-green-400 font-mono tracking-wider select-none">
            NOSE
          </div>
        </Html>
      </group>

      {/* TAIL marker — red cone pointing +X */}
      <group position={layout.tail}>
        <mesh rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry
            args={[layout.coneRadius * 0.7, layout.coneHeight * 0.7, 16]}
          />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={0.4}
          />
        </mesh>
        <Html center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-red-400 font-mono tracking-wider select-none">
            TAIL
          </div>
        </Html>
      </group>
    </>
  );
}
