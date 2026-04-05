import { ChevronRight } from "lucide-react";

interface Props {
  path: { id: number | null; name: string }[];
  onNavigate: (folderId: number | null) => void;
}

export default function AssetBreadcrumb({ path, onNavigate }: Props) {
  return (
    <nav className="flex items-center gap-1 text-xs min-w-0">
      {path.map((segment, i) => (
        <span key={segment.id ?? "root"} className="flex items-center gap-1 min-w-0">
          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600 flex-shrink-0" />}
          <button
            onClick={() => onNavigate(segment.id)}
            className={`truncate transition-colors ${
              i === path.length - 1
                ? "text-accent-cyan font-medium"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {segment.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
