/**
 * LogConsoleCompact — Minimal, bottom-docked log console for VTK viewport.
 *
 * Shows simulation progress and solver output in a compact format.
 * Collapsed by default (just header + progress bar visible).
 * Expands on demand to show full log entries.
 */
import { useState } from "react";
import { ChevronUp } from "lucide-react";
import { useSimStore } from "../../store/useSimStore";

interface LogEntry {
  phase: string; // 'MESHING', 'SOLVING', 'POST', etc.
  progress: number; // 0–1
  message: string;
}

/**
 * Parse raw OpenFOAM log output into structured entries.
 * Extracts key phrases and iteration counts.
 */
function parseLogOutput(logs: string): LogEntry[] {
  if (!logs) return [];

  const entries: LogEntry[] = [];
  const lines = logs.split("\n").slice(-50); // Last 50 lines only

  let currentPhase = "SOLVING";
  let currentProgress = 0;

  for (const line of lines) {
    // Detect phase transitions
    if (line.includes("surfaceFeatureExtract")) {
      currentPhase = "FEATURE";
      entries.push({ phase: currentPhase, progress: 0.1, message: line });
    } else if (line.includes("blockMesh") && !line.includes("snappy")) {
      currentPhase = "MESHING";
      entries.push({ phase: currentPhase, progress: 0.2, message: line });
    } else if (line.includes("snappyHexMesh")) {
      currentPhase = "MESHING";
      entries.push({ phase: currentPhase, progress: 0.4, message: line });
    } else if (line.includes("decomposePar")) {
      currentPhase = "DECOMPOSE";
      entries.push({ phase: currentPhase, progress: 0.5, message: line });
    } else if (line.includes("simpleFoam") || line.includes("pimpleFoam")) {
      currentPhase = "SOLVING";
      currentProgress = 0.6;
      entries.push({ phase: currentPhase, progress: currentProgress, message: line });
    } else if (line.includes("Iteration") || line.includes("Time =")) {
      currentProgress = Math.min(0.9, currentProgress + 0.05);
      entries.push({ phase: currentPhase, progress: currentProgress, message: line });
    } else if (
      line.includes("End") ||
      line.includes("Finalizing") ||
      line.includes("Finished")
    ) {
      currentPhase = "POST";
      entries.push({ phase: currentPhase, progress: 1.0, message: line });
    } else if (line.trim().length > 0) {
      entries.push({ phase: currentPhase, progress: currentProgress, message: line });
    }
  }

  return entries;
}

export function LogConsoleCompact() {
  const logs = useSimStore((s) => s.logs);
  const status = useSimStore((s) => s.status);
  const [isExpanded, setIsExpanded] = useState(false);

  const entries = parseLogOutput(logs);
  const currentEntry = entries[entries.length - 1];
  const isRunning = status === "PENDING" || status === "MESHING" || status === "SOLVING";

  if (!currentEntry && !isRunning) {
    return null; // Don't show if not running and no logs
  }

  const progress = currentEntry?.progress || 0;
  const phase = currentEntry?.phase || "IDLE";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ─────────────────────────────────────────────────────────────── */}
      {/* Header (Always Visible) */}
      {/* ─────────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-3 py-1.5 hover:bg-[rgba(255,255,255,0.03)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[rgba(255,255,255,0.35)] uppercase tracking-[0.1em]">
            Solver Output
          </span>
          {isRunning && (
            <div className="h-1.5 w-1.5 bg-nereus-accent" style={{ borderRadius: '1px' }} />
          )}
        </div>
        <ChevronUp
          className={`h-[14px] w-[14px] text-[rgba(255,255,255,0.25)] transition-transform ${
            isExpanded ? "" : "rotate-180"
          }`}
        />
      </button>

      {/* Progress Bar (Always Visible When Running) */}
      {isRunning && currentEntry && (
        <div className="px-3 py-1.5 space-y-1 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[rgba(255,255,255,0.4)]">{phase}</span>
            <span className="text-[10px] text-[rgba(255,255,255,0.25)] font-mono">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <div className="w-full h-[1px] bg-[rgba(255,255,255,0.06)] overflow-hidden">
            <div
              className="h-full bg-nereus-accent transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded Log View */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto scrollbar-dark border-t border-[rgba(255,255,255,0.06)] bg-[rgba(10,11,13,0.4)]">
          <div className="space-y-0 text-[10px] font-mono text-[rgba(255,255,255,0.4)] p-2.5">
            {entries.slice(-30).map((entry, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 py-0.5 hover:bg-[rgba(255,255,255,0.02)] px-1"
              >
                <span className="text-[rgba(255,255,255,0.2)] min-w-fit flex-shrink-0">
                  [{entry.phase}]
                </span>
                <span className="flex-1 break-words text-[rgba(255,255,255,0.35)]">
                  {entry.message}
                </span>
                {entry.progress > 0 && entry.progress < 1 && (
                  <span className="text-right min-w-fit flex-shrink-0 text-[rgba(255,255,255,0.2)]">
                    {Math.round(entry.progress * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}