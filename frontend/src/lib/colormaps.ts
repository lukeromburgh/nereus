/**
 * Scientific colormap utilities using d3-scale-chromatic.
 * VTK.js colormap functions live in lib/vtkColormaps.ts.
 * This file retains only the CSS-gradient helper used by DOM overlay components.
 */
import {
  interpolateTurbo,
  interpolateViridis,
  interpolateInferno,
  interpolatePlasma,
  interpolateMagma,
  interpolateCool,
} from "d3-scale-chromatic";

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
