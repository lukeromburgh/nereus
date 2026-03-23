/**
 * VTK.js colormap utilities — builds vtkColorTransferFunction instances
 * from d3-scale-chromatic interpolators for use in VTK.js mappers.
 */
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
import {
  interpolateTurbo,
  interpolateViridis,
  interpolateInferno,
  interpolatePlasma,
  interpolateMagma,
  interpolateCool,
} from "d3-scale-chromatic";
import type { ColormapName } from "./colormaps";

const INTERPOLATORS: Record<ColormapName, (t: number) => string> = {
  turbo: interpolateTurbo,
  viridis: interpolateViridis,
  inferno: interpolateInferno,
  plasma: interpolatePlasma,
  magma: interpolateMagma,
  coolwarm: interpolateCool,
};

function parseRgb(css: string): [number, number, number] {
  const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
  return [0.5, 0.5, 0.5];
}

/**
 * Build a vtkColorTransferFunction from a d3-scale-chromatic colormap.
 * Samples `resolution` points across `scalarRange` and adds RGB control points.
 */
export function createVtkLookupTable(
  name: ColormapName,
  scalarRange: [number, number] = [0, 1],
  resolution = 256,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctf: any = vtkColorTransferFunction.newInstance();
  const interpolate = INTERPOLATORS[name];
  const [sMin, sMax] = scalarRange;

  for (let i = 0; i < resolution; i++) {
    const t = i / (resolution - 1);
    const scalar = sMin + t * (sMax - sMin);
    const [r, g, b] = parseRgb(interpolate(t));
    ctf.addRGBPoint(scalar, r, g, b);
  }

  ctf.setMappingRange(sMin, sMax);
  return ctf;
}
