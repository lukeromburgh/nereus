import { useState } from "react";

interface TickLabel {
  value: number;
  label: string;
}

interface SliderWithInputProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  ticks?: TickLabel[];
  onChange: (value: number) => void;
  onLivePreview?: (value: number) => void;
}

export function SliderWithInput({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit,
  ticks,
  onChange,
  onLivePreview,
}: SliderWithInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

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
        <label className="text-xs font-medium text-foreground-muted block">{label}</label>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="flex-1 flex flex-col">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            className="w-full h-1 bg-background-muted rounded-lg appearance-none cursor-pointer accent-accent"
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              onChange(next);
              onLivePreview?.(next);
              setEditValue(next.toFixed(2));
            }}
            aria-label={label}
          />
          {ticks && ticks.length > 0 && (
            <div className="relative w-full h-4 mt-1 px-[6px]">
              {ticks.map((tick, i) => {
                const pct = ((tick.value - min) / (max - min)) * 100;
                const isFirst = i === 0;
                const isLast = i === ticks.length - 1;
                return (
                  <span
                    key={tick.value}
                    className={`absolute text-[9px] text-foreground-subtle leading-none select-none ${
                      isFirst ? "translate-x-0" : isLast ? "-translate-x-full" : "-translate-x-1/2"
                    }`}
                    style={{ left: `${pct}%` }}
                  >
                    {tick.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="w-16 text-right">
          {isEditing ? (
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitValue(editValue)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitValue(editValue);
                else if (e.key === "Escape") {
                  setEditValue(value.toFixed(2));
                  setIsEditing(false);
                }
              }}
              className="w-full bg-background-elevated border border-border rounded-md px-1.5 py-1 text-xs font-mono text-foreground text-center focus:border-accent focus:outline-none"
              step={step}
              min={min}
              max={max}
              autoFocus
              aria-label={label}
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="w-full text-xs font-mono text-foreground text-right hover:text-accent transition-colors"
              aria-label={`Edit ${label}`}
            >
              {value.toFixed(2)}
            </button>
          )}
        </div>

        {unit && <span className="text-2xs text-foreground-subtle">{unit}</span>}
      </div>
    </div>
  );
}
