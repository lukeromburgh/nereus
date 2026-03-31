import { type ReactNode, useState } from "react";

interface SliderWithInputProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  onLivePreview?: (value: number) => void;
  onRelease?: () => void;
}

export function SliderWithInput({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit,
  onChange,
  onLivePreview,
  onRelease,
}: SliderWithInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>(value.toString());

  const commitValue = (raw: string) => {
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) {
      setEditValue(value.toFixed(2));
      setIsEditing(false);
      return;
    }

    const clamped = Math.min(max, Math.max(min, parsed));
    const output = Number.isNaN(clamped) ? value : clamped;

    if (output !== value) {
      onChange(output);
      onLivePreview?.(output);
    }

    setEditValue(output.toFixed(2));
    setIsEditing(false);
  };

  return (
    <div className="space-y-1">
      {label ? (
        <label className="text-xs font-medium text-slate-300 block">{label}</label>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          className="flex-1 h-1 bg-accent/20 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
          onChange={(e) => {
            const next = Number(e.currentTarget.value);
            onChange(next);
            onLivePreview?.(next);
            setEditValue(next.toFixed(2));
          }}
          onPointerUp={onRelease}
          onMouseUp={onRelease}
          aria-label={label}
        />

        <div className="w-16 text-right">
          {isEditing ? (
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitValue(editValue)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitValue(editValue);
                } else if (e.key === "Escape") {
                  setEditValue(value.toFixed(2));
                  setIsEditing(false);
                }
              }}
              className="w-full bg-accent/10 border border-accent/25 rounded px-1.5 py-1 text-xs font-mono text-slate-200"
              step={step}
              min={min}
              max={max}
              autoFocus
              aria-label={`${label} input`}
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="w-full text-xs font-mono text-slate-200 text-right"
              aria-label={`Edit ${label}`}
            >
              {value.toFixed(2)}
            </button>
          )}
        </div>

        {unit ? <span className="text-2xs text-slate-500">{unit}</span> : null}
      </div>
    </div>
  );
}
