import { useEffect, useRef, useState } from "react";
import { ChevronRight, Folder as FolderIcon, X } from "lucide-react";
import type { Folder } from "../../types/assets";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (folderId: number | null) => void;
  folders: Folder[];
  excludeId?: number;
  title?: string;
}

function FolderNode({
  folder,
  depth,
  onSelect,
  excludeId,
}: {
  folder: Folder;
  depth: number;
  onSelect: (id: number) => void;
  excludeId?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  if (folder.id === excludeId) return null;
  return (
    <div>
      <button
        onClick={() => onSelect(folder.id)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/5 rounded transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {folder.children.length > 0 ? (
          <ChevronRight
            className={`h-3 w-3 text-slate-500 transition-transform ${expanded ? "rotate-90" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          />
        ) : (
          <span className="w-3" />
        )}
        <FolderIcon className="h-3.5 w-3.5 text-amber-400" />
        <span className="truncate">{folder.name}</span>
      </button>
      {expanded &&
        folder.children
          .filter((c) => c.id !== excludeId)
          .map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              onSelect={onSelect}
              excludeId={excludeId}
            />
          ))}
    </div>
  );
}

export default function FolderPickerModal({
  open,
  onClose,
  onSelect,
  folders,
  excludeId,
  title = "Move to...",
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-[#131e23] border border-hud-border rounded-lg shadow-xl w-full max-w-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto border border-hud-border rounded bg-black/20 p-1 mb-3">
          <button
            onClick={() => onSelect(null)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/5 rounded transition-colors"
          >
            <FolderIcon className="h-3.5 w-3.5 text-slate-400" />
            <span>Project Root</span>
          </button>
          {folders.map((f) => (
            <FolderNode
              key={f.id}
              folder={f}
              depth={1}
              onSelect={onSelect}
              excludeId={excludeId}
            />
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-hud-border rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
