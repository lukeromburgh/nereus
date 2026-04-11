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
    <div className="flex flex-col gap-1 px-2.5">
      {/* Red banner — geometry still looks wrong */}
      {isSideways && (
        <div className="flex items-start gap-1.5 border border-[rgba(255,107,53,0.3)] bg-[rgba(255,107,53,0.06)] px-2.5 py-1.5 text-[11px] text-nereus-orange" style={{ borderRadius: '2px' }}>
          <AlertTriangle className="h-[14px] w-[14px] flex-shrink-0 mt-0.5 text-nereus-orange" />
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
        <div className="flex items-start gap-1.5 border border-[rgba(255,190,36,0.3)] bg-[rgba(255,190,36,0.06)] px-2.5 py-1.5 text-[11px] text-[#fbbf24]" style={{ borderRadius: '2px' }}>
          <AlertTriangle className="h-[14px] w-[14px] flex-shrink-0 mt-0.5 text-[#fbbf24]" />
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
