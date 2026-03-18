import {
  Layers,
  Eye,
  EyeOff,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Palette,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useSimStore } from "../store/useSimStore";
import { colormapGradientCSS, type ColormapName } from "../lib/colormaps";

const COLORMAP_OPTIONS: ColormapName[] = [
  "turbo",
  "viridis",
  "inferno",
  "plasma",
  "magma",
  "coolwarm",
];

function ToggleRow({
  label,
  enabled,
  onToggle,
  color,
  disabled,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`group w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-all duration-200 ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : enabled
            ? "bg-white/[0.04] hover:bg-white/[0.06]"
            : "hover:bg-white/[0.03]"
      }`}
    >
      {/* Indicator dot */}
      <span
        className="h-2 w-2 rounded-full shrink-0 transition-all duration-300"
        style={{
          backgroundColor: enabled ? color : "transparent",
          border: `1.5px solid ${enabled ? color : "rgba(148, 163, 184, 0.3)"}`,
          boxShadow: enabled ? `0 0 8px ${color}40` : "none",
        }}
      />

      <span
        className={`flex-1 text-xs font-medium transition-colors duration-200 ${
          enabled ? "text-slate-200" : "text-slate-500"
        }`}
      >
        {label}
      </span>

      {/* Toggle icon */}
      <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
        {enabled ? (
          <Eye className="h-3.5 w-3.5" style={{ color }} />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  );
}

/** Collapsible section header */
function SectionHeader({
  icon: Icon,
  label,
  open,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/[0.03] rounded transition-colors"
    >
      <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <span className="hud-label flex-1 text-left">{label}</span>
      {open ? (
        <ChevronDown className="h-3 w-3 text-slate-600" />
      ) : (
        <ChevronRight className="h-3 w-3 text-slate-600" />
      )}
    </button>
  );
}

export function LayerManager() {
  const totalFrames = useSimStore((s) => s.totalFrames);

  const showFlowLines = useSimStore((s) => s.showFlowLines);
  const showPressureMap = useSimStore((s) => s.showPressureMap);
  const showVorticity = useSimStore((s) => s.showVorticity);
  const showStreamlines = useSimStore((s) => s.showStreamlines);
  const enableBloom = useSimStore((s) => s.enableBloom);
  const enableSSAO = useSimStore((s) => s.enableSSAO);
  const colormap = useSimStore((s) => s.colormap);
  const toggleFlowLines = useSimStore((s) => s.toggleFlowLines);
  const togglePressureMap = useSimStore((s) => s.togglePressureMap);
  const toggleVorticity = useSimStore((s) => s.toggleVorticity);
  const toggleStreamlines = useSimStore((s) => s.toggleStreamlines);
  const toggleBloom = useSimStore((s) => s.toggleBloom);
  const toggleSSAO = useSimStore((s) => s.toggleSSAO);
  const setColormap = useSimStore((s) => s.setColormap);

  const [overlaysOpen, setOverlaysOpen] = useState(true);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [colormapOpen, setColormapOpen] = useState(false);

  if (totalFrames <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="pointer-events-auto absolute left-3 top-20 z-20 w-48"
    >
      <div className="glass-panel rounded-lg p-1.5">
        {/* ── Overlays ── */}
        <SectionHeader
          icon={Layers}
          label="Overlays"
          open={overlaysOpen}
          onToggle={() => setOverlaysOpen((o) => !o)}
        />
        <AnimatePresence initial={false}>
          {overlaysOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-0.5 mt-0.5">
                <ToggleRow
                  label="Flow Lines"
                  enabled={showFlowLines}
                  onToggle={toggleFlowLines}
                  color="#60a5fa"
                />
                <ToggleRow
                  label="Pressure"
                  enabled={showPressureMap}
                  onToggle={togglePressureMap}
                  color="#fb7185"
                />
                <ToggleRow
                  label="Vorticity"
                  enabled={showVorticity}
                  onToggle={toggleVorticity}
                  color="#a78bfa"
                />
                <ToggleRow
                  label="Streamlines"
                  enabled={showStreamlines}
                  onToggle={toggleStreamlines}
                  color="#34d399"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Colormap ── */}
        <div className="mt-1 pt-1 border-t border-hud-border">
          <SectionHeader
            icon={Palette}
            label="Colormap"
            open={colormapOpen}
            onToggle={() => setColormapOpen((o) => !o)}
          />
          <AnimatePresence initial={false}>
            {colormapOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-0.5 mt-0.5 px-1">
                  {COLORMAP_OPTIONS.map((cm) => (
                    <button
                      key={cm}
                      onClick={() => setColormap(cm)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-left transition-all duration-150 ${
                        colormap === cm
                          ? "bg-white/[0.08] ring-1 ring-accent/30"
                          : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <div
                        className="w-10 h-2 rounded-sm border border-hud-border shrink-0"
                        style={{
                          background: colormapGradientCSS(cm, 32).replace(
                            "to top",
                            "to right",
                          ),
                        }}
                      />
                      <span
                        className={`text-2xs font-mono capitalize ${
                          colormap === cm ? "text-slate-200" : "text-slate-500"
                        }`}
                      >
                        {cm}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Effects ── */}
        <div className="mt-1 pt-1 border-t border-hud-border">
          <SectionHeader
            icon={Sparkles}
            label="Effects"
            open={effectsOpen}
            onToggle={() => setEffectsOpen((o) => !o)}
          />
          <AnimatePresence initial={false}>
            {effectsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-0.5 mt-0.5">
                  <ToggleRow
                    label="Bloom"
                    enabled={enableBloom}
                    onToggle={toggleBloom}
                    color="#fbbf24"
                  />
                  <ToggleRow
                    label="SSAO"
                    enabled={enableSSAO}
                    onToggle={toggleSSAO}
                    color="#94a3b8"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
