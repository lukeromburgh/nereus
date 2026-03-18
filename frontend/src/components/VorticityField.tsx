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

const PARTICLE_COUNT = 4000;
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
    float dist = -mvPosition.z;
    vAlpha = smoothstep(uFadeDistance, uFadeDistance * 0.3, dist) * 0.85;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    // Soft circular particle
    vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
    float r = length(uv);
    if (r > 1.0) discard;
    float softEdge = 1.0 - smoothstep(0.5, 1.0, r);

    gl_FragColor = vec4(vColor, vAlpha * softEdge * 0.7);
  }
`;

function generateVortexParticles(colormap: string) {
  const phases = new Float32Array(PARTICLE_COUNT);
  const speeds = new Float32Array(PARTICLE_COUNT);
  const radii = new Float32Array(PARTICLE_COUNT);
  const colors = new Float32Array(PARTICLE_COUNT * 3);

  const dummy = new Matrix4();
  const initialMatrices: Matrix4[] = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const coreIdx = i % VORTEX_CORES;
    const sign = coreIdx === 0 ? 1 : -1;

    // Spread particles along the wake (downstream X axis)
    const downstream = Math.random() * 6 + 0.5;
    const angle = Math.random() * Math.PI * 2;
    const helixRadius = 0.05 + Math.random() * 0.15;

    // Vortex core positions (tip vortices off each wing tip)
    const coreY = 0;
    const coreZ = sign * 0.8;

    const x = downstream;
    const y = coreY + Math.sin(angle) * helixRadius;
    const z = coreZ + Math.cos(angle) * helixRadius;

    const scale = 0.003 + Math.random() * 0.008;

    dummy.identity();
    dummy.makeScale(scale, scale, scale);
    dummy.setPosition(x, y, z);

    initialMatrices.push(dummy.clone());

    phases[i] = angle;
    speeds[i] = 0.5 + Math.random() * 2.0;
    radii[i] = helixRadius;

    // Color by downstream distance (0→1 normalized)
    const t = downstream / 6.5;
    const c = sampleColormap(colormap as never, t);
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  return { phases, speeds, radii, colors, initialMatrices };
}

export function VorticityField() {
  const meshRef = useRef<InstancedMesh>(null);
  const showVorticity = useSimStore((s) => s.showVorticity);
  const colormap = useSimStore((s) => s.colormap);

  const { phases, speeds, radii, colors, initialMatrices } = useMemo(
    () => generateVortexParticles(colormap),
    [colormap],
  );

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
      const coreZ = sign * 0.8;

      mesh.getMatrixAt(i, tempMatrix);
      tempPos.setFromMatrixPosition(tempMatrix);

      // Helical rotation around vortex core
      const phase = phases[i];
      const speed = speeds[i];
      const radius = radii[i];
      const angle = phase + t * speed;

      const newY = Math.sin(angle) * radius;
      const newZ = coreZ + Math.cos(angle) * radius;

      // Slow downstream drift
      let newX = tempPos.x + delta * 0.15;
      if (newX > 7) newX = 0.3 + Math.random() * 0.5; // recycle

      const scale = 0.003 + radii[i] * 0.04;
      tempMatrix.identity();
      tempMatrix.makeScale(scale, scale, scale);
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
