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
  disabled?: boolean;
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
  ticks,
  disabled = false,
  onChange,
  onLivePreview,
  onRelease,
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
    <div className="space-y-0.5">
      {label ? (
        <label className="text-[11px] font-medium text-[rgba(255,255,255,0.55)] block">{label}</label>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="flex-1 flex flex-col">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            className="slider-aerospace w-full cursor-pointer"
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              onChange(next);
              onLivePreview?.(next);
              setEditValue(next.toFixed(2));
            }}
            onMouseUp={() => onRelease?.()}
            onTouchEnd={() => onRelease?.()}
            aria-label={label}
          />
          {ticks && ticks.length > 0 && (
            <div className="relative w-full h-3 mt-0.5 px-[6px]">
              {ticks.map((tick, i) => {
                const pct = ((tick.value - min) / (max - min)) * 100;
                const isFirst = i === 0;
                const isLast = i === ticks.length - 1;
                return (
                  <span
                    key={tick.value}
                    className={`absolute text-[9px] text-[rgba(255,255,255,0.25)] leading-none select-none font-mono ${
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

        <div className="w-14 text-right">
          {isEditing ? (
            <input
              type="number"
              value={editValue}
              disabled={disabled}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitValue(editValue)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitValue(editValue);
                else if (e.key === "Escape") {
                  setEditValue(value.toFixed(2));
                  setIsEditing(false);
                }
              }}
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] px-1 py-0.5 text-[12px] font-mono text-[rgba(255,255,255,0.9)] text-right focus:border-nereus-accent focus:outline-none"
              style={{ borderRadius: '2px', height: '24px' }}
              step={step}
              min={min}
              max={max}
              autoFocus
              aria-label={label}
            />
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setIsEditing(true)}
              className="w-full text-[12px] font-mono text-[rgba(255,255,255,0.9)] text-right hover:text-nereus-accent transition-colors tabular-nums disabled:opacity-40 disabled:hover:text-[rgba(255,255,255,0.9)]"
              aria-label={`Edit ${label}`}
            >
              {value.toFixed(2)}
            </button>
          )}
        </div>

        {unit && <span className="text-[10px] text-[rgba(255,255,255,0.35)] font-mono">{unit}</span>}
      </div>
    </div>
  );
}
