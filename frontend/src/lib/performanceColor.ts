/**
 * getPerformanceColor — Map L/D ratio to a performance color class.
 *
 * Used to color-code the L/D ratio display based on performance level.
 */

export function getPerformanceColor(
  ldRatio: number | null | undefined
): string {
  if (ldRatio === null || ldRatio === undefined || Number.isNaN(ldRatio)) {
    return "text-[rgba(255,255,255,0.25)]";
  }

  if (ldRatio >= 5) return "text-nereus-accent"; // Excellent
  if (ldRatio >= 3.5) return "text-nereus-accent"; // Very good
  if (ldRatio >= 2) return "text-nereus-accent"; // Good
  if (ldRatio >= 1) return "text-[#fbbf24]"; // Fair
  return "text-nereus-orange"; // Poor
}