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
    <div className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 glass-panel rounded-lg px-1 py-1">
      {MODES.map(({ mode, icon: Icon, label, shortcut }) => {
        const active = gizmoMode === mode;
        return (
          <button
            key={mode}
            type="button"
            title={`${label} (${shortcut})`}
            onClick={() => setGizmoMode(mode)}
            className={`
              relative flex items-center justify-center w-8 h-8 rounded
              transition-colors
              ${
                active
                  ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] border border-transparent"
              }
            `}
          >
            <Icon className="w-4 h-4" />
            <span className="absolute -bottom-0.5 right-0.5 text-[8px] font-mono leading-none opacity-50">
              {shortcut}
            </span>
          </button>
        );
      })}

      {/* Snap hint */}
      <div className="ml-1 text-[9px] text-slate-500 font-mono leading-tight px-1">
        Hold <kbd className="bg-white/[0.08] px-0.5 rounded text-slate-400">⇧</kbd> to snap
      </div>
    </div>
  );
}
