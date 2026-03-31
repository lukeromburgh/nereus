/**
 * getPerformanceColor — Map L/D ratio to a performance color class.
 *
 * Used to color-code the L/D ratio display based on performance level.
 */

export function getPerformanceColor(
  ldRatio: number | null | undefined
): string {
  if (ldRatio === null || ldRatio === undefined || Number.isNaN(ldRatio)) {
    return "text-slate-600";
  }

  if (ldRatio >= 5) return "text-accent-emerald"; // Excellent
  if (ldRatio >= 3.5) return "text-accent-cyan"; // Very good
  if (ldRatio >= 2) return "text-accent-glow"; // Good
  if (ldRatio >= 1) return "text-yellow-500"; // Fair
  return "text-accent-rose"; // Poor
}