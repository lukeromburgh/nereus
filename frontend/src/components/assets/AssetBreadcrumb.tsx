import { ChevronRight } from "lucide-react";

interface Props {
  path: { id: number | null; name: string }[];
  onNavigate: (folderId: number | null) => void;
}

export default function AssetBreadcrumb({ path, onNavigate }: Props) {
  return (
    <nav className="flex items-center gap-1 text-[11px] min-w-0">
      {path.map((segment, i) => (
        <span key={segment.id ?? "root"} className="flex items-center gap-1 min-w-0">
          {i > 0 && <ChevronRight className="h-[14px] w-[14px] text-[rgba(255,255,255,0.2)] flex-shrink-0" />}
          <button
            onClick={() => onNavigate(segment.id)}
            className={`truncate transition-colors ${
              i === path.length - 1
                ? "text-nereus-accent font-medium"
                : "text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)]"
            }`}
          >
            {segment.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
