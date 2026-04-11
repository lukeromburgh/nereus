import { type ReactNode, useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface ConfigSectionProps {
  title: string;
  id?: string;
  isAdvanced?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

const STORAGE_KEY = "nereus:sections";

function loadSectionState(id: string): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return map[id] ?? null;
  } catch {
    return null;
  }
}

function saveSectionState(id: string, open: boolean) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[id] = open;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function ConfigSection({
  title,
  id,
  isAdvanced = false,
  defaultOpen,
  children,
}: ConfigSectionProps) {
  const sectionId = id ?? title.toLowerCase().replace(/\s+/g, "-");
  const fallback = defaultOpen !== undefined ? defaultOpen : !isAdvanced;
  const saved = loadSectionState(sectionId);
  const [isOpen, setIsOpen] = useState(saved ?? fallback);

  useEffect(() => {
    saveSectionState(sectionId, isOpen);
  }, [sectionId, isOpen]);

  return (
    <div className="border-b border-border pb-3 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left py-2 transition-colors duration-200 text-foreground-muted hover:text-foreground"
      >
        <div className="flex items-center gap-2">
          <span className="hud-label font-semibold text-foreground">{title}</span>
          {isAdvanced ? (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              Advanced
            </span>
          ) : null}
        </div>

        <ChevronDown
          className={`h-4 w-4 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="pt-2">
          <div className="space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
