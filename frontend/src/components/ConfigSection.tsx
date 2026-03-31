import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";

interface ConfigSectionProps {
  title: string;
  isAdvanced?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function ConfigSection({
  title,
  isAdvanced = false,
  defaultOpen,
  children,
}: ConfigSectionProps) {
  const initialOpen =
    defaultOpen !== undefined ? defaultOpen : !isAdvanced;
  const [isOpen, setIsOpen] = useState(initialOpen);

  return (
    <div className="border-b border-hud-border pb-3 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left py-2 transition-colors duration-200 text-slate-400 hover:text-slate-200"
      >
        <div className="flex items-center gap-2">
          <span className="hud-label font-semibold text-accent-cyan">{title}</span>
          {isAdvanced ? (
            <span className="rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
              Advanced
            </span>
          ) : null}
        </div>

        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${
          isOpen
            ? "max-h-[1200px] opacity-100"
            : "max-h-0 opacity-0"
        }`}
        style={{ willChange: "max-height, opacity" }}
        aria-hidden={!isOpen}
      >
        <div
          className={`transform transition-transform duration-300 ease-in-out ${
            isOpen ? "translate-y-0" : "-translate-y-1"
          }`}
        >
          <div className="space-y-2 mt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
