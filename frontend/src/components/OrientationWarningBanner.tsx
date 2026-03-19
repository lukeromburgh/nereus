import { AlertTriangle } from "lucide-react";
import { useSimStore } from "../store/useSimStore";

/**
 * Shows a warning banner when the STL orientation was auto-corrected or
 * when the geometry dimensions look wrong (chord < span).
 */
export function OrientationWarningBanner() {
  const geometryAxesDetected = useSimStore((s) => s.geometryAxesDetected);
  const geometryDimensions = useSimStore((s) => s.geometryDimensions);

  const chordAxis = geometryAxesDetected?.detected_chord_axis;
  const chordM = geometryDimensions?.chord_m;
  const spanM = geometryDimensions?.span_m;

  const wasAutoRotated = chordAxis != null && chordAxis !== "X";
  const isSideways = chordM != null && spanM != null && chordM < spanM;

  if (!wasAutoRotated && !isSideways) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3">
      {/* Red banner — geometry still looks wrong */}
      {isSideways && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
          <span>
            <strong>Geometry looks incorrect:</strong> chord (
            {chordM?.toFixed(3)} m) &lt; span ({spanM?.toFixed(3)} m). The foil
            may still be sideways after correction. Check the orientation panel
            before running.
          </span>
        </div>
      )}

      {/* Yellow banner — auto-rotation was applied */}
      {wasAutoRotated && !isSideways && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-yellow-400" />
          <span>
            Geometry was auto-rotated: original chord axis was{" "}
            <strong>{chordAxis}</strong>. Verify orientation before interpreting
            results.
          </span>
        </div>
      )}
    </div>
  );
}
