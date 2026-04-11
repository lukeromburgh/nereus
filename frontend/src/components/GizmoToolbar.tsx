/**
 * GizmoToolbar — Mode selector for the 3D viewport transform gizmo.
 *
 * Provides Translate (W), Rotate (E), Scale (R) buttons matching Unity's
 * keyboard shortcuts.  Active mode gets a cyan accent highlight.
 */
import { Move, RotateCcw, Maximize2, MousePointer } from "lucide-react";
import { useSimStore } from "../store/useSimStore";

type GizmoMode = "none" | "translate" | "rotate" | "scale";

const MODES: { mode: GizmoMode; icon: typeof Move; label: string; shortcut: string }[] = [
  { mode: "none",      icon: MousePointer, label: "Select",    shortcut: "Q" },
  { mode: "translate", icon: Move,          label: "Translate", shortcut: "W" },
  { mode: "rotate",    icon: RotateCcw,     label: "Rotate",    shortcut: "E" },
  { mode: "scale",     icon: Maximize2,     label: "Scale",     shortcut: "R" },
];

export function GizmoToolbar() {
  const gizmoMode = useSimStore((s) => s.gizmoMode);
  const setGizmoMode = useSimStore((s) => s.setGizmoMode);

  return (
    <div className="pointer-events-auto absolute top-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 bg-[rgba(17,19,24,0.9)] border border-[rgba(255,255,255,0.08)] px-1 py-0.5" style={{ borderRadius: '2px' }}>
      {MODES.map(({ mode, icon: Icon, label, shortcut }) => {
        const active = gizmoMode === mode;
        return (
          <button
            key={mode}
            type="button"
            title={`${label} (${shortcut})`}
            onClick={() => setGizmoMode(mode)}
            className={`
              relative flex items-center justify-center w-7 h-7
              transition-colors
              ${
                active
                  ? "bg-[rgba(0,212,255,0.12)] text-nereus-accent border border-[rgba(0,212,255,0.3)]"
                  : "text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.8)] hover:bg-[rgba(255,255,255,0.05)] border border-transparent"
              }
            `}
            style={{ borderRadius: '2px' }}
          >
            <Icon className="w-[14px] h-[14px]" />
            <span className="absolute -bottom-0.5 right-0.5 text-[8px] font-mono leading-none opacity-50">
              {shortcut}
            </span>
          </button>
        );
      })}

      {/* Snap hint */}
      <div className="ml-1 text-[9px] text-[rgba(255,255,255,0.25)] font-mono leading-tight px-1">
        Hold <kbd className="bg-[rgba(255,255,255,0.06)] px-0.5 text-[rgba(255,255,255,0.45)]" style={{ borderRadius: '1px' }}>⇧</kbd> to snap
      </div>
    </div>
  );
}
