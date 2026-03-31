import { type ReactNode, useState } from "react";
import { HelpCircle } from "lucide-react";

interface FieldWithHintProps {
  label: string;
  hint: string;
  children: ReactNode;
}

export function FieldWithHint({ label, hint, children }: FieldWithHintProps) {
  const [showHint, setShowHint] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <button
          type="button"
          aria-label={`${label} help`}
          onMouseEnter={() => setShowHint(true)}
          onMouseLeave={() => setShowHint(false)}
          onFocus={() => setShowHint(true)}
          onBlur={() => setShowHint(false)}
          className="text-slate-500 transition-colors hover:text-accent-cyan focus:outline-none"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ease-out rounded ${
          showHint
            ? "max-h-32 opacity-100 py-1.5"
            : "max-h-0 opacity-0 py-0"
        }`}
        style={{ willChange: "max-height, opacity" }}
        aria-live="polite"
      >
        <p className="text-2xs text-slate-400 bg-accent/5 border border-accent/15 rounded px-2 py-1.5">
          {hint}
        </p>
      </div>

      <div>{children}</div>
    </div>
  );
}
