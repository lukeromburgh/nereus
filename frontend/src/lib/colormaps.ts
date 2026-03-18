/**
 * Scientific colormap utilities using d3-scale-chromatic.
 * Converts a normalized scalar [0,1] to an RGB color for use in Three.js shaders/materials.
 */
import {
  interpolateTurbo,
  interpolateViridis,
  interpolateInferno,
  interpolatePlasma,
  interpolateMagma,
  interpolateCool,
} from "d3-scale-chromatic";
import {
  Color,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
} from "three";

export type ColormapName =
  | "turbo"
  | "viridis"
  | "inferno"
  | "plasma"
  | "magma"
  | "coolwarm";

const INTERPOLATORS: Record<ColormapName, (t: number) => string> = {
  turbo: interpolateTurbo,
  viridis: interpolateViridis,
  inferno: interpolateInferno,
  plasma: interpolatePlasma,
  magma: interpolateMagma,
  coolwarm: interpolateCool,
};

/** Sample a colormap at normalized value t ∈ [0, 1]. Returns a THREE.Color. */
export function sampleColormap(name: ColormapName, t: number): Color {
  const clamped = Math.max(0, Math.min(1, t));
  const css = INTERPOLATORS[name](clamped);
  return new Color(css);
}

/** Generate a 1D DataTexture (256×1) for GPU-side colormap lookups. */
export function createColormapTexture(
  name: ColormapName,
  resolution = 256,
): DataTexture {
  const data = new Uint8Array(resolution * 4);
  const interpolate = INTERPOLATORS[name];

  for (let i = 0; i < resolution; i++) {
    const t = i / (resolution - 1);
    const css = interpolate(t);
    const c = new Color(css);
    data[i * 4 + 0] = Math.round(c.r * 255);
    data[i * 4 + 1] = Math.round(c.g * 255);
    data[i * 4 + 2] = Math.round(c.b * 255);
    data[i * 4 + 3] = 255;
  }

  const tex = new DataTexture(
    data,
    resolution,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Generate CSS gradient stops for a 2D colorbar legend. */
export function colormapGradientCSS(name: ColormapName, steps = 64): string {
  const interpolate = INTERPOLATORS[name];
  const stops: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    stops.push(`${interpolate(t)} ${(t * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to top, ${stops.join(", ")})`;
}
