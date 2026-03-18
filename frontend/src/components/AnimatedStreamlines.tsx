/**
 * AnimatedStreamlines — Animated particle traces along flow streamlines.
 *
 * Uses THREE.InstancedMesh with thousands of tiny elongated particles
 * that travel along parameterized streamline paths. Velocity magnitude
 * controls both particle speed and color intensity via the active colormap.
 */
import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import {
  InstancedMesh,
  Matrix4,
  Vector3,
  Quaternion,
  CylinderGeometry,
  ShaderMaterial,
  InstancedBufferAttribute,
  AdditiveBlending,
  DoubleSide,
} from "three";
import { useSimStore } from "../store/useSimStore";
import { sampleColormap } from "../lib/colormaps";

const STREAMLINE_COUNT = 24;
const PARTICLES_PER_LINE = 80;
const TOTAL_PARTICLES = STREAMLINE_COUNT * PARTICLES_PER_LINE;

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(vColor, vAlpha * 0.85);
  }
`;

type StreamlineSeed = {
  origin: Vector3;
  direction: Vector3;
  speed: number;
  curvature: number;
  length: number;
};

function generateStreamlineSeeds(): StreamlineSeed[] {
  const seeds: StreamlineSeed[] = [];
  for (let i = 0; i < STREAMLINE_COUNT; i++) {
    // Fan out from upstream, converging around the hydrofoil shape
    const spanZ = (i / (STREAMLINE_COUNT - 1) - 0.5) * 2.0; // -1 to 1
    const vertY = (Math.random() - 0.5) * 0.6;

    seeds.push({
      origin: new Vector3(-3, vertY, spanZ * 0.8),
      direction: new Vector3(1, 0, 0).normalize(),
      speed: 0.8 + Math.random() * 1.5,
      curvature: 0.1 + Math.random() * 0.3,
      length: 6 + Math.random() * 3,
    });
  }
  return seeds;
}

/** Evaluate a streamline position at parameter t ∈ [0, 1] */
function evalStreamline(seed: StreamlineSeed, t: number): Vector3 {
  const { origin, curvature, length } = seed;
  const x = origin.x + t * length;
  // Simulate flow deflection around a foil shape
  const deflection =
    curvature * Math.sin(t * Math.PI) * (1 - Math.abs(origin.z));
  const y = origin.y + deflection;
  const z = origin.z * (1 + 0.1 * Math.sin(t * Math.PI * 2));
  return new Vector3(x, y, z);
}

/** Evaluate velocity (tangent) at parameter t */
function evalVelocity(seed: StreamlineSeed, t: number): Vector3 {
  const dt = 0.001;
  const p0 = evalStreamline(seed, Math.max(0, t - dt));
  const p1 = evalStreamline(seed, Math.min(1, t + dt));
  return p1.clone().sub(p0).normalize();
}

export function AnimatedStreamlines() {
  const meshRef = useRef<InstancedMesh>(null);
  const showStreamlines = useSimStore((s) => s.showStreamlines);
  const colormap = useSimStore((s) => s.colormap);

  const seeds = useMemo(() => generateStreamlineSeeds(), []);

  // Particle state: each particle has a parameter t along its streamline
  const particleT = useRef(new Float32Array(TOTAL_PARTICLES));

  // Initialize particle positions spread along their streamlines
  useEffect(() => {
    const t = particleT.current;
    for (let s = 0; s < STREAMLINE_COUNT; s++) {
      for (let p = 0; p < PARTICLES_PER_LINE; p++) {
        const idx = s * PARTICLES_PER_LINE + p;
        t[idx] = p / PARTICLES_PER_LINE; // evenly distributed
      }
    }
  }, []);

  const geometry = useMemo(
    () => new CylinderGeometry(0.002, 0.001, 0.04, 4, 1),
    [],
  );

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );

  // Allocate instanced buffer attributes
  const { alphaAttr, colorAttr } = useMemo(() => {
    const alphas = new Float32Array(TOTAL_PARTICLES);
    const cols = new Float32Array(TOTAL_PARTICLES * 3);
    const alphaAttr = new InstancedBufferAttribute(alphas, 1);
    const colorAttr = new InstancedBufferAttribute(cols, 3);
    return { alphaAttr, colorAttr };
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.geometry.setAttribute("aAlpha", alphaAttr);
    mesh.geometry.setAttribute("aColor", colorAttr);
  }, [alphaAttr, colorAttr]);

  const tempMatrix = useMemo(() => new Matrix4(), []);
  const tempVel = useMemo(() => new Vector3(), []);
  const tempQuat = useMemo(() => new Quaternion(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !showStreamlines) return;

    const t = particleT.current;

    for (let s = 0; s < STREAMLINE_COUNT; s++) {
      const seed = seeds[s];

      for (let p = 0; p < PARTICLES_PER_LINE; p++) {
        const idx = s * PARTICLES_PER_LINE + p;

        // Advance particle along streamline
        t[idx] += delta * seed.speed * 0.08;
        if (t[idx] > 1) t[idx] -= 1; // wrap around

        const param = t[idx];
        const pos = evalStreamline(seed, param);
        const vel = evalVelocity(seed, param);

        // Orient cylinder along velocity direction
        tempVel.copy(vel);
        tempQuat.setFromUnitVectors(up, tempVel);

        // Scale by velocity magnitude (stretch fast particles)
        const speed = seed.speed;
        const stretch = 1 + speed * 0.3;

        tempMatrix.identity();
        tempMatrix.makeRotationFromQuaternion(tempQuat);
        tempMatrix.scale(new Vector3(1, stretch, 1));
        tempMatrix.setPosition(pos.x, pos.y, pos.z);

        mesh.setMatrixAt(idx, tempMatrix);

        // Fade: leading edge bright, trailing dim
        const headFade = Math.sin(param * Math.PI);
        alphaAttr.array[idx] = headFade * 0.9;

        // Color by velocity
        const velNorm = Math.min(1, speed / 2.5);
        const c = sampleColormap(colormap as never, velNorm);
        colorAttr.array[idx * 3 + 0] = c.r;
        colorAttr.array[idx * 3 + 1] = c.g;
        colorAttr.array[idx * 3 + 2] = c.b;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  if (!showStreamlines) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, TOTAL_PARTICLES]}
      frustumCulled={false}
    />
  );
}
