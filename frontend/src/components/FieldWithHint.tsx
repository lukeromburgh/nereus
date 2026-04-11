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
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-[rgba(255,255,255,0.55)]">{label}</span>
        <button
          type="button"
          aria-label={`${label} help`}
          onMouseEnter={() => setShowHint(true)}
          onMouseLeave={() => setShowHint(false)}
          onFocus={() => setShowHint(true)}
          onBlur={() => setShowHint(false)}
          className="text-[rgba(255,255,255,0.25)] transition-colors hover:text-nereus-accent focus:outline-none"
        >
          <HelpCircle className="h-[14px] w-[14px]" aria-hidden="true" />
        </button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          showHint
            ? "max-h-32 opacity-100 py-1"
            : "max-h-0 opacity-0 py-0"
        }`}
        style={{ willChange: "max-height, opacity" }}
        aria-live="polite"
      >
        <p className="text-[10px] text-[rgba(255,255,255,0.4)] bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.1)] px-2 py-1" style={{ borderRadius: '2px' }}>
          {hint}
        </p>
      </div>

      <div>{children}</div>
    </div>
  );
}
