/**
 * Parse per-equation residuals from OpenFOAM solver log output.
 * Returns one entry per iteration with all available residual fields.
 */

export type ResidualEntry = {
  iteration: number;
  p?: number;
  Ux?: number;
  Uy?: number;
  Uz?: number;
};

const FIELD_RE = /Solving for (\w+), Initial residual = ([0-9.eE+-]+)/g;

/**
 * Parse all residual fields from the full solver log.
 * Groups them into per-iteration entries by watching for "Time = " markers.
 */
export function parseAllResiduals(
  logs: string,
  maxEntries = 200,
): ResidualEntry[] {
  if (!logs) return [];

  const entries: ResidualEntry[] = [];
  const lines = logs.split("\n");
  let current: Partial<ResidualEntry> = {};
  let iteration = 0;

  for (const line of lines) {
    // Detect iteration boundary
    if (line.includes("Time =")) {
      if (Object.keys(current).length > 1) {
        entries.push(current as ResidualEntry);
      }
      iteration++;
      current = { iteration };
      continue;
    }

    // Extract residuals
    FIELD_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FIELD_RE.exec(line)) !== null) {
      const field = match[1];
      const value = Number(match[2]);
      if (!Number.isFinite(value)) continue;

      if (field === "p" || field === "Ux" || field === "Uy" || field === "Uz") {
        (current as Record<string, number | undefined>)[field] = value;
      }
    }
  }

  // Push final entry
  if (Object.keys(current).length > 1) {
    entries.push(current as ResidualEntry);
  }

  return entries.slice(-maxEntries);
}

/** Extract a single field series from residual entries */
export function extractSeries(
  entries: ResidualEntry[],
  field: keyof Omit<ResidualEntry, "iteration">,
): number[] {
  return entries
    .map((e) => e[field])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

/** Available fields that can appear in residuals */
export const RESIDUAL_FIELDS = ["p", "Ux", "Uy", "Uz"] as const;

export const RESIDUAL_COLORS: Record<string, string> = {
  p: "#60a5fa",
  Ux: "#94a3b8",
  Uy: "#fbbf24",
  Uz: "#34d399",
};
