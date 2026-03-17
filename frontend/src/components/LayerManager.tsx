import { Check, Layers } from 'lucide-react';
import { useSimStore } from '../store/useSimStore';

function ToggleRow({
  label,
  enabled,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 rounded border border-slate-700 bg-black/30 hover:bg-black/50 px-2 py-2 text-left"
    >
      <span className="text-sm text-slate-100">{label}</span>
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded border ${
          enabled ? 'border-blue-600 bg-blue-900/20' : 'border-slate-700 bg-black/20'
        }`}
      >
        {enabled ? <Check className="h-3.5 w-3.5 text-blue-200" /> : null}
      </span>
    </button>
  );
}

export function LayerManager() {
  const totalFrames = useSimStore((s) => s.totalFrames);

  const showFlowLines = useSimStore((s) => s.showFlowLines);
  const showPressureMap = useSimStore((s) => s.showPressureMap);
  const showVorticity = useSimStore((s) => s.showVorticity);
  const toggleFlowLines = useSimStore((s) => s.toggleFlowLines);
  const togglePressureMap = useSimStore((s) => s.togglePressureMap);
  const toggleVorticity = useSimStore((s) => s.toggleVorticity);

  if (totalFrames <= 0) return null;

  return (
    <div className="pointer-events-auto absolute left-3 top-20 z-20 w-48 rounded border border-slate-700 bg-slate-950/60 backdrop-blur p-2">
      <div className="flex items-center gap-2 px-1 pb-2">
        <Layers className="h-4 w-4 text-slate-200" />
        <div className="text-xs uppercase tracking-wide text-slate-400">Layers</div>
      </div>

      <div className="flex flex-col gap-2">
        <ToggleRow label="Flow Lines" enabled={showFlowLines} onToggle={toggleFlowLines} />
        <ToggleRow label="Pressure Lines" enabled={showPressureMap} onToggle={togglePressureMap} />
        <ToggleRow label="Vorticity" enabled={showVorticity} onToggle={toggleVorticity} />
      </div>
    </div>
  );
}
