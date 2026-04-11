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
      className={`group w-full flex items-center gap-2 px-2 py-1.5 text-left transition-all duration-150 ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : enabled
            ? "bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.05)]"
            : "hover:bg-[rgba(255,255,255,0.02)]"
      }`}
    >
      {/* Indicator dot */}
      <span
        className="h-1.5 w-1.5 shrink-0 transition-all duration-300"
        style={{
          backgroundColor: enabled ? color : "transparent",
          border: `1.5px solid ${enabled ? color : "rgba(255, 255, 255, 0.15)"}`,
          borderRadius: '1px',
        }}
      />

      <span
        className={`flex-1 text-[11px] font-medium transition-colors duration-150 ${
          enabled ? "text-[rgba(255,255,255,0.8)]" : "text-[rgba(255,255,255,0.35)]"
        }`}
      >
        {label}
      </span>

      {/* Toggle icon */}
      <span className="text-[rgba(255,255,255,0.2)] group-hover:text-[rgba(255,255,255,0.45)] transition-colors">
        {enabled ? (
          <Eye className="h-[14px] w-[14px]" style={{ color }} />
        ) : (
          <EyeOff className="h-[14px] w-[14px]" />
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
      className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
    >
      <Icon className="h-[14px] w-[14px] text-[rgba(255,255,255,0.35)] shrink-0" />
      <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)] flex-1 text-left">{label}</span>
      {open ? (
        <ChevronDown className="h-[10px] w-[10px] text-[rgba(255,255,255,0.25)]" />
      ) : (
        <ChevronRight className="h-[10px] w-[10px] text-[rgba(255,255,255,0.25)]" />
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
      className="pointer-events-auto absolute left-2.5 top-16 z-20 w-44"
    >
      <div className="bg-[rgba(17,19,24,0.9)] border border-[rgba(255,255,255,0.08)] p-1" style={{ borderRadius: '2px' }}>
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
                  color="#00d4ff"
                />
                <ToggleRow
                  label="Pressure"
                  enabled={showPressureMap}
                  onToggle={togglePressureMap}
                  color="#ff6b35"
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
        <div className="mt-0.5 pt-0.5 border-t border-[rgba(255,255,255,0.06)]">
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
                      className={`flex items-center gap-1.5 px-1.5 py-0.5 text-left transition-all duration-150 ${
                        colormap === cm
                          ? "bg-[rgba(255,255,255,0.06)] border border-[rgba(0,212,255,0.2)]"
                          : "hover:bg-[rgba(255,255,255,0.03)] border border-transparent"
                      }`}
                      style={{ borderRadius: '2px' }}
                    >
                      <div
                        className="w-10 h-1.5 border border-[rgba(255,255,255,0.08)] shrink-0"
                        style={{
                          background: colormapGradientCSS(cm, 32).replace(
                            "to top",
                            "to right",
                          ),
                          borderRadius: '1px',
                        }}
                      />
                      <span
                        className={`text-[10px] font-mono capitalize ${
                          colormap === cm ? "text-[rgba(255,255,255,0.8)]" : "text-[rgba(255,255,255,0.35)]"
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
        <div className="mt-0.5 pt-0.5 border-t border-[rgba(255,255,255,0.06)]">
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
