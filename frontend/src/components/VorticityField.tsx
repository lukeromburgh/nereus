/**
 * VorticityField — A GPU-driven vortex particle system.
 *
 * Renders tip-vortex and wake-turbulence visualization as thousands of tiny
 * instanced spheres that rotate in helical patterns around vortex core lines.
 * Uses a custom shader for smooth animated opacity, velocity-based stretching,
 * and scientific colormap tinting.
 */
import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import {
  InstancedMesh,
  Matrix4,
  Vector3,
  SphereGeometry,
  ShaderMaterial,
  InstancedBufferAttribute,
  AdditiveBlending,
  DoubleSide,
} from "three";
import { useSimStore } from "../store/useSimStore";
import { sampleColormap } from "../lib/colormaps";

const PARTICLE_COUNT = 600; // 300 per tip vortex
const VORTEX_CORES = 2; // Two tip vortices (port + starboard)

const vertexShader = /* glsl */ `
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aRadius;
  attribute vec3 aColor;

  varying float vAlpha;
  varying vec3 vColor;

  uniform float uTime;
  uniform float uFadeDistance;

  void main() {
    vColor = aColor;

    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    // Constant alpha — distance-based fade was killing particles at most
    // camera angles because dist = -mvPosition.z can go negative.
    vAlpha = 0.85;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, vAlpha * 0.7);
  }
`;

export function VorticityField() {
  const meshRef = useRef<InstancedMesh>(null);
  const showVorticity = useSimStore((s) => s.showVorticity);
  const colormap = useSimStore((s) => s.colormap);
  const foilCenter = useSimStore((s) => s.foilCenter);
  const foilSize = useSimStore((s) => s.foilSize);

  // Derive wake geometry from actual foil bounds
  const span = foilSize[1]; // Y extent = wingspan
  const chord = foilSize[0]; // X extent
  const foilScale = Math.max(span, chord, 0.01);
  // Tip vortex cores at ± half-span in Y, at foil center Z
  const coreYOffset = span / 2;
  // Trail starts at mid-chord so helices appear attached to the foil
  const trailStartX = foilCenter[0];
  const trailLen = foilScale * 12; // 12× foil scale downstream
  const particleSize = foilScale * 0.035;

  const { phases, speeds, radii, colors, initialMatrices } = useMemo(() => {
    const phases = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const dummy = new Matrix4();
    const initialMatrices: Matrix4[] = [];
    const particlesPerCore = PARTICLE_COUNT / VORTEX_CORES;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const coreIdx = i % VORTEX_CORES;
      const sign = coreIdx === 0 ? 1 : -1;
      const posInCore = Math.floor(i / VORTEX_CORES);
      const frac = posInCore / particlesPerCore;

      const downstream = frac * trailLen;
      const turnsPerUnit = 2.0 / Math.max(foilScale, 0.01);
      const angle = frac * Math.PI * 2 * turnsPerUnit * trailLen;
      // Start with a very tight helix at the foil, expanding downstream
      const helixRadius = foilScale * 0.02 + downstream * 0.008;

      const x = trailStartX + downstream;
      const y =
        foilCenter[1] + sign * coreYOffset + Math.sin(angle) * helixRadius;
      const z = foilCenter[2] + Math.cos(angle) * helixRadius;

      dummy.identity();
      dummy.makeScale(particleSize, particleSize, particleSize);
      dummy.setPosition(x, y, z);
      initialMatrices.push(dummy.clone());

      phases[i] = angle;
      speeds[i] = 0.8;
      radii[i] = helixRadius;

      const t = frac;
      const c = sampleColormap(colormap as never, t * 0.7 + 0.05);
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { phases, speeds, radii, colors, initialMatrices };
  }, [
    colormap,
    foilCenter,
    foilSize,
    span,
    chord,
    foilScale,
    coreYOffset,
    trailStartX,
    trailLen,
    particleSize,
  ]);

  const geometry = useMemo(() => new SphereGeometry(1, 6, 4), []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uFadeDistance: { value: 50 },
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );

  // Set initial instance matrices and attributes
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      mesh.setMatrixAt(i, initialMatrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Set instanced buffer attributes
    mesh.geometry.setAttribute(
      "aPhase",
      new InstancedBufferAttribute(phases, 1),
    );
    mesh.geometry.setAttribute(
      "aSpeed",
      new InstancedBufferAttribute(speeds, 1),
    );
    mesh.geometry.setAttribute(
      "aRadius",
      new InstancedBufferAttribute(radii, 1),
    );
    mesh.geometry.setAttribute(
      "aColor",
      new InstancedBufferAttribute(colors, 3),
    );
  }, [phases, speeds, radii, colors, initialMatrices]);

  // Animate: rotate particles helically around vortex cores
  const tempMatrix = useMemo(() => new Matrix4(), []);
  const tempPos = useMemo(() => new Vector3(), []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !showVorticity) return;

    material.uniforms.uTime.value += delta;
    const t = material.uniforms.uTime.value;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const coreIdx = i % VORTEX_CORES;
      const sign = coreIdx === 0 ? 1 : -1;

      mesh.getMatrixAt(i, tempMatrix);
      tempPos.setFromMatrixPosition(tempMatrix);

      const phase = phases[i];
      const speed = speeds[i];
      const radius = radii[i];
      const angle = phase + t * speed;

      const newY =
        foilCenter[1] + sign * coreYOffset + Math.sin(angle) * radius;
      const newZ = foilCenter[2] + Math.cos(angle) * radius;

      let newX = tempPos.x + delta * foilScale * 1.5;
      if (newX > trailStartX + trailLen) newX = trailStartX + foilScale * 0.05;

      tempMatrix.identity();
      tempMatrix.makeScale(particleSize, particleSize, particleSize);
      tempMatrix.setPosition(newX, newY, newZ);
      mesh.setMatrixAt(i, tempMatrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!showVorticity) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, PARTICLE_COUNT]}
      frustumCulled={false}
    />
  );
}
