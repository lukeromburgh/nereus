import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useSimStore } from "../store/useSimStore";

/**
 * A small arrow in the 3D scene pointing in +X labelled "FLOW →".
 * Positioned upstream of the foil leading edge, centred in Y and Z.
 *
 * Reads centredFoilBounds from the store — a stable value that only
 * changes when a new result loads. No per-frame bounding box recompute.
 */
export function FlowDirectionArrow() {
  const centredFoilBounds = useSimStore((s) => s.centredFoilBounds);

  const result = useMemo(() => {
    if (!centredFoilBounds) return null;

    const bMin = new THREE.Vector3(...centredFoilBounds.min);
    const bMax = new THREE.Vector3(...centredFoilBounds.max);
    const centre = new THREE.Vector3()
      .addVectors(bMin, bMax)
      .multiplyScalar(0.5);
    const chord = bMax.x - bMin.x;

    if (chord < 0.001) return null;

    // Place the arrow 1.5× upstream of the foil leading edge
    const originX = bMin.x - chord * 0.6;
    const originY = centre.y;
    const originZ = centre.z;

    const dir = new THREE.Vector3(1, 0, 0);
    const origin = new THREE.Vector3(originX, originY, originZ);
    const length = Math.max(chord * 0.35, 0.15);
    const headLength = length * 0.3;
    const headWidth = headLength * 0.5;

    const arrow = new THREE.ArrowHelper(
      dir,
      origin,
      length,
      0x60a5fa,
      headLength,
      headWidth,
    );

    const lPos = new THREE.Vector3(
      originX + length + headLength * 0.5,
      originY,
      originZ,
    );

    return { arrowMesh: arrow, labelPos: lPos };
  }, [centredFoilBounds]);

  if (!result) return null;

  return (
    <group>
      <primitive object={result.arrowMesh} />
      <Html
        position={[result.labelPos.x, result.labelPos.y, result.labelPos.z]}
        center
        style={{ pointerEvents: "none" }}
      >
        <div className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-blue-400 font-mono tracking-wider select-none">
          FLOW →
        </div>
      </Html>
    </group>
  );
}
