/**
 * Hydrodynamic force coefficient computations.
 *
 * Standard non-dimensionalisation:
 *   C = F / (0.5 * rho * V^2 * A_ref)
 *
 * Since reference area (A_ref) is not yet known per-geometry,
 * we compute a "force coefficient per unit area" (C* = F / q)
 * where q = dynamic pressure = 0.5 * rho * V^2.
 * This is consistent with how most CFD post-processors report
 * coefficients when working with a single geometry variant.
 */

export function dynamicPressure(
  velocity: number,
  waterDensity: number,
): number {
  return 0.5 * waterDensity * velocity * velocity;
}

export function forceCoefficient(
  force: number | null | undefined,
  q: number,
): number | null {
  if (force === null || force === undefined || !Number.isFinite(force))
    return null;
  if (q <= 0) return null;
  return force / q;
}

export type Coefficients = {
  Cl: number | null; // Lift coefficient
  Cd: number | null; // Drag coefficient
  Cs: number | null; // Side-force coefficient
};

export function computeCoefficients(
  Fx: number | null | undefined,
  Fy: number | null | undefined,
  Fz: number | null | undefined,
  velocity: number,
  waterDensity: number,
): Coefficients {
  const q = dynamicPressure(velocity, waterDensity);
  return {
    Cd: forceCoefficient(Fx, q),
    Cs: forceCoefficient(Fy, q),
    Cl: forceCoefficient(Fz, q),
  };
}
