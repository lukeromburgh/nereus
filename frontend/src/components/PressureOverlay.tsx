/**
 * PressureOverlay — Renders pressure contour geometry with scientific colormap
 * applied via a 1D DataTexture lookup in a custom shader.
 *
 * Uses vertex position (normalized along the flow direction) as the scalar
 * field to drive the colormap, giving a physically meaningful gradient instead
 * of a flat red emissive color.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import {
  BufferGeometry,
  DoubleSide,
  ShaderMaterial,
  AdditiveBlending,
} from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { useSimStore } from "../store/useSimStore";
import { createColormapTexture } from "../lib/colormaps";

const vertexShader = /* glsl */ `
  varying float vScalar;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  uniform float uMinX;
  uniform float uRangeX;

  void main() {
    // Normalize position along primary flow axis (X) as scalar field
    vScalar = clamp((position.x - uMinX) / max(uRangeX, 0.001), 0.0, 1.0);
    vNormal = normalize(normalMatrix * normal);

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);

    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uColormap;
  uniform float uOpacity;
  uniform float uEmissiveIntensity;

  varying float vScalar;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 cmColor = texture2D(uColormap, vec2(vScalar, 0.5));

    // Fresnel rim effect for depth
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.0);
    float rim = 0.15 * fresnel;

    vec3 finalColor = cmColor.rgb * (1.0 + uEmissiveIntensity) + rim;
    gl_FragColor = vec4(finalColor, uOpacity);
  }
`;

export type PressureOverlayProps = {
  url: string | null;
  opacity?: number;
};

export function PressureOverlay({ url, opacity = 0.88 }: PressureOverlayProps) {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  const geometryRef = useRef<BufferGeometry | null>(null);
  const colormap = useSimStore((s) => s.colormap);

  const colormapTexture = useMemo(
    () => createColormapTexture(colormap),
    [colormap],
  );

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uColormap: { value: colormapTexture },
          uOpacity: { value: opacity },
          uEmissiveIntensity: { value: 0.5 },
          uMinX: { value: 0 },
          uRangeX: { value: 1 },
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    // Re-create when colormap changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colormapTexture],
  );

  // Update opacity uniform reactively
  useEffect(() => {
    material.uniforms.uOpacity.value = opacity;
  }, [material, opacity]);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      geometryRef.current?.dispose();
      geometryRef.current = null;
      setGeometry(null);
      return;
    }

    const loader = new STLLoader();
    loader.load(
      url,
      (geom) => {
        if (cancelled) {
          geom.dispose();
          return;
        }
        geom.computeVertexNormals();
        geom.computeBoundingBox();

        // Set scalar range from bounding box X extent
        if (geom.boundingBox) {
          material.uniforms.uMinX.value = geom.boundingBox.min.x;
          material.uniforms.uRangeX.value =
            geom.boundingBox.max.x - geom.boundingBox.min.x;
        }

        geometryRef.current?.dispose();
        geometryRef.current = geom;
        setGeometry(geom);

        window.dispatchEvent(
          new CustomEvent("overlay-fit-request", { detail: { url } }),
        );
      },
      undefined,
      (err) => {
        if (cancelled) return;
        console.error("PressureOverlay: failed to load", url, err);
        geometryRef.current?.dispose();
        geometryRef.current = null;
        setGeometry(null);
      },
    );

    return () => {
      cancelled = true;
      geometryRef.current?.dispose();
      geometryRef.current = null;
    };
  }, [url, material]);

  if (!url || !geometry) return null;

  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={10}
      frustumCulled={false}
    />
  );
}
